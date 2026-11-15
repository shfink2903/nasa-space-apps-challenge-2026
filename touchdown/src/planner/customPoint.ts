/**
 * Quick look at any coordinates, in the browser, without terrain.
 *
 * The Sun and the Earth are at the same place in the Moon-fixed frame whatever the
 * site. A published series gives, for one site, their azimuth, elevation and distance
 * every 600 s. From it we rebuild their Moon-fixed positions, then look at them from
 * another point. This is the dataset's own geometric model (N0): a smooth sphere of
 * 1737.4 km, observer at the mast height, horizon at 0° elevation, disc radius from the
 * distance. Relief is ignored, so near the south pole hills can hide what is shown as
 * visible. Shares and gaps come from the 600 s samples: estimates, not exact events.
 */
import { add, azElToMoonFixed, dot, enuBasis, latLonToUnit, length, MOON_RADIUS_KM, scale, type Vec3 } from "../data/astro";
import type { DiskState, Series } from "../data/dataset";

/** Radii used by the dataset (lunar_data/geometry.py). */
const R_SUN_KM = 695700.0;
const R_EARTH_KM = 6378.137;

export interface LatLon {
  latDeg: number;
  lonDeg: number;
}

/** Reference series: the published columns the projection needs. */
export type RefSeries = Pick<
  Series,
  "t0Utc" | "stepS" | "n" | "sunAzDeg" | "sunElDeg" | "earthAzDeg" | "earthElDeg"
> & {
  sunDistanceKm: number[];
  earthDistanceKm: number[];
};

export interface BodyTrack {
  azDeg: number[];
  elDeg: number[];
  angularRadiusDeg: number[];
  state: DiskState[];
}

export interface ProjectedSeries {
  t0Utc: string;
  stepS: number;
  n: number;
  sun: BodyTrack;
  earth: BodyTrack;
}

/** Why a coordinate is refused, or null when it can be used. */
export function checkCoordinates(latDeg: number, lonDeg: number): "lat" | "lon" | "pole" | null {
  if (!Number.isFinite(latDeg) || latDeg < -90 || latDeg > 90) return "lat";
  if (!Number.isFinite(lonDeg) || lonDeg < -180 || lonDeg > 360) return "lon";
  // On the polar axis north and east are undefined, like in the dataset.
  if (Math.abs(latDeg) > 89.999) return "pole";
  return null;
}

const observer = (p: LatLon, heightM: number): Vec3 => scale(latLonToUnit(p.latDeg, p.lonDeg), MOON_RADIUS_KM + heightM / 1000);

/** Same rule as lunar_data/geometry.py disk_state, with the N0 horizon at 0°. */
export function diskState(elDeg: number, radiusDeg: number, horizonDeg = 0): DiskState {
  if (!Number.isFinite(elDeg) || !Number.isFinite(radiusDeg)) return null;
  if (elDeg - radiusDeg > horizonDeg) return 2;
  return elDeg + radiusDeg > horizonDeg ? 1 : 0;
}

function track(
  azRef: number[],
  elRef: number[],
  distRef: number[],
  radiusKm: number,
  from: Vec3,
  refSite: LatLon,
  target: LatLon,
  to: Vec3,
): BodyTrack {
  const basis = enuBasis(target.latDeg, target.lonDeg);
  const out: BodyTrack = { azDeg: [], elDeg: [], angularRadiusDeg: [], state: [] };
  for (let i = 0; i < azRef.length; i++) {
    // Moon-fixed position of the body, rebuilt from the reference site.
    const dir = azElToMoonFixed(azRef[i], elRef[i], refSite.latDeg, refSite.lonDeg);
    const body = add(from, scale(dir, distRef[i]));
    // Seen from the target.
    const v: Vec3 = [body[0] - to[0], body[1] - to[1], body[2] - to[2]];
    const d = length(v);
    const e = dot(v, basis.east);
    const n = dot(v, basis.north);
    const u = dot(v, basis.up);
    const az = ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
    const el = (Math.asin(Math.max(-1, Math.min(1, u / d))) * 180) / Math.PI;
    const radius = (Math.asin(Math.min(1, radiusKm / d)) * 180) / Math.PI;
    out.azDeg.push(az);
    out.elDeg.push(el);
    out.angularRadiusDeg.push(radius);
    out.state.push(diskState(el, radius));
  }
  return out;
}

/** Sun and Earth seen from `target`, from a published series at `refSite`. Both at the same mast height. */
export function projectSeries(ref: RefSeries, refSite: LatLon, target: LatLon, heightM: number): ProjectedSeries {
  const from = observer(refSite, heightM);
  const to = observer(target, heightM);
  return {
    t0Utc: ref.t0Utc,
    stepS: ref.stepS,
    n: ref.n,
    sun: track(ref.sunAzDeg, ref.sunElDeg, ref.sunDistanceKm, R_SUN_KM, from, refSite, target, to),
    earth: track(ref.earthAzDeg, ref.earthElDeg, ref.earthDistanceKm, R_EARTH_KM, from, refSite, target, to),
  };
}

export interface SampledWindow {
  startUtc: string;
  endUtc: string;
}

/** Runs of "visible" samples as windows. Edges sit half a step from the samples: about ±5 min. */
export function windowsFromSamples(visible: boolean[], t0Ms: number, stepS: number): SampledWindow[] {
  const out: SampledWindow[] = [];
  const stepMs = stepS * 1000;
  const endMs = t0Ms + (visible.length - 1) * stepMs;
  const at = (ms: number) => new Date(Math.min(endMs, Math.max(t0Ms, ms))).toISOString();
  let start = -1;
  for (let i = 0; i <= visible.length; i++) {
    const on = i < visible.length && visible[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push({ startUtc: at(t0Ms + (start - 0.5) * stepMs), endUtc: at(t0Ms + (i - 0.5) * stepMs) });
      start = -1;
    }
  }
  return out;
}

/** Longest run of "not visible" samples, in hours, and whether it touches an edge of the period. */
export function longestGap(visible: boolean[], stepS: number): { hours: number; cut: boolean } {
  let best = 0;
  let bestCut = false;
  let run = 0;
  let runStart = 0;
  for (let i = 0; i <= visible.length; i++) {
    if (i < visible.length && !visible[i]) {
      if (run === 0) runStart = i;
      run++;
    } else if (run > 0) {
      const cut = runStart === 0 || i === visible.length;
      if (run > best) {
        best = run;
        bestCut = cut;
      }
      run = 0;
    }
  }
  return { hours: (best * stepS) / 3600, cut: bestCut };
}

export interface PointSummary {
  sunShare: number;
  sunFullShare: number;
  earthShare: number;
  bothShare: number;
  sunGapH: number;
  sunGapAtLeast: boolean;
  earthGapH: number;
  earthGapAtLeast: boolean;
  sunMaxElDeg: number;
  /** Mean Sun elevation while any part of the disc is above the horizon. Null when never. */
  sunMeanElDeg: number | null;
}

/** 30-day figures from the samples. */
export function summarize(p: ProjectedSeries): PointSummary {
  const sunOn = p.sun.state.map((s) => (s ?? 0) > 0);
  const earthOn = p.earth.state.map((s) => (s ?? 0) > 0);
  const n = p.n || 1;
  const count = (xs: boolean[]) => xs.filter(Boolean).length;
  const sunGap = longestGap(sunOn, p.stepS);
  const earthGap = longestGap(earthOn, p.stepS);
  const litEl = p.sun.elDeg.filter((_, i) => sunOn[i]);
  return {
    sunShare: count(sunOn) / n,
    sunFullShare: p.sun.state.filter((s) => s === 2).length / n,
    earthShare: count(earthOn) / n,
    bothShare: sunOn.filter((on, i) => on && earthOn[i]).length / n,
    sunGapH: sunGap.hours,
    sunGapAtLeast: sunGap.cut,
    earthGapH: earthGap.hours,
    earthGapAtLeast: earthGap.cut,
    sunMaxElDeg: Math.max(...p.sun.elDeg),
    sunMeanElDeg: litEl.length ? litEl.reduce((a, b) => a + b, 0) / litEl.length : null,
  };
}
