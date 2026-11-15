"""Small synthetic terrain tests; no remote data or large raster required."""
from copy import deepcopy

import numpy as np
import pytest

from lunar_data.common import DataError
from lunar_data.compare import compare
from lunar_data.terrain import DEM, interpolate_horizon, polar20_profile
from lunar_data.polar_validation import differences


def synthetic(tmp_path, monkeypatch, missing=False):
    import lunar_data.terrain as terrain
    d = DEM.__new__(DEM)
    d.label = tmp_path / "synthetic.lbl"
    d.label.write_text("synthetic")
    d.product, d.pixel_m = "synthetic", 80.
    d.source = d.label_source = {"sha256": "0" * 64}
    d.sample = lambda lat, lon: np.where((np.asarray(lat) >= .029) & (np.asarray(lat) <= .031),
                                         np.nan if missing else 10., 0.).reshape(-1)
    monkeypatch.setattr(terrain, "destination", lambda lat, lon, az, dist: (np.radians(dist), np.zeros_like(dist)))
    return d


SITE = {"id": "synthetic", "latDeg": 0., "lonDeg": 0.}


def test_obstacle_in_first_160_metres_changes_horizon(tmp_path, monkeypatch):
    d = synthetic(tmp_path, monkeypatch)
    old = d.profile(SITE, 2., radius_km=1., azimuth_step=10.)
    close = d.profile(SITE, 2., radius_km=1., azimuth_step=10., near_surface=True)
    assert max(old["horizonElevationDeg"]) < 0
    assert min(close["horizonElevationDeg"]) > 10
    assert close["distanceOfMaxKm"][0] < .04
    assert close["profileId"] != old["profileId"]


def test_missing_near_terrain_is_unknown(tmp_path, monkeypatch):
    d = synthetic(tmp_path, monkeypatch, missing=True)
    p = d.profile(SITE, 2., radius_km=1., azimuth_step=10., near_surface=True)
    assert p["reachKm"][0] < .03
    assert np.isnan(interpolate_horizon(np.array([0., 20.]), p)).all()


class Band:
    def __init__(self, product, el, missing=False):
        self.product, self.el, self.missing, self.pixel_m = product, el, missing, 20.
        self.source = self.label_source = {"sha256": product * 64}
        self.calls = []

    def sample(self, lat, lon):
        return np.array([123.])

    def profile(self, site, height, radius, az, cache, **kw):
        self.calls.append((radius, kw))
        return {"profileId": self.product, "azimuthDeg": [0.], "azimuthStepDeg": az, "groundHeightM": kw["ground_height_m"],
                "horizonElevationDeg": [None if self.missing else self.el], "distanceOfMaxKm": [radius], "reachKm": [0. if self.missing else radius]}


def test_band_boundaries_and_fixed_observer():
    near, mid, far = Band("a", 2), Band("b", 3), Band("c", 1)
    p = polar20_profile(near, mid, far, SITE, 2.)
    assert p["horizonElevationDeg"] == [3]
    assert near.calls[0][0] == mid.calls[0][1]["rmin_km"] == 20.
    assert mid.calls[0][0] == far.calls[0][1]["rmin_km"] == 150.
    assert all(d.calls[0][1]["ground_height_m"] == 123. for d in (near, mid, far))
    assert p["terrainMethodId"] == polar20_profile(near, mid, far, {**SITE, "id": "other"}, 10.)["terrainMethodId"]
    far.missing = True
    assert polar20_profile(near, mid, far, SITE, 2.)["horizonElevationDeg"] == [None]


@pytest.mark.parametrize("field", ["height", "method"])
def test_mixed_methods_and_heights_rejected(field):
    a = {"scenarioId": "a", "modelLevel": "lola", "terrainMethodId": "same", "kernelSetId": "k",
         "request": {"observerHeightM": {"value": 2}, "analysisDurationS": {"value": 100}, "computeStepS": {"value": 60}}}
    b = deepcopy(a)
    b["scenarioId"] = "b"
    if field == "height": b["request"]["observerHeightM"]["value"] = 10
    else: b["terrainMethodId"] = "different"
    with pytest.raises(DataError, match="incompatible_scenarios"):
        compare([a, b])


def test_numerical_check_rejects_unmatched_grazing_event():
    a = {"events": [{"body": "sun", "convention": "anyDisk", "type": "grazing", "tUtc": "2026-12-01T00:00:00Z"}],
         "windows": {"sun.anyDisk": []}, "metrics": [], "coverageStatus": "covered"}
    b = {**a, "events": []}
    report = differences(a, b)
    assert not report["pass"]
    assert report["countMismatches"][0]["counts"] == [1, 0]


def test_numerical_check_reports_window_and_event_shifts():
    a = {"events": [{"body": "sun", "convention": "anyDisk", "type": "rise", "tUtc": "2026-12-01T00:00:00Z"}],
         "windows": {"sun.anyDisk": [{"startUtc": "2026-12-01T00:00:00Z", "endUtc": "2026-12-01T01:00:00Z",
                                         "truncatedStart": False, "truncatedEnd": False}]},
         "metrics": [], "coverageStatus": "covered"}
    b = deepcopy(a)
    b["events"][0]["tUtc"] = b["windows"]["sun.anyDisk"][0]["startUtc"] = "2026-12-01T00:10:01Z"
    report = differences(a, b)
    assert not report["pass"]
    assert report["pairedEventDifferences"][0]["differenceS"] == 601
    assert report["windowDifferences"]["sun.anyDisk"][0]["startDifferenceS"] == 601
