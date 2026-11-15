"""Release verification regressions; mutations are confined to temporary copies."""
from copy import deepcopy
import gzip
import json
from pathlib import Path
import shutil

import jsonschema
import pytest

from lunar_data.common import DataError, canonical, read_json, sha256
from lunar_data.compare import evaluate
from lunar_data.pipeline import build, validate_scenario, validate_series, verify


RELEASE = Path(__file__).resolve().parents[1] / "data/processed/v1"
CURRENT_SCHEMA = Path(__file__).resolve().parents[1] / "schemas/scenario.schema.json"


def _rewrite_manifest(root):
    manifest = read_json(root / "manifest.json")
    for entry in manifest["files"]:
        path = root / entry["path"]
        entry.update(sizeBytes=path.stat().st_size, sha256=sha256(path))
    manifest["totalSizeBytes"] = sum(entry["sizeBytes"] for entry in manifest["files"])
    (root / "manifest.json").write_text(canonical(manifest))


@pytest.fixture
def bundle(tmp_path):
    """One real scenario, with the original, weaker immutable release schema."""
    root = tmp_path / "v1"
    source = next(RELEASE.glob("scenarios/apollo11_*_h2m_geometric_*.json"))
    scenario = read_json(source)
    relative = str(source.relative_to(RELEASE))
    paths = {relative, scenario["seriesRef"]["path"], "schema/scenario.schema.json"}
    for name in paths:
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(RELEASE / name, target)
    index = {"schemaVersion": "1.0.0", "scenarioIds": [scenario["scenarioId"]], "profileIds": [], "comparisonIds": [], "total": 1}
    (root / "index.json").write_text(canonical(index))
    paths.add("index.json")
    manifest = read_json(RELEASE / "manifest.json")
    manifest["files"] = [{"path": name, "sizeBytes": (root / name).stat().st_size, "sha256": sha256(root / name)} for name in sorted(paths)]
    manifest["fileCount"] = len(paths)
    manifest["totalSizeBytes"] = sum(entry["sizeBytes"] for entry in manifest["files"])
    (root / "manifest.json").write_text(canonical(manifest))
    return root, root / relative, scenario


def test_real_release_verifies_without_changing_immutable_files():
    before = sha256(RELEASE / "manifest.json")
    result = verify(RELEASE)
    assert result == {"status": "pass", "filesChecked": 4013, "scenarioCount": 1872, "networkUsed": False}
    assert sha256(RELEASE / "manifest.json") == before


def test_finder_metadata_is_ignored_but_other_unlisted_files_are_rejected(bundle):
    root, _, _ = bundle
    (root / ".DS_Store").write_bytes(b"Finder metadata")
    (root / "scenarios/.DS_Store").write_bytes(b"nested Finder metadata")
    assert verify(root)["status"] == "pass"
    assert (root / ".DS_Store").read_bytes() == b"Finder metadata"
    for name in ("unexpected.json", ".unexpected", "._unexpected.json"):
        extra = root / name
        extra.write_text("{}")
        with pytest.raises(DataError, match="invalid_manifest"):
            verify(root)
        extra.unlink()


@pytest.mark.parametrize("parameters", [
    {"terrain": False, "sensitivity": True}, {"starts": True}, {"starts": 0},
    {"starts": 53}, {"terrain": "yes"}, {"sensitivity": 1},
    {"heights": []}, {"heights": [2, 2]}, {"heights": [True]},
    {"heights": [-1]}, {"heights": [float("nan")]},
    {"site_ids": []}, {"site_ids": ["missing"]}, {"site_ids": "apollo11"},
    {"site_ids": ["apollo11", "apollo11"]},
])
def test_invalid_build_input_fails_before_staging_or_scientific_work(tmp_path, monkeypatch, parameters):
    def forbidden(*args, **kwargs):
        raise AssertionError("scientific preparation must not start")
    monkeypatch.setattr("lunar_data.pipeline.Geometry", forbidden)
    output = tmp_path / "v1"
    with pytest.raises(DataError, match="invalid_request"):
        build(output, **parameters)
    assert not output.exists()
    assert not output.with_name("v1.tmp").exists()


@pytest.mark.parametrize("mutation", [
    lambda s: s["request"]["analysisDurationS"].update(value=-1),
    lambda s: s["request"]["observerHeightM"].update(value="not-a-height"),
    lambda s: s["request"]["computeStepS"].update(value=True),
    lambda s: s.update(windows={"sun.anyDisk": "broken"}),
    lambda s: s["metrics"][0].update(value=999),
    lambda s: s["metrics"][0].update(unit="bananas"),
])
def test_current_schema_rejects_corruptions_accepted_by_old_release_schema(bundle, mutation):
    _, _, scenario = bundle
    altered = deepcopy(scenario)
    mutation(altered)
    jsonschema.Draft202012Validator(read_json(RELEASE / "schema/scenario.schema.json")).validate(altered)
    validator = jsonschema.Draft202012Validator(read_json(CURRENT_SCHEMA), format_checker=jsonschema.FormatChecker())
    assert list(validator.iter_errors(altered))


@pytest.mark.parametrize("metric_id", ["sun.anyDisk.fraction", "overlap.sunAny_earthAny.fraction", "analysis.analysableFraction"])
def test_semantic_verification_rejects_rehashed_inconsistent_fraction(bundle, metric_id):
    root, path, scenario = bundle
    metric = next(m for m in scenario["metrics"] if m["metricId"] == metric_id)
    metric["value"] = .123456789
    path.write_text(canonical(scenario))
    _rewrite_manifest(root)
    with pytest.raises(DataError, match="fraction disagrees"):
        verify(root)


@pytest.mark.parametrize("mutation", [
    lambda s: s["metrics"].append(deepcopy(s["metrics"][0])),
    lambda s: s["windows"]["sun.anyDisk"][0].update(endUtc=s["windows"]["sun.anyDisk"][0]["startUtc"]),
    lambda s: s["metrics"][0].update(denominatorS=s["request"]["analysisDurationS"]["value"] + 1),
    lambda s: next(m for m in s["metrics"] if m["metricId"] == "sun.anyDisk.longestGapH").update(value=0),
    lambda s: next(m for m in s["metrics"] if m["metricId"] == "sun.anyDisk.nextSetH").update(value=0),
])
def test_semantic_invariants_reject_duplicate_metrics_and_invalid_windows(bundle, mutation):
    _, _, scenario = bundle
    mutation(scenario)
    with pytest.raises(DataError, match="invalid_scenario"):
        validate_scenario(scenario)


def test_rehashed_series_with_wrong_explicit_time_count_is_rejected(bundle):
    root, path, scenario = bundle
    series_path = root / scenario["seriesRef"]["path"]
    series = json.loads(gzip.decompress(series_path.read_bytes()))
    series["timesUtc"] = [series["t0Utc"]]
    raw = canonical(series).encode()
    series_path.write_bytes(gzip.compress(raw, mtime=0))
    scenario["seriesRef"].update(sha256=sha256(series_path), uncompressedSizeBytes=len(raw))
    path.write_text(canonical(scenario))
    _rewrite_manifest(root)
    with pytest.raises(DataError, match="explicit time column"):
        verify(root)


@pytest.mark.parametrize("column,value", [("sunState", True), ("sunElDeg", 91), ("earthSunOcclusionPossible", "yes"), ("sunVisibleDiskFraction", 2)])
def test_series_types_and_ranges_are_checked(bundle, column, value):
    root, _, scenario = bundle
    series = json.loads(gzip.decompress((root / scenario["seriesRef"]["path"]).read_bytes()))
    series[column][0] = value
    with pytest.raises(DataError, match="invalid_series"):
        validate_series(series, scenario)


@pytest.fixture
def truncated_july_scenario():
    source = next(RELEASE.glob("scenarios/sp_s8600_20270713_30d_h2m_lola_*.json"))
    return read_json(source)


@pytest.mark.parametrize("flag", ["truncatedStart", "truncatedEnd", "truncatedByMissingData"])
@pytest.mark.parametrize("mutation", ["remove", "not_boolean", "invert"])
def test_longest_gap_truncation_cannot_be_removed_or_falsified(truncated_july_scenario, flag, mutation):
    scenario = truncated_july_scenario
    validate_scenario(scenario)
    metric = next(m for m in scenario["metrics"] if m["metricId"] == "sun.anyDisk.longestGapH")
    if mutation == "remove":
        del metric[flag]
    elif mutation == "not_boolean":
        metric[flag] = 0
    else:
        metric[flag] = not metric[flag]
    if mutation != "invert":
        validator = jsonschema.Draft202012Validator(read_json(CURRENT_SCHEMA))
        assert list(validator.iter_errors(scenario))
    with pytest.raises(DataError, match="truncation flags"):
        validate_scenario(scenario)


def test_reject_truncation_loss_that_would_turn_unknown_into_pass(truncated_july_scenario):
    scenario = truncated_july_scenario
    constraint = {"metricId": "sun.anyDisk.longestGapH", "op": "<=", "value": 360, "unit": "h", "origin": "user"}
    assert evaluate(scenario["metrics"], [constraint])["status"] == "unknown"
    metric = next(m for m in scenario["metrics"] if m["metricId"] == constraint["metricId"])
    for flag in ("truncatedStart", "truncatedEnd", "truncatedByMissingData"):
        metric[flag] = False
    assert evaluate(scenario["metrics"], [constraint])["status"] == "pass"
    with pytest.raises(DataError, match="truncation flags disagree"):
        validate_scenario(scenario)


@pytest.fixture
def partial_scenario():
    from test_scientific_regressions import SyntheticGeometry, margin_scenario
    return margin_scenario(geometry=SyntheticGeometry(missing=True))


@pytest.mark.parametrize("metric_id", [
    "sun.anyDisk.fraction", "earth.fullDisk.fraction", "sun.anyDisk.longestGapH",
    "earth.anyDisk.nextSetH", "overlap.sunAny_earthAny.fraction",
])
def test_partial_metric_cannot_claim_complete_quality(partial_scenario, metric_id):
    validate_scenario(partial_scenario)
    metric = next(m for m in partial_scenario["metrics"] if m["metricId"] == metric_id)
    assert metric["quality"] == "partial"
    metric["quality"] = "complete"
    with pytest.raises(DataError, match="quality disagrees"):
        validate_scenario(partial_scenario)


def test_reject_quality_promotion_that_would_turn_unknown_into_pass(partial_scenario):
    constraint = {"metricId": "sun.anyDisk.fraction", "op": ">=", "value": .25, "unit": "1", "origin": "user"}
    assert evaluate(partial_scenario["metrics"], [constraint])["status"] == "unknown"
    next(m for m in partial_scenario["metrics"] if m["metricId"] == constraint["metricId"])["quality"] = "complete"
    assert evaluate(partial_scenario["metrics"], [constraint])["status"] == "pass"
    with pytest.raises(DataError, match="quality disagrees"):
        validate_scenario(partial_scenario)


@pytest.mark.parametrize("field,value", [("coverageStatus", "covered"), ("coverageStatus", "outside"), ("processingStatus", "complete")])
def test_coverage_and_processing_cannot_contradict_missing_data(partial_scenario, field, value):
    validate_scenario(partial_scenario)
    partial_scenario[field] = value
    with pytest.raises(DataError, match="statuses disagree"):
        validate_scenario(partial_scenario)


def test_longest_gap_missing_data_flag_matches_analysable_windows():
    import numpy as np
    from test_scientific_regressions import SyntheticGeometry, margin_scenario
    scenario = margin_scenario(geometry=SyntheticGeometry(lambda times: np.full_like(times, -10.), missing=True))
    validate_scenario(scenario)
    metric = next(m for m in scenario["metrics"] if m["metricId"] == "sun.anyDisk.longestGapH")
    assert metric["truncatedByMissingData"] is True
    metric["truncatedByMissingData"] = False
    with pytest.raises(DataError, match="truncation flags disagree"):
        validate_scenario(scenario)


def test_window_boundary_cannot_hide_its_truncation(bundle):
    _, _, scenario = bundle
    scenario["analysableWindows"]["sun.anyDisk"][0]["truncatedStart"] = False
    with pytest.raises(DataError, match="invalid truncation flag"):
        validate_scenario(scenario)
