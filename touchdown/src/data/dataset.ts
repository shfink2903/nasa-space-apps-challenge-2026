/**
 * Read-only access to the frozen dataset (data/processed/v1), served at /data/v1.
 * The UI shows these values. It never recomputes windows, durations or verdicts.
 */
import { lerpAngleDeg } from "./astro";

export const DATA_BASE = "/data/v1";

export type SiteStatus = "historical" | "study_point";
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
  scenarioIds: string[];
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

export interface Scenario {
  scenarioId: string;
  siteId: string;
  modelLevel: string;
  profileId: string | null;
  events: ScenarioEvent[];
  metrics: Metric[];
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
 * Picks the published scenario for a site and a start date, at 2 m observer height.
 * The terrain-aware model ("lola") is used when the dataset has it, else "geometric".
 */
export function pickScenarioId(site: Site, date: string, heightM = 2): string | null {
  let geometric: string | null = null;
  for (const id of site.scenarioIds) {
    const key = parseScenarioId(id);
    if (!key || key.date !== date || key.heightM !== heightM) continue;
    if (key.model === "lola") return id;
    geometric = id;
  }
  return geometric;
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

/** Opaque suffix keeps static hosts from automatically decoding the gzip bytes. */
export async function loadSeries(scenario: Scenario, signal?: AbortSignal): Promise<Series> {
  const res = await fetch(`${DATA_BASE}/${scenario.seriesRef.path}.bin`, { signal });
  if (!res.ok || !res.body) throw new Error(`${scenario.seriesRef.path}: HTTP ${res.status}`);
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  return (await new Response(stream).json()) as Series;
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
