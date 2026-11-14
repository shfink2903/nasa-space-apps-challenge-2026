/**
 * Free point: Sun and Earth seen from any lunar coordinates, by pure geometry.
 *
 * The dataset publishes, for a reference site, the direction and the angular
 * radius of the Sun and of the Earth every 600 s. A direction plus a distance
 * is a position in the Moon-fixed frame. The same position seen from another
 * point of the sphere gives the azimuth and elevation there. Nothing else is
 * assumed: no ephemeris, no orbit model, no terrain.
 *
 * Model level: geometric (smooth sphere of 1737.4 km, observer `heightM`
 * above it). Terrain is ignored, so near the poles the real windows can be
 * very different. tests/custom.test.ts measures the difference with the
 * geometric scenarios published by DATA for known sites.
 */
import { add, DEG, dot, enuBasis, length, MOON_RADIUS_KM, scale, azElToMoonFixed, type Vec3 } from "./astro";
import type { DiskState, Metric, Scenario, Series, Site, VisibilityWindow, WindowKey } from "./dataset";

const SUN_RADIUS_KM = 695_700;
const EARTH_RADIUS_KM = 6_378.137;
export const CUSTOM_ID = "custom";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Position of a body in the Moon-fixed frame (km), from what a site sees. */
function bodyPosition(site: Site, heightM: number, azDeg: number, elDeg: number, angularRadiusDeg: number, bodyRadiusKm: number): Vec3 {
  const observer = scale(enuBasis(site.latDeg, site.lonDeg).up, MOON_RADIUS_KM + heightM / 1000);
  const distance = bodyRadiusKm / Math.sin(angularRadiusDeg * DEG);
  return add(observer, scale(azElToMoonFixed(azDeg, elDeg, site.latDeg, site.lonDeg), distance));
}

/**
 * Horizon at 0° exactly, as in the geometric scenarios of the dataset (measured
 * on its series: every rise and set happens where a limb crosses 0°). The small
 * dip of the horizon seen from 2 m or 10 m is therefore not applied.
 */
const stateOf = (elDeg: number, radiusDeg: number): DiskState => (elDeg - radiusDeg > 0 ? 2 : elDeg + radiusDeg > 0 ? 1 : 0);

/** Display series at a free point, rebuilt from the series of a reference site. */
export function customSeries(reference: Site, ref: Series, latDeg: number, lonDeg: number, heightM: number): Series {
  const basis = enuBasis(latDeg, lonDeg);
  const observer = scale(basis.up, MOON_RADIUS_KM + heightM / 1000);
  const out: Series = {
    t0Utc: ref.t0Utc,
    stepS: ref.stepS,
    n: ref.n,
    sunAzDeg: new Array<number>(ref.n),
    sunElDeg: new Array<number>(ref.n),
    sunState: new Array<DiskState>(ref.n),
    sunAngularRadiusDeg: new Array<number>(ref.n),
    earthAzDeg: new Array<number>(ref.n),
    earthElDeg: new Array<number>(ref.n),
    earthState: new Array<DiskState>(ref.n),
    earthAngularRadiusDeg: new Array<number>(ref.n),
  };
  const see = (position: Vec3, bodyRadiusKm: number): [number, number, number] => {
    const v = sub(position, observer);
    const d = length(v);
    const az = (Math.atan2(dot(v, basis.east), dot(v, basis.north)) / DEG + 360) % 360;
    return [az, Math.asin(dot(v, basis.up) / d) / DEG, Math.asin(bodyRadiusKm / d) / DEG];
  };
  for (let i = 0; i < ref.n; i++) {
    const sun = see(bodyPosition(reference, heightM, ref.sunAzDeg[i], ref.sunElDeg[i], ref.sunAngularRadiusDeg[i], SUN_RADIUS_KM), SUN_RADIUS_KM);
    const earth = see(bodyPosition(reference, heightM, ref.earthAzDeg[i], ref.earthElDeg[i], ref.earthAngularRadiusDeg[i], EARTH_RADIUS_KM), EARTH_RADIUS_KM);
    [out.sunAzDeg[i], out.sunElDeg[i], out.sunAngularRadiusDeg[i]] = sun;
    [out.earthAzDeg[i], out.earthElDeg[i], out.earthAngularRadiusDeg[i]] = earth;
    out.sunState[i] = stateOf(sun[1], sun[2]);
    out.earthState[i] = stateOf(earth[1], earth[2]);
  }
  return out;
}

/**
 * Visibility windows from the display samples. `edge` is +1 for "any part of the
 * disc" (upper limb) and -1 for "whole disc" (lower limb). The crossing time is
 * placed between two samples by a straight line: good to a few minutes, far
 * coarser than the 1 s events of the dataset.
 */
function windowsOf(series: Series, elDeg: number[], radiusDeg: number[], edge: 1 | -1): VisibilityWindow[] {
  const t0 = Date.parse(series.t0Utc);
  const stepMs = series.stepS * 1000;
  const clearance = (i: number): number => elDeg[i] + edge * radiusDeg[i];
  const iso = (x: number): string => new Date(t0 + x * stepMs).toISOString();
  const cross = (i: number): number => {
    const a = clearance(i);
    const b = clearance(i + 1);
    return i + (a === b ? 0.5 : a / (a - b));
  };
  const out: VisibilityWindow[] = [];
  let start: number | null = clearance(0) > 0 ? 0 : null;
  let truncatedStart = start !== null;
  for (let i = 0; i < series.n - 1; i++) {
    const up = clearance(i) > 0;
    const nextUp = clearance(i + 1) > 0;
    if (!up && nextUp) {
      start = cross(i);
      truncatedStart = false;
    } else if (up && !nextUp && start !== null) {
      out.push({ startUtc: iso(start), endUtc: iso(cross(i)), truncatedStart, truncatedEnd: false });
      start = null;
    }
  }
  if (start !== null) out.push({ startUtc: iso(start), endUtc: iso(series.n - 1), truncatedStart, truncatedEnd: true });
  return out;
}

const spanH = (w: VisibilityWindow): number => (Date.parse(w.endUtc) - Date.parse(w.startUtc)) / 3_600_000;

/** Longest stretch without the body, inside the analysed period (its two ends included). */
function longestGapH(windows: VisibilityWindow[], t0: number, t1: number): number {
  let gap = 0;
  let cursor = t0;
  for (const w of windows) {
    gap = Math.max(gap, (Date.parse(w.startUtc) - cursor) / 3_600_000);
    cursor = Date.parse(w.endUtc);
  }
  return Math.max(gap, (t1 - cursor) / 3_600_000);
}

function overlapH(a: VisibilityWindow[], b: VisibilityWindow[]): number {
  let total = 0;
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(Date.parse(x.startUtc), Date.parse(y.startUtc));
      const end = Math.min(Date.parse(x.endUtc), Date.parse(y.endUtc));
      if (end > start) total += (end - start) / 3_600_000;
    }
  }
  return total;
}

/** The limits shown with every free point. Written here, not taken from the dataset. */
export const CUSTOM_LIMITS = [
  "Free point: computed in the browser by geometry from the Sun and Earth positions of dataset v1 (reference site series, 600 s step).",
  "Smooth sphere of 1737.4 km: terrain is ignored. Near the poles the real windows can be very different.",
  "Windows come from 600 s samples with a straight-line crossing: accurate to a few minutes, not to the second.",
  "Not validated as a mission result. Visibility does not establish lighting power, a radio link or landing safety.",
];

/** 30-day metrics of a free point, with the metric ids of the dataset. */
export function customMetrics(series: Series): { windows: Record<WindowKey, VisibilityWindow[]>; values: Record<string, number | null> } {
  const windows: Record<WindowKey, VisibilityWindow[]> = {
    "sun.anyDisk": windowsOf(series, series.sunElDeg, series.sunAngularRadiusDeg, 1),
    "sun.fullDisk": windowsOf(series, series.sunElDeg, series.sunAngularRadiusDeg, -1),
    "earth.anyDisk": windowsOf(series, series.earthElDeg, series.earthAngularRadiusDeg, 1),
    "earth.fullDisk": windowsOf(series, series.earthElDeg, series.earthAngularRadiusDeg, -1),
  };
  const t0 = Date.parse(series.t0Utc);
  const t1 = t0 + (series.n - 1) * series.stepS * 1000;
  const totalH = (t1 - t0) / 3_600_000;
  const share = (key: WindowKey): number => windows[key].reduce((sum, w) => sum + spanH(w), 0) / totalH;
  const max = (values: number[]): number => values.reduce((m, v) => Math.max(m, v), -Infinity);
  let lit = 0;
  let litSum = 0;
  for (let i = 0; i < series.n; i++) {
    if (series.sunState[i]) {
      lit++;
      litSum += series.sunElDeg[i];
    }
  }
  return {
    windows,
    values: {
      "sun.anyDisk.fraction": share("sun.anyDisk"),
      "sun.fullDisk.fraction": share("sun.fullDisk"),
      "earth.anyDisk.fraction": share("earth.anyDisk"),
      "earth.fullDisk.fraction": share("earth.fullDisk"),
      "overlap.sunAny_earthAny.fraction": overlapH(windows["sun.anyDisk"], windows["earth.anyDisk"]) / totalH,
      "sun.anyDisk.longestGapH": longestGapH(windows["sun.anyDisk"], t0, t1),
      "earth.anyDisk.longestGapH": longestGapH(windows["earth.anyDisk"], t0, t1),
      "sun.maxElevDeg": max(series.sunElDeg),
      "earth.maxElevDeg": max(series.earthElDeg),
      "sun.meanElevWhenAnyDiskDeg": lit > 0 ? litSum / lit : null,
    },
  };
}

/** A scenario object with the shape of the dataset files, so every panel can show a free point. */
export function customScenario(series: Series, date: string, heightM: number): Scenario {
  const { windows, values } = customMetrics(series);
  const metrics: Metric[] = Object.entries(values).map(([metricId, value]) => ({
    metricId,
    value,
    unit: metricId.endsWith("H") ? "h" : metricId.endsWith("Deg") ? "deg" : "1",
    quality: "sampled",
  }));
  return {
    scenarioId: `${CUSTOM_ID}_${date}_30d_h${heightM}m_geometric_0b5e7fed`,
    siteId: CUSTOM_ID,
    modelLevel: "geometric (browser)",
    validationStatus: "not_validated",
    coverageStatus: "covered",
    profileId: null,
    events: [],
    windows,
    metrics,
    limits: CUSTOM_LIMITS,
    seriesRef: { path: "", encoding: "none" },
  };
}

/** A free point as a catalogue entry. Longitude is brought back to ]-180, 180]. */
export function customSite(latDeg: number, lonDeg: number): Site {
  const lat = Math.min(89.9, Math.max(-89.9, latDeg));
  let lon = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  if (lon === -180) lon = 180;
  return {
    id: CUSTOM_ID,
    name: "",
    mission: null,
    status: "custom",
    latDeg: lat,
    lonDeg: lon,
    terrainProduct: null,
    verification: "custom",
    scenarioIds: [],
  };
}
