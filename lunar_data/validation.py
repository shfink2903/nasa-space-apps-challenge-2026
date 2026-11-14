"""Scientific checks with tolerances declared in data.md before execution."""
from __future__ import annotations

import csv
import io
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

import certifi
import numpy as np

from .catalog import list_sites
from .common import DataError, identity, read_json, sha256, utc_now, write_json
from .geometry import Geometry, az_el, site_vector, time_grid
from .pipeline import engine_version
from .scenario import compute, normalized_request
from .sources import USER_AGENT
from .terrain import DEM, combined_profile, interpolate_horizon, spherical_elevation

REFERENCES = [
    ("T1", "SUN", .67416, 23.47314, 268.648713, -13.422339),
    ("T2", "EARTH", .67416, 23.47314, 272.422269, 73.108865),
    ("T3", "SUN", -80.13, 1.44, 278.248393, 2.921647),
    ("T4", "EARTH", -80.13, 1.44, 5.286070, 8.221100),
    ("T5", "EARTH", -45.444, 177.599, 192.921151, -45.370087),
]


def horizons_reference(raw, test_id, target, lat, lon):
    params = {"format": "text", "COMMAND": "'10'" if target == "SUN" else "'399'", "CENTER": "'coord@301'",
              "COORD_TYPE": "'GEODETIC'", "SITE_COORD": f"'{lon},{lat},0'", "MAKE_EPHEM": "'YES'",
              "EPHEM_TYPE": "'OBSERVER'", "START_TIME": "'2026-12-01'", "STOP_TIME": "'2026-12-01 03:00'",
              "STEP_SIZE": "'3h'", "QUANTITIES": "'4,20'", "ANG_FORMAT": "'DEG'", "APPARENT": "'AIRLESS'", "CSV_FORMAT": "'YES'"}
    path = Path(raw) / "horizons" / f"{test_id}_{identity(params)}.txt"
    if path.exists():
        text = path.read_text()
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context(cafile=certifi.where())) as response:
            text = response.read().decode()
        if "$$SOE" not in text or "$$EOE" not in text:
            raise DataError("source_format_changed", "Horizons", "ephemeris markers absent")
        path.write_text(text)
        write_json(path.with_suffix(".source.json"), {"url": url, "retrievedAt": utc_now(), "sha256": sha256(path), "params": params})
    lines = text.splitlines()
    header = next((line for line in lines if "Date__(UT)__HR:MN" in line and "Azi" in line and "Elev" in line), None)
    if header is None:
        raise DataError("source_format_changed", "Horizons", "expected columns absent")
    headings = next(csv.reader([header]))
    az_index = next((i for i, h in enumerate(headings) if h.strip() == "Azi_(a-app)"), None)
    el_index = next((i for i, h in enumerate(headings) if h.strip() == "Elev_(a-app)"), None)
    if az_index is None or el_index is None:
        raise DataError("source_format_changed", "Horizons", headings)
    row = next(csv.reader(io.StringIO(text.split("$$SOE")[1].split("$$EOE")[0].strip())))
    return {"azimuthDeg": float(row[az_index]), "elevationDeg": float(row[el_index]), "raw": str(path), "sha256": sha256(path)}


def event_difference(a, b):
    from datetime import datetime
    groups = {(e["body"], e["convention"], e["type"]) for e in a["events"] + b["events"] if e["type"] != "grazing"}
    diffs, mismatch = [], []
    for key in groups:
        aa = [e for e in a["events"] if (e["body"], e["convention"], e["type"]) == key]
        bb = [e for e in b["events"] if (e["body"], e["convention"], e["type"]) == key]
        if len(aa) != len(bb):
            mismatch.append({"key": key, "counts": [len(aa), len(bb)]})
        else:
            diffs.extend(abs((datetime.fromisoformat(x["tUtc"]) - datetime.fromisoformat(y["tUtc"])).total_seconds()) for x, y in zip(aa, bb))
    return {"maxEventDifferenceS": max(diffs) if diffs else None, "matchedEvents": len(diffs), "countMismatches": mismatch,
            "pass": not mismatch and bool(diffs) and max(diffs) <= 600.}


def validate(raw="data/raw", output="docs/validation/scientific-v1.json", terrain=False, live_horizons=False):
    out = Path(output)
    if out.exists():
        raise DataError("immutable_report_exists", str(out))
    executed_version = engine_version()
    geo = Geometry(raw)
    et = geo.et("2026-12-01T00:00:00Z")
    vectors = geo.vectors([et])
    rows = []
    for tid, body, lat, lon, az, el in REFERENCES:
        reference = {"azimuthDeg": az, "elevationDeg": el, "source": "data.md §15.1"}
        if live_horizons:
            reference = horizons_reference(raw, tid, body, lat, lon)
        obtained = az_el(body, vectors[body], site_vector(lat, lon, 0))
        actual = {"azimuthDeg": float(obtained["az"][0]), "elevationDeg": float(obtained["el"][0])}
        delta = {"azimuthDeg": abs((actual["azimuthDeg"] - reference["azimuthDeg"] + 180) % 360 - 180),
                 "elevationDeg": abs(actual["elevationDeg"] - reference["elevationDeg"])}
        rows.append({"testId": tid, "inputs": {"latDeg": lat, "lonDeg": lon, "body": body, "utc": "2026-12-01T00:00:00Z", "heightAboveSphereM": 0},
                     "expected": reference, "obtained": actual, "delta": delta, "toleranceDeg": .01,
                     "status": "pass" if max(delta.values()) <= .01 else "fail"})
    end = geo.et("2027-12-24T00:00:00Z")
    ets = time_grid(et, end - et, 60.)
    vv = geo.cached_vectors(ets)
    g = {b: az_el(b, vv[b], site_vector(-89.5, 0, 2)) for b in ("SUN", "EARTH")}
    subsolar = np.degrees(np.arcsin(vv["SUN"][:, 2] / np.linalg.norm(vv["SUN"], axis=1)))
    far = az_el("EARTH", vv["EARTH"], site_vector(-45.444, 177.599, 2))["el"]
    bounds = [("sunRadiusDeg", g["SUN"]["radius"], .26, .275), ("earthRadiusDeg", g["EARTH"]["radius"], .89, 1.03),
              ("sunElevationDeg", g["SUN"]["el"], -2.1, 2.1), ("earthElevationDeg", g["EARTH"]["el"], -7.6, 7.6),
              ("subSolarLatDeg", subsolar, -1.6, 1.6), ("change4EarthElevationDeg", far, -90, 0)]
    checks = [{"quantity": key, "expectedRange": [lo, hi], "obtainedRange": [float(arr.min()), float(arr.max())],
               "pass": bool(arr.min() >= lo and arr.max() <= hi)} for key, arr, lo, hi in bounds]
    rows.append({"testId": "T6", "status": "pass" if all(c["pass"] for c in checks) else "fail", "epochCount": len(ets), "checks": checks})
    for height, expected in ((2., -.0869), (10., -.1944)):
        distances = np.arange(.001, 10, .001)
        e = spherical_elevation(distances, 0, 0, height)
        obtained = float(e.max())
        rows.append({"testId": "T7", "observerHeightM": height, "expectedDeg": expected, "obtainedDeg": obtained,
                     "distanceOfMaxKm": float(distances[np.argmax(e)]), "toleranceDeg": .001,
                     "status": "pass" if abs(obtained - expected) <= .001 else "fail"})
    wall = float(spherical_elevation(10, 1000, 0, 2))
    rows.append({"testId": "T8", "expectedDeg": 5.533, "obtainedDeg": wall, "toleranceDeg": .01, "status": "pass" if abs(wall - 5.533) <= .01 else "fail"})
    domain = [{"modelLevel": "geometric", "sites": [r["inputs"] for r in rows if "inputs" in r], "date": "2026-12-01T00:00:00Z", "heightAboveSphereM": 0}]
    if terrain:
        site = next(s for s in list_sites() if s["id"] == "sp_s8950")
        near = DEM(Path(raw) / "lola/ldem_80s_80m.lbl")
        wide = DEM(Path(raw) / "lola/ldem_75s_120m.lbl")
        version = executed_version
        for height in (2., 10.):
            print(f"Convergence {site['id']} h={height:g}", flush=True)
            profiles = {str(r): near.profile(site, height, r, cache="data/interim") for r in (50., 100., 150.)}
            profiles["300.0"] = wide.profile(site, height, 300., cache="data/interim")
            profiles["composite300"] = combined_profile(near, wide, site, height, 300., .1, "data/interim")
            profiles["fine"] = combined_profile(near, wide, site, height, 300., .05, "data/interim")
            scenarios = {key: compute(geo, site, normalized_request(site, height=height), version, "validation", p, include_series=False) for key, p in profiles.items()}
            fine_request = normalized_request(site, height=height, step=10.)
            scenarios["timeFine"] = compute(geo, site, fine_request, version, "validation", profiles["fine"], include_series=False)
            deltas = []
            for a, b in (("50.0", "100.0"), ("100.0", "150.0"), ("150.0", "300.0"), ("150.0", "composite300"), ("composite300", "fine"), ("fine", "timeFine")):
                delta = event_difference(scenarios[a], scenarios[b])
                if b != "timeFine":
                    angles = profiles[a]["azimuthDeg"]
                    aa, bb = interpolate_horizon(angles, profiles[a]), interpolate_horizon(angles, profiles[b])
                    delta["maxProfileDifferenceDeg"] = float(np.nanmax(np.abs(aa - bb)))
                deltas.append({"from": a, "to": b, **delta})
            required = deltas[2:]
            rows.append({"testId": "T9", "siteId": site["id"], "heightM": height, "toleranceEventS": 600., "comparisons": deltas,
                         "status": "pass" if all(x["pass"] for x in required) else "fail",
                         "compositeMethodStatus": "pass" if all(x["pass"] for x in deltas[3:]) else "fail",
                         "profileIds": {key: p["profileId"] for key, p in profiles.items()},
                         "limits": ["Original whole-product T9 acceptance retained, including failures. Additional fixed-observer composite radius test is separate; it does not erase the original failure. Observed differences are not physical error bounds."]})
            for key, p in profiles.items():
                write_json(out.parent / "profiles" / f'{p["profileId"]}.json', p) if not (out.parent / "profiles" / f'{p["profileId"]}.json').exists() else None
            domain.append({"modelLevel": "lola", "siteId": site["id"], "heightM": height, "dateRange": ["2026-12-01", "2026-12-31"],
                           "status": "convergence_checked_only", "products": [near.product, wide.product]})
    else:
        rows.append({"testId": "T9", "status": "not_tested", "reason": "terrain flag not requested"})
    report = {"schemaVersion": "1.0.0", "generatedAt": utc_now(), "engineVersion": executed_version,
              "kernelSetId": geo.kernel_set_id, "sources": geo.sources, "tests": rows, "verifiedDomain": domain,
              "limits": ["Agreement with Horizons tests implementation, not independent physical accuracy.",
                         "T10–T12 are exercised by pytest, not counted in this scientific report."]}
    write_json(out, report)
    return report
