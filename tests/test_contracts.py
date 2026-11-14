import copy
import json

import numpy as np
import pytest

from lunar_data.ai import validate_explanation
from lunar_data.catalog import list_sites
from lunar_data.common import DataError, check_schema, identity, parameter, read_json, write_json
from lunar_data.compare import compare, dominates, evaluate
from lunar_data.geometry import az_el, disk_state, site_vector, time_grid, validate_point
from lunar_data.scenario import normalized_request
from lunar_data.terrain import interpolate_horizon, spherical_elevation
from lunar_data.windows import detect, duration, erode, intersect, merge, metrics


def test_catalog_plan():
    sites = list_sites()
    assert len(sites) == 13
    assert len({s['id'] for s in sites}) == 13
    assert sum(s['status'] == 'study_point' for s in sites) == 3
    assert next(s for s in sites if s['id'] == 'im1')['verification'] == 'unverified'
    assert all(s['groundHeightM'] is None for s in sites)


@pytest.mark.parametrize('lat,lon', [(90, 0), (-90, 0), (89.9999, 0), (0, -180), (0, 181), (float('nan'), 0), (True, 0)])
def test_reject_ambiguous_coordinates(lat, lon):
    with pytest.raises(DataError):
        validate_point(lat, lon)


def test_nondivisible_grid_includes_end():
    assert time_grid(10, 125, 60).tolist() == [10, 70, 130, 135]
    with pytest.raises(DataError):
        time_grid(0, 0, 60)


def test_disk_and_wrap():
    assert disk_state(np.array([-1, 0, 1, 0]), .5, [0, 0, 0, np.nan]).tolist() == [0, 1, 2, -1]
    p = {'azimuthDeg': [0, 90, 180, 270], 'horizonElevationDeg': [1, 0, 0, 0], 'reachKm': [150]*4, 'rMaxKm': 150}
    assert interpolate_horizon([359, 1], p)[0] == pytest.approx(interpolate_horizon([359, 1], p)[1])
    p['reachKm'][0] = 100
    assert np.isnan(interpolate_horizon([359, 1], p)).all()


@pytest.mark.parametrize('height,expected', [(2., -.0869), (10., -.1944)])
def test_T7_synthetic_sphere(height, expected):
    # Dense test grid, independent of DEM samples, tolerance fixed by data.md T7.
    d = np.arange(.001, 10, .001)
    el = spherical_elevation(d, 0, 0, height)
    assert np.max(el) == pytest.approx(expected, abs=.001)
    tangent = 1737.4 * np.arccos(1737400 / (1737400 + height))
    assert d[np.argmax(el)] == pytest.approx(tangent, abs=.002)


def test_T8_wall():
    assert float(spherical_elevation(10, 1000, 0, 2)) == pytest.approx(5.533, abs=.01)


def test_T10_refinement_uses_direct_evaluation():
    ts = np.arange(0, 241, 60.)
    result = detect(ts, ts - 93., lambda t: t - 93.)
    assert len(result['events']) == 1
    assert result['events'][0]['type'] == 'rise'
    assert result['events'][0]['t'] == pytest.approx(93., abs=1)
    assert duration(result['visible']) == pytest.approx(147., abs=1)
    assert duration(result['valid']) == 240
    assert result['events'][0]['bracket'][1] - result['events'][0]['bracket'][0] <= 1


def test_T10_hole_excluded_not_filled():
    ts = np.arange(0, 301, 60.)
    result = detect(ts, [1., 1., np.nan, 1., 1., 1.], lambda t: np.ones_like(t))
    assert result['visible'] == [[0., 60.], [180., 300.]]
    assert duration(result['valid']) == 180
    assert result['events'] == []
    assert merge([[0, 10], [10, 20], [30, 40]]) == [[0., 20.], [30., 40.]]
    assert intersect([[0, 20]], [[10, 30]]) == [[10., 20.]]


def test_grazing_refines_short_hidden_window():
    ts = np.array([0., 60., 120.])
    fn = lambda t: .0025 - ((t - 50.) / 100.)**2
    r = detect(ts, fn(ts), fn)
    assert any(e['type'] == 'grazing' for e in r['events'])
    assert duration(r['visible']) == pytest.approx(10., abs=1.)


def test_T11_constraints_and_margins():
    m = [{'metricId': 'x', 'value': 3., 'unit': 'h', 'quality': 'complete'}]
    c = [{'metricId': 'x', 'op': '<=', 'value': 4., 'unit': 'h', 'origin': 'user'}]
    assert evaluate(m, [])['status'] == 'not_evaluated'
    assert evaluate(m, c)['status'] == 'pass'
    assert evaluate([{**m[0], 'value': None}], c)['status'] == 'unknown'
    with pytest.raises(DataError):
        evaluate(m, [{**c[0], 'unit': 's'}])
    original = [[0, 100]]
    assert erode(original, 0) == original
    assert erode(original, 51) == []
    assert original == [[0, 100]]


def test_truncated_gap_is_lower_bound():
    m = [{'metricId': 'sun.anyDisk.longestGapH', 'value': 20, 'unit': 'h', 'quality': 'complete', 'truncatedEnd': True}]
    c = [{'metricId': m[0]['metricId'], 'op': '<=', 'value': 30, 'unit': 'h', 'origin': 'user'}]
    assert evaluate(m, c)['status'] == 'unknown'
    assert evaluate(m, [{**c[0], 'value': 10}])['status'] == 'fail'


def fake_scenario(sid, value, status='not_evaluated'):
    return {'scenarioId': sid, 'kernelSetId': 'k', 'modelLevel': 'geometric', 'coverageStatus': 'covered',
            'request': {'analysisDurationS': parameter(100, 's'), 'computeStepS': parameter(60, 's')},
            'metrics': [{'metricId': 'x', 'value': value, 'unit': '1', 'quality': 'complete'}],
            'evaluation': {'nominal': {'status': status}}}


def test_pareto_and_unknown_are_not_zero():
    criteria = [{'metricId': 'x', 'direction': 'max', 'origin': 'user'}]
    a, b, unknown = fake_scenario('a', 2), fake_scenario('b', 1), fake_scenario('u', None)
    assert dominates(a, b, criteria)
    assert not dominates(a, unknown, criteria)
    assert compare([a, b, unknown], criteria)['nonDominatedScenarioIds'] == ['a', 'u']
    r = compare([fake_scenario('a', 2, 'fail')], criteria)
    assert r['nonDominatedScenarioIds'] == [] and r['recommendation'] is None
    with pytest.raises(DataError):
        compare([a] * 61, criteria)
    with pytest.raises(DataError):
        compare([a, {**b, 'modelLevel': 'lola'}], criteria)


def test_T12_json_and_versions(tmp_path):
    path = tmp_path / 'a.json'
    with pytest.raises(ValueError):
        write_json(path, {'bad': float('nan')})
    assert not path.exists()
    path.write_text('{"bad":Infinity}')
    with pytest.raises(DataError):
        read_json(path)
    with pytest.raises(DataError):
        check_schema({'schemaVersion': '2.0.0'})
    check_schema({'schemaVersion': '1.1.0'})
    s = list_sites()[0]
    assert identity(normalized_request(s, height=2)) != identity(normalized_request(s, height=10))


def test_T12_ai_changes_number_rejected():
    packet = {'scenarios': [{'scenarioId': 's', 'metrics': [{'metricId': 'x', 'value': 42, 'unit': 'h'}]}]}
    correct = {'claims': [{'scenarioId': 's', 'metricId': 'x', 'text': 'Durée observée sur cette période.'}]}
    assert validate_explanation(correct, packet)['claims'][0]['metric']['value'] == 42
    for field, value in [('text', 'Durée de 43 heures'), ('metricId', 'invented'), ('text', 'Succès garanti')]:
        altered = copy.deepcopy(correct)
        altered['claims'][0][field] = value
        with pytest.raises(DataError):
            validate_explanation(altered, packet)
