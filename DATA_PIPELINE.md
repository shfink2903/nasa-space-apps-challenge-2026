# DATA pipeline

Implementation of [data.md](data.md). Preparation is Python. `touchdown/` is the
maintained application consuming the prepared dataset: static files provide the
scientific values; the local Python API provides comparison verdicts and the
optional OpenRouter explanation. No second frontend is part of this delivery.

## Offline reading

Entry point: `data/processed/v1/manifest.json`, then `sites.json` and `index.json`.
`sweeps/` holds weekly metrics. Scenario summaries hold requests, exact windows,
events, metrics, quality, verdicts and provenance. Display series use **lossless
gzip JSON**, referenced by `seriesRef.path` and SHA-256. This storage extension
to §11 reduces repeated display data; scientific values are unchanged.

```python
from lunar_data.reader import Dataset

dataset = Dataset("data/processed/v1")
sites = dataset.list_sites()
response = dataset.get_scenario(
    "apollo11", "2026-12-01T00:00:00Z", durationDays=30, heightM=2,
    modelLevel="geometric", include="series",
)
scenario = response["data"][0]
comparison = dataset.compare([scenario["scenarioId"]])
```

The reader needs only Python's standard library. No network, SPICE, terrain load
or physical calculation. Responses report filters, total/returned counts,
unavailable portions and pagination. Requests above 60 scenarios must be split.
Missing dates are never substituted. Request an explicit model level for a series.
`get_profile(profileId)`, `get_sensitivity(siteId, heightM)` and
`get_evidence(comparisonId)` provide the other prepared outputs.

Touchdown: serve the dataset as static assets. Fetch summary first, then
`seriesRef.path` when selected. Decode gzip bytes (for example with browser
`DecompressionStream("gzip")`) before parsing JSON. Use summary windows and
verdicts, never display samples, for durations or conclusions.
Contract: [schemas/scenario.schema.json](schemas/scenario.schema.json).

### Runtime comparison contract

`POST /api/compare` is the source of the verdicts, ranks and Pareto set displayed
by Touchdown. It reads the prepared scenarios and calls the same deterministic
comparison implementation as the assistant's `compare` tool. No SPICE calculation,
external provider request or model fee is involved in this endpoint.

Mission constraints are empty by default: a descriptive ranking is not a
`pass` verdict. Only thresholds enabled by the user become constraints with
`origin: "user"`. The UI can compare up to three explicit site/date pairs,
including different dates of the same site; height, duration and model stay common.
The assistant receives exactly those scenario IDs, priority and constraints.
Missing dates are not replaced with a nearby date or a catalogue-wide selection.

The complete request identifies the UI comparison cache. A response for an older
date, priority or threshold cannot replace the current selection's result. If the
API is unavailable, static values remain readable; active-constraint verdicts
remain unknown, and no API rank or Pareto result is invented locally. A static
file server alone therefore does not provide the complete comparison workflow.
See [AI_GUIDE.md](AI_GUIDE.md) for the local server and development proxy.

Current visibility and animation eligibility use the published half-open
`windows` and `analysableWindows`, including at event boundaries. Angles may be
interpolated from the 600-second display series for drawing; missing visibility
remains unknown. The landing animation's visibility rule is not an assessment of
power or landing safety. Data views initialize independently of WebGL; when the
scene fails or loses its context, data controls and the assistant remain available
subject to their own data/API dependencies, while flight controls are disabled.

The v1 sensitivity grids always describe the 30-day period starting
2026-12-01. Changing the selected comparison date does not recalculate that grid.

## Reproduce

Tested locally: Python 3.14; exact versions in `requirements.lock`. Package ranges
allow Python >=3.11; other platform/Python combinations were not exercised.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.lock
pip install -e .
lunar-data acquire --terrain

# Preparation only: live Horizons requests are serial and raw responses cached.
# Existing reports cannot be overwritten; choose a new report name.
lunar-data validate-science --terrain --live-horizons \
  --output docs/validation/scientific-next.json
pytest -q

# v1 already exists in this branch; a new release must reference its parent.
lunar-data build --output data/processed/v1.1 --parent data/processed/v1 --sensitivity
lunar-data verify data/processed/v1.1
```

For the first build in a checkout without a dataset: `lunar-data build --sensitivity`.
Defaults: 52 weekly starts (2026-12-01 through 2027-11-23), 30 days per scenario,
heights 2/10 m, 13 catalogue entries. All sites get geometry; the five terrain
sites additionally get experimental LOLA. Three polar study points get 5×5
sensitivity grids at each height. Scientific inputs (~398 MB) and intermediate
caches are excluded from Git.

`--geometric-only`, `--starts 1`, `--heights 2` and `--sites apollo11` reduce a run.
Failed staging stays in `v1.tmp` for diagnosis and is never published. Choose
another destination or remove only the failed staging directory before retrying.
Released datasets cannot be overwritten.

### Cache migration and integrity checks

Terrain preparation now stores verified cache entries under
`<cache>/profiles-verified-v1/profile_<profileId>.json`. Each entry is an envelope
with `cacheFormatVersion`, a canonical-content `contentSha256` and the original
`profile`. Reading checks the digest, profile ID and complete calculation
parameters. Returned/published profile objects retain their existing format.

Older `<cache>/profile_<profileId>.json` files have no content digest. They are
ignored with an explicit warning, preserved unchanged, and recomputed into the
new namespace. They are not made trustworthy by hashing their existing contents.
A verified entry with changed content or parameters fails with
`integrity_failure`; use another cache directory for a clean recomputation.
The first terrain build after migration can therefore cost more time than a warm
cache run. No new cold/warm performance bound is claimed.

DEM labels and raster images are checked against their source records by SHA-256
and byte size before raster interpretation. Cached Horizons references are checked
against their hash, request parameters and URL before use. Missing provenance or
altered archives are errors, not permission to silently replace a reference.

`lunar-data verify` checks hashes and byte counts, the current scenario schema,
request/metric units and bounds, window/metric consistency, event brackets and
decompressed display-series structure. This is a full local read, including
decompression of every referenced series; it does not rerun SPICE or prove
physical accuracy. Its I/O and CPU cost is distinct from normal lazy UI reads,
terrain generation and paid OpenRouter requests. No final verification latency is
guaranteed. Finder `.DS_Store` metadata is excluded from the scientific manifest
inventory without deleting or modifying it; arbitrary extra files still fail.

Custom coordinates are a preparation operation, never triggered by the reader:

```python
from lunar_data.pipeline import compute_custom_point
result = compute_custom_point(-88.1, 12.0, "2026-12-01T00:00:00Z", heightM=2)
```

MOON_ME, planetocentric latitude, east-positive longitude. Ambiguous longitudes
and the polar axis are rejected. Latitude <= -84.95° uses available LOLA products;
other points get an explicitly geometric model.

## Scientific status

Read [docs/validation/v1.md](docs/validation/v1.md). Kernel coverage, numerical
tests, physical accuracy and mission feasibility remain separate. Scenario
validation stays `not_validated` outside the tested reference domain. No terrain
means a mandatory polar warning. Power, stations, relays, exact eclipses,
landing safety, resources and transfer trajectories are not modeled.

The original whole-product T9 test **fails**: replacing the entire 80 m DEM with
the wider 120 m product changes near terrain and observer ground height. The
pipeline uses a composite for polar points and IM-1: fine DEM through 150 km,
wider product from 150 to 300 km, fixed fine-DEM observer altitude. Additional
checks of this method do not erase the original T9 failure. LOLA outputs remain
experimental. Chandrayaan-3 uses the declared 240 m DEM to 150 km; its convergence
was not tested.

The annual ET grid includes the final endpoint; the measured count is recorded.
Exact weekly UTC epochs can differ by milliseconds. Annual vectors are
interpolated only within a declared 2 ms offset; bisection recomputes SPICE
geometry directly. Calculation: 60 s, grazing refinement: 5 s, rise/set event
brackets: <=1 s, display: 600 s. Grazing candidates retain their wider search
bracket. These settings are not physical error bounds.

Nonzero mission margins now retain only detected sets belonging to surviving
prudent windows. An analysis boundary or data hole no longer becomes an invented
set. This changes future calculations with margins; it does not rewrite the
immutable v1 scenarios, whose mission margins are absent.

The software correction report is
[Touchdown audit fixes, 15 November 2026](docs/validation/touchdown-audit-fixes-2026-11-15.md).
It separates checks already run from final integration qualification and preserves
the scientific limitations of v1.

## OpenRouter agent

The complete tool-calling agent is in `lunar_data.agent`, served by
`lunar_data.server` and integrated into Touchdown. It uses OpenRouter with an
explicit model and server-side key. See [AI_GUIDE.md](AI_GUIDE.md) for the tool
boundary, budgets, startup and live qualification. The earlier single-call
`lunar_data.ai.explain(packet)` remains a legacy compatibility adapter; the UI
uses the new agent. Scientific validation of the immutable v1 bundle is unchanged.
