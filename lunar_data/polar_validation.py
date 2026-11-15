"""Offline numerical sensitivity checks for the published three-site polar20 bundle."""
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from .catalog import list_sites
from .common import sha256, utc_now, write_json
from .geometry import Geometry
from .pipeline import engine_version, validate_scenario
from .reader import Dataset
from .scenario import compute, normalized_request
from .terrain import DEM, POLAR20_SITES, polar20_profile


def differences(a, b):
    def groups(s):
        out = defaultdict(list)
        for e in s["events"]:
            if not e.get("truncated"):
                out[(e["body"], e["convention"], e["type"])].append(datetime.fromisoformat(e["tUtc"]))
        return out
    aa, bb = groups(a), groups(b)
    mismatch, deltas, pairs = [], [], []
    for key in sorted(aa.keys() | bb.keys()):
        if len(aa[key]) != len(bb[key]):
            mismatch.append({"event": list(key), "counts": [len(aa[key]), len(bb[key])]})
        else:
            for x, y in zip(sorted(aa[key]), sorted(bb[key])):
                delta = (y-x).total_seconds()
                deltas.append(abs(delta))
                pairs.append({"event": list(key), "referenceUtc": x.isoformat(),
                              "candidateUtc": y.isoformat(), "differenceS": delta})
    ma, mb = ({m["metricId"]: m for m in s["metrics"]} for s in (a, b))
    metrics = {k: {"unit": ma[k]["unit"], "from": ma[k]["value"], "to": mb[k]["value"],
                   "delta": mb[k]["value"] - ma[k]["value"]}
               for k in ma.keys() & mb.keys() if ma[k]["value"] is not None and mb[k]["value"] is not None}
    windows = {k: [len(a["windows"][k]), len(b["windows"][k])] for k in a["windows"]}
    window_differences = {k: [{"startDifferenceS": (datetime.fromisoformat(y["startUtc"]) - datetime.fromisoformat(x["startUtc"])).total_seconds(),
                               "endDifferenceS": (datetime.fromisoformat(y["endUtc"]) - datetime.fromisoformat(x["endUtc"])).total_seconds()}
                              for x, y in zip(a["windows"][k], b["windows"][k])] for k in windows}
    topology = all(x == y for x, y in windows.values())
    # With no transitions, equal counts alone would not distinguish always-visible from always-hidden.
    boundary_states = all([(w["truncatedStart"], w["truncatedEnd"]) for w in a["windows"][k]] ==
                          [(w["truncatedStart"], w["truncatedEnd"]) for w in b["windows"][k]] for k in windows)
    maximum = max(deltas, default=0.)
    return {"maxEventDifferenceS": maximum, "matchedEvents": len(deltas), "countMismatches": mismatch,
            "windowCounts": windows, "windowDifferences": window_differences,
            "pairedEventDifferences": pairs, "metricDifferences": metrics,
            "pass": not mismatch and topology and boundary_states and maximum <= 600.
                    and a["coverageStatus"] == b["coverageStatus"] == "covered"}


def validate(dataset_path, output, raw="data/raw", cache="data/interim"):
    data = Dataset(dataset_path)
    refined = data.manifest.get("refined", False)
    radius, angle, step = (25., .05, 10.) if refined else (20., .1, 60.)
    fine = DEM(Path(raw) / "lola/ldem_85s_20m.lbl")
    middle = DEM(Path(raw) / "lola/ldem_80s_80m.lbl")
    far = DEM(Path(raw) / "lola/ldem_75s_120m.lbl")
    geo, version, rows = Geometry(raw, cache), engine_version(), []
    for site in (s for s in list_sites() if s["id"] in POLAR20_SITES):
        for height in (2., 10.):
            original = data.get_scenario(site["id"], "2026-12-01T00:00:00Z", heightM=height, modelLevel="lola")["data"][0]
            for name, r, az, seconds in (("azimuth", radius, angle/2, step),
                                         ("time", radius, angle, step/2 if refined else 10.),
                                         ("fineRadius", 27.5 if refined else 25., angle, step)):
                print(f'Check {site["id"]} h={height:g} {name}', flush=True)
                profile = polar20_profile(fine, middle, far, site, height, cache, r, az)
                request = normalized_request(site, height=height, step=seconds)
                candidate = compute(geo, site, request, version, "numerical-check", profile, include_series=False)
                validate_scenario(candidate)
                rows.append({"siteId": site["id"], "heightM": height, "test": name,
                             "referenceScenarioId": original["scenarioId"], "candidateProfileId": profile["profileId"],
                             "parameters": {"fineRadiusKm": r, "azimuthStepDeg": az, "computeStepS": seconds},
                             **differences(original, candidate)})
    report = {"schemaVersion": "1.0.0", "generatedAt": utc_now(), "datasetVersion": data.manifest["datasetVersion"],
              "datasetManifestSha256": sha256(data.root / "manifest.json"), "engineVersion": version,
              "toleranceEventS": 600., "toleranceOrigin": "team numerical acceptance inherited from data.md T9, not mission accuracy",
              "numericalAcceptance": "accepted" if all(r["pass"] for r in rows) else "rejected",
              "validationStatus": "not_validated", "tests": rows,
              "limits": ["December 2026 only; numerical sensitivity is not validation against observed lunar shadows.",
                         "No physical error bound, exact eclipses, power, thermal or radio-link validation."]}
    write_json(output, report)
    return {"report": str(output), "numericalAcceptance": report["numericalAcceptance"],
            "passed": sum(r["pass"] for r in rows), "total": len(rows)}
