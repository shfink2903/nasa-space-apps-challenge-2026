"""Offline UI/agent tools. This module needs only the Python standard library."""
from __future__ import annotations

import gzip
import json
from pathlib import Path

from .common import DataError, check_schema, read_json, sha256
from .compare import compare as compare_results, evidence


class Dataset:
    def __init__(self, root="data/processed/v1"):
        self.root = Path(root)
        self.manifest = read_json(self.root / "manifest.json")
        check_schema(self.manifest)
        self.files = {entry["path"]: entry for entry in self.manifest["files"]}
        self.index = self._read("index.json")
        self.sites = self._read("sites.json")["sites"]

    def _path(self, relative):
        path = self.root / relative
        if relative not in self.files or not path.resolve().is_relative_to(self.root.resolve()):
            raise DataError("unavailable", relative)
        entry = self.files[relative]
        if not path.is_file() or path.stat().st_size != entry["sizeBytes"] or sha256(path) != entry["sha256"]:
            raise DataError("integrity_failure", relative)
        return path

    def _read(self, relative):
        result = read_json(self._path(relative))
        if "schemaVersion" in result:
            check_schema(result)
        return result

    @staticmethod
    def _page(rows, filters, offset=0, limit=60, unavailable=None):
        if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0 or isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 60:
            raise DataError("invalid_request", "pagination", "offset >=0, limit 1..60 required")
        selected = rows[offset:offset + limit]
        return {"schemaVersion": "1.0.0", "filters": filters, "total": len(rows), "returned": len(selected),
                "next": offset + len(selected) if offset + len(selected) < len(rows) else None,
                "unavailable": unavailable or [], "data": selected}

    def list_sites(self, offset=0, limit=60):
        return self._page(self.sites, {}, offset, limit)

    def scenario(self, scenario_id, include_series=False):
        if scenario_id not in self.index["scenarioIds"]:
            raise DataError("unavailable", "scenarioId", scenario_id)
        result = self._read(f"scenarios/{scenario_id}.json")
        if include_series:
            if "seriesRef" not in result:
                raise DataError("unavailable", "series", scenario_id)
            with gzip.open(self._path(result["seriesRef"]["path"]), "rt") as stream:
                result["series"] = json.load(stream, parse_constant=lambda x: (_ for _ in ()).throw(DataError("invalid_json", x)))
        return result

    def get_scenario(self, siteId, startUtc, durationDays=30., heightM=2., modelLevel=None, include=None):
        if include not in (None, "series"):
            raise DataError("invalid_request", "include", "expected series or omitted")
        if include == "series" and modelLevel is None:
            raise DataError("invalid_request", "modelLevel", "explicit level required when requesting a series")
        # File names are never constructed from unchecked user coordinates or ids.
        rows = []
        for sid in self.index["scenarioIds"]:
            if not sid.startswith(siteId + "_"):
                continue
            s = self.scenario(sid)
            r = s["request"]
            if (s["siteId"] == siteId and r["surfaceStartUtc"]["value"] == startUtc
                and r["analysisDurationS"]["value"] == durationDays * 86400
                and r["observerHeightM"]["value"] == heightM and (modelLevel is None or s["modelLevel"] == modelLevel)):
                if include == "series":
                    s = self.scenario(sid, True)
                rows.append(s)
        filters = {"siteId": siteId, "startUtc": startUtc, "durationDays": durationDays, "heightM": heightM, "modelLevel": modelLevel}
        return self._page(rows, filters, unavailable=[] if rows else [{"code": "not_precomputed", "filters": filters}])

    def compare(self, scenarioIds, criteria=None, priority=None, constraints=None):
        if not isinstance(scenarioIds, list) or not 1 <= len(scenarioIds) <= 60:
            raise DataError("invalid_request", "scenarioIds", "1 to 60 ids required")
        missing = [sid for sid in scenarioIds if sid not in self.index["scenarioIds"]]
        if missing:
            raise DataError("unavailable", "scenarioIds", missing)
        result = compare_results([self.scenario(sid) for sid in scenarioIds], criteria, priority, constraints)
        return {"filters": {"scenarioIds": scenarioIds}, "total": len(scenarioIds), "returned": len(scenarioIds), "next": None, "unavailable": [], "data": result}

    def get_sensitivity(self, siteId, heightM=2.):
        matches = [path for path in self.files if path.startswith("sensitivity/")]
        rows = [self._read(path) for path in matches]
        rows = [row for row in rows if row["siteId"] == siteId and row["heightM"] == heightM]
        return self._page(rows, {"siteId": siteId, "heightM": heightM}, unavailable=[] if rows else [{"code": "not_precomputed"}])

    def get_profile(self, profileId):
        if profileId not in self.index["profileIds"]:
            raise DataError("unavailable", "profileId", profileId)
        for path in self.files:
            if path.startswith("horizons/") and path.endswith(f"_{profileId}.json"):
                return self._page([self._read(path)], {"profileId": profileId})
        raise DataError("broken_reference", "profileId", profileId)

    def get_evidence(self, comparisonId):
        if comparisonId not in self.index["comparisonIds"]:
            raise DataError("unavailable", "comparisonId", comparisonId)
        packet = self._read(f"ai/{comparisonId}.evidence.json")
        return self._page([packet], {"comparisonId": comparisonId})
