"""Constraint verdicts and Pareto sets, with no invented weights or missing = zero."""
from __future__ import annotations

import operator

from .common import DataError, finite, identity, parameter, reason

OPS = {"<=": operator.le, ">=": operator.ge, "<": operator.lt, ">": operator.gt, "==": operator.eq}
DEFAULT_CRITERIA = [
    {"metricId": "sun.anyDisk.fraction", "direction": "max", "origin": "team_default_hackathon"},
    {"metricId": "earth.anyDisk.fraction", "direction": "max", "origin": "team_default_hackathon"},
    {"metricId": "sun.anyDisk.longestGapH", "direction": "min", "origin": "team_default_hackathon"},
    {"metricId": "overlap.sunAny_earthAny.fraction", "direction": "max", "origin": "team_default_hackathon"},
]


def evaluate(metrics, constraints):
    lookup = {m["metricId"]: m for m in metrics}
    rows = []
    for c in constraints:
        if not isinstance(c, dict) or not all(k in c for k in ("metricId", "op", "value", "unit", "origin")):
            raise DataError("invalid_request", "hardConstraints", "metricId, op, value, unit and origin required")
        if c["op"] not in OPS or not isinstance(c["unit"], str) or not c["unit"] or not isinstance(c["origin"], str) or not c["origin"]:
            raise DataError("invalid_request", "hardConstraints", "invalid operator, unit or origin")
        finite(c["value"], "constraint.value")
        m = lookup.get(c["metricId"])
        why = None
        if m and m["unit"] != c["unit"]:
            raise DataError("invalid_request", "constraint.unit", {"expected": m["unit"], "received": c["unit"]})
        if m is None or m["value"] is None or m.get("quality") in ("unknown", "partial"):
            status, why = "unknown", reason("missing_or_partial_metric")
        elif c["metricId"].endswith("longestGapH") and any(m.get(k) for k in ("truncatedStart", "truncatedEnd", "truncatedByMissingData")):
            # Observed gap is a lower bound, sufficient only to prove failure of
            # an upper bound (or success of a lower bound).
            outcome = OPS[c["op"]](m["value"], c["value"])
            certain = (c["op"] in ("<=", "<") and not outcome) or (c["op"] in (">=", ">") and outcome)
            status = ("pass" if outcome else "fail") if certain else "unknown"
            why = reason("truncated_gap_lower_bound")
        else:
            status = "pass" if OPS[c["op"]](m["value"], c["value"]) else "fail"
        rows.append({"constraint": c, "status": status, "value": m["value"] if m else None, "reason": why,
                     "fragile": None, "fragileReason": reason("convergence_error_not_quantified")})
    statuses = [x["status"] for x in rows]
    return {"status": "not_evaluated" if not rows else "fail" if "fail" in statuses else "unknown" if "unknown" in statuses else "pass", "constraints": rows}


def dominates(a, b, criteria):
    ma, mb = {m["metricId"]: m for m in a["metrics"]}, {m["metricId"]: m for m in b["metrics"]}
    better = False
    for c in criteria:
        x, y = ma.get(c["metricId"]), mb.get(c["metricId"])
        if not x or not y or x["value"] is None or y["value"] is None:
            return False
        if x["unit"] != y["unit"] or x["quality"] in ("unknown", "partial") or y["quality"] in ("unknown", "partial"):
            return False
        if c["metricId"].endswith("longestGapH"):
            keys = ("truncatedStart", "truncatedEnd", "truncatedByMissingData")
            if any(x.get(k) != y.get(k) for k in keys):
                return False
        sign = 1 if c["direction"] == "max" else -1
        if sign * x["value"] < sign * y["value"]:
            return False
        better |= sign * x["value"] > sign * y["value"]
    return better


def compare(scenarios, criteria=None, priority=None, constraints=None):
    if not scenarios or len(scenarios) > 60:
        raise DataError("invalid_request", "scenarioIds", "1 to 60 scenarios required; split larger requests")
    if len({s["scenarioId"] for s in scenarios}) != len(scenarios):
        raise DataError("invalid_request", "scenarioIds", "duplicates")
    criteria = DEFAULT_CRITERIA if criteria is None else criteria
    if not criteria:
        raise DataError("invalid_request", "criteria", "at least one criterion required")
    for c in criteria:
        if c.get("direction") not in ("min", "max") or not c.get("metricId") or not c.get("origin"):
            raise DataError("invalid_request", "criteria", "metricId, direction and origin required")
    compatibility = {(s["modelLevel"], s["kernelSetId"], s["request"]["analysisDurationS"]["value"], s["request"]["computeStepS"]["value"]) for s in scenarios}
    if len(compatibility) != 1:
        raise DataError("incompatible_scenarios", "scenarioIds", "model level, kernels, duration and compute step must match")
    verdicts = {s["scenarioId"]: evaluate(s["metrics"], constraints) if constraints is not None else s["evaluation"]["nominal"] for s in scenarios}
    eligible = [s for s in scenarios if verdicts[s["scenarioId"]]["status"] in ("pass", "not_evaluated") and s["coverageStatus"] == "covered"]
    front = [s["scenarioId"] for s in eligible if not any(dominates(other, s, criteria) for other in eligible if other is not s)]
    ranking = None
    if priority:
        selected = {c["metricId"]: c for c in criteria}
        if len(set(priority)) != len(priority) or any(k not in selected for k in priority):
            raise DataError("invalid_request", "priority", "unique metricIds from criteria required")
        def key(s):
            mm = {m["metricId"]: m["value"] for m in s["metrics"]}
            return tuple((mm[k] is None, (-mm[k] if selected[k]["direction"] == "max" else mm[k]) if mm[k] is not None else 0) for k in priority)
        ranking = [s["scenarioId"] for s in sorted(eligible, key=key)]
    result = {"schemaVersion": "1.0.0", "scenarioIds": [s["scenarioId"] for s in scenarios],
              "method": {"type": "pareto", "criteria": criteria, "priority": priority, "weights": None},
              "modelLevel": scenarios[0]["modelLevel"], "coverageStatus": "covered" if all(s["coverageStatus"] == "covered" for s in scenarios) else "partial",
              "validationStatus": "not_validated", "verdicts": verdicts, "nonDominatedScenarioIds": front,
              "ranking": ranking, "recommendation": None,
              "recommendationReason": reason("descriptive_pareto_only" if eligible else "all_failed_or_unknown"),
              "exploredCount": len(scenarios), "returnedCount": len(front),
              "excluded": [{"scenarioId": s["scenarioId"], "reason": reason("constraint_or_coverage"), "status": verdicts[s["scenarioId"]]["status"]} for s in scenarios if s not in eligible],
              "limits": ["Best only among explored scenarios and declared criteria; no mission feasibility guarantee."]}
    result["comparisonId"] = "comparison_" + identity(result)
    return result


def evidence(comparison, scenarios, sites):
    by_id = {s["id"]: s for s in sites}
    rows = []
    for s in scenarios:
        rows.append({k: s[k] for k in ("scenarioId", "siteId", "request", "metrics", "evaluation", "modelLevel",
                                      "coverageStatus", "validationStatus", "notEvaluated", "limits", "provenance")})
    return {"schemaVersion": "1.0.0", "comparisonId": comparison["comparisonId"], "comparison": comparison,
            "scenarios": rows, "sites": [{key: value for key, value in by_id[k].items() if key != "scenarioIds"} for k in sorted({s["siteId"] for s in scenarios})],
            "limits": ["LLM may explain and cite these values only; it must not calculate physical quantities."]}
