"""MOON_ME / LT+S geometry, exactly the declared vector method in data.md §8."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import spiceypy as sp

from .common import DataError, finite, identity, read_json, sha256, write_json
from .sources import KERNELS

R_MOON_KM = 1737.4
R_BODY_KM = {"SUN": 695700.0, "EARTH": 6378.137}
_LOADED = None


def validate_point(lat, lon):
    finite(lat, "latDeg", -90, 90)
    finite(lon, "lonDeg", -180, 180)
    if abs(lat) >= 89.9999 or lon <= -180:
        raise DataError("invalid_request", "customPoint", "undefined polar north or ambiguous longitude")


def time_grid(start, duration, step):
    finite(duration, "analysisDurationS", 0)
    finite(step, "computeStepS", 0)
    if duration <= 0 or step <= 0 or duration / step > 2_000_000:
        raise DataError("invalid_request", "timeGrid", "positive values and <= 2 million samples required")
    grid = start + np.arange(math.floor(duration / step) + 1) * step
    if grid[-1] < start + duration:
        grid = np.append(grid, start + duration)
    return grid


def site_vector(lat, lon, height_m):
    validate_point(lat, lon)
    finite(height_m, "heightAboveSphereM")
    return np.asarray(sp.latrec(R_MOON_KM + height_m / 1000., np.radians(lon), np.radians(lat)))


def enu(obs):
    up = obs / np.linalg.norm(obs)
    east = np.cross([0., 0., 1.], up)
    if np.linalg.norm(east) < 1e-9:
        raise DataError("invalid_request", "latDeg", "north undefined on polar axis")
    east /= np.linalg.norm(east)
    return east, np.cross(up, east), up


def az_el(target, vectors, obs):
    v = np.atleast_2d(vectors) - obs
    e, n, u = enu(obs)
    dist = np.linalg.norm(v, axis=1)
    return {
        "az": np.degrees(np.arctan2(v @ e, v @ n)) % 360.,
        "el": np.degrees(np.arcsin(np.clip((v @ u) / dist, -1, 1))),
        "distance": dist,
        "radius": np.degrees(np.arcsin(R_BODY_KM[target] / dist)),
    }


def disk_state(el, radius, horizon):
    el, radius, horizon = np.broadcast_arrays(el, radius, horizon)
    return np.where(~np.isfinite(el + radius + horizon), -1,
                    np.where(el - radius > horizon, 2, np.where(el + radius > horizon, 1, 0)))


class Geometry:
    def __init__(self, raw="data/raw", cache="data/interim"):
        global _LOADED
        self.raw, self.cache = Path(raw), Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        files = [self.raw / "kernels" / Path(rel).name for rel, _ in KERNELS]
        self.sources = []
        for path in files:
            if not path.exists():
                raise DataError("missing_dependency", str(path), "run lunar-data acquire")
            record = read_json(path.with_name(path.name + ".source.json"))
            if record["sha256"] != sha256(path):
                raise DataError("integrity_failure", str(path))
            self.sources.append(record)
        # Relative paths keep this identity portable across installations.
        meta = "KPL/MK\n\\begindata\nKERNELS_TO_LOAD = (\n" + "\n".join(f"  'data/raw/kernels/{p.name}'" for p in files) + "\n)\n\\begintext\n"
        self.kernel_set_id = identity({"metaKernel": meta, "sha256": [x["sha256"] for x in self.sources]}, 64)
        if _LOADED is not None and _LOADED != self.kernel_set_id:
            raise DataError("kernel_set_locked", "kernelSetId", "use a fresh process for another kernel set")
        if _LOADED is None:
            for path in files:
                sp.furnsh(str(path.resolve()))
            _LOADED = self.kernel_set_id
        meta_path = self.raw / "kernels" / "lunar_v1.tm"
        if not meta_path.exists():
            meta_path.write_text(meta)
        elif meta_path.read_text() != meta:
            raise DataError("integrity_failure", str(meta_path))
        # SPK windows alone omit parent-chain light time; callers also rely on SPICE
        # errors at the exact requested epochs. Do not extrapolate or clamp requests.
        intervals = []
        for body in (301, 399, 10):
            w = sp.spkcov(str(files[2]), body)
            intervals.append([sp.wnfetd(w, i) for i in range(sp.wncard(w))])
        w = sp.pckcov(str(files[3]), 31008)
        intervals.append([sp.wnfetd(w, i) for i in range(sp.wncard(w))])
        self.coverage_intervals = intervals
        self.coverage = [max(w[0][0] for w in intervals), min(w[-1][1] for w in intervals)]

    def et(self, utc):
        if not isinstance(utc, str) or not utc.endswith("Z") or "T" not in utc:
            raise DataError("invalid_request", "surfaceStartUtc", "ISO 8601 UTC with Z required")
        try:
            return float(sp.str2et(utc))
        except Exception as exc:
            raise DataError("invalid_request", "surfaceStartUtc", str(exc)) from exc

    def utc(self, et):
        return sp.et2utc(float(et), "ISOC", 3) + "Z"

    def check_coverage(self, start, end):
        if end < start or any(not any(a <= start <= end <= b for a, b in windows) for windows in self.coverage_intervals):
            raise DataError("outside_coverage", "surfaceStartUtc", [self.utc(x) for x in self.coverage])

    def vectors(self, ets):
        ets = np.atleast_1d(ets).astype(float)
        self.check_coverage(ets.min(), ets.max())
        try:
            return {body: np.atleast_2d(sp.spkpos(body, ets, "MOON_ME", "LT+S", "MOON")[0]) for body in R_BODY_KM}
        except Exception as exc:
            raise DataError("outside_coverage", "ephemeris", str(exc)) from exc

    def cached_vectors(self, ets):
        key = identity({"kernelSetId": self.kernel_set_id, "start": float(ets[0]), "end": float(ets[-1]),
                        "n": len(ets), "gridSha256": __import__("hashlib").sha256(ets.tobytes()).hexdigest()})
        path = self.cache / f"ephem_{key}.npy"
        meta = path.with_suffix(".json")
        if path.exists() and meta.exists():
            if sha256(path) != read_json(meta)["sha256"]:
                raise DataError("integrity_failure", str(path))
            data = np.load(path, mmap_mode="r", allow_pickle=False)
            if data.shape != (2, len(ets), 3):
                raise DataError("source_format_changed", str(path))
        else:
            # Chunk to bound temporary SPICE wrapper allocations.
            data = np.empty((2, len(ets), 3), dtype=np.float64)
            for first in range(0, len(ets), 20000):
                last = min(first + 20000, len(ets))
                print(f"Ephemerides {last}/{len(ets)}", flush=True)
                chunk = self.vectors(ets[first:last])
                for j, body in enumerate(R_BODY_KM):
                    data[j, first:last] = chunk[body]
            if path.exists():
                raise DataError("incomplete_cache", str(path))
            np.save(path, data, allow_pickle=False)
            write_json(meta, {"kernelSetId": self.kernel_set_id, "sha256": sha256(path), "bytes": path.stat().st_size})
        return dict(zip(R_BODY_KM, data))
