"""Refined events, half-open windows and honest denominators, independent of UI series."""
from __future__ import annotations

import numpy as np

from .common import reason


def merge(intervals):
    out = []
    for start, end in sorted(intervals):
        if end <= start:
            continue
        if out and start <= out[-1][1] + 1e-7:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([float(start), float(end)])
    return out


def intersect(a, b):
    out, i, j = [], 0, 0
    while i < len(a) and j < len(b):
        lo, hi = max(a[i][0], b[j][0]), min(a[i][1], b[j][1])
        if hi > lo:
            out.append([lo, hi])
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return merge(out)


def subtract(a, b):
    out = []
    for start, end in a:
        cursor = start
        for x, y in b:
            if y <= cursor or x >= end:
                continue
            if x > cursor:
                out.append([cursor, min(x, end)])
            cursor = max(cursor, y)
            if cursor >= end:
                break
        if cursor < end:
            out.append([cursor, end])
    return out


def duration(intervals):
    return sum(b - a for a, b in intervals)


def erode(intervals, margin):
    return [[a + margin, b - margin] for a, b in intervals if b - a > 2 * margin]


def bisect(t0, t1, c0, c1, evaluate, tolerance=1.):
    n = 0
    while t1 - t0 > tolerance:
        mid = (t0 + t1) / 2
        value = float(evaluate(np.array([mid]))[0])
        if not np.isfinite(value):
            return None
        if (value > 0) == (c0 > 0):
            t0, c0 = mid, value
        else:
            t1, c1 = mid, value
        n += 1
    return {"t": (t0 + t1) / 2, "bracket": [t0, t1], "iterations": n}


def detect(ets, clearance, evaluate):
    ets, clearance = np.asarray(ets), np.asarray(clearance)
    # Refine local |clearance| minima without a grid sign change. Retain an
    # explicit grazing flag even when the 5 s subgrid does not find a crossing.
    grazing, additions = [], []
    if len(ets) > 2:
        c = np.abs(clearance)
        candidates = np.flatnonzero((c[1:-1] < .05) & (c[1:-1] <= c[:-2]) & (c[1:-1] < c[2:])) + 1
        for i in candidates:
            if not np.isfinite(clearance[i-1:i+2]).all() or len(set(clearance[i-1:i+2] > 0)) > 1:
                continue
            sub = np.arange(ets[i-1], ets[i+1], 5.)
            sub = np.unique(np.append(sub, ets[i+1]))
            values = np.asarray(evaluate(sub))
            if np.isfinite(values).any():
                k = int(np.nanargmin(np.abs(values)))
                grazing.append({"type": "grazing", "t": float(sub[k]), "bracket": [float(ets[i-1]), float(ets[i+1])], "iterations": 0})
            additions.extend(zip(sub.tolist(), values.tolist()))
    if additions:
        mapping = dict(zip(ets.tolist(), clearance.tolist()))
        mapping.update(additions)
        ets = np.array(sorted(mapping))
        clearance = np.array([mapping[t] for t in ets])
    visible, valid, events = [], [], []
    ok = np.isfinite(clearance)
    # Merge runs in bulk; only crossing segments need a direct SPICE call.
    segment_valid = ok[:-1] & ok[1:]
    positive = clearance > 0
    both_up = segment_valid & positive[:-1] & positive[1:]
    for mask, dest in ((segment_valid, valid), (both_up, visible)):
        diff = np.diff(np.r_[False, mask, False].astype(int))
        starts, ends = np.flatnonzero(diff == 1), np.flatnonzero(diff == -1)
        dest.extend([[ets[a], ets[b]] for a, b in zip(starts, ends)])
    for i in np.flatnonzero(segment_valid & (positive[:-1] != positive[1:])):
        root = bisect(ets[i], ets[i+1], clearance[i], clearance[i+1], evaluate)
        if root is None:
            valid = subtract(valid, [[ets[i], ets[i+1]]])
            continue
        events.append({**root, "type": "set" if positive[i] else "rise"})
        visible.append([ets[i], root["t"]] if positive[i] else [root["t"], ets[i+1]])
    return {"visible": merge(visible), "valid": merge(valid),
            "events": sorted(events + grazing, key=lambda x: x["t"]), "grazingCount": len(grazing)}


def metric(mid, value, unit, denominator, quality="complete", why=None, **extra):
    return {"metricId": mid, "value": value, "unit": unit, "denominatorS": denominator,
            "quality": quality, "reason": why, **extra}


def metrics(results, body_geometry, ets):
    requested = float(ets[-1] - ets[0])
    rows = []
    for body in ("sun", "earth"):
        for convention in ("anyDisk", "fullDisk"):
            r = results[f"{body}.{convention}"]
            den = duration(r["valid"])
            quality = "complete" if abs(den - requested) < 1e-6 else "partial" if den else "unknown"
            rows.append(metric(f"{body}.{convention}.fraction", duration(r["visible"]) / den if den else None,
                               "1", den, quality, reason("no_analysable_data") if not den else None))
            if convention == "anyDisk":
                gaps = subtract(r["valid"], r["visible"])
                gap = max(gaps, key=lambda ab: ab[1] - ab[0]) if gaps else None
                left = bool(gap and gap[0] == ets[0])
                right = bool(gap and gap[1] == ets[-1])
                # A data hole also truncates a gap; missing time is never a zero gap.
                hole = bool(gap and any((gap[0] == a and a > ets[0]) or (gap[1] == b and b < ets[-1]) for a, b in r["valid"]))
                rows.append(metric(f"{body}.anyDisk.longestGapH", (gap[1] - gap[0]) / 3600. if gap else 0. if den else None,
                                   "h", den, quality, reason("no_analysable_data") if not den else None,
                                   truncatedStart=left, truncatedEnd=right, truncatedByMissingData=hole))
                next_set = next((e["t"] for e in r["events"] if e["type"] == "set" and e["t"] >= ets[0]), None)
                rows.append(metric(f"{body}.anyDisk.nextSetH", (next_set - ets[0]) / 3600. if next_set is not None else None,
                                   "h", den, quality, reason("unknown" if quality != "complete" or r["grazingCount"] else "beyond_window") if next_set is None else None,
                                   selectedUtcOffsetS=0.))
        el = body_geometry[body]["el"]
        finite_el = el[np.isfinite(el)]
        rows.append(metric(f"{body}.maxElevDeg", float(finite_el.max()) if len(finite_el) else None,
                           "deg", requested, "sampled", reason("sampled_at_compute_step")))
    overlap_valid = intersect(results["sun.anyDisk"]["valid"], results["earth.anyDisk"]["valid"])
    overlap = intersect(results["sun.anyDisk"]["visible"], results["earth.anyDisk"]["visible"])
    den = duration(overlap_valid)
    rows.append(metric("overlap.sunAny_earthAny.fraction", duration(overlap) / den if den else None, "1", den,
                       "complete" if abs(den - requested) < 1e-6 else "partial" if den else "unknown",
                       reason("no_analysable_data") if not den else None))
    rows.append(metric("analysis.analysableFraction", den / requested, "1", requested))
    visible = results["sun.anyDisk"]["visible"]
    vis_duration = duration(visible)
    integral = 0.
    for a, b in visible:
        sub = np.r_[a, ets[(ets > a) & (ets < b)], b]
        integral += np.trapezoid(np.interp(sub, ets, body_geometry["sun"]["el"]), sub)
    rows.append(metric("sun.meanElevWhenAnyDiskDeg", float(integral / vis_duration) if vis_duration else None,
                       "deg", vis_duration, "sampled", reason("sampled_at_compute_step") if vis_duration else reason("no_visible_sun")))
    rows.append(metric("sun.directIllumination.fraction", None, "1", None, "unknown", reason("exact_occultations_not_modeled")))
    return rows, overlap
