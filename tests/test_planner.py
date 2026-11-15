"""Planner comparisons and contextual AI, with real data and no provider network calls."""
from copy import deepcopy
import json
import threading
import urllib.error
import urllib.request

import pytest

from lunar_data.agent import Agent
from lunar_data.ai_tools import DataTools
from lunar_data.common import DataError, canonical, sha256
from lunar_data.compare import compare, evaluate, validate_comparison_request
from lunar_data.openrouter import Config, OpenRouter
from lunar_data.reader import Dataset
from lunar_data.server import Application, make_server


@pytest.fixture(scope="module")
def dataset():
    return Dataset()


def scenario_id(dataset, site="sp_s8950", date="20261201", model="lola"):
    return next(sid for sid in dataset.index["scenarioIds"] if sid.startswith(f"{site}_{date}_30d_h2m_{model}_"))


def fixture_scenario(identifier, sun, earth=.5, quality="complete"):
    return {"scenarioId": identifier, "modelLevel": "lola", "kernelSetId": "same-kernels",
            "request": {"analysisDurationS": {"value": 2592000}, "computeStepS": {"value": 60}, "observerHeightM": {"value": 2}},
            "coverageStatus": "covered", "evaluation": {"nominal": {"status": "not_evaluated"}},
            "metrics": [{"metricId": "sun.anyDisk.fraction", "value": sun, "unit": "1", "quality": quality},
                        {"metricId": "earth.anyDisk.fraction", "value": earth, "unit": "1", "quality": "complete"}]}


CRITERIA = [{"metricId": "sun.anyDisk.fraction", "direction": "max", "origin": "user"},
            {"metricId": "earth.anyDisk.fraction", "direction": "max", "origin": "user"}]


def test_subset_pareto_is_recomputed_not_filtered():
    a, b, c = fixture_scenario("a", .5, .5), fixture_scenario("b", .2, .8), fixture_scenario("c", .8, .5)
    full = compare([a, b, c], CRITERIA)["nonDominatedScenarioIds"]
    selected = compare([a, b], CRITERIA)["nonDominatedScenarioIds"]
    assert full == ["b", "c"]
    assert selected == ["a", "b"]
    assert selected != [sid for sid in full if sid in ("a", "b")]


def test_ranks_preserve_ties_and_exclude_partial_missing_values():
    rows = [fixture_scenario("a", .5), fixture_scenario("b", .5), fixture_scenario("c", .25),
            fixture_scenario("missing", None), fixture_scenario("partial", 1, quality="partial")]
    result = compare(rows, CRITERIA, ["sun.anyDisk.fraction"])
    assert result["ranking"] == ["a", "b", "c"]
    assert result["rankByScenarioId"] == {"a": 1, "b": 1, "c": 3}
    assert result["unrankedScenarioIds"] == ["missing", "partial"]
    assert rows[3]["metrics"][0]["value"] is None


def test_truncated_gap_is_not_ranked_and_preserves_lower_bound_verdict():
    metric = {"metricId": "sun.anyDisk.longestGapH", "value": 720., "unit": "h", "quality": "complete", "truncatedEnd": True}
    scenario = fixture_scenario("a", .5)
    scenario["metrics"].append(metric)
    criteria = [{"metricId": metric["metricId"], "direction": "min", "origin": "user"}]
    result = compare([scenario], criteria, [metric["metricId"]])
    assert result["ranking"] == [] and result["unrankedScenarioIds"] == ["a"]
    c = {"metricId": metric["metricId"], "op": "<=", "value": 720, "unit": "h", "origin": "user"}
    assert evaluate([metric], [c])["status"] == "unknown"
    assert evaluate([metric], [{**c, "value": 719}])["status"] == "fail"


@pytest.mark.parametrize("body", [
    [], {}, {"scenarioIds": "x"}, {"scenarioIds": ["x", "x"]}, {"scenarioIds": [{}]},
    {"scenarioIds": ["x"], "priority": "sun.anyDisk.fraction"},
    {"scenarioIds": ["x"], "priority": ["not-a-criterion"]},
    {"scenarioIds": ["x"], "criteria": []},
    {"scenarioIds": ["x"], "constraints": None},
    {"scenarioIds": ["x"], "constraints": [{"metricId": "x", "op": [], "value": 1, "unit": "1", "origin": "user"}]},
    {"scenarioIds": ["x"], "constraints": [{"metricId": "x", "op": ">=", "value": float("nan"), "unit": "1", "origin": "user"}]},
    {"scenarioIds": ["x"], "path": "/etc/passwd"},
])
def test_strict_comparison_contract_rejects_malformed_input(body):
    with pytest.raises(DataError):
        validate_comparison_request(body)


def test_different_dates_compare_and_incompatible_models_fail(dataset):
    app = Application(dataset, Config())
    ids = [scenario_id(dataset), scenario_id(dataset, date="20261208")]
    parameters = {"scenarioIds": ids, "priority": ["overlap.sunAny_earthAny.fraction"], "constraints": []}
    result = app.compare(parameters)
    assert result == dataset.compare(**parameters)["data"]
    assert result["scenarioIds"] == ids and result["exploredCount"] == 2
    with pytest.raises(DataError, match="incompatible_scenarios"):
        app.compare({"scenarioIds": [ids[0], scenario_id(dataset, model="geometric")]})


def test_compare_http_works_without_ai_and_uses_origin_json_boundaries(dataset):
    app = Application(dataset, Config())
    server = make_server(app, port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    root = f"http://127.0.0.1:{server.server_port}"
    body = {"scenarioIds": [scenario_id(dataset), scenario_id(dataset, "sp_s8600")],
            "priority": ["sun.anyDisk.fraction"], "constraints": []}
    def post(payload, origin=None, content_type="application/json"):
        headers = {"Content-Type": content_type}
        if origin:
            headers["Origin"] = origin
        request = urllib.request.Request(root + "/api/compare", data=canonical(payload).encode(), headers=headers)
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)
    try:
        assert post(body) == app.compare(body)
        assert post(body, "http://127.0.0.1:5180") == app.compare(body)
        assert post(body, "http://localhost:5180") == app.compare(body)
        for payload, origin, kind, code in [
            (body, "https://foreign.example", "application/json", 403),
            (body, None, "text/plain", 415),
            ({**body, "priority": ["invalid"]}, None, "application/json", 400),
            ({**body, "scenarioIds": []}, None, "application/json", 400),
        ]:
            with pytest.raises(urllib.error.HTTPError) as exc:
                post(payload, origin, kind)
            assert exc.value.code == code
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def response(content=None, calls=None):
    return {"id": "test-generation", "model": "test/model", "provider": "mock", "usage": {"cost": .0001},
            "choices": [{"finish_reason": "tool_calls" if calls else "stop", "message": {
                "role": "assistant", "content": content, "tool_calls": calls}}]}


def tool_call(name, args):
    return {"id": "test-call", "type": "function", "function": {"name": name, "arguments": canonical(args)}}


class Scripted(OpenRouter):
    def __init__(self, config, steps):
        super().__init__(config)
        self.steps = iter(steps)
        self.payloads = []

    def complete(self, payload, budget):
        self.payloads.append(deepcopy(payload))
        budget.reserve(payload)
        step = next(self.steps)
        result = step(payload) if callable(step) else step
        budget.record(result)
        return result


def final_comparison(payload):
    tool = json.loads(payload["messages"][-1]["content"])
    return response(canonical({"summaryKey": "scenario_comparison", "evidenceIds": [tool["comparison"]["evidenceId"]],
                               "clarificationFields": []}))


def test_ai_and_endpoint_share_exact_selection_priority_constraints_and_locale(dataset):
    ids = [scenario_id(dataset), scenario_id(dataset, date="20261208")]
    priority = ["earth.anyDisk.fraction"]
    constraint = {"metricId": "earth.anyDisk.fraction", "op": ">=", "value": .3, "unit": "1", "origin": "user"}
    config = Config(api_key="mock-only", model="test/model")
    client = Scripted(config, [response(calls=[tool_call("compare", {"scenarioIds": list(reversed(ids))})]), final_comparison])
    app = Application(dataset, config, client)
    answer = app.chat({"message": "Explain this comparison", "context": {"scenarioIds": ids, "priority": priority},
                       "constraints": [constraint], "locale": "en"})
    expected = app.compare({"scenarioIds": ids, "priority": priority, "constraints": [constraint]})
    assert answer["explanationStatus"] == "available"
    proof = next(p for p in answer["evidence"] if p["kind"] == "comparison")
    assert proof["comparison"] == expected
    assert answer["locale"] == "en" and answer["message"].startswith("These are the trade-offs")
    assert client.payloads[0]["tool_choice"] == {"type": "function", "function": {"name": "compare"}}
    assert set(s["scenarioId"] for s in answer["scenarios"]) == set(ids)


def test_ai_cannot_compare_subset_or_old_priority_under_current_selection(dataset):
    ids = [scenario_id(dataset), scenario_id(dataset, "sp_s8600")]
    config = Config(api_key="mock-only", model="test/model")
    final = response(canonical({"summaryKey": "outside_scope", "evidenceIds": [], "clarificationFields": []}))
    client = Scripted(config, [response(calls=[tool_call("compare", {"scenarioIds": ids[:1]})]), final])
    result = Agent(dataset, config, client).run("Compare selected", {"scenarioIds": ids, "priority": ["sun.anyDisk.fraction"]})
    assert result["status"] == "insufficient_data"
    assert json.loads(client.payloads[1]["messages"][-1]["content"])["error"]["code"] == "selection_mismatch"
    old = dataset.compare(ids, priority=["earth.anyDisk.fraction"], constraints=[])["data"]
    client = Scripted(config, [response(calls=[tool_call("get_evidence", {"comparisonId": old["comparisonId"]})]), final])
    Agent(dataset, config, client).run("Explain selection", {"scenarioIds": ids, "priority": ["sun.anyDisk.fraction"]},
                                       comparisons={old["comparisonId"]: old})
    assert json.loads(client.payloads[1]["messages"][-1]["content"])["error"]["code"] == "selection_mismatch"


def test_sensitivity_proofs_carry_fixed_period_without_modifying_v1(dataset):
    path = dataset.root / "sensitivity/sp_s8950_h2m_grid1km.json"
    before = sha256(path)
    result = DataTools(dataset).dispatch("get_sensitivity", {"siteId": "sp_s8950", "heightM": 2})
    proof = result["data"][0]["ranges"][0]
    assert proof["analysisPeriod"]["surfaceStartUtc"] == "2026-12-01T00:00:00Z"
    assert proof["analysisPeriod"]["durationDays"] == 30 and proof["analysisPeriod"]["fixed"] is True
    assert sha256(path) == before
