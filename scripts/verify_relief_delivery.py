#!/usr/bin/env python3
"""Audit source-to-sweep-to-UI fidelity for the two local relief bundles."""
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text())


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def audit(version, starts):
    data = ROOT / "data/processed" / version
    manifest = read(data / "manifest.json")
    derived = read(ROOT / "touchdown/public/derived" / f"{version}.json")
    index = read(data / "index.json")
    assert derived["datasetVersion"] == version
    assert derived["datasetManifestSha256"] == digest(data / "manifest.json")
    assert index["total"] == 3 * 2 * 2 * starts
    assert len(index["profileIds"]) == 6
    assert len(index["comparisonIds"]) == 2 * 2 * starts
    assert not derived["sensitivity"]
    assert manifest["validationStatus"] == "not_validated"
    assert manifest["parent"]["manifestSha256"] == digest(ROOT / "data/processed/v1/manifest.json")
    for entry in manifest["files"]:
        path = data / entry["path"]
        assert path.stat().st_size == entry["sizeBytes"] and digest(path) == entry["sha256"], path
    sites = read(data / "sites.json")["sites"]
    assert {s["id"] for s in sites} == {"sp_s8600", "sp_s8800", "sp_s8950"}
    assert all(s["terrainMethodId"] == manifest["terrainMethodId"] for s in sites)
    for path in (data / "horizons").glob("*.json"):
        profile = read(path)
        assert profile["terrainMethodId"] == manifest["terrainMethodId"]
        assert profile["truncatedAzimuthCount"] == 0
        assert len(profile["horizonElevationDeg"]) == 3600
        assert all(x is not None and math.isfinite(x) for x in profile["horizonElevationDeg"])
        assert all(x >= 300 - 1e-8 for x in profile["reachKm"])
    values = 0
    for path in (data / "sweeps").glob("*.json"):
        sweep = read(path)
        compact = derived["sweeps"][f'{sweep["siteId"]}|{sweep["heightM"]:g}|{sweep["modelLevel"]}']
        assert len(sweep["rows"]) == len(compact["dates"]) == starts
        assert compact["terrainMethodId"] == sweep["terrainMethodId"]
        for i, row in enumerate(sweep["rows"]):
            scenario = read(data / "scenarios" / f'{row["scenarioId"]}.json')
            assert scenario["coverageStatus"] == compact["coverageStatus"][i] == "covered"
            assert scenario["metrics"] == row["metrics"]
            lookup = {m["metricId"]: m["value"] for m in scenario["metrics"]}
            for metric in derived["metricIds"]:
                assert lookup[metric] == compact["values"][metric][i]
                values += 1
    for path in (data / "comparisons").glob("*.json"):
        comparison = read(path)
        scenarios = [read(data / "scenarios" / f"{id}.json") for id in comparison["scenarioIds"]]
        assert len(scenarios) == 3
        assert len({(s["terrainMethodId"], s["kernelSetId"], s["request"]["observerHeightM"]["value"],
                     s["request"]["analysisDurationS"]["value"], s["request"]["computeStepS"]["value"]) for s in scenarios}) == 1
        date = scenarios[0]["request"]["surfaceStartUtc"]["value"][:10].replace("-", "")
        key = f'{date}|{comparison["modelLevel"]}|{comparison["heightM"]:g}|{comparison["terrainMethodId"]}'
        assert derived["comparisons"][key]["nonDominated"] == comparison["nonDominatedScenarioIds"]
    return {"datasetVersion": version, "manifestSha256": digest(data / "manifest.json"),
            "scenarios": index["total"], "lolaScenarios": index["total"] // 2,
            "profiles": 6, "comparisons": len(index["comparisonIds"]), "compactValuesChecked": values,
            "allCovered": True, "legacySensitivityCopied": False,
            "terrainMethodId": manifest["terrainMethodId"], "kernelSetId": manifest["kernelSetId"]}


def main():
    bundles = [audit("v1.1-relief-30d", 1), audit("v1.1-relief-year", 52)]
    old = read(ROOT / "data/processed/v1/manifest.json")
    assert all(bundle["kernelSetId"] == old["kernelSetId"] for bundle in bundles)
    sources = []
    for suffix in ("lbl", "img"):
        path = ROOT / "data/raw/lola" / f"ldem_85s_20m.{suffix}"
        record = read(path.with_name(path.name + ".source.json"))
        assert digest(path) == record["sha256"]
        assert path.stat().st_size == record["receivedSizeBytes"] == record["announcedSizeBytes"]
        sources.append(record)
    report = {"checkedAt": datetime.now(timezone.utc).isoformat(), "pass": True,
              "physicalValidation": "not_validated", "bundles": bundles, "fineTerrainSources": sources,
              "v1": read(ROOT / "docs/validation/polar20-v1-integrity.json")}
    path = ROOT / "docs/validation/polar20-delivery-audit.json"
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"pass": True, "scenarios": sum(b["scenarios"] for b in bundles),
                      "compactValuesChecked": sum(b["compactValuesChecked"] for b in bundles), "report": str(path)}))


if __name__ == "__main__":
    main()
