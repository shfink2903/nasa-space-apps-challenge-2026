import type { HorizonProfile, Sample, Series } from "../data/dataset";
import { T } from "./strings";

const PAD = { left: 26, right: 6, top: 6, bottom: 16 };
const LOW_DEG = -10;
const SUN = "255,186,96";
const EARTH = "157,188,255";

/** Keep every source bin: even a narrow missing sector must break the polygon. */
export function terrainSegments(profile: HorizonProfile, centerAz: number): { fraction: number; elevation: number }[][] {
  const n = profile.horizonElevationDeg.length;
  if (!n) return [];
  const start = Math.round(((centerAz + 180) % 360) / profile.azimuthStepDeg) % n;
  const segments: { fraction: number; elevation: number }[][] = [];
  let segment: { fraction: number; elevation: number }[] = [];
  for (let k = 0; k <= n; k++) {
    const elevation = profile.horizonElevationDeg[(start + k) % n];
    if (elevation === null || !Number.isFinite(elevation)) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ fraction: k / n, elevation });
  }
  if (segment.length) segments.push(segment);
  return segments;
}

export interface SkyChart {
  el: HTMLCanvasElement;
  /** New 30-day paths and terrain. `southern` puts north in the middle, where the Earth is seen from the south. */
  setData(series: Series | null, horizon: HorizonProfile | null, southern: boolean): void;
  setNow(sample: Sample | null): void;
}

/**
 * Flat map of the sky seen from the site: direction left to right, height
 * bottom to top. It draws published values only: the two 30-day paths, the
 * terrain horizon when the dataset has one, and the two bodies now.
 */
export function createSkyChart(): SkyChart {
  const el = document.createElement("canvas");
  el.className = "sky-chart";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", T.skyTitle);
  const still = document.createElement("canvas");
  let series: Series | null = null;
  let horizon: HorizonProfile | null = null;
  let centerAz = 180;
  let high = 15;
  let now: Sample | null = null;
  let w = 0;
  let hgt = 0;
  let ratio = 1;

  const px = (az: number): number => PAD.left + ((((az - centerAz + 540) % 360) + 360) % 360) / 360 * (w - PAD.left - PAD.right);
  const py = (el_: number): number => PAD.top + (1 - (Math.max(LOW_DEG, Math.min(high, el_)) - LOW_DEG) / (high - LOW_DEG)) * (hgt - PAD.top - PAD.bottom);

  function drawStill(): void {
    still.width = el.width;
    still.height = el.height;
    const ctx = still.getContext("2d")!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    const x0 = PAD.left;
    const x1 = w - PAD.right;
    const yBottom = hgt - PAD.bottom;

    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.fillRect(x0, PAD.top, x1 - x0, yBottom - PAD.top);

    // Height lines and their labels.
    const step = high <= 20 ? 5 : high <= 45 ? 15 : 30;
    ctx.font = "9px ui-monospace, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let d = 0; d <= high; d += step) {
      ctx.fillStyle = d === 0 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(x0, Math.round(py(d)), x1 - x0, 1);
      ctx.fillStyle = "rgba(139,147,166,0.9)";
      ctx.fillText(`${d}°`, x0 - 5, py(d));
    }

    // Terrain: everything under the published horizon profile hides the sky.
    if (horizon) {
      for (const segment of terrainSegments(horizon, centerAz)) {
        const x = (fraction: number): number => x0 + fraction * (x1 - x0);
        ctx.beginPath();
        ctx.moveTo(x(segment[0].fraction), yBottom);
        for (const point of segment) ctx.lineTo(x(point.fraction), py(point.elevation));
        ctx.lineTo(x(segment[segment.length - 1].fraction), yBottom);
        ctx.closePath();
        ctx.fillStyle = "rgba(160,168,186,0.3)";
        ctx.fill();
        ctx.strokeStyle = "rgba(210,216,230,0.65)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "rgba(160,168,186,0.14)";
      ctx.fillRect(x0, py(0), x1 - x0, yBottom - py(0));
    }

    // 30-day paths, one dot per published step.
    if (series) {
      for (const [az, elev, rgb] of [
        [series.sunAzDeg, series.sunElDeg, SUN],
        [series.earthAzDeg, series.earthElDeg, EARTH],
      ] as const) {
        ctx.fillStyle = `rgba(${rgb},0.5)`;
        for (let i = 0; i < series.n; i += 2) {
          if (elev[i] < LOW_DEG || elev[i] > high) continue;
          ctx.fillRect(px(az[i]) - 0.6, py(elev[i]) - 0.6, 1.2, 1.2);
        }
      }
    }

    // Directions.
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(139,147,166,0.9)";
    for (const [az, label] of [[0, T.north], [90, T.east], [180, T.south], [270, T.west]] as const) {
      const x = px(az);
      if (x > x0 + 4 && x < x1 - 4) ctx.fillText(label, x, hgt - 4);
    }
    // The direction on both edges is the one opposite the centre.
    const edge = centerAz === 0 ? T.south : T.north;
    ctx.fillText(edge, x0 + 4, hgt - 4);
    ctx.fillText(edge, x1 - 4, hgt - 4);
  }

  function draw(): void {
    const ctx = el.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    if (still.width > 0) ctx.drawImage(still, 0, 0);
    if (!now) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    for (const [az, elev, rgb, visible] of [
      [now.sunAzDeg, now.sunElDeg, SUN, now.sunState !== 0 && now.sunState !== null],
      [now.earthAzDeg, now.earthElDeg, EARTH, now.earthState !== 0 && now.earthState !== null],
    ] as const) {
      const x = px(az);
      const y = py(elev);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb},${visible ? 1 : 0.25})`;
      ctx.shadowColor = `rgba(${rgb},${visible ? 0.9 : 0})`;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(4,6,10,0.85)";
      ctx.stroke();
    }
  }

  function resize(): void {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    w = el.clientWidth;
    hgt = el.clientHeight;
    if (w === 0 || hgt === 0) return;
    el.width = Math.round(w * ratio);
    el.height = Math.round(hgt * ratio);
    drawStill();
    draw();
  }
  new ResizeObserver(resize).observe(el);

  return {
    el,
    setData(nextSeries, nextHorizon, southern) {
      series = nextSeries;
      horizon = nextHorizon;
      centerAz = southern ? 0 : 180;
      let top = 0;
      if (series) for (let i = 0; i < series.n; i += 6) top = Math.max(top, series.sunElDeg[i], series.earthElDeg[i]);
      if (horizon) for (const v of horizon.horizonElevationDeg) if (v !== null && v > top) top = v;
      high = Math.min(90, Math.max(15, Math.ceil((top + 3) / 5) * 5));
      if (w > 0) {
        drawStill();
        draw();
      }
    },
    setNow(sample) {
      now = sample;
      if (w > 0) draw();
    },
  };
}
