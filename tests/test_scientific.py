"""Integration tests use real local kernels. No network access during tests."""
import copy
import socket
from pathlib import Path

import jsonschema
import numpy as np
import pytest

from lunar_data.catalog import list_sites
from lunar_data.common import DataError, parameter, read_json
from lunar_data.geometry import Geometry, az_el, site_vector
from lunar_data.scenario import compute, normalized_request
from lunar_data.terrain import DEM, combined_profile
from lunar_data.validation import REFERENCES

pytestmark = [pytest.mark.scientific, pytest.mark.skipif(not Path('data/raw/kernels/de440s.bsp').exists(), reason='run acquire to enable scientific integration tests')]


@pytest.fixture(scope='module')
def geo():
    return Geometry()


@pytest.mark.parametrize('tid,body,lat,lon,az,el', REFERENCES)
def test_T1_T5_plan_references(geo, tid, body, lat, lon, az, el):
    v = geo.vectors([geo.et('2026-12-01T00:00:00Z')])[body]
    actual = az_el(body, v, site_vector(lat, lon, 0))
    assert abs((actual['az'][0] - az + 180) % 360 - 180) <= .01
    assert abs(actual['el'][0] - el) <= .01


def test_outside_coverage_rejected(geo):
    with pytest.raises(DataError, match='outside_coverage'):
        geo.vectors([geo.et('2200-01-01T00:00:00Z')])
    with pytest.raises(DataError):
        geo.et('2026-12-01')


def test_zero_margins_preserve_nominal(geo):
    site = list_sites()[0]
    constraint = {'metricId': 'earth.anyDisk.fraction', 'op': '>=', 'value': .5, 'unit': '1', 'origin': 'user'}
    r = normalized_request(site, duration=3600, constraints=[constraint], margins={'timeS': parameter(0, 's', 'user'), 'angleDeg': parameter(0, 'deg', 'user')})
    before = copy.deepcopy(r)
    s = compute(geo, site, r, 'test', 'test')
    assert s['evaluation']['nominal'] == s['evaluation']['prudent']
    assert r == before
    jsonschema.validate(s, read_json('schemas/scenario.schema.json'))
    other = compute(geo, site, normalized_request(site, duration=3600, height=10), 'test', 'test')
    assert s['scenarioId'] != other['scenarioId']


def test_real_dem_projection_and_profile_identity():
    if not Path('data/raw/lola/ldem_80s_80m.img').exists():
        pytest.skip('terrain not acquired')
    dem = DEM('data/raw/lola/ldem_80s_80m.lbl')
    wide = DEM('data/raw/lola/ldem_75s_120m.lbl')
    site = list_sites()[10]
    near = dem.profile(site, 2, azimuth_step=1)
    combo = combined_profile(dem, wide, site, 2, azimuth_step=1)
    high = dem.profile(site, 10, azimuth_step=1)
    assert near['groundHeightM'] == combo['groundHeightM']
    assert near['profileId'] != combo['profileId'] != high['profileId']
    assert combo['truncatedAzimuthCount'] == 0
    assert np.all(np.array(combo['horizonElevationDeg']) >= np.array(near['horizonElevationDeg']))


def test_bundle_atomic_offline_schema_and_integrity(tmp_path, monkeypatch):
    from lunar_data.pipeline import build, verify
    from lunar_data.reader import Dataset
    root = tmp_path / 'v1'
    result = build(root, starts=1, terrain=False, heights=(2.,), site_ids=['apollo11', 'change4'])
    assert result['scenarioCount'] == 2
    assert root.exists() and not root.with_name('v1.tmp').exists()
    with pytest.raises(DataError, match='immutable_dataset_exists'):
        build(root, starts=1)
    def no_network(*a, **kw):
        raise AssertionError('network forbidden')
    monkeypatch.setattr(socket, 'socket', no_network)
    assert verify(root)['networkUsed'] is False
    dataset = Dataset(root)
    assert dataset.list_sites(limit=1)['next'] == 1
    scenario = dataset.get_scenario('apollo11', '2026-12-01T00:00:00Z', modelLevel='geometric', include='series')['data'][0]
    assert scenario['series']['n'] == 4321
    jsonschema.validate(scenario, read_json('schemas/scenario.schema.json'))
    assert scenario['series']['earthState'] == [2] * 4321
    missing = dataset.get_scenario('apollo11', '2030-12-01T00:00:00Z')
    assert missing['returned'] == 0 and missing['unavailable']
    p = root / 'scenarios' / f"{scenario['scenarioId']}.json"
    p.write_text('{}')
    with pytest.raises(DataError, match='integrity_failure'):
        dataset.scenario(scenario['scenarioId'])
