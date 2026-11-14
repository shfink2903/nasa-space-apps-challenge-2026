/** The sky seen from the site, unrolled: x = azimuth, y = elevation, terrain silhouette, Sun and Earth paths. */
import { COLORS, FONT_MONO, FONT_SANS, fitCanvas } from "./theme";
import { niceRange } from "./elevationChart";

type State = 0 | 1 | 2 | null;

export interface PanoramaProps {
  profileDeg: (number | null)[] | null;
  sunAzDeg: number[];
  sunElDeg: number[];
  sunState: State[];
  earthAzDeg: number[];
  earthElDeg: number[];
  earthState: State[];
  cursorIndex: number | null;
  centerAzDeg?: number;
  compass: [string, string, string, string];
  labels: { sun: string; earth: string; horizon: string };
  formatDeg: (deg: number) => string;
}

export interface HorizonPanorama {
  el: HTMLElement;
  update(props: PanoramaProps): void;
  destroy(): void;
}

const mod = (a: number, m: number) => ((a % m) + m) % m;

/** Maps an azimuth to [-180, 180) degrees around the centre azimuth. */
export function wrapAzimuth(azDeg: number, centerAzDeg: number): number {
  return mod(azDeg - centerAzDeg + 180, 360) - 180;
}

/** Terrain horizon at an azimuth: linear interpolation, periodic. Null when data is missing. */
export function profileAt(profile: (number | null)[] | null | undefined, azDeg: number): number | null {
  if (!profile || profile.length === 0 || !Number.isFinite(azDeg)) return null;
  const n = profile.length;
  const pos = (mod(azDeg, 360) / 360) * n;
  const i0 = Math.floor(pos) % n;
  const i1 = (i0 + 1) % n;
  const a = profile[i0];
  const b = profile[i1];
  if (a == null || b == null) return null;
  const t = pos - Math.floor(pos);
  return a + (b - a) * t;
}

const PAD = { left: 34, right: 12, top: 10, bottom: 24 };
const fmtTick = (v: number): string => `${v < 0 ? "−" : ""}${Math.abs(v)}°`;

function lerpAz(a: number, b: number, t: number): number {
  const d = mod(b - a + 180, 360) - 180;
  return mod(a + d * t, 360);
}

export function createHorizonPanorama(): HorizonPanorama {
  const el = document.createElement("div");
  el.className = "chart chart-panorama";
  const canvas = document.createElement("canvas");
  el.append(canvas);
  const layer = document.createElement("canvas");

  let props: PanoramaProps | null = null;
  let dirty = true;
  let destroyed = false;
  let raf = 0;
  let geom = { left: 0, right: 0, top: 0, bottom: 0, lo: 0, hi: 1, center: 180 };

  const xOfAz = (az: number) => {
    const f = (wrapAzimuth(az, geom.center) + 180) / 360;
    return geom.left + f * (geom.right - geom.left);
  };
  const yOfEl = (e: number) => geom.bottom - ((e - geom.lo) / (geom.hi - geom.lo)) * (geom.bottom - geom.top);

  function bodyPaths(az: number[], elv: number[], st: State[], m: number) {
    const bright = new Path2D();
    const dim = new Path2D();
    for (let i = 0; i < m - 1; i++) {
      const a0 = wrapAzimuth(az[i], geom.center);
      const a1 = wrapAzimuth(az[i + 1], geom.center);
      if (Math.abs(a1 - a0) > 180) continue; // azimuth wrap: do not cross the chart
      const path = (st[i] ?? 0) > 0 ? bright : dim;
      path.moveTo(xOfAz(az[i]), yOfEl(elv[i]));
      path.lineTo(xOfAz(az[i + 1]), yOfEl(elv[i + 1]));
    }
    return { bright, dim };
  }

  function drawStatic(p: PanoramaProps, ctx: CanvasRenderingContext2D, w: number, h: number) {
    const center = p.centerAzDeg ?? 180;
    const left = PAD.left;
    const right = w - PAD.right;
    const top = PAD.top;
    const bottom = h - PAD.bottom;

    let pMin = Infinity;
    let pMax = -Infinity;
    if (p.profileDeg) {
      for (const v of p.profileDeg) {
        if (v == null) continue;
        if (v < pMin) pMin = v;
        if (v > pMax) pMax = v;
      }
    }
    let bMax = -Infinity;
    for (const v of p.sunElDeg) if (v > bMax) bMax = v;
    for (const v of p.earthElDeg) if (v > bMax) bMax = v;
    const lowest = Math.min(pMin, -3);
    const highest = Math.max(pMax, bMax, 6);
    const pad = Math.max(0.5, (highest - lowest) * 0.05);
    const range = niceRange(lowest - pad, highest + pad);
    geom = { left, right, top, bottom, lo: range.min, hi: range.max, center };

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#080b12";
    ctx.fillRect(left, top, right - left, bottom - top);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();

    // Terrain silhouette.
    const plotW = right - left;
    const y0 = yOfEl(0);
    ctx.fillStyle = "#1a1f2b";
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    if (!p.profileDeg) {
      ctx.fillRect(left, y0, plotW, bottom - y0);
      ctx.beginPath();
      ctx.moveTo(left, y0);
      ctx.lineTo(right, y0);
      ctx.stroke();
    } else {
      const cols = Math.max(2, Math.floor(plotW));
      let run: [number, number][] = [];
      const flush = () => {
        if (run.length > 1) {
          ctx.beginPath();
          ctx.moveTo(run[0][0], bottom);
          for (const [x, y] of run) ctx.lineTo(x, y);
          ctx.lineTo(run[run.length - 1][0], bottom);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          run.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        }
        run = [];
      };
      for (let c = 0; c <= cols; c++) {
        const x = left + (c / cols) * plotW;
        const az = center + (c / cols) * 360 - 180;
        const v = profileAt(p.profileDeg, az);
        if (v == null) flush();
        else run.push([x, yOfEl(v)]);
      }
      flush();
    }

    // Grid (elevation) and horizon line.
    ctx.font = `11px ${FONT_MONO}`;
    for (let v = range.min; v <= range.max + 1e-9; v += range.step) {
      const val = Math.round(v * 1e6) / 1e6;
      const y = Math.round(yOfEl(val)) + 0.5;
      ctx.strokeStyle = val === 0 ? "rgba(255,255,255,0.28)" : COLORS.line;
      ctx.setLineDash(val === 0 ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Azimuth grid every 30 degrees.
    for (let az = 0; az < 360; az += 30) {
      const x = Math.round(xOfAz(az)) + 0.5;
      ctx.strokeStyle = az % 90 === 0 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }

    // Sun and Earth paths.
    const series: [number[], number[], State[], string][] = [
      [p.earthAzDeg, p.earthElDeg, p.earthState, COLORS.earth],
      [p.sunAzDeg, p.sunElDeg, p.sunState, COLORS.sun],
    ];
    ctx.lineJoin = "round";
    for (const [az, elv, st, color] of series) {
      const m = Math.min(az.length, elv.length);
      if (m < 2) continue;
      const { bright, dim } = bodyPaths(az, elv, st, m);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.globalAlpha = 0.3;
      ctx.stroke(dim);
      ctx.globalAlpha = 0.95;
      ctx.stroke(bright);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Frame, y labels.
    ctx.strokeStyle = COLORS.line;
    ctx.strokeRect(left + 0.5, top + 0.5, plotW - 1, bottom - top - 1);
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    for (let v = range.min; v <= range.max + 1e-9; v += range.step) {
      const val = Math.round(v * 1e6) / 1e6;
      const y = yOfEl(val);
      if (y < top + 4 || y > bottom - 4) continue;
      ctx.fillStyle = val === 0 ? COLORS.ink : COLORS.faint;
      ctx.fillText(fmtTick(val), left - 6, y);
    }
    // Horizon label.
    ctx.font = `11px ${FONT_SANS}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = COLORS.muted;
    if (y0 > top + 4 && y0 < bottom - 14) ctx.fillText(p.labels.horizon, left + 6, y0 + 3);

    // Compass letters and ticks on the x axis.
    ctx.textBaseline = "top";
    for (let az = 0; az < 360; az += 30) {
      const x = xOfAz(az);
      const idx = az / 90;
      const isCard = az % 90 === 0;
      ctx.strokeStyle = isCard ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.14)";
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, bottom);
      ctx.lineTo(Math.round(x) + 0.5, bottom + (isCard ? 5 : 3));
      ctx.stroke();
      if (!isCard) continue;
      const letter = p.compass[idx];
      ctx.fillStyle = COLORS.ink;
      ctx.font = `600 11px ${FONT_SANS}`;
      // A letter that sits on a seam is drawn at both edges.
      const edge = x - left < 1 || right - x < 1;
      if (edge) {
        ctx.textAlign = "left";
        ctx.fillText(letter, left, bottom + 8);
        ctx.textAlign = "right";
        ctx.fillText(letter, right, bottom + 8);
      } else {
        ctx.textAlign = "center";
        ctx.fillText(letter, x, bottom + 8);
      }
    }
  }

  function drawMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    visible: boolean,
    radius: number,
    glow: boolean,
  ) {
    if (glow && visible) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.4);
      g.addColorStop(0, "rgba(255,186,96,0.55)");
      g.addColorStop(1, "rgba(255,186,96,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - radius * 3.4, y - radius * 3.4, radius * 6.8, radius * 6.8);
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (visible) {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(6,8,13,0.85)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(6,8,13,0.6)";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawCursor(p: PanoramaProps, ctx: CanvasRenderingContext2D, w: number) {
    if (p.cursorIndex == null || !Number.isFinite(p.cursorIndex)) return;
    const bodies = [
      { az: p.sunAzDeg, el: p.sunElDeg, st: p.sunState, color: COLORS.sun, label: p.labels.sun, r: 5.5, glow: true },
      { az: p.earthAzDeg, el: p.earthElDeg, st: p.earthState, color: COLORS.earth, label: p.labels.earth, r: 4.5, glow: false },
    ].flatMap((b) => {
      const m = Math.min(b.az.length, b.el.length);
      if (m < 1) return [];
      const x = Math.min(m - 1, Math.max(0, p.cursorIndex!));
      const i = Math.min(m - 1, Math.floor(x));
      const j = Math.min(m - 1, i + 1);
      const t = x - i;
      const az = lerpAz(b.az[i], b.az[j], t);
      const elv = b.el[i] + (b.el[j] - b.el[i]) * t;
      const near = t < 0.5 ? i : j;
      return [{ ...b, ax: xOfAz(az), ay: yOfEl(elv), elv, visible: (b.st[near] ?? 0) > 0 }];
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(geom.left, geom.top, geom.right - geom.left, geom.bottom - geom.top);
    ctx.clip();
    for (const b of bodies) drawMarker(ctx, b.ax, b.ay, b.color, b.visible, b.r, b.glow);
    ctx.restore();

    // Labels next to the markers. Two close markers get labels above and below.
    ctx.font = `11px ${FONT_SANS}`;
    ctx.textBaseline = "middle";
    const close =
      bodies.length === 2 && Math.abs(bodies[0].ax - bodies[1].ax) < 90 && Math.abs(bodies[0].ay - bodies[1].ay) < 16;
    const upper = close ? (bodies[0].ay <= bodies[1].ay ? bodies[0] : bodies[1]) : null;
    for (const b of bodies) {
      const text = `${b.label} ${p.formatDeg(b.elv)}`;
      const tw = ctx.measureText(text).width;
      const flip = b.ax + 11 + tw > w - 2;
      let ly = b.ay;
      let lx = flip ? b.ax - 11 : b.ax + 11;
      let align: CanvasTextAlign = flip ? "right" : "left";
      if (close) {
        ly = b === upper ? b.ay - 12 : b.ay + 12;
        lx = b.ax;
        align = "center";
        if (lx - tw / 2 < 2) align = "left";
        if (lx + tw / 2 > w - 2) align = "right";
      }
      ly = Math.min(geom.bottom - 7, Math.max(geom.top + 7, ly));
      ctx.textAlign = align;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(8,11,18,0.85)";
      ctx.strokeText(text, lx, ly);
      ctx.fillStyle = b.color;
      ctx.fillText(text, lx, ly);
    }
  }

  function draw() {
    raf = 0;
    if (destroyed || !props) return;
    const p = props;
    const { ctx, width: w, height: h } = fitCanvas(canvas);
    const ratio = canvas.width / w;
    if (layer.width !== canvas.width || layer.height !== canvas.height) {
      layer.width = canvas.width;
      layer.height = canvas.height;
      dirty = true;
    }
    if (dirty) {
      const lctx = layer.getContext("2d")!;
      lctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawStatic(p, lctx, w, h);
      dirty = false;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    drawCursor(p, ctx, w);
  }

  const schedule = () => {
    if (!raf && !destroyed) raf = requestAnimationFrame(draw);
  };
  const ro = new ResizeObserver(() => {
    dirty = true;
    schedule();
  });
  ro.observe(el);
  void document.fonts?.ready.then(() => {
    dirty = true;
    schedule();
  });

  function sameStatic(a: PanoramaProps, b: PanoramaProps): boolean {
    return (
      a.profileDeg === b.profileDeg &&
      a.sunAzDeg === b.sunAzDeg &&
      a.sunElDeg === b.sunElDeg &&
      a.sunState === b.sunState &&
      a.earthAzDeg === b.earthAzDeg &&
      a.earthElDeg === b.earthElDeg &&
      a.earthState === b.earthState &&
      (a.centerAzDeg ?? 180) === (b.centerAzDeg ?? 180) &&
      a.compass.join("|") === b.compass.join("|") &&
      a.labels.horizon === b.labels.horizon
    );
  }

  return {
    el,
    update(next) {
      if (!props || !sameStatic(props, next)) dirty = true;
      props = next;
      schedule();
    },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      el.remove();
    },
  };
}
