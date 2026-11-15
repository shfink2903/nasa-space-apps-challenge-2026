"""Scientific audit regressions. Every test output stays under tmp_path."""
from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest

from lunar_data.common import DataError, identity, parameter, read_json, sha256, write_json
from lunar_data.geometry import R_BODY_KM, R_MOON_KM
from lunar_data.scenario import compute, normalized_request
from lunar_data.terrain import CACHE_NAMESPACE, DEM
from lunar_data.validation import horizons_reference


class SyntheticGeometry:
    kernel_set_id = "synthetic-regression"
    sources = []

    def __init__(self, clearance=None, missing=False):
        self.clearance = clearance or (lambda times: np.full_like(times, 10.))
        self.missing = missing

    def et(self, _utc):
        return 0.

    def check_coverage(self, _start, _end):
        pass

    def utc(self, et):
        return (datetime(2026, 12, 1, tzinfo=timezone.utc)
                + timedelta(seconds=float(et))).isoformat().replace("+00:00", "Z")

    def vectors(self, ets):
        times = np.atleast_1d(ets).astype(float)
        result = {}
        for body, distance in (("SUN", 150_000_000.), ("EARTH", 384_400.)):
            radius = np.degrees(np.arcsin(R_BODY_KM[body] / distance))
            el = np.radians(self.clearance(times) - radius)
            vectors = np.column_stack((np.sin(el), np.cos(el), np.zeros_like(el))) * distance
            vectors[:, 0] += R_MOON_KM + .002
            if self.missing:
                vectors[(times >= 600) & (times <= 1200)] = np.nan
            result[body] = vectors
        return result


def margin_scenario(angle=1., time=0., geometry=None):
    geometry = geometry or SyntheticGeometry()
    site = {"id": "synthetic", "latDeg": 0., "lonDeg": 0., "sources": []}
    constraint = {"metricId": "earth.anyDisk.nextSetH", "op": "<=", "value": 2.,
                  "unit": "h", "origin": "user"}
    request = normalized_request(site, duration=3600., constraints=[constraint], margins={
        "timeS": parameter(time, "s", "user"), "angleDeg": parameter(angle, "deg", "user"),
    })
    ets = np.arange(0., 3601., 60.)
    return compute(geometry, site, request, "test", "test", vectors=geometry.vectors(ets),
                   ets=ets, include_series=False)


def prudent_next_set(scenario):
    return next(m for m in scenario["evaluation"]["prudentMetrics"]
                if m["metricId"] == "earth.anyDisk.nextSetH")


@pytest.mark.parametrize("angle,time", [(1., 0.), (0., 120.), (1., 120.)])
def test_nonzero_margins_do_not_invent_set_at_analysis_boundary(angle, time):
    scenario = margin_scenario(angle, time)
    assert scenario["events"] == []
    assert prudent_next_set(scenario)["value"] is None
    assert prudent_next_set(scenario)["reason"]["code"] == "beyond_window"
    assert scenario["evaluation"]["prudent"]["status"] == "unknown"


def test_nonzero_margins_do_not_invent_set_at_missing_data_boundary():
    scenario = margin_scenario(time=120., geometry=SyntheticGeometry(missing=True))
    assert scenario["events"] == []
    assert prudent_next_set(scenario)["value"] is None
    assert prudent_next_set(scenario)["reason"]["code"] == "unknown"
    assert scenario["evaluation"]["prudent"]["status"] == "unknown"


def test_time_margin_shifts_a_real_set_and_preserves_nominal():
    geometry = SyntheticGeometry(lambda times: (1800. - times) / 100.)
    angular_only = margin_scenario(angle=1., geometry=geometry)
    eroded = margin_scenario(angle=1., time=120., geometry=geometry)
    assert eroded["metrics"] == angular_only["metrics"]
    assert prudent_next_set(angular_only)["value"] * 3600 == pytest.approx(1700., abs=1.)
    assert prudent_next_set(eroded)["value"] == pytest.approx(
        prudent_next_set(angular_only)["value"] - 120. / 3600.)


def test_eroded_away_window_has_no_prudent_set():
    geometry = SyntheticGeometry(lambda times: 2. - np.abs(times - 1800.) / 30.)
    scenario = margin_scenario(angle=0., time=120., geometry=geometry)
    assert any(e["type"] == "set" for e in scenario["events"])
    assert prudent_next_set(scenario)["value"] is None


@pytest.fixture
def flat_dem(tmp_path):
    # Exercise actual ray tracing and cache code on deterministic flat ground.
    dem = DEM.__new__(DEM)
    dem.product = "synthetic-flat"
    dem.label = tmp_path / "synthetic-flat.lbl"
    dem.label.write_text("Synthetic regression label\n")
    dem.source = {"sha256": "0" * 64}
    dem.pixel_m = 80.
    dem.sample = lambda lat, _lon: np.zeros_like(np.atleast_1d(lat), dtype=float)
    return dem


def make_profile(dem, cache=None):
    return dem.profile({"id": "flat", "latDeg": -88., "lonDeg": 0.}, 2.,
                       radius_km=.2, azimuth_step=10., cache=cache)


def profile_cache_path(cache, profile):
    return cache / CACHE_NAMESPACE / f"profile_{profile['profileId']}.json"


def test_verified_profile_cache_reuses_matching_content(flat_dem, tmp_path):
    cache = tmp_path / "cache"
    profile = make_profile(flat_dem, cache)
    path = profile_cache_path(cache, profile)
    envelope = read_json(path)
    assert envelope["contentSha256"] == identity(profile, 64)

    def no_recompute(*_args):
        raise AssertionError("Valid verified cache should be reused")

    flat_dem.sample = no_recompute
    assert make_profile(flat_dem, cache) == profile


@pytest.mark.parametrize("alteration", ["terrain", "parameters", "malformed"])
def test_verified_profile_cache_rejects_alteration(flat_dem, tmp_path, alteration):
    cache = tmp_path / "cache"
    profile = make_profile(flat_dem, cache)
    path = profile_cache_path(cache, profile)
    envelope = read_json(path)
    if alteration == "malformed":
        path.write_text('{"profile":')
    else:
        if alteration == "terrain":
            envelope["profile"]["horizonElevationDeg"][0] = 85.
        else:
            envelope["profile"]["observerHeightM"] = 10.
            envelope["contentSha256"] = identity(envelope["profile"], 64)
        path.unlink()
        write_json(path, envelope)
    before = path.read_bytes()
    with pytest.raises(DataError, match="integrity_failure"):
        make_profile(flat_dem, cache)
    assert path.read_bytes() == before


def test_legacy_profile_cache_is_preserved_and_recomputed(flat_dem, tmp_path):
    cache = tmp_path / "cache"
    expected = make_profile(flat_dem)
    legacy = cache / f"profile_{expected['profileId']}.json"
    corrupt = {**expected, "groundHeightM": 999999., "horizonElevationDeg": [85.] * 36}
    write_json(legacy, corrupt)
    before = legacy.read_bytes()
    with pytest.warns(RuntimeWarning, match="Legacy terrain cache has no content digest"):
        actual = make_profile(flat_dem, cache)
    assert actual == expected
    assert legacy.read_bytes() == before
    assert profile_cache_path(cache, actual).is_file()
    assert make_profile(flat_dem, cache) == expected


LABEL = '''SAMPLE_TYPE = LSB_INTEGER
SAMPLE_BITS = 16
SCALING_FACTOR = 0.5
OFFSET = 1737400.
CENTER_LATITUDE = -90
POSITIVE_LONGITUDE_DIRECTION = "EAST"
COORDINATE_SYSTEM_NAME = "MEAN EARTH/POLAR AXIS OF DE421"
'''


def record_source(path):
    write_json(path.with_name(path.name + ".source.json"), {
        "sha256": sha256(path), "receivedSizeBytes": path.stat().st_size,
    })


@pytest.mark.parametrize("alteration", ["label", "raster", "missing_label_provenance"])
def test_dem_rejects_changed_source_before_raster_interpretation(tmp_path, monkeypatch, alteration):
    label, raster = tmp_path / "dem.lbl", tmp_path / "dem.img"
    label.write_text(LABEL)
    raster.write_bytes(b"synthetic raster")
    record_source(label)
    record_source(raster)
    if alteration == "label":
        # Projection-affecting metadata must not be silently accepted.
        label.write_text(LABEL + "MAP_SCALE = 160\n")
    elif alteration == "raster":
        raster.write_bytes(b"corrupted raster")
    else:
        label.with_name(label.name + ".source.json").unlink()

    def no_raster_open(*_args, **_kwargs):
        raise AssertionError("Source integrity must be checked before raster interpretation")

    monkeypatch.setattr("lunar_data.terrain.rasterio.open", no_raster_open)
    code = "missing_provenance" if alteration == "missing_label_provenance" else "integrity_failure"
    with pytest.raises(DataError, match=code):
        DEM(label)


@pytest.fixture
def horizons_archive(tmp_path, monkeypatch):
    text = ("Date__(UT)__HR:MN,Azi_(a-app),Elev_(a-app),\n"
            "$$SOE\n2026-Dec-01 00:00,268.648713,-13.422339,\n$$EOE\n")
    monkeypatch.setattr("lunar_data.validation.urllib.request.urlopen",
                        lambda *_args, **_kwargs: io.BytesIO(text.encode()))
    reference = horizons_reference(tmp_path, "T1", "SUN", .67416, 23.47314)

    def no_network(*_args, **_kwargs):
        raise AssertionError("Archived references must not be replaced by a network response")

    monkeypatch.setattr("lunar_data.validation.urllib.request.urlopen", no_network)
    return tmp_path, Path(reference["raw"]), reference


def test_horizons_verified_archive_is_read_offline(horizons_archive):
    raw, path, expected = horizons_archive
    before = path.read_bytes()
    assert horizons_reference(raw, "T1", "SUN", .67416, 23.47314) == expected
    assert path.read_bytes() == before


@pytest.mark.parametrize("alteration", ["response", "params", "url", "missing_provenance"])
def test_horizons_archive_rejects_alteration_without_network(horizons_archive, alteration):
    raw, path, _expected = horizons_archive
    record = path.with_suffix(".source.json")
    if alteration == "response":
        path.write_text(path.read_text().replace("268.648713", "168.648713"))
    elif alteration == "missing_provenance":
        record.unlink()
    else:
        source = read_json(record)
        source[alteration] = {} if alteration == "params" else "https://example.invalid/changed"
        record.unlink()
        write_json(record, source)
    before = path.read_bytes()
    code = "missing_provenance" if alteration == "missing_provenance" else "integrity_failure"
    with pytest.raises(DataError, match=code):
        horizons_reference(raw, "T1", "SUN", .67416, 23.47314)
    assert path.read_bytes() == before
