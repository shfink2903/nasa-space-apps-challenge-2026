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
from .common import DataError, canonical, finite, identity, read_json, sha256, utc_now, write_json
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
    # Reject invalid combinations before touching staging, scientific inputs or caches.
    if isinstance(starts, bool) or not isinstance(starts, int) or not 1 <= starts <= 52:
        raise DataError("invalid_request", "starts", "1 to 52 weekly starts required")
    if not isinstance(terrain, bool) or not isinstance(sensitivity, bool):
        raise DataError("invalid_request", "terrain/sensitivity", "boolean flags required")
    if sensitivity and not terrain:
        raise DataError("invalid_request", "sensitivity", "terrain is required for sensitivity grids")
    if not isinstance(heights, (list, tuple)) or not heights:
        raise DataError("invalid_request", "heights", "at least one observer height required")
    for height in heights:
        finite(height, "observerHeightM", 0)
    if len(set(heights)) != len(heights):
        raise DataError("invalid_request", "heights", "duplicate observer heights")
    sites = list_sites()
    if site_ids is not None:
        if not isinstance(site_ids, (list, tuple)) or not site_ids or any(not isinstance(sid, str) for sid in site_ids):
            raise DataError("invalid_request", "siteIds", "nonempty list of catalogue identifiers required")
        unknown = set(site_ids) - {s["id"] for s in sites}
        if unknown or len(set(site_ids)) != len(site_ids):
            raise DataError("invalid_request", "siteIds", sorted(unknown) if unknown else "duplicate identifiers")
        sites = [s for s in sites if s["id"] in site_ids]
    out = Path(output)
    if out.exists() or out.with_name(out.name + ".tmp").exists():
        raise DataError("immutable_dataset_exists", str(out), "choose a new version; no overwrite")
    if parent is not None:
        verify(parent)
    elif out.name != "v1":
        raise DataError("invalid_request", "parent", "non-v1 releases require parent dataset")
    staging = out.with_name(out.name + ".tmp")
    staging.mkdir(parents=True)
    clock = time.perf_counter()
    geo = Geometry(raw, cache)
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
        files = [{"path": str(p.relative_to(staging)), "sizeBytes": p.stat().st_size, "sha256": sha256(p)} for p in sorted(staging.rglob("*")) if p.is_file() and not _os_metadata(p)]
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


def _os_metadata(path):
    # Finder metadata carries no scientific payload. Do not ignore arbitrary hidden
    # files, directories or names beginning with a dot.
    return path.name == ".DS_Store"


def _utc_seconds(value, field):
    if not isinstance(value, str) or not value.endswith("Z") or "T" not in value:
        raise DataError("invalid_scenario", field, "ISO 8601 UTC with Z required")
    try:
        return datetime.fromisoformat(value[:-1] + "+00:00").timestamp()
    except ValueError as exc:
        raise DataError("invalid_scenario", field, "invalid UTC timestamp") from exc


def validate_scenario(scenario):
    """Check semantic invariants even when a released bundle has an older schema.

    This validates the data contract, not the physical accuracy of the model.
    Serialized UTC timestamps are millisecond-rounded; numerical checks allow
    10 ms plus 1 ms per interval for rounding and the UTC/TDB rate difference.
    """
    sid = scenario["scenarioId"]
    request = scenario["request"]

    def fail(field, detail):
        raise DataError("invalid_scenario", f"{sid}.{field}", detail)

    def number(value, field, lo=None, hi=None):
        try:
            return finite(value, field, lo, hi)
        except DataError as exc:
            fail(field, exc.detail)

    expected_units = {"analysisDurationS": "s", "observerHeightM": "m", "computeStepS": "s", "displayStepS": "s"}
    for field, unit in expected_units.items():
        if field not in request:
            if field == "displayStepS":
                continue
            fail(field, "missing parameter")
        parameter = request[field]
        if not isinstance(parameter, dict) or parameter.get("unit") != unit or not isinstance(parameter.get("origin"), str) or not parameter["origin"]:
            fail(field, "parameter requires its declared unit and origin")
        value = number(parameter.get("value"), field, 0)
        if field != "observerHeightM" and value <= 0:
            fail(field, "positive value required")
    duration = request["analysisDurationS"]["value"]
    if request["computeStepS"]["value"] > 600:
        fail("computeStepS", "maximum is 600 s")
    if request["surfaceStartUtc"].get("unit") != "UTC":
        fail("surfaceStartUtc", "UTC unit required")
    start = _utc_seconds(request["surfaceStartUtc"]["value"], f"{sid}.surfaceStartUtc")
    if request["siteId"] != scenario["siteId"]:
        fail("siteId", "request and scenario disagree")
    if (scenario["modelLevel"] == "geometric") != (scenario["profileId"] is None):
        fail("profileId", "terrain model and profile disagree")
    expected_suffix = identity({"request": request, "kernelSetId": scenario["kernelSetId"],
                                "profileId": scenario["profileId"], "engineVersion": scenario["engineVersion"]}, 8)
    if not sid.endswith("_" + expected_suffix):
        fail("scenarioId", "does not identify the declared computation")

    keys = {f"{body}.{convention}" for body in ("sun", "earth") for convention in ("anyDisk", "fullDisk")}

    def intervals(rows, field):
        if not isinstance(rows, list):
            fail(field, "window array required")
        result, previous = [], start
        for row in rows:
            if not isinstance(row, dict) or any(k not in row for k in ("startUtc", "endUtc", "truncatedStart", "truncatedEnd")):
                fail(field, "malformed window")
            a, b = [_utc_seconds(row[k], f"{sid}.{field}.{k}") for k in ("startUtc", "endUtc")]
            if b <= a or a < previous - .01 or a < start - .01 or b > start + duration + .01:
                fail(field, "windows must be ordered, disjoint and within the requested period")
            for flag, boundary in (("truncatedStart", abs(a - start) <= .01), ("truncatedEnd", abs(b - start - duration) <= .01)):
                if not isinstance(row[flag], bool) or row[flag] != boundary:
                    fail(field, "invalid truncation flag")
            result.append([a, b]); previous = b
        return result

    parsed = {}
    for field in ("windows", "analysableWindows"):
        if not isinstance(scenario.get(field), dict) or set(scenario[field]) != keys:
            fail(field, "all four body/convention window arrays required")
        parsed[field] = {key: intervals(rows, f"{field}.{key}") for key, rows in scenario[field].items()}
    overlap = intervals(scenario.get("overlapWindows"), "overlapWindows")
    from .windows import duration as window_duration, intersect, subtract
    for key in keys:
        vis, valid = parsed["windows"][key], parsed["analysableWindows"][key]
        if window_duration(subtract(vis, valid)) > .01:
            fail(f"windows.{key}", "visibility outside analysable windows")
    for body in ("sun", "earth"):
        if window_duration(subtract(parsed["windows"][body + ".fullDisk"], parsed["windows"][body + ".anyDisk"])) > .01:
            fail("windows", "full-disk visibility outside any-disk visibility")
    expected_overlap = intersect(parsed["windows"]["sun.anyDisk"], parsed["windows"]["earth.anyDisk"])
    if window_duration(subtract(overlap, expected_overlap)) + window_duration(subtract(expected_overlap, overlap)) > .01:
        fail("overlapWindows", "does not match Sun/Earth visibility intersection")
    metric_ids = [m["metricId"] for m in scenario["metrics"]]
    if len(metric_ids) != len(set(metric_ids)):
        fail("metrics", "duplicate metric identifiers")
    metrics = {m["metricId"]: m for m in scenario["metrics"]}

    def quality_for(valid):
        if not valid:
            return "unknown"
        return "complete" if len(valid) == 1 and abs(valid[0][0] - start) <= .01 and abs(valid[0][1] - start - duration) <= .01 else "partial"

    def check_quality(mid, expected):
        if metrics[mid]["quality"] != expected:
            fail(f"metrics.{mid}.quality", "quality disagrees with analysable windows or metric definition")

    required_metrics = {key + ".fraction" for key in keys}
    required_metrics.update(f"{body}.{suffix}" for body in ("sun", "earth") for suffix in ("anyDisk.longestGapH", "anyDisk.nextSetH", "maxElevDeg"))
    required_metrics.update(("overlap.sunAny_earthAny.fraction", "analysis.analysableFraction", "sun.meanElevWhenAnyDiskDeg", "sun.directIllumination.fraction"))
    if not required_metrics.issubset(metrics):
        fail("metrics", "missing required metrics: " + ", ".join(sorted(required_metrics - metrics.keys())))
    for mid, metric in metrics.items():
        value, den = metric["value"], metric["denominatorS"]
        unit = "1" if mid.endswith((".fraction", "Fraction")) else "h" if mid.endswith(("longestGapH", "nextSetH")) else "deg" if mid.endswith("Deg") else None
        if unit is None or metric["unit"] != unit:
            fail(f"metrics.{mid}", "unknown metric or incorrect unit")
        if den is not None:
            number(den, f"metrics.{mid}.denominatorS", 0, duration + .01)
        if value is None:
            if not isinstance(metric.get("reason"), dict) or not metric["reason"].get("code"):
                fail(f"metrics.{mid}", "null value requires a reason")
        else:
            number(value, f"metrics.{mid}.value", -90 if unit == "deg" else 0,
                   90 if unit == "deg" else 1 if unit == "1" else duration / 3600 + .01)
    for key in keys:
        mid = key + ".fraction"
        if mid not in metrics:
            fail("metrics", f"missing {mid}")
        metric = metrics[mid]
        valid, vis = parsed["analysableWindows"][key], parsed["windows"][key]
        den = window_duration(valid)
        tolerance = .01 + .001 * (len(valid) + len(vis))
        check_quality(mid, quality_for(valid))
        if metric["denominatorS"] is None or abs(metric["denominatorS"] - den) > tolerance:
            fail(f"metrics.{mid}", "denominator disagrees with analysable windows")
        if den and (metric["value"] is None or abs(metric["value"] * metric["denominatorS"] - window_duration(vis)) > tolerance):
            fail(f"metrics.{mid}", "fraction disagrees with visibility windows")
        if not den and metric["value"] is not None:
            fail(f"metrics.{mid}", "no analysable data must produce null")
    overlap_valid = intersect(parsed["analysableWindows"]["sun.anyDisk"], parsed["analysableWindows"]["earth.anyDisk"])
    denominator = window_duration(overlap_valid)
    tolerance = .01 + .001 * (len(overlap_valid) + len(overlap))
    overlap_quality = quality_for(overlap_valid)
    expected_coverage = {"complete": "covered", "partial": "partial", "unknown": "outside"}[overlap_quality]
    if scenario["coverageStatus"] != expected_coverage or scenario["processingStatus"] != ("complete" if expected_coverage == "covered" else "partial"):
        fail("coverageStatus/processingStatus", "statuses disagree with analysable windows")
    check_quality("overlap.sunAny_earthAny.fraction", overlap_quality)
    check_quality("analysis.analysableFraction", "complete")
    check_quality("sun.meanElevWhenAnyDiskDeg", "sampled")
    check_quality("sun.directIllumination.fraction", "unknown")
    for mid, expected_den, numerator in (("overlap.sunAny_earthAny.fraction", denominator, window_duration(overlap)),
                                          ("analysis.analysableFraction", duration, denominator)):
        metric = metrics[mid]
        if metric["denominatorS"] is None or abs(metric["denominatorS"] - expected_den) > tolerance:
            fail(f"metrics.{mid}", "denominator disagrees with windows")
        if expected_den and (metric["value"] is None or abs(metric["value"] * metric["denominatorS"] - numerator) > tolerance):
            fail(f"metrics.{mid}", "fraction disagrees with windows")
        if not expected_den and metric["value"] is not None:
            fail(f"metrics.{mid}", "no analysable data must produce null")
    for body in ("sun", "earth"):
        valid, vis = parsed["analysableWindows"][body + ".anyDisk"], parsed["windows"][body + ".anyDisk"]
        check_quality(body + ".maxElevDeg", "sampled")
        for suffix in ("longestGapH", "nextSetH"):
            mid = body + ".anyDisk." + suffix
            check_quality(mid, quality_for(valid))
            den = metrics[mid]["denominatorS"]
            if den is None or abs(den - window_duration(valid)) > .01 + .001 * len(valid):
                fail(f"metrics.{mid}", "denominator disagrees with analysable windows")
        gaps = subtract(valid, vis)
        expected = max((b - a for a, b in gaps), default=0.) / 3600 if valid else None
        gap_metric = metrics[body + ".anyDisk.longestGapH"]
        actual = gap_metric["value"]
        if (actual is None) != (expected is None) or actual is not None and abs(actual - expected) > .01 / 3600:
            fail(f"metrics.{body}.anyDisk.longestGapH", "gap disagrees with windows")
        flags = ("truncatedStart", "truncatedEnd", "truncatedByMissingData")
        if any(not isinstance(gap_metric.get(flag), bool) for flag in flags):
            fail(f"metrics.{body}.anyDisk.longestGapH", "three boolean truncation flags required")
        # Millisecond serialization can tie nearly equal maximal gaps. Accept
        # only a flag tuple belonging to one of those maximal candidates.
        candidates = [gap for gap in gaps if abs((gap[1] - gap[0]) / 3600 - expected) <= .002 / 3600]
        possible_flags = {(False, False, False)} if not candidates else set()
        for a, b in candidates:
            left, right = abs(a - start) <= .01, abs(b - start - duration) <= .01
            hole = any((abs(a - x) <= .001 and x > start + .01) or (abs(b - y) <= .001 and y < start + duration - .01) for x, y in valid)
            possible_flags.add((left, right, hole))
        if tuple(gap_metric[flag] for flag in flags) not in possible_flags:
            fail(f"metrics.{body}.anyDisk.longestGapH", "truncation flags disagree with longest gap and missing-data boundaries")
        sets = [_utc_seconds(event["tUtc"], sid) for event in scenario["events"] if event["body"] == body and event["convention"] == "anyDisk" and event["type"] == "set"]
        expected = (min(sets) - start) / 3600 if sets else None
        actual = metrics[body + ".anyDisk.nextSetH"]["value"]
        if (actual is None) != (expected is None) or actual is not None and abs(actual - expected) > .01 / 3600:
            fail(f"metrics.{body}.anyDisk.nextSetH", "next set disagrees with events")
    for event in scenario["events"]:
        when = _utc_seconds(event["tUtc"], f"{sid}.events.tUtc")
        lo, hi = event["bracketS"]
        number(lo, "events.bracketS"); number(hi, "events.bracketS")
        if when < start - .01 or when > start + duration + .01 or lo > 0 or hi < 0:
            fail("events", "event or bracket outside its declared bounds")
        if event["type"] != "grazing" and hi - lo > 1.000001:
            fail("events", "rise/set bracket exceeds 1 s")


def validate_series(series, scenario):
    """Validate display data without deriving scientific conclusions from it."""
    sid = scenario["scenarioId"]

    def fail(detail):
        raise DataError("invalid_series", sid, detail)

    if not isinstance(series, dict):
        fail("object required")
    n, step = series.get("n"), series.get("stepS")
    if isinstance(n, bool) or not isinstance(n, int) or n < 2:
        fail("n must be an integer >= 2")
    try:
        finite(step, "stepS", 1e-6)
    except DataError:
        fail("positive finite stepS required")
    request = scenario["request"]
    duration = request["analysisDurationS"]["value"]
    start = _utc_seconds(request["surfaceStartUtc"]["value"], sid)
    if abs(_utc_seconds(series.get("t0Utc"), sid) - start) > .001:
        fail("series start differs from requested start")
    if step != request.get("displayStepS", {"value": 600.})["value"]:
        fail("series step differs from declared display step")
    times = series.get("timesUtc")
    if times is None:
        if abs((n - 1) * step - duration) > 1e-6:
            fail("implicit grid does not span requested duration")
    else:
        if not isinstance(times, list) or len(times) != n:
            fail("explicit time column must contain n values")
        epochs = [_utc_seconds(value, sid) for value in times]
        if abs(epochs[0] - start) > .001 or abs(epochs[-1] - start - duration) > .01 or any(b <= a for a, b in zip(epochs, epochs[1:])):
            fail("explicit time grid must be increasing and span requested duration")
    columns = {"subSolarLatDeg": (-90, 90), "subEarthLatDeg": (-90, 90), "subEarthLonDeg": (-180, 180), "sunVisibleDiskFraction": (0, 1)}
    for body in ("sun", "earth"):
        columns.update({body + "AzDeg": (0, 360), body + "ElDeg": (-90, 90),
                        body + "AngularRadiusDeg": (0, 90), body + "DistanceKm": (0, None)})
    for name, bounds in columns.items():
        col = series.get(name)
        if not isinstance(col, list) or len(col) != n:
            fail(f"{name} must contain n values")
        for value in col:
            if value is not None:
                try:
                    finite(value, name, *bounds)
                except DataError:
                    fail(f"{name} contains an invalid value")
    for name in ("sunState", "earthState", "sunMaskVariesAcrossDisk", "earthMaskVariesAcrossDisk", "earthSunOcclusionPossible"):
        col = series.get(name)
        if not isinstance(col, list) or len(col) != n:
            fail(f"{name} must contain n values")
        if name.endswith("State"):
            if any(value is not None and (type(value) is not int or value not in (0, 1, 2)) for value in col):
                fail(f"{name} requires 0, 1, 2 or null")
        elif any(not isinstance(value, bool) for value in col):
            fail(f"{name} requires boolean values")
    for name, col in series.items():
        if isinstance(col, list) and len(col) != n:
            fail(f"{name} length differs from n")


def verify(dataset):
    root = Path(dataset)
    from .common import check_schema
    manifest = read_json(root / "manifest.json")
    check_schema(manifest)
    listed = [x["path"] for x in manifest["files"]]
    actual = {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file() and p != root / "manifest.json" and not _os_metadata(p)}
    if len(set(listed)) != len(listed) or set(listed) != actual:
        raise DataError("invalid_manifest", "files", "duplicate, missing or unlisted files")
    if manifest.get("fileCount") != len(listed) or manifest.get("totalSizeBytes") != sum(entry["sizeBytes"] for entry in manifest["files"]):
        raise DataError("invalid_manifest", "totals", "file count or byte count differs")
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
    for field in ("scenarioIds", "profileIds", "comparisonIds"):
        ids = index.get(field)
        if not isinstance(ids, list) or any(not isinstance(value, str) or not value for value in ids) or len(set(ids)) != len(ids):
            raise DataError("invalid_index", field, "unique string identifiers required")
    if index.get("total") != len(index["scenarioIds"]):
        raise DataError("invalid_index", "total")
    import jsonschema
    schema_path = Path(__file__).resolve().parent.parent / "schemas/scenario.schema.json"
    if not schema_path.is_file():
        schema_path = root / "schema/scenario.schema.json"
    validator = jsonschema.Draft202012Validator(read_json(schema_path), format_checker=jsonschema.FormatChecker())
    scenario_ids = set(index["scenarioIds"])
    profiles = set(index["profileIds"])
    for sid in scenario_ids:
        s = read_json(root / "scenarios" / f"{sid}.json")
        error = next(validator.iter_errors(s), None)
        if error:
            raise DataError("invalid_scenario_schema", sid, error.message)
        validate_scenario(s)
        if any(s[key] != manifest[key] for key in ("datasetVersion", "engineVersion", "kernelSetId")):
            raise DataError("invalid_scenario", sid, "scenario and manifest versions differ")
        if s["scenarioId"] != sid or s["profileId"] is not None and s["profileId"] not in profiles:
            raise DataError("broken_reference", sid)
        if "seriesRef" in s:
            path = root / s["seriesRef"]["path"]
            if not path.resolve().is_relative_to(root.resolve()) or sha256(path) != s["seriesRef"]["sha256"]:
                raise DataError("broken_reference", sid, "series")
            with gzip.open(path, "rb") as f:
                raw_series = f.read()
            import json
            series = json.loads(raw_series, parse_constant=lambda x: (_ for _ in ()).throw(DataError("invalid_json", x)))
            if "uncompressedSizeBytes" in s["seriesRef"] and len(raw_series) != s["seriesRef"]["uncompressedSizeBytes"]:
                raise DataError("invalid_series", sid, "uncompressed byte count differs")
            validate_series(series, s)
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
