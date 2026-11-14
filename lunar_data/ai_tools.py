"""Read-only tool boundary and compact, attributable evidence for the lunar agent."""
from __future__ import annotations

from copy import deepcopy

import jsonschema

from .common import DataError, canonical, identity, reason
from .compare import evidence
from .reader import Dataset


def object_schema(properties, required=None):
    return {"type": "object", "properties": properties, "required": list(properties) if required is None else required, "additionalProperties": False}


STRING = {"type": "string", "minLength": 1, "maxLength": 180}


class DataTools:
    """A model gets neither file paths, network access, code execution nor raw terrain."""

    def __init__(self, dataset: Dataset, constraints=None):
        self.dataset = dataset
        self.constraints = deepcopy(constraints or [])
        self.proofs = {}
        self.comparisons = {}
        self.seen_scenarios = {}
        self.sites = {s["id"]: s for s in dataset.sites}
        self.selected_ids = None
        self.priority = None
        self.criteria = None
        self.expected_comparison_id = None
        self.schemas = {
            "list_sites": object_schema({}),
            "get_scenario": object_schema({
                "siteId": {"enum": list(self.sites)},
                "startUtc": {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$"},
                "durationDays": {"type": "number", "exclusiveMinimum": 0, "maximum": 365},
                "heightM": {"type": "number", "minimum": 0, "maximum": 10000},
                "modelLevel": {"enum": ["geometric", "lola"]},
            }),
            "compare": object_schema({"scenarioIds": {"type": "array", "minItems": 1, "maxItems": 60,
                                                         "uniqueItems": True, "items": STRING}}),
            "get_sensitivity": object_schema({"siteId": {"enum": list(self.sites)}, "heightM": {"type": "number", "minimum": 0}}),
            "get_evidence": object_schema({"comparisonId": STRING}),
        }

    @property
    def definitions(self):
        descriptions = {
            "list_sites": "Read available lunar sites, source verification and dataset coverage. Does not choose mission parameters.",
            "get_scenario": "Read one precomputed scenario with metrics, windows and limits. Explicit UTC date, duration, height and model required. Never computes a missing scenario. Use the user-selected context or ask for clarification.",
            "compare": "Compare previously read compatible scenarios using the UI-selected priority, declared Pareto criteria and user-supplied constraints. Pass only scenarioIds; priority and criteria are bound by the server. No invented thresholds, weights or global optimum.",
            "get_sensitivity": "Read prepared sensitivity ranges on an explicitly described grid. These ranges are not probabilities or a regional optimum.",
            "get_evidence": "Read compact evidence for a prepared or just-calculated comparison. Never returns full time series, kernels or DEM arrays.",
        }
        return [{"type": "function", "function": {"name": name, "description": descriptions[name], "parameters": schema}}
                for name, schema in self.schemas.items()]

    def _proof(self, kind, value):
        pid = kind + "_" + identity(value, 20)
        self.proofs[pid] = {"evidenceId": pid, "kind": kind, **deepcopy(value)}
        return self.proofs[pid]

    def _site(self, site):
        keys = ("id", "name", "mission", "status", "latDeg", "lonDeg", "frame", "latitudeType",
                "verification", "positionUncertainty", "sources", "notes", "terrainProduct")
        return {k: site[k] for k in keys}

    def _scenario(self, s):
        self.seen_scenarios[s["scenarioId"]] = s
        quality = {k: s[k] for k in ("modelLevel", "coverageStatus", "validationStatus", "notEvaluated", "limits")}
        common = {"scenarioId": s["scenarioId"], "siteId": s["siteId"], "request": s["request"], **quality,
                  "evaluation": s["evaluation"], "provenance": s["provenance"]}
        # Shared limits and provenance occur once, not once per metric in model context.
        proofs = [self._proof("metric", {"scenarioId": s["scenarioId"], "siteId": s["siteId"], "metric": m,
                                        "modelLevel": s["modelLevel"], "coverageStatus": s["coverageStatus"],
                                        "validationStatus": s["validationStatus"]}) for m in s["metrics"]]
        return {**common, "metrics": proofs, "windows": s["windows"], "detailScope": "summary_without_series_or_event_list"}

    def _comparison(self, comparison, scenarios):
        cid = comparison["comparisonId"]
        if self.expected_comparison_id and cid != self.expected_comparison_id:
            raise DataError("selection_mismatch", "comparison", "comparison must match selected scenarios, priority and constraints")
        self.comparisons[cid] = comparison
        rows = []
        for s in scenarios:
            if s["scenarioId"] in self.seen_scenarios:
                rows.append({"scenarioId": s["scenarioId"], "modelLevel": s["modelLevel"],
                             "coverageStatus": s["coverageStatus"], "validationStatus": s["validationStatus"],
                             "limits": s["limits"], "metricsAlreadyRead": True})
            else:
                rows.append(self._scenario(s))
        proof = self._proof("comparison", {"comparison": comparison})
        return {"comparison": proof, "scenarios": rows, "exploredCount": len(rows),
                "limits": ["Best only among these explored scenarios under the declared criteria."]}

    def dispatch(self, name, arguments):
        if name not in self.schemas:
            raise DataError("invalid_tool", "name", name)
        try:
            jsonschema.Draft202012Validator(self.schemas[name]).validate(arguments)
            canonical(arguments)
        except (jsonschema.ValidationError, ValueError, TypeError) as exc:
            raise DataError("invalid_tool_arguments", name, "arguments do not match the tool schema") from exc
        if name == "list_sites":
            proofs = [self._proof("site", {"site": self._site(s)}) for s in self.dataset.sites]
            return {"total": len(proofs), "returned": len(proofs), "next": None, "unavailable": [], "data": proofs,
                    "datasetVersion": self.dataset.manifest["datasetVersion"],
                    "limits": ["Explicit scenario dates, durations, heights and model levels are required; no mission defaults are inferred."]}
        if name == "get_scenario":
            result = self.dataset.get_scenario(**arguments)
            return {**result, "data": [self._scenario(s) for s in result["data"]]}
        if name == "compare":
            ids = arguments["scenarioIds"]
            if any(sid not in self.seen_scenarios for sid in ids):
                raise DataError("unseen_scenario", "scenarioIds", "read scenarios before comparing them")
            if self.selected_ids is not None:
                if set(ids) != set(self.selected_ids):
                    raise DataError("selection_mismatch", "scenarioIds", "compare exactly the UI selection")
                ids = self.selected_ids
            result = self.dataset.compare(ids, criteria=self.criteria, priority=self.priority, constraints=self.constraints)
            return self._comparison(result["data"], [self.seen_scenarios[sid] for sid in ids])
        if name == "get_sensitivity":
            result = self.dataset.get_sensitivity(**arguments)
            rows = []
            for grid in result["data"]:
                common = {k: grid[k] for k in ("siteId", "heightM", "modelLevel", "coverageStatus", "validationStatus", "grid", "limits")}
                # v1 sensitivity_grid uses normalized_request's fixed start and duration.
                # This presentation metadata does not rewrite the immutable dataset.
                common["analysisPeriod"] = {"surfaceStartUtc": "2026-12-01T00:00:00Z", "durationDays": 30,
                                            "origin": "source:pipeline.sensitivity_grid_v1", "fixed": True}
                ranges = [self._proof("sensitivity", {**common, "range": r}) for r in grid["ranges"]]
                rows.append({**common, "ranges": ranges})
            return {**result, "data": rows}
        if name == "get_evidence":
            cid = arguments["comparisonId"]
            if cid in self.comparisons:
                c = self.comparisons[cid]
                return self._comparison(c, [self.seen_scenarios.get(sid) or self.dataset.scenario(sid) for sid in c["scenarioIds"]])
            packet = self.dataset.get_evidence(cid)["data"][0]
            scenarios = [self.dataset.scenario(s["scenarioId"]) for s in packet["scenarios"]]
            return self._comparison(packet["comparison"], scenarios)
        raise AssertionError("unreachable")
