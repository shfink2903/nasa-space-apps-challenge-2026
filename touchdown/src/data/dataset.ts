/**
 * Read-only access to the frozen dataset (data/processed/v1), served at /data/v1.
 * The UI shows these values. It never recomputes windows, durations or verdicts.
 */
import { lerpAngleDeg } from "./astro";

export const DATA_BASE = "/data/v1";

/** "custom" is a free point chosen by the user; it is not in the dataset catalogue. */
export type SiteStatus = "historical" | "study_point" | "announced" | "custom";
/** 0 = not visible, 1 = partly visible, 2 = fully visible, null = unknown. */
export type DiskState = 0 | 1 | 2 | null;

export interface Site {
  id: string;
  name: string;
  mission: string | null;
  status: SiteStatus;
  latDeg: number;
  lonDeg: number;
  terrainProduct: string | null;
  /** "single_source", "unverified" or "team_defined", as published. */
  verification: string;
  scenarioIds: string[];
  /** True when the dataset has no scenario for the site: its values are a geometric estimate made in the browser. */
  computed?: boolean;
  /** Where the position comes from, for the sites added to the dataset catalogue. */
  source?: { title: string; url: string };
}

export interface Series {
  t0Utc: string;
  stepS: number;
  n: number;
  sunAzDeg: number[];
  sunElDeg: number[];
  sunState: DiskState[];
  sunAngularRadiusDeg: number[];
  earthAzDeg: number[];
  earthElDeg: number[];
  earthState: DiskState[];
  earthAngularRadiusDeg: number[];
}

export interface ScenarioEvent {
  body: "sun" | "earth";
  type: "rise" | "set";
  convention: "anyDisk" | "fullDisk";
  tUtc: string;
}

export interface Metric {
  metricId: string;
  value: number | null;
  unit: string;
  quality: string;
}

/** Exact visibility interval [startUtc, endUtc), from the 60 s grid refined to 1 s. */
export interface VisibilityWindow {
  startUtc: string;
  endUtc: string;
  truncatedStart: boolean;
  truncatedEnd: boolean;
}

export type WindowKey = "sun.anyDisk" | "sun.fullDisk" | "earth.anyDisk" | "earth.fullDisk";

export interface Scenario {
  scenarioId: string;
  siteId: string;
  modelLevel: string;
  validationStatus: string;
  coverageStatus: string;
  profileId: string | null;
  events: ScenarioEvent[];
  windows: Record<WindowKey, VisibilityWindow[]>;
  metrics: Metric[];
  limits: string[];
  seriesRef: { path: string; encoding: string };
}

export interface HorizonProfile {
  profileId: string;
  azimuthStepDeg: number;
  horizonElevationDeg: (number | null)[];
}

export interface ScenarioKey {
  date: string; // YYYYMMDD
  heightM: number;
  model: "geometric" | "lola";
}

const ID_PATTERN = /^(.+)_(\d{8})_30d_h(\d+)m_(geometric|lola)_[0-9a-f]+$/;

/** Splits a scenario id into its parts. Returns null if the id has another shape. */
export function parseScenarioId(id: string): (ScenarioKey & { siteId: string }) | null {
  const m = ID_PATTERN.exec(id);
  if (!m) return null;
  return { siteId: m[1], date: m[2], heightM: Number(m[3]), model: m[4] as ScenarioKey["model"] };
}

/** Sorted list of the analysis start dates (YYYYMMDD) published for a site. */
export function availableDates(site: Site): string[] {
  const dates = new Set<string>();
  for (const id of site.scenarioIds) {
    const key = parseScenarioId(id);
    if (key) dates.add(key.date);
  }
  return [...dates].sort();
}

/**
 * Picks the published scenario for a site, a start date and an observer height.
 * Without `model`, the terrain-aware model ("lola") is used when the dataset has it, else "geometric".
 */
export function pickScenarioId(site: Site, date: string, heightM = 2, model?: ScenarioKey["model"]): string | null {
  let geometric: string | null = null;
  for (const id of site.scenarioIds) {
    const key = parseScenarioId(id);
    if (!key || key.date !== date || key.heightM !== heightM) continue;
    if (model ? key.model === model : key.model === "lola") return id;
    if (!model) geometric = id;
  }
  return geometric;
}

/** Model level the interface shows for a site: terrain-aware when published, else geometric. */
export function bestModel(site: Site): ScenarioKey["model"] {
  return site.scenarioIds.some((id) => parseScenarioId(id)?.model === "lola") ? "lola" : "geometric";
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${DATA_BASE}/${path}`, { signal });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadSites(signal?: AbortSignal): Promise<Site[]> {
  const doc = await getJson<{ sites: Site[] }>("sites.json", signal);
  return doc.sites;
}

export function loadScenario(id: string, signal?: AbortSignal): Promise<Scenario> {
  return getJson<Scenario>(`scenarios/${id}.json`, signal);
}

/** Series files are gzip on disk. The server sends the raw bytes; decode here. */
export async function loadSeries(scenario: Scenario, signal?: AbortSignal): Promise<Series> {
  const res = await fetch(`${DATA_BASE}/${scenario.seriesRef.path}`, { signal });
  if (!res.ok || !res.body) throw new Error(`${scenario.seriesRef.path}: HTTP ${res.status}`);
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  return (await new Response(stream).json()) as Series;
}

/** Series of a published scenario, straight from its id (the file is named after it). */
export async function loadSeriesById(scenarioId: string, signal?: AbortSignal): Promise<Series> {
  const path = `series/${scenarioId}.json.gz`;
  const res = await fetch(`${DATA_BASE}/${path}`, { signal });
  if (!res.ok || !res.body) throw new Error(`${path}: HTTP ${res.status}`);
  return (await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).json()) as Series;
}

/** Horizon profiles exist only for terrain-aware scenarios. Returns null when there is none. */
export async function loadHorizon(scenario: Scenario, signal?: AbortSignal): Promise<HorizonProfile | null> {
  if (!scenario.profileId) return null;
  const parsed = parseScenarioId(scenario.scenarioId);
  if (!parsed) return null;
  const file = `horizons/${scenario.siteId}_h${parsed.heightM}m_${scenario.profileId}.json`;
  try {
    return await getJson<HorizonProfile>(file, signal);
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    return null;
  }
}

export interface Sample {
  tMs: number;
  sunAzDeg: number;
  sunElDeg: number;
  sunState: DiskState;
  sunRadiusDeg: number;
  earthAzDeg: number;
  earthElDeg: number;
  earthState: DiskState;
  earthRadiusDeg: number;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Display sample at a fractional index of the series. Angles are interpolated
 * for smooth motion only. States are taken from the nearest published step.
 */
export function sampleSeries(series: Series, index: number): Sample {
  const x = Math.min(series.n - 1, Math.max(0, index));
  const i = Math.min(series.n - 2, Math.floor(x));
  const t = x - i;
  const near = t < 0.5 ? i : i + 1;
  return {
    tMs: Date.parse(series.t0Utc) + x * series.stepS * 1000,
    sunAzDeg: lerpAngleDeg(series.sunAzDeg[i], series.sunAzDeg[i + 1], t),
    sunElDeg: mix(series.sunElDeg[i], series.sunElDeg[i + 1], t),
    sunState: series.sunState[near],
    sunRadiusDeg: series.sunAngularRadiusDeg[near],
    earthAzDeg: lerpAngleDeg(series.earthAzDeg[i], series.earthAzDeg[i + 1], t),
    earthElDeg: mix(series.earthElDeg[i], series.earthElDeg[i + 1], t),
    earthState: series.earthState[near],
    earthRadiusDeg: series.earthAngularRadiusDeg[near],
  };
}

/** Next published Sun event (any-disk convention) after a time, or null. */
export function nextSunEvent(scenario: Scenario, tMs: number): ScenarioEvent | null {
  let best: ScenarioEvent | null = null;
  let bestT = Infinity;
  for (const ev of scenario.events) {
    if (ev.body !== "sun" || ev.convention !== "anyDisk") continue;
    const t = Date.parse(ev.tUtc);
    if (t > tMs && t < bestT) {
      best = ev;
      bestT = t;
    }
  }
  return best;
}

export function metric(scenario: Scenario, id: string): number | null {
  return scenario.metrics.find((m) => m.metricId === id)?.value ?? null;
}

export interface Visibility {
  visible: boolean;
  /** Time of the next change: the set when visible, the rise when not. Null when the window publishes none. */
  changeMs: number | null;
}

/**
 * Is a body above the terrain at a time, and when does that change?
 * Read from the published exact windows, never from the display samples.
 */
export function visibilityAt(scenario: Scenario, key: WindowKey, tMs: number): Visibility {
  for (const w of scenario.windows[key] ?? []) {
    const start = Date.parse(w.startUtc);
    const end = Date.parse(w.endUtc);
    // A window cut by the end of the analysis stops 1 ms before the last display sample.
    if (tMs >= start && (tMs < end || (w.truncatedEnd && tMs <= end + 1000))) {
      return { visible: true, changeMs: w.truncatedEnd ? null : end };
    }
    if (start > tMs) return { visible: false, changeMs: start };
  }
  return { visible: false, changeMs: null };
}

/** Fractional index of the display series for a time, clamped to the series. */
export function indexAt(series: Series, tMs: number): number {
  const x = (tMs - Date.parse(series.t0Utc)) / (series.stepS * 1000);
  return Math.min(series.n - 1, Math.max(0, x));
}

// ---------- Compact index of published sweeps, comparisons and sensitivity grids ----------

export interface SweepEntry {
  dates: string[];
  validationStatus: string;
  values: Record<string, (number | null)[]>;
}

export interface ComparisonEntry {
  comparisonId: string;
  exploredCount: number;
  criteria: { metricId: string; direction: "max" | "min" }[];
  nonDominated: string[];
}

export interface SensitivityEntry {
  date: string;
  modelLevel: string;
  validationStatus: string;
  spacingKm: number;
  size: [number, number];
  limits: string[];
  ranges: { metricId: string; min: number | null; max: number | null; knownCount: number; totalCount: number }[];
  cells: { northKm: number; eastKm: number; sun: number | null; earth: number | null }[];
}

/** Built by scripts/build-derived.mjs. Values are copied from the dataset, never computed. */
export interface Derived {
  datasetVersion: string;
  metricIds: string[];
  sweeps: Record<string, SweepEntry>;
  comparisons: Record<string, ComparisonEntry>;
  sensitivity: Record<string, SensitivityEntry>;
}

export async function loadDerived(signal?: AbortSignal): Promise<Derived> {
  const res = await fetch("/derived/v1.json", { signal });
  if (!res.ok) throw new Error(`derived/v1.json: HTTP ${res.status}`);
  return (await res.json()) as Derived;
}

export function sweepFor(derived: Derived, site: Site, heightM: number, model = bestModel(site)): SweepEntry | null {
  return derived.sweeps[`${site.id}|${heightM}|${model}`] ?? null;
}

/** Published 30-day metric of a site for one start date. Null when the dataset has no value. */
export function sweepValue(derived: Derived, site: Site, heightM: number, date: string, metricId: string): number | null {
  const sweep = sweepFor(derived, site, heightM);
  const i = sweep ? sweep.dates.indexOf(date) : -1;
  return i < 0 ? null : (sweep!.values[metricId]?.[i] ?? null);
}
