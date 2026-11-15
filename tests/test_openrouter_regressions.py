"""Safe provider diagnostics and honest accounting, without provider requests."""
import io
import json
import socket
import urllib.error
from dataclasses import replace

import pytest

from lunar_data.common import DataError, canonical
from lunar_data.openrouter import Budget, Config, OpenRouter


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Transport tests must use simulated responses")
    monkeypatch.setattr(socket, "socket", forbidden)


def config():
    return Config(model="test/model", api_key="mock-secret-do-not-expose")


def http_failure(body):
    return urllib.error.HTTPError("https://openrouter.ai/private-url-do-not-expose", 400, "raw-reason-do-not-expose",
                                  {"Authorization": "headers-do-not-expose"}, io.BytesIO(body))


def run_failure(error):
    conf = config()
    def opener(*args, **kwargs):
        raise error
    client = OpenRouter(conf, opener=opener)
    budget = Budget(conf)
    with pytest.raises(DataError) as raised:
        client.complete(client.payload([], [], {"type": "object"}), budget)
    return raised.value, budget


def test_http_diagnostics_allowlist_redacts_key_at_every_level():
    key = config().api_key
    body = {"error": {"message": f"Invalid request {key}", "code": 400,
                      "private": "outer-private-do-not-expose", "metadata": {
        "provider_name": f"Test {key}", "headers": "metadata-headers-do-not-expose",
        "raw": json.dumps({"error": {"message": f"Unsupported tool_choice {key}", "code": "bad_choice",
                                      "request": "provider-request-do-not-expose"}, "debug": "raw-debug-do-not-expose"})}}}
    error, budget = run_failure(http_failure(canonical(body).encode()))
    assert error.detail == {"status": 400, "message": "Invalid request [REDACTED]", "code": 400,
                            "provider_name": "Test [REDACTED]", "provider_error": {
                                "message": "Unsupported tool_choice [REDACTED]", "code": "bad_choice"}}
    assert "do-not-expose" not in canonical(error.as_dict())
    assert budget.report()["observedCostUsd"] is None
    assert budget.report()["observedCostReason"] == "provider_usage_missing"


@pytest.mark.parametrize("body", [b"<html>raw-body-do-not-expose</html>", b"x" * 16385, b"[]", b'{"error":null}', b"[" * 2000])
def test_invalid_or_oversized_http_body_is_not_exposed(body):
    error, _ = run_failure(http_failure(body))
    assert error.detail == {"status": 400}


def test_raw_provider_text_is_ignored_and_diagnostic_fields_are_bounded():
    body = {"error": {"message": config().api_key + "\n" + "x" * 1000, "code": "y" * 200,
                      "metadata": {"provider_name": "z" * 300, "raw": "raw-private-do-not-expose"}}}
    error, _ = run_failure(http_failure(canonical(body).encode()))
    assert len(error.detail["message"]) == 500
    assert len(error.detail["code"]) == 100
    assert len(error.detail["provider_name"]) == 120
    assert error.detail["message"].startswith("[REDACTED]")
    assert "\n" not in error.detail["message"]
    assert "provider_error" not in error.detail


def test_network_failure_does_not_claim_zero_observed_cost():
    error, budget = run_failure(TimeoutError("private-network-error"))
    assert error.detail == "TimeoutError"
    assert budget.usage_missing is True
    assert budget.report()["observedCostUsd"] is None
    assert budget.report()["calls"] == 1


def test_retry_with_unreported_attempt_keeps_total_observed_cost_unknown():
    conf = config()
    attempts = []
    def opener(*args, **kwargs):
        attempts.append(True)
        if len(attempts) == 1:
            raise urllib.error.HTTPError("https://openrouter.ai", 503, "busy", {"Retry-After": "0"}, io.BytesIO(b"{}"))
        return io.BytesIO(canonical({"choices": [{}], "usage": {"cost": .0001}}).encode())
    client = OpenRouter(conf, opener=opener, sleeper=lambda _: None)
    budget = Budget(conf)
    client.complete(client.payload([], [], {"type": "object"}), budget)
    assert budget.report()["calls"] == 2
    assert budget.report()["observedCostUsd"] is None


@pytest.mark.parametrize("usage", [None, {}, {"cost": 0}])
def test_observed_zero_requires_an_explicit_provider_cost(usage):
    budget = Budget(config())
    budget.reserve({})
    budget.record({"usage": usage})
    assert budget.report()["observedCostUsd"] == ("0" if usage == {"cost": 0} else None)


def test_reserved_request_without_recorded_response_has_unknown_cost():
    budget = Budget(config())
    budget.reserve({})
    assert budget.report()["observedCostUsd"] is None
    assert budget.report()["observedCostReason"] == "provider_usage_missing"


def test_reported_cost_above_limit_is_still_known():
    budget = Budget(config())
    budget.reserve({})
    with pytest.raises(DataError, match="reported_cost_exceeded"):
        budget.record({"usage": {"cost": .06}})
    assert budget.report()["observedCostUsd"] == "0.06"
    assert budget.report()["observedCostReason"] is None


TOOLS = [{"type": "function", "function": {"name": "compare", "parameters": {"type": "object"}}}]


@pytest.mark.parametrize("model", ["deepseek/deepseek-v4.1-flash-1017", "deepseek/deepseek-v4-pro"])
@pytest.mark.parametrize("choice", ["required", "auto", "none", {"type": "function", "function": {"name": "compare"}}])
def test_deepseek_v4_tool_loop_uses_explicit_non_thinking_mode(model, choice):
    client = OpenRouter(replace(config(), model=model, provider="test-provider"))
    schema = {"type": "object"}
    payload = client.payload([], TOOLS, schema, choice)
    assert payload["reasoning"] == {"enabled": False}
    assert payload["model"] == model and payload["tool_choice"] == choice
    assert payload["provider"]["only"] == ["test-provider"]
    assert payload["provider"]["allow_fallbacks"] is False
    if choice == "required" or isinstance(choice, dict):
        assert "response_format" not in payload
    else:
        assert payload["response_format"] == {"type": "json_schema", "json_schema": {
            "name": "lunar_answer", "strict": True, "schema": schema}}


@pytest.mark.parametrize("model,tools", [
    ("deepseek/deepseek-v4.1-flash-1017", []),
    ("deepseek/deepseek-r1", TOOLS),
    ("deepseek/deepseek-v3.2", TOOLS),
    ("other/model", TOOLS),
])
def test_reasoning_compatibility_does_not_change_other_models_or_toolless_requests(model, tools):
    payload = OpenRouter(replace(config(), model=model)).payload([], tools, {"type": "object"})
    assert "reasoning" not in payload


def test_deepseek_generation_trace_records_applied_reasoning_mode():
    from lunar_data.agent import Agent
    from lunar_data.reader import Dataset

    class Scripted(OpenRouter):
        def complete(self, payload, budget):
            budget.reserve(payload)
            result = {"model": self.config.model, "usage": {"cost": 0}, "choices": [{"finish_reason": "stop", "message": {
                "role": "assistant", "content": canonical({"summaryKey": "outside_scope", "evidenceIds": [], "clarificationFields": []})}}]}
            budget.record(result)
            return result

    conf = replace(config(), model="deepseek/deepseek-v4.1-flash-1017")
    answer = Agent(Dataset(), conf, Scripted(conf)).run("Explain an unmodeled physical quantity")
    assert answer["generations"][0]["parameters"]["reasoning"] == {"enabled": False}


@pytest.mark.parametrize("choice", ["required", "auto", "none", {"type": "function", "function": {"name": "compare"}}])
def test_forced_tool_turns_omit_only_final_answer_format_and_keep_budgets(choice):
    from lunar_data.agent import FINAL_SCHEMA
    conf = config()
    payload = OpenRouter(conf).payload([{"role": "user", "content": "Compare the selected scenarios"}], TOOLS, FINAL_SCHEMA, choice)
    assert payload["tools"] == TOOLS and payload["tool_choice"] == choice
    assert "reasoning" not in payload
    forced = choice == "required" or isinstance(choice, dict)
    assert ("response_format" not in payload) is forced
    if not forced:
        assert payload["response_format"]["json_schema"]["schema"] == FINAL_SCHEMA
        assert payload["response_format"]["json_schema"]["strict"] is True
    budget = Budget(conf)
    budget.reserve(payload)
    assert budget.report()["calls"] == 1 and budget.reserved > 0
    assert budget.report()["observedCostUsd"] is None
    budget.record({"usage": {"cost": 0}})
    assert budget.report()["observedCostUsd"] == "0"
