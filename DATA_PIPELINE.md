# DATA pipeline

Implementation of [data.md](data.md). Preparation is Python; the UI reads static
files. No frontend or scene is included here.

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

Web UI: serve the dataset as static assets. Fetch summary first, then
`seriesRef.path` when selected. Decode gzip bytes (for example with browser
`DecompressionStream("gzip")`) before parsing JSON. Use summary windows and
verdicts, never display samples, for durations or conclusions.
Contract: [schemas/scenario.schema.json](schemas/scenario.schema.json).

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
geometry directly. Calculation: 60 s, grazing refinement: 5 s, event brackets:
<=1 s, display: 600 s. These settings are not physical error bounds.

## Optional OpenRouter adapter

`lunar_data.ai.explain(packet)` requires server-side `OPENROUTER_API_KEY` and an
explicit `OPENROUTER_MODEL`. No default model, paid request or provider call in
this delivery. Provider support and tool orchestration remain untested.

One bounded call, no retry or provider fallback. Structured citations only;
actual numbers are rendered from referenced metrics. Model-written digits and
guarantees are rejected. Missing configuration or invalid output leaves the
deterministic data available. These checks do not establish semantic correctness
of free text. Context sizes use named `cl100k_base`; provider counts may differ.
