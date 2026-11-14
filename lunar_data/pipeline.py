"""Build an immutable offline bundle, then verify every link and file before publication."""
from __future__ import annotations

import gzip
import importlib.metadata
import os
import platform
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from .catalog import list_sites
from .common import DataError, canonical, identity, read_json, sha256, utc_now, write_json
from .compare import compare, evidence
from .geometry import Geometry, time_grid
from .scenario import compute, normalized_request
from .terrain import DEM, combined_profile, destination


def engine_version():
    source = {p.name: sha256(p) for p in sorted(Path(__file__).parent.glob("*.py"))}
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = "unavailable"
    return f"{commit}+source.{identity(source, 16)}"


def save_scenario(path, scenario):
    """Keep summaries small; lossless display series in a linked deterministic gzip."""
    series = scenario.pop("series", None)
    if series is not None:
        relative = f'series/{scenario["scenarioId"]}.json.gz'
        destination_path = path / relative
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        with destination_path.open("xb") as raw:
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as stream:
                stream.write(canonical(series).encode())
        scenario["seriesRef"] = {"path": relative, "encoding": "gzip", "sha256": sha256(destination_path),
                               "uncompressedSizeBytes": len(canonical(series).encode())}
    write_json(path / "scenarios" / f'{scenario["scenarioId"]}.json', scenario)


def token_count(value):
    import tiktoken
    # Explicit context accounting tokenizer, not a claim about an unchosen model.
    text = canonical(value)
    return {"tokenizer": "cl100k_base", "count": len(tiktoken.get_encoding("cl100k_base").encode(text)), "utf8Bytes": len(text.encode())}


def build(output="data/processed/v1", raw="data/raw", cache="data/interim", starts=52, terrain=True,
          heights=(2., 10.), site_ids=None, parent=None, sensitivity=False):
    out = Path(output)
    if out.exists() or out.with_name(out.name + ".tmp").exists():
        raise DataError("immutable_dataset_exists", str(out), "choose a new version; no overwrite")
    if not isinstance(starts, int) or not 1 <= starts <= 52:
        raise DataError("invalid_request", "starts", "1 to 52 weekly starts required")
    if parent is not None:
        verify(parent)
    elif out.name != "v1":
        raise DataError("invalid_request", "parent", "non-v1 releases require parent dataset")
    staging = out.with_name(out.name + ".tmp")
    staging.mkdir(parents=True)
    clock = time.perf_counter()
    geo = Geometry(raw, cache)
    sites = list_sites()
    if site_ids:
        unknown = set(site_ids) - {s["id"] for s in sites}
        if unknown:
            raise DataError("invalid_request", "siteIds", sorted(unknown))
        sites = [s for s in sites if s["id"] in site_ids]
    version = engine_version()
    et0 = geo.et("2026-12-01T00:00:00Z")
    # Full documented grid through 2027-12-24, independent of sweep count.
    annual_end = geo.et("2027-12-24T00:00:00Z")
    annual_ets = time_grid(et0, annual_end - et0, 60.)
    vectors = geo.cached_vectors(annual_ets)
    ephem_elapsed = time.perf_counter() - clock
    dem_cache, profiles, scenarios, timings = {}, {}, [], []
    days = [datetime(2026, 12, 1, tzinfo=timezone.utc) + timedelta(weeks=i) for i in range(starts)]
    try:
        for site in sites:
            sid = site["id"]
            levels = ["geometric"] + (["lola"] if terrain and site["terrainProduct"] else [])
            for level in levels:
                for height in heights:
                    profile = None
                    if level == "lola":
                        product = site["terrainProduct"]
                        if product not in dem_cache:
                            dem_cache[product] = DEM(Path(raw) / "lola" / f"{product}.lbl")
                        tick = time.perf_counter()
                        extended = {"ldem_80s_80m": "ldem_75s_120m", "ldem_75s_120m": "ldem_60s_240m"}.get(product)
                        if extended:
                            if extended not in dem_cache:
                                dem_cache[extended] = DEM(Path(raw) / "lola" / f"{extended}.lbl")
                            profile = combined_profile(dem_cache[product], dem_cache[extended], site, height, cache=cache)
                        else:
                            profile = dem_cache[product].profile(site, height, cache=cache)
                        profile["demSource"] = dem_cache[product].source
                        profiles[profile["profileId"]] = profile
                        write_json(staging / "horizons" / f'{sid}_h{height:g}m_{profile["profileId"]}.json', profile)
                        site["groundHeightM"] = profile["groundHeightM"]
                        site["groundHeightSource"] = {"product": product, "sha256": profile["demSha256"]}
                        site["groundHeightReason"] = None
                        timings.append({"kind": "profile", "siteId": sid, "heightM": height, "seconds": time.perf_counter() - tick})
                    sweep = []
                    for day in days:
                        tick = time.perf_counter()
                        start = day.isoformat().replace("+00:00", "Z")
                        offset = round((geo.et(start) - et0) / 60.)
                        # ET seconds are uniform; UTC/TDB small periodic differences
                        # mean weekly UTC starts do not land exactly on this grid.
                        # Use exact per-scenario times, interpolate vectors only if
                        # offset differs <= 2 ms; otherwise compute a new grid.
                        req = normalized_request(site, start=start, height=height)
                        ets = time_grid(geo.et(start), 2592000., 60.)
                        if abs(annual_ets[offset] - ets[0]) <= .002:
                            vv = {body: np.stack([np.interp(ets, annual_ets, arr[:, j]) for j in range(3)], axis=1) for body, arr in vectors.items()}
                        else:
                            vv = geo.cached_vectors(ets)
                        print(f"Compute {sid} h={height:g} {level} {start}", flush=True)
                        scenario = compute(geo, site, req, version, out.name, profile, vv, ets)
                        scenario["limits"].append("Annual vectors interpolated to exact UTC grid (offset <= 2 ms); events recomputed directly.")
                        save_scenario(staging, scenario)
                        site["scenarioIds"].append(scenario["scenarioId"])
                        scenarios.append(scenario)
                        sweep.append({"scenarioId": scenario["scenarioId"], "surfaceStartUtc": start,
                                      "metrics": scenario["metrics"], "evaluation": scenario["evaluation"],
                                      "modelLevel": level, "coverageStatus": scenario["coverageStatus"],
                                      "validationStatus": scenario["validationStatus"]})
                        timings.append({"kind": "scenario", "scenarioId": scenario["scenarioId"], "seconds": time.perf_counter() - tick})
                    write_json(staging / "sweeps" / f"{sid}_h{height:g}m_{level}_dates.json", {
                        "schemaVersion": "1.0.0", "siteId": sid, "heightM": height, "modelLevel": level,
                        "total": len(sweep), "returned": len(sweep), "rows": sweep,
                        "explored": {"firstStartUtc": sweep[0]["surfaceStartUtc"], "lastStartUtc": sweep[-1]["surfaceStartUtc"], "weeklyStarts": starts, "analysisDurationS": 2592000.}})
        # A comparison remains bounded to 60 scenarios and never mixes terrain levels.
        comparisons = []
        token_counts = []
        for day in days:
            start = day.isoformat().replace("+00:00", "Z")
            for level in ("geometric", "lola"):
                group = [s for s in scenarios if s["modelLevel"] == level and s["request"]["surfaceStartUtc"]["value"] == start]
                for first in range(0, len(group), 60):
                    subset = group[first:first + 60]
                    c = compare(subset)
                    cid = c["comparisonId"]
                    write_json(staging / "comparisons" / f"{cid}.json", c)
                    packet = evidence(c, subset, sites)
                    count = token_count(packet)
                    token_counts.append({"comparisonId": cid, **count})
                    write_json(staging / "ai" / f"{cid}.evidence.json", {**packet, "contextSize": count})
                    comparisons.append(cid)
        if sensitivity:
            for site in [s for s in sites if s["id"].startswith("sp_")]:
                for height in heights:
                    grid = sensitivity_grid(geo, site, height, dem_cache[site["terrainProduct"]], cache, version, out.name,
                                            far_dem=dem_cache["ldem_75s_120m"])
                    write_json(staging / "sensitivity" / f'{site["id"]}_h{height:g}m_grid1km.json', grid)
        write_json(staging / "sites.json", {"schemaVersion": "1.0.0", "sites": sites, "total": len(sites), "returned": len(sites), "unavailable": [], "next": None})
        write_json(staging / "index.json", {"schemaVersion": "1.0.0", "scenarioIds": [s["scenarioId"] for s in scenarios],
                   "comparisonIds": comparisons, "profileIds": list(profiles), "total": len(scenarios)})
        write_json(staging / "performance.json", {"machine": platform.platform(), "python": platform.python_version(),
                   "dependencies": {p: importlib.metadata.version(p) for p in ("numpy", "spiceypy", "scipy", "rasterio", "pyproj")},
                   "ephemerisSeconds": ephem_elapsed, "ephemerisEpochs": len(annual_ets), "timings": timings,
                   "evidenceContextSizes": token_counts, "totalSecondsBeforeManifest": time.perf_counter() - clock})
        records = read_json(Path(raw) / "SOURCES.json")
        write_json(staging / "sources.json", records)
        write_json(staging / "schema" / "scenario.schema.json", read_json("schemas/scenario.schema.json"))
        validation_reports = sorted(Path("docs/validation").glob("scientific*.json"))
        for report in validation_reports:
            write_json(staging / "validation" / report.name, read_json(report))
        files = [{"path": str(p.relative_to(staging)), "sizeBytes": p.stat().st_size, "sha256": sha256(p)} for p in sorted(staging.rglob("*")) if p.is_file()]
        manifest = {"schemaVersion": "1.0.0", "datasetVersion": out.name, "generatedAt": utc_now(),
                    "parent": {"datasetVersion": read_json(Path(parent) / "manifest.json")["datasetVersion"], "manifestSha256": sha256(Path(parent) / "manifest.json")} if parent else None,
                    "engineVersion": version, "kernelSetId": geo.kernel_set_id,
                    "kernelLoadOrder": [x["product"] for x in geo.sources],
                    "coverageUtc": [geo.utc(t) for t in geo.coverage], "terrainProducts": list(dem_cache),
                    "validationStatus": "not_validated", "releaseStatus": "prepared_pending_ui_review",
                    "levelsPrepared": ["N0", "N2"] + (["N1_experimental"] if profiles else []) + (["N3_sensitivity_experimental"] if sensitivity else []),
                    "notEvaluated": ["UI review", "live OpenRouter provider", "full physical error bounds"],
                    "files": files, "fileCount": len(files), "totalSizeBytes": sum(f["sizeBytes"] for f in files)}
        write_json(staging / "manifest.json", manifest)
        verify(staging)
        os.rename(staging, out)
        return {"path": str(out), "scenarioCount": len(scenarios), "profileCount": len(profiles),
                "comparisonCount": len(comparisons), "sizeBytes": manifest["totalSizeBytes"], "seconds": time.perf_counter() - clock}
    except Exception:
        # Deliberately retain staging for diagnosis; never publish a partial bundle.
        raise


def verify(dataset):
    root = Path(dataset)
    from .common import check_schema
    manifest = read_json(root / "manifest.json")
    check_schema(manifest)
    listed = [x["path"] for x in manifest["files"]]
    actual = {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file() and p != root / "manifest.json"}
    if len(set(listed)) != len(listed) or set(listed) != actual:
        raise DataError("invalid_manifest", "files", "duplicate, missing or unlisted files")
    for entry in manifest["files"]:
        path = root / entry["path"]
        if not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
            raise DataError("invalid_manifest_path", entry["path"])
        if path.stat().st_size != entry["sizeBytes"] or sha256(path) != entry["sha256"]:
            raise DataError("integrity_failure", entry["path"])
        if path.suffix == ".json":
            value = read_json(path)
            if "schemaVersion" in value:
                check_schema(value)
    index = read_json(root / "index.json")
    import jsonschema
    validator = jsonschema.Draft202012Validator(read_json(root / "schema/scenario.schema.json")) if (root / "schema/scenario.schema.json").exists() else None
    scenario_ids = set(index["scenarioIds"])
    profiles = set(index["profileIds"])
    for sid in scenario_ids:
        s = read_json(root / "scenarios" / f"{sid}.json")
        if validator:
            errors = list(validator.iter_errors(s))
            if errors:
                raise DataError("invalid_scenario_schema", sid, errors[0].message)
        if s["scenarioId"] != sid or s["profileId"] is not None and s["profileId"] not in profiles:
            raise DataError("broken_reference", sid)
        if "seriesRef" in s:
            path = root / s["seriesRef"]["path"]
            if not path.resolve().is_relative_to(root.resolve()) or sha256(path) != s["seriesRef"]["sha256"]:
                raise DataError("broken_reference", sid, "series")
            with gzip.open(path, "rt") as f:
                import json
                series = json.load(f, parse_constant=lambda x: (_ for _ in ()).throw(DataError("invalid_json", x)))
            for name, col in series.items():
                if isinstance(col, list) and name != "timesUtc" and len(col) != series["n"]:
                    raise DataError("invalid_series", sid, name)
    for cid in index["comparisonIds"]:
        c = read_json(root / "comparisons" / f"{cid}.json")
        if not set(c["scenarioIds"]).issubset(scenario_ids):
            raise DataError("broken_reference", cid)
        if not (root / "ai" / f"{cid}.evidence.json").is_file():
            raise DataError("broken_reference", cid, "evidence")
    return {"status": "pass", "filesChecked": len(manifest["files"]), "scenarioCount": len(scenario_ids), "networkUsed": False}


def compute_custom_point(latDeg, lonDeg, startUtc, durationDays=30., heightM=2., raw="data/raw", cache="data/interim", dataset_version="custom"):
    """Preparation tool, never called implicitly by the offline Dataset reader."""
    from .geometry import validate_point
    from .common import finite
    validate_point(latDeg, lonDeg)
    finite(durationDays, "durationDays", 1e-6, 365.)
    point = {"id": "custom_" + identity({"latDeg": latDeg, "lonDeg": lonDeg}), "latDeg": latDeg, "lonDeg": lonDeg,
             "coordinateOrigin": "user", "sources": [], "name": "Custom point", "status": "study_point"}
    geo = Geometry(raw, cache)
    profile = None
    if latDeg <= -84.95:
        near = DEM(Path(raw) / "lola/ldem_80s_80m.lbl")
        far = DEM(Path(raw) / "lola/ldem_75s_120m.lbl")
        profile = combined_profile(near, far, point, heightM, cache=cache)
    request = normalized_request(point, startUtc, durationDays * 86400, heightM)
    for key in ("surfaceStartUtc", "analysisDurationS", "observerHeightM"):
        request[key]["origin"] = "user"
    result = compute(geo, point, request, engine_version(), dataset_version, profile)
    return {"scenario": result, "profile": profile, "point": point}


def sensitivity_grid(geo, site, height, dem, cache, version, dataset_version, far_dem=None):
    rows = []
    for north in range(-2, 3):
        for east in range(-2, 3):
            distance = float(np.hypot(north, east))
            bearing = float(np.arctan2(east, north))
            lat, lon = destination(np.radians(site["latDeg"]), np.radians(site["lonDeg"]), bearing, distance)
            point = {**site, "id": f'{site["id"]}_n{north}_e{east}', "latDeg": float(np.degrees(lat)),
                     "lonDeg": float((np.degrees(lon) + 180) % 360 - 180), "coordinateOrigin": "team_default_hackathon"}
            profile = combined_profile(dem, far_dem, point, height, cache=cache) if far_dem else dem.profile(point, height, cache=cache)
            scenario = compute(geo, point, normalized_request(point, height=height), version, dataset_version, profile, include_series=False)
            rows.append({"northOffsetKm": north, "eastOffsetKm": east, "latDeg": point["latDeg"], "lonDeg": point["lonDeg"],
                         "profile": profile, "scenarioId": scenario["scenarioId"], "metrics": scenario["metrics"], "coverageStatus": scenario["coverageStatus"]})
    ranges = []
    for metric in rows[0]["metrics"]:
        values = [next(m for m in row["metrics"] if m["metricId"] == metric["metricId"])["value"] for row in rows]
        known = [x for x in values if x is not None]
        ranges.append({"metricId": metric["metricId"], "min": min(known) if known else None,
                       "max": max(known) if known else None, "knownCount": len(known), "totalCount": 25, "unit": metric["unit"]})
    return {"schemaVersion": "1.0.0", "siteId": site["id"], "heightM": height, "modelLevel": "lola",
            "validationStatus": "not_validated", "coverageStatus": "covered" if all(r["coverageStatus"] == "covered" for r in rows) else "partial",
            "grid": {"size": [5, 5], "spacingKm": 1., "origin": "team_default_hackathon", "method": "great-circle offsets from center"},
            "rows": rows, "ranges": ranges, "limits": ["25 explored points only; variation is not a probability or a regional optimum."]}
