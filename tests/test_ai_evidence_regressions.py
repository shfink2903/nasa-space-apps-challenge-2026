"""Current request contracts must hold even when evidence comes from history."""
from copy import deepcopy
from decimal import Decimal
import json
import socket

import pytest

from lunar_data.agent import Agent, render_answer
from lunar_data.ai_tools import DataTools
from lunar_data.common import DataError, canonical, sha256
from lunar_data.openrouter import Config, OpenRouter
from lunar_data.reader import Dataset
from lunar_data.server import Application


@pytest.fixture(scope="module")
def dataset():
    return Dataset()


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Provider/network access is forbidden in regression tests")
    monkeypatch.setattr(socket, "socket", forbidden)


def scenario_id(dataset, site="change4", date="20261201", model="geometric"):
    return next(sid for sid in dataset.index["scenarioIds"] if sid.startswith(f"{site}_{date}_30d_h2m_{model}_"))


def earth_threshold(value):
    return {"metricId": "earth.anyDisk.fraction", "op": ">=", "value": value, "unit": "1", "origin": "user"}


def selected_tools(dataset, constraints, mode, ids):
    tools = DataTools(dataset, constraints)
    if mode == "single":
        tools.selected_scenario_id = ids[0]
    elif mode == "multi":
        tools.selected_ids = ids
    if tools.selection is not None:
        tools.expected_comparison_id = dataset.compare(ids, constraints=constraints)["data"]["comparisonId"]
    return tools


@pytest.mark.parametrize("mode", ["absent", "single", "multi"])
@pytest.mark.parametrize("old_constraints,new_constraints", [
    ([earth_threshold(0)], [earth_threshold(1)]),
    ([earth_threshold(0)], []),
    ([], [earth_threshold(1)]),
])
def test_historical_comparison_cannot_bypass_current_constraints(dataset, mode, old_constraints, new_constraints):
    ids = [scenario_id(dataset)]
    old = dataset.compare(ids, constraints=old_constraints)["data"]
    tools = selected_tools(dataset, new_constraints, mode, ids)
    tools.comparisons[old["comparisonId"]] = old
    with pytest.raises(DataError, match="comparison"):
        tools.dispatch("get_evidence", {"comparisonId": old["comparisonId"]})
    assert not tools.proofs
    tools._scenario(dataset.scenario(ids[0]))
    fresh = tools.dispatch("compare", {"scenarioIds": ids})["comparison"]["comparison"]
    assert fresh == dataset.compare(ids, constraints=new_constraints)["data"]
    assert fresh["verdicts"][ids[0]]["status"] == ("fail" if new_constraints else "not_evaluated")


@pytest.mark.parametrize("changed", ["priority", "criteria", "model", "date"])
def test_history_cannot_override_selected_method_or_scenarios(dataset, changed):
    sid = scenario_id(dataset, "sp_s8950", model="lola")
    tools = selected_tools(dataset, [], "single", [sid])
    kwargs = {}
    old_ids = [sid]
    if changed == "priority":
        kwargs["priority"] = ["earth.anyDisk.fraction"]
    elif changed == "criteria":
        kwargs["criteria"] = [{"metricId": "earth.anyDisk.fraction", "direction": "max", "origin": "user"}]
    elif changed == "model":
        old_ids = [scenario_id(dataset, "sp_s8950", model="geometric")]
    else:
        old_ids = [scenario_id(dataset, "sp_s8950", "20261208", "lola")]
    old = dataset.compare(old_ids, constraints=[], **kwargs)["data"]
    tools.comparisons[old["comparisonId"]] = old
    with pytest.raises(DataError, match="selection_mismatch"):
        tools.dispatch("get_evidence", {"comparisonId": old["comparisonId"]})


def test_compatible_frozen_v1_evidence_is_refreshed_without_modifying_bundle(dataset):
    cid = dataset.index["comparisonIds"][0]
    path = dataset.root / "ai" / f"{cid}.evidence.json"
    before = sha256(path)
    old = dataset.get_evidence(cid)["data"][0]["comparison"]
    tools = DataTools(dataset)
    result = tools.dispatch("get_evidence", {"comparisonId": cid})
    current = dataset.compare(old["scenarioIds"], constraints=[])["data"]
    assert result["comparison"]["comparison"] == current
    assert "rankByScenarioId" in current and "unrankedScenarioIds" in current
    assert sha256(path) == before


@pytest.mark.parametrize("changed", ["constraints", "method", "verdict", "model", "selection"])
def test_final_render_rechecks_full_comparison_not_only_evidence_id(dataset, changed):
    sid = scenario_id(dataset)
    tools = selected_tools(dataset, [earth_threshold(1)], "single", [sid])
    tools._scenario(dataset.scenario(sid))
    stale = deepcopy(dataset.compare([sid], constraints=tools.constraints)["data"])
    if changed == "constraints":
        stale = dataset.compare([sid], constraints=[earth_threshold(0)])["data"]
    elif changed == "method":
        stale["method"]["priority"] = ["earth.anyDisk.fraction"]
    elif changed == "verdict":
        stale["verdicts"][sid]["status"] = "pass"
    elif changed == "model":
        stale["modelLevel"] = "lola"
    else:
        stale = dataset.compare([scenario_id(dataset, "apollo11")], constraints=tools.constraints)["data"]
    proof = tools._proof("comparison", {"comparison": stale})
    with pytest.raises(DataError, match="invalid_explanation: comparison"):
        render_answer({"summaryKey": "scenario_comparison", "evidenceIds": [proof["evidenceId"]], "clarificationFields": []}, tools)


def test_single_selection_cannot_render_another_sites_metric(dataset):
    tools = selected_tools(dataset, [], "single", [scenario_id(dataset)])
    other = tools._scenario(dataset.scenario(scenario_id(dataset, "apollo11")))
    with pytest.raises(DataError, match="selection"):
        render_answer({"summaryKey": "scenario_summary", "evidenceIds": [other["metrics"][0]["evidenceId"]], "clarificationFields": []}, tools)


def response(content=None, calls=None):
    return {"id": "offline-generation", "model": "test/model", "usage": {"cost": .0001}, "choices": [{
        "finish_reason": "tool_calls" if calls else "stop",
        "message": {"role": "assistant", "content": content, "tool_calls": calls}}]}


def call(name, arguments):
    return response(calls=[{"id": "offline-call", "type": "function", "function": {
        "name": name, "arguments": canonical(arguments)}}])


def finish(payload):
    proof = json.loads(payload["messages"][-1]["content"])["comparison"]
    return response(canonical({"summaryKey": "scenario_comparison", "evidenceIds": [proof["evidenceId"]], "clarificationFields": []}))


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


@pytest.mark.parametrize("mode", ["absent", "single", "multi"])
def test_conversation_recovers_from_old_proof_with_current_failed_verdict(dataset, mode):
    sid = scenario_id(dataset)
    old = dataset.compare([sid], constraints=[earth_threshold(0)])["data"]
    args = {"siteId": "change4", "startUtc": "2026-12-01T00:00:00Z", "durationDays": 30, "heightM": 2, "modelLevel": "geometric"}
    config = Config(api_key="offline-test-key", model="test/model", max_cost_usd=Decimal(".20"))
    client = Scripted(config, [call("get_evidence", {"comparisonId": old["comparisonId"]}),
                               call("get_scenario", args), call("compare", {"scenarioIds": [sid]}), finish])
    context = None if mode == "absent" else {"scenarioId": sid} if mode == "single" else {"scenarioIds": [sid]}
    answer = Agent(dataset, config, client).run("Apply the new threshold", context=context,
        constraints=[earth_threshold(1)], comparisons={old["comparisonId"]: old})
    assert answer["explanationStatus"] == "available"
    assert answer["toolTrace"][0]["status"] == "error"
    proof = next(p for p in answer["evidence"] if p["kind"] == "comparison")
    assert proof["comparison"]["verdicts"][sid]["status"] == "fail"
    assert proof["comparison"]["comparisonId"] != old["comparisonId"]


def test_server_history_keeps_old_proof_from_overriding_changed_constraints(dataset):
    sid = scenario_id(dataset)
    old = dataset.compare([sid], constraints=[earth_threshold(0)])["data"]
    args = {"siteId": "change4", "startUtc": "2026-12-01T00:00:00Z", "durationDays": 30, "heightM": 2, "modelLevel": "geometric"}
    config = Config(api_key="offline-test-key", model="test/model", max_cost_usd=Decimal(".20"))
    client = Scripted(config, [call("get_scenario", args), call("compare", {"scenarioIds": [sid]}), finish,
                               call("get_evidence", {"comparisonId": old["comparisonId"]}), call("get_scenario", args),
                               call("compare", {"scenarioIds": [sid]}), finish])
    app = Application(dataset, config, client, hourly_budget="1")
    first = app.chat({"message": "Compare", "constraints": [earth_threshold(0)]})
    assert first["evidence"][0]["comparison"]["verdicts"][sid]["status"] == "pass"
    second = app.chat({"message": "Now require full visibility", "sessionId": first["sessionId"], "constraints": [earth_threshold(1)]})
    assert second["toolTrace"][0]["status"] == "error"
    assert second["evidence"][0]["comparison"]["verdicts"][sid]["status"] == "fail"


def test_followup_without_context_preserves_recorded_method_and_session_constraints(dataset):
    ids = [scenario_id(dataset, "apollo11"), scenario_id(dataset)]
    priority = ["earth.anyDisk.fraction"]
    constraints = [earth_threshold(.25)]
    expected = dataset.compare(ids, priority=priority, constraints=constraints)["data"]
    config = Config(api_key="offline-test-key", model="test/model", max_cost_usd=Decimal(".20"))
    client = Scripted(config, [call("compare", {"scenarioIds": ids}), finish,
                               call("get_evidence", {"comparisonId": expected["comparisonId"]}), finish])
    app = Application(dataset, config, client, hourly_budget="1")
    first = app.chat({"message": "Compare selected sites", "context": {"scenarioIds": ids, "priority": priority},
                      "constraints": constraints})
    assert first["explanationStatus"] == "available"
    second = app.chat({"message": "Explain that comparison again", "sessionId": first["sessionId"]})
    assert second["explanationStatus"] == "available"
    assert second["toolTrace"][0]["status"] == "ok"
    assert second["evidence"][0]["comparison"] == expected


def test_restored_method_is_bound_to_proof_without_changing_new_comparisons(dataset):
    sid = scenario_id(dataset)
    tools = DataTools(dataset)
    old = dataset.compare([sid], priority=["earth.anyDisk.fraction"], constraints=[])["data"]
    tools.comparisons[old["comparisonId"]] = old
    proof = tools.dispatch("get_evidence", {"comparisonId": old["comparisonId"]})["comparison"]
    rendered = render_answer({"summaryKey": "scenario_comparison", "evidenceIds": [proof["evidenceId"]], "clarificationFields": []}, tools)
    assert rendered["evidence"][0]["comparison"] == old
    fresh = tools.dispatch("compare", {"scenarioIds": [sid]})["comparison"]["comparison"]
    assert fresh["method"]["priority"] is None
    assert fresh["comparisonId"] != old["comparisonId"]
    assert tools.priority is None and tools.criteria is None
    tools.proofs[proof["evidenceId"]]["comparison"]["method"]["priority"] = ["sun.anyDisk.fraction"]
    with pytest.raises(DataError, match="invalid_explanation: comparison"):
        render_answer({"summaryKey": "scenario_comparison", "evidenceIds": [proof["evidenceId"]], "clarificationFields": []}, tools)


@pytest.mark.parametrize("changed", ["constraints", "priority", "criteria"])
def test_historical_method_does_not_override_current_request_without_context(dataset, changed):
    sid = scenario_id(dataset)
    old = dataset.compare([sid], priority=["earth.anyDisk.fraction"], constraints=[earth_threshold(0)])["data"]
    tools = DataTools(dataset, [earth_threshold(1 if changed == "constraints" else 0)])
    if changed == "priority":
        tools.priority = ["sun.anyDisk.fraction"]
    elif changed == "criteria":
        tools.criteria = [{"metricId": "sun.anyDisk.fraction", "direction": "max", "origin": "user"}]
    tools.comparisons[old["comparisonId"]] = old
    with pytest.raises(DataError, match="comparison_mismatch"):
        tools.dispatch("get_evidence", {"comparisonId": old["comparisonId"]})
    assert not tools.proofs and not tools.restored_methods
