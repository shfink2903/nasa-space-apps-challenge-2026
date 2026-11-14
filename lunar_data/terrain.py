"""Spherical LOLA ray tracing; missing terrain never becomes flat ground."""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from scipy.ndimage import map_coordinates

from .common import DataError, finite, identity, read_json, sha256, write_json
from .geometry import validate_point

R_M = 1737400.
CRS_GEO = "+proj=longlat +R=1737400 +no_defs"


def unit(lat, lon):
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)


def destination(lat0, lon0, azimuth, distance_km):
    delta = distance_km / (R_M / 1000.)
    lat = np.arcsin(np.clip(np.sin(lat0) * np.cos(delta) + np.cos(lat0) * np.sin(delta) * np.cos(azimuth), -1, 1))
    lon = lon0 + np.arctan2(np.sin(azimuth) * np.sin(delta) * np.cos(lat0), np.cos(delta) - np.sin(lat0) * np.sin(lat))
    return lat, lon


def spherical_elevation(distance_km, target_height_m, ground_height_m, observer_height_m):
    """Exact radial/tangential components; avoids cancellation of large xyz vectors."""
    delta = np.asarray(distance_km) * 1000. / R_M
    r = R_M + np.asarray(target_height_m)
    vertical = (np.asarray(target_height_m) - ground_height_m - observer_height_m) - 2 * r * np.sin(delta / 2)**2
    horizontal = r * np.sin(delta)
    return np.degrees(np.arctan2(vertical, horizontal))


def interpolate_horizon(az, profile):
    values = np.array([np.nan if x is None else x for x in profile["horizonElevationDeg"]], dtype=float)
    reach = np.asarray(profile["reachKm"])
    values[reach < profile["rMaxKm"] - 1e-8] = np.nan
    return np.interp(az, np.asarray(profile["azimuthDeg"]), values, period=360.)


def mask_variation(az, el, radius, profile):
    if profile is None:
        return np.zeros(np.shape(az), dtype=bool)
    width = radius / np.maximum(np.cos(np.radians(el)), 1e-8)
    p = np.asarray(profile["azimuthDeg"])
    hz = np.asarray([np.nan if v is None else v for v in profile["horizonElevationDeg"]])
    # Sliding min/max over every profile bin intersecting the disk width.
    lo, hi = interpolate_horizon(az - width, profile), interpolate_horizon(az + width, profile)
    minval, maxval = np.minimum(lo, hi), np.maximum(lo, hi)
    step = profile["azimuthStepDeg"]
    for offset in range(-int(np.ceil(np.max(width) / step)) - 1, int(np.ceil(np.max(width) / step)) + 2):
        index = (np.floor(np.asarray(az) / step).astype(int) + offset) % len(p)
        delta = np.abs((p[index] - az + 180) % 360 - 180)
        inside = delta <= width
        minval = np.where(inside, np.minimum(minval, hz[index]), minval)
        maxval = np.where(inside, np.maximum(maxval, hz[index]), maxval)
    return (~np.isfinite(minval + maxval)) | (maxval - minval > 0.05)


class DEM:
    def __init__(self, label):
        self.label = Path(label)
        text = self.label.read_text()
        required = {"SAMPLE_TYPE": "LSB_INTEGER", "SAMPLE_BITS": "16", "SCALING_FACTOR": "0.5",
                    "OFFSET": "1737400.", "CENTER_LATITUDE": "-90", "POSITIVE_LONGITUDE_DIRECTION": '"EAST"'}
        for key, value in required.items():
            match = re.search(rf"^\s*{key}\s*=\s*(\S+)", text, re.M)
            if not match or match[1] != value:
                raise DataError("source_format_changed", str(label), key)
        if '"MEAN EARTH/POLAR AXIS OF DE421"' not in text:
            raise DataError("source_format_changed", str(label), "coordinate system")
        img = self.label.with_suffix(".img")
        self.source = read_json(img.with_name(img.name + ".source.json"))
        if sha256(img) != self.source["sha256"]:
            raise DataError("integrity_failure", str(img))
        with rasterio.open(self.label) as ds:
            if ds.count != 1 or ds.dtypes != ("int16",) or ds.nodata not in (None, -32768):
                raise DataError("source_format_changed", str(label), "dtype, band count or nodata")
            # read() returns stored DN, not GDAL's scale/offset. Explicitly use the
            # HEIGHT formula from the label; OFFSET is for planetary radius only.
            self.heights = ds.read(1).astype(np.float32) * 0.5
            if ds.nodata is not None:
                self.heights[self.heights == ds.nodata * .5] = np.nan
            self.transform, self.crs = ds.transform, ds.crs
            self.pixel_m = abs(ds.transform.a)
            self.shape = (ds.height, ds.width)
        self.to_xy = Transformer.from_crs(CRS_GEO, self.crs, always_xy=True)
        self.to_geo = Transformer.from_crs(self.crs, CRS_GEO, always_xy=True)
        self.product = self.label.stem
        self.validate_projection()

    def validate_projection(self):
        x, y = self.to_xy.transform(0, -90)
        inv = ~self.transform
        col, row = inv.a * x + inv.b * y + inv.c, inv.d * x + inv.e * y + inv.f
        if abs(col - self.shape[1] / 2) > 1 or abs(row - self.shape[0] / 2) > 1:
            raise DataError("projection_validation_failed", self.product, {"polePixel": [col, row]})
        lon, lat = 25., -87.
        xx, yy = self.to_xy.transform(lon, lat)
        ll, pp = self.to_geo.transform(xx, yy)
        if abs(ll - lon) > 1e-7 or abs(pp - lat) > 1e-7:
            raise DataError("projection_validation_failed", self.product, "roundtrip")

    def sample(self, lat, lon):
        x, y = self.to_xy.transform(lon, lat)
        inv = ~self.transform
        x, y = np.asarray(x), np.asarray(y)
        col, row = inv.a * x + inv.b * y + inv.c, inv.d * x + inv.e * y + inv.f
        return map_coordinates(self.heights, [np.atleast_1d(row) - .5, np.atleast_1d(col) - .5],
                               order=1, mode="constant", cval=np.nan)

    def profile(self, site, height_m, radius_km=150., azimuth_step=.1, cache=None, rmin_km=None, ground_height_m=None):
        lat, lon = site["latDeg"], site["lonDeg"]
        validate_point(lat, lon)
        finite(height_m, "observerHeightM", 0)
        finite(radius_km, "rMaxKm", .001, 1000)
        finite(azimuth_step, "azimuthStepDeg", .01, 10)
        spec = {"siteId": site["id"], "latDeg": lat, "lonDeg": lon, "observerHeightM": height_m,
                "demProduct": self.product, "demSha256": self.source["sha256"],
                "labelSha256": sha256(self.label), "rMaxKm": radius_km,
                "radialStepM": self.pixel_m, "azimuthStepDeg": azimuth_step, "rMinKm": rmin_km,
                "groundHeightOverrideM": ground_height_m, "algorithm": "spherical-bilinear-v2"}
        pid = identity(spec)
        cached = Path(cache) / f"profile_{pid}.json" if cache else None
        if cached and cached.exists():
            result = read_json(cached)
            if result["profileId"] != pid:
                raise DataError("integrity_failure", str(cached))
            return result
        h0 = float(self.sample(lat, lon)[0]) if ground_height_m is None else ground_height_m
        if not np.isfinite(h0):
            raise DataError("outside_coverage", "terrain", site["id"])
        distances = np.arange(2 * self.pixel_m / 1000. if rmin_km is None else rmin_km, radius_km, self.pixel_m / 1000.)
        distances = np.append(distances, radius_km)
        az = np.arange(0, 360, azimuth_step)
        hz, dmax, reach = [], [], []
        lat0, lon0 = np.radians(lat), np.radians(lon)
        for a in np.radians(az):
            la, lo = destination(lat0, lon0, a, distances)
            h = self.sample(np.degrees(la), np.degrees(lo))
            el = spherical_elevation(distances, h, h0, height_m)
            ok = np.isfinite(el)
            # Stop at the first missing sample. A later valid pixel cannot bridge a hole.
            stop = int(np.flatnonzero(~ok)[0]) if (~ok).any() else len(ok)
            if stop:
                i = int(np.argmax(el[:stop]))
                hz.append(float(el[i])); dmax.append(float(distances[i])); reach.append(float(distances[stop - 1]))
            else:
                hz.append(None); dmax.append(None); reach.append(0.)
        result = {**spec, "schemaVersion": "1.0.0", "profileId": pid, "frame": "MOON_ME",
                  "shape": "sphere_1737.4km", "groundHeightM": h0, "demPixelM": self.pixel_m,
                  "azimuthDeg": az.tolist(), "horizonElevationDeg": hz, "distanceOfMaxKm": dmax,
                  "reachKm": reach, "truncatedAzimuthCount": sum(r < radius_km - 1e-8 for r in reach),
                  "interpolation": "bilinear", "convergence": None,
                  "convergenceReason": {"code": "not_tested", "detail": "See independent convergence report"},
                  "limits": ["Preliminary interpolated LOLA product; relief beyond rMaxKm not modeled.",
                             "Local slope, roughness and landing hazards not evaluated."]}
        if cached:
            write_json(cached, result)
        return result


def combined_profile(near_dem, far_dem, site, height_m, radius_km=300., azimuth_step=.1, cache=None):
    """Keep observer and near field fixed when extending the ray radius.

    Replacing the entire DEM also replaces local ground height and near terrain;
    that is a resolution experiment, not a radius-only convergence test.
    """
    near = near_dem.profile(site, height_m, 150., azimuth_step, cache)
    far = far_dem.profile(site, height_m, radius_km, azimuth_step, cache,
                          rmin_km=150., ground_height_m=near["groundHeightM"])
    result = dict(near)
    result["rMaxKm"] = radius_km
    result["demProducts"] = [{"product": near_dem.product, "sha256": near_dem.source["sha256"], "rangeKm": [0., 150.]},
                             {"product": far_dem.product, "sha256": far_dem.source["sha256"], "rangeKm": [150., radius_km]}]
    result["profileId"] = identity({"nearProfileId": near["profileId"], "farProfileId": far["profileId"], "algorithm": "composite-fixed-observer-v1"})
    result["radialStepsM"] = [near_dem.pixel_m, far_dem.pixel_m]
    result["horizonElevationDeg"], result["distanceOfMaxKm"], result["reachKm"] = [], [], []
    for i, (n, f) in enumerate(zip(near["horizonElevationDeg"], far["horizonElevationDeg"])):
        if n is None or f is None:
            result["horizonElevationDeg"].append(None)
            result["distanceOfMaxKm"].append(None)
        else:
            source = near if n >= f else far
            result["horizonElevationDeg"].append(source["horizonElevationDeg"][i])
            result["distanceOfMaxKm"].append(source["distanceOfMaxKm"][i])
        result["reachKm"].append(near["reachKm"][i] if near["reachKm"][i] < 150. - 1e-8 else far["reachKm"][i])
    result["truncatedAzimuthCount"] = sum(r < radius_km - 1e-8 for r in result["reachKm"])
    result["limits"] = near["limits"] + ["Composite: fine DEM through 150 km, wider DEM beyond; fixed fine-DEM observer altitude."]
    result["demSources"] = [near_dem.source, far_dem.source]
    return result
