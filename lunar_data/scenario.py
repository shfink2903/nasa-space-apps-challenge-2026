"""Scenario computation; presentation samples never feed event metrics."""
from __future__ import annotations

from copy import deepcopy

import numpy as np

from .common import DataError, finite, identity, parameter, reason, utc_now
from .compare import evaluate
from .geometry import az_el, disk_state, site_vector, time_grid, validate_point
from .terrain import interpolate_horizon, mask_variation
from .windows import detect, erode, metrics

NOT_EVALUATED = [
    {"capability": k, "reason": reason("not_modeled")} for k in
    ("electricalPower", "thermalBalance", "battery", "radioLink", "earthStation", "relay", "landingSafety", "resources", "exactSolarOccultations", "transferTrajectory")
]


def normalized_request(site, start="2026-12-01T00:00:00Z", duration=2592000., height=2., step=60., constraints=None, margins=None):
    validate_point(site["latDeg"], site["lonDeg"])
    finite(height, "observerHeightM", 0)
    finite(duration, "analysisDurationS", 1e-6)
    finite(step, "computeStepS", 1e-6, 600)
    if constraints is None:
        constraints = []
    if not isinstance(constraints, list):
        raise DataError("invalid_request", "hardConstraints", "list required")
    evaluate([], constraints)
    if margins is not None:
        if not isinstance(margins, dict) or set(margins) != {"timeS", "angleDeg"}:
            raise DataError("invalid_request", "missionMargins", "timeS and angleDeg parameters required")
        for key, unit in (("timeS", "s"), ("angleDeg", "deg")):
            p = margins[key]
            if not isinstance(p, dict) or p.get("unit") != unit or not p.get("origin"):
                raise DataError("invalid_request", f"missionMargins.{key}", "value, unit and origin required")
            finite(p.get("value"), key, 0)
    return {"siteId": site["id"], "surfaceStartUtc": parameter(start, "UTC"),
            "analysisDurationS": parameter(duration, "s"), "observerHeightM": parameter(height, "m"),
            "computeStepS": parameter(step, "s"), "displayStepS": parameter(600., "s"),
            "diskConvention": ["anyDisk", "fullDisk"], "hardConstraints": deepcopy(constraints),
            "missionMargins": deepcopy(margins), "preferences": [], "resourceRequirement": None,
            "position": {"latDeg": site["latDeg"], "lonDeg": site["lonDeg"], "frame": "MOON_ME",
                         "latitudeType": "planetocentric", "origin": site.get("coordinateOrigin", "user")}}


def compute(geometry, site, request, engine_version, dataset_version, profile=None, vectors=None, ets=None, include_series=True):
    start = geometry.et(request["surfaceStartUtc"]["value"])
    duration = request["analysisDurationS"]["value"]
    step = request["computeStepS"]["value"]
    height = request["observerHeightM"]["value"]
    geometry.check_coverage(start, start + duration)
    if ets is None:
        ets = time_grid(start, duration, step)
    if abs(ets[0] - start) > 1e-6 or abs(ets[-1] - start - duration) > 1e-6:
        raise DataError("invalid_request", "ephemerisGrid", "must span entire scenario")
    if profile and (profile["siteId"] != site["id"] or profile["observerHeightM"] != height or
                    profile["latDeg"] != site["latDeg"] or profile["lonDeg"] != site["lonDeg"]):
        raise DataError("invalid_request", "profileId", "profile does not match observer")
    level = "lola" if profile else "geometric"
    h0 = profile["groundHeightM"] if profile else 0.
    obs = site_vector(site["latDeg"], site["lonDeg"], h0 + height)
    vectors = geometry.cached_vectors(ets) if vectors is None else vectors
    bg = {b.lower(): az_el(b, vectors[b], obs) for b in ("SUN", "EARTH")}

    def horizon(az):
        # N0 is a zero-elevation tangent horizon, explicitly without relief.
        return interpolate_horizon(az, profile) if profile else np.zeros_like(az)

    def calculate_results(angle_margin=0.):
        results = {}
        for body in ("sun", "earth"):
            g = bg[body]
            hz = horizon(g["az"]) + angle_margin
            for convention, sign in (("anyDisk", 1), ("fullDisk", -1)):
                def direct(times, body=body, sign=sign):
                    v = geometry.vectors(times)[body.upper()]
                    local = az_el(body.upper(), v, obs)
                    return local["el"] + sign * local["radius"] - horizon(local["az"]) - angle_margin
                results[f"{body}.{convention}"] = detect(ets, g["el"] + sign * g["radius"] - hz, direct)
        return results

    results = calculate_results()
    rows, overlap = metrics(results, bg, ets)
    nominal = evaluate(rows, request["hardConstraints"])
    margins = request["missionMargins"]
    prudent_metrics = None
    if margins is None:
        prudent = {"status": "not_evaluated", "constraints": [], "reason": reason("margins_not_provided")}
    elif margins["timeS"]["value"] == 0 and margins["angleDeg"]["value"] == 0:
        prudent, prudent_metrics = deepcopy(nominal), deepcopy(rows)
    else:
        prudent_results = calculate_results(margins["angleDeg"]["value"])
        for result in prudent_results.values():
            result["visible"] = erode(result["visible"], margins["timeS"]["value"])
            # Eroded windows need their own set times, never the nominal events.
            result["events"] = [{"type": "set", "t": b} for a, b in result["visible"]]
        prudent_metrics, _ = metrics(prudent_results, bg, ets)
        prudent = evaluate(prudent_metrics, request["hardConstraints"])
    limits = [
        "Mathematical kernel coverage is not a validated physical error bound.",
        "LT+S correction at lunar center, then site parallax; no atmospheric refraction.",
        "An out-and-back event shorter than the compute step can escape detection.",
        "Visibility does not establish electrical power, a radio link or mission feasibility.",
        "UTC future leap seconds are held at the last known LSK value.",
    ]
    if profile:
        limits += profile["limits"] + ["Horizon held constant across each disk; varying masks flagged, not resolved.", "Terrain convergence must be checked separately before declaring N1 validated."]
    else:
        limits.append("Relief non pris en compte : fenêtres non fiables au pôle sud.")
        limits.append("Observer height is above the 1737.4 km reference sphere; actual ground altitude unavailable.")
    profile_id = profile["profileId"] if profile else None
    suffix = identity({"request": request, "kernelSetId": geometry.kernel_set_id, "profileId": profile_id, "engineVersion": engine_version}, 8)
    date = request["surfaceStartUtc"]["value"][:10].replace("-", "")
    sid = f'{site["id"]}_{date}_{duration / 86400:g}d_h{height:g}m_{level}_{suffix}'

    def serialize_window(ab):
        a, b = ab
        return {"startUtc": geometry.utc(a), "endUtc": geometry.utc(b),
                "truncatedStart": bool(abs(a - ets[0]) < 1e-6), "truncatedEnd": bool(abs(b - ets[-1]) < 1e-6)}

    valid_all = min(m["value"] for m in rows if m["metricId"] == "analysis.analysableFraction")
    scenario = {
        "schemaVersion": "1.0.0", "scenarioId": sid, "siteId": site["id"], "datasetVersion": dataset_version,
        "generatedAt": utc_now(), "engineVersion": engine_version, "engine": "spiceypy", "kernelSetId": geometry.kernel_set_id,
        "profileId": profile_id, "profileIdReason": reason("geometric_no_terrain") if profile_id is None else None,
        "request": request, "processingStatus": "complete" if valid_all == 1 else "partial",
        "modelLevel": level, "coverageStatus": "covered" if valid_all == 1 else "partial" if valid_all > 0 else "outside",
        "validationStatus": "not_validated", "validationReason": reason("reference_cases_do_not_validate_entire_domain"),
        "requestedCapabilities": ["sunVisibility", "earthVisibility"], "evaluatedCapabilities": ["sunVisibility", "earthVisibility"],
        "notEvaluated": NOT_EVALUATED, "limits": limits,
        "coordinateConvention": {"frame": "MOON_ME", "latitude": "planetocentric", "longitude": "east-positive", "azimuth": "north=0 east=90 clockwise", "polarNorth": "toward equator along site meridian"},
        "groundHeightM": h0 if profile else None, "groundHeightReason": reason("no_dem_geometric_reference_sphere") if not profile else None,
        "events": [{"body": key.split(".")[0], "convention": key.split(".")[1], "type": e["type"],
                    "tUtc": geometry.utc(e["t"]), "bracketUtc": [geometry.utc(t) for t in e["bracket"]],
                    "bracketS": [e["bracket"][0] - e["t"], e["bracket"][1] - e["t"]],
                    "iterations": e["iterations"], "truncated": False} for key, r in results.items() for e in r["events"]],
        "windows": {key: [serialize_window(ab) for ab in r["visible"]] for key, r in results.items()},
        "analysableWindows": {key: [serialize_window(ab) for ab in r["valid"]] for key, r in results.items()},
        "overlapWindows": [serialize_window(ab) for ab in overlap], "metrics": rows,
        "evaluation": {"nominal": nominal, "prudent": prudent, "prudentMetrics": prudent_metrics},
        "provenance": {"sources": geometry.sources + (profile.get("demSources", [profile.get("demSource", {"product": profile["demProduct"], "sha256": profile["demSha256"]})]) if profile else []),
                       "catalogueSources": site["sources"], "parameters": {"moonRadiusKm": parameter(1737.4, "km", "source:pck00011"),
                       "sunRadiusKm": parameter(695700., "km", "source:data_plan_8.1"), "earthRadiusKm": parameter(6378.137, "km", "source:data_plan_8.1")}},
    }
    if include_series:
        # A non-divisible custom duration gets explicit times; never pretend it is regular.
        display_times = time_grid(start, duration, 600.)
        index = np.searchsorted(ets, display_times)
        exact_grid = np.all(index < len(ets)) and np.allclose(ets[np.minimum(index, len(ets)-1)], display_times, atol=1e-6, rtol=0)
        dv = {b: vectors[b][index] for b in vectors} if exact_grid else geometry.vectors(display_times)
        dg = {b.lower(): az_el(b, dv[b], obs) for b in ("SUN", "EARTH")}
        def rounded(values):
            return [round(float(v), 3) if np.isfinite(v) else None for v in values]
        series = {"t0Utc": geometry.utc(start), "stepS": 600., "n": len(display_times),
                  "timesUtc": None if duration % 600 == 0 else [geometry.utc(t) for t in display_times],
                  "purpose": "display_only; use exact events and windows for metrics"}
        for body in ("sun", "earth"):
            g = dg[body]
            hz = horizon(g["az"])
            for suffix_key, column in (("AzDeg", "az"), ("ElDeg", "el"), ("AngularRadiusDeg", "radius"), ("DistanceKm", "distance")):
                series[body + suffix_key] = rounded(g[column])
            state = disk_state(g["el"], g["radius"], hz)
            series[body + "State"] = [int(x) if x >= 0 else None for x in state]
            series[body + "MaskVariesAcrossDisk"] = mask_variation(g["az"], g["el"], g["radius"], profile).tolist()
            center = dv[body.upper()]
            series["subSolarLatDeg" if body == "sun" else "subEarthLatDeg"] = rounded(np.degrees(np.arcsin(center[:, 2] / np.linalg.norm(center, axis=1))))
            if body == "earth":
                series["subEarthLonDeg"] = rounded(np.degrees(np.arctan2(center[:, 1], center[:, 0])))
        sun, earth = dv["SUN"] - obs, dv["EARTH"] - obs
        sep = np.degrees(np.arccos(np.clip(np.sum(sun * earth, axis=1) / (np.linalg.norm(sun, axis=1) * np.linalg.norm(earth, axis=1)), -1, 1)))
        series["earthSunOcclusionPossible"] = (sep < dg["sun"]["radius"] + dg["earth"]["radius"]).tolist()
        g = dg["sun"]
        d = np.clip((g["el"] - horizon(g["az"])) / g["radius"], -1, 1)
        f = (np.pi - np.arccos(d) + d * np.sqrt(1 - d*d)) / np.pi
        f[series["sunMaskVariesAcrossDisk"]] = np.nan
        series["sunVisibleDiskFraction"] = rounded(f)
        series["azimuthWrapIndices"] = {body: (np.flatnonzero(np.abs(np.diff(dg[body]["az"])) > 180) + 1).tolist() for body in dg}
        scenario["series"] = series
    return scenario
