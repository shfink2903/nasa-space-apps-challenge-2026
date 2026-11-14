/** Elevation of the Sun and the Earth over the 30 days, one line per track. Canvas, no dependency. */
import { COLORS, FONT_MONO, fitCanvas } from "./theme";

export interface ElevationTrack {
  id: string;
  label: string;
  color: string;
  elevationDeg: number[];
  state?: (0 | 1 | 2 | null)[];
  horizonDeg?: (number | null)[];
  dashed?: boolean;
}

export interface ElevationChartProps {
  t0Ms: number;
  stepS: number;
  n: number;
  tracks: ElevationTrack[];
  cursorIndex: number | null;
  dayLabel: (day: number) => string;
  formatDeg: (deg: number) => string;
  onScrub?: (index: number) => void;
}

export interface ElevationChart {
  el: HTMLElement;
  update(props: ElevationChartProps): void;
  destroy(): void;
}

const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 45, 90];

/** Rounds [min, max] outward to a tick step among 0.5, 1, 2, 5, 10, 15, 30, 45, 90 degrees (at most 6 intervals). */
export function niceRange(min: number, max: number): { min: number; max: number; step: number } {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 0;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  let step = STEPS.find((s) => span / s <= 6);
  if (step === undefined) step = Math.ceil(span / 6 / 90) * 90;
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return { min: r(Math.floor(lo / step + 1e-9) * step), max: r(Math.ceil(hi / step - 1e-9) * step), step };
}

const PAD = { left: 34, right: 12, top: 10, bottom: 22 };
const DAY_S = 86400;

const fmtTick = (v: number): string => `${v < 0 ? "−" : ""}${Math.abs(v)}°`;

function valueAt(values: number[], x: number): number {
  const i = Math.min(values.length - 1, Math.max(0, Math.floor(x)));
  const j = Math.min(values.length - 1, i + 1);
  return values[i] + (values[j] - values[i]) * Math.min(1, Math.max(0, x - i));
}

export function createElevationChart(): ElevationChart {
  const el = document.createElement("div");
  el.className = "chart chart-elevation";
  const canvas = document.createElement("canvas");
  el.append(canvas);
  const layer = document.createElement("canvas");

  let props: ElevationChartProps | null = null;
  let dirty = true;
  let geom = { left: 0, right: 0, top: 0, bottom: 0 };
  let dragging = false;
  let destroyed = false;
  let raf = 0;

  function drawStatic(p: ElevationChartProps, ctx: CanvasRenderingContext2D, w: number, h: number) {
    const left = PAD.left;
    const right = w - PAD.right;
    const top = PAD.top;
    const bottom = h - PAD.bottom;
    geom = { left, right, top, bottom };
    ctx.clearRect(0, 0, w, h);

    let lo = 0;
    let hi = 0;
    for (const t of p.tracks) {
      for (const v of t.elevationDeg) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (t.horizonDeg) {
        for (const v of t.horizonDeg) {
          if (v == null) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    const pad = Math.max(0.5, (hi - lo) * 0.08);
    const range = niceRange(lo - pad, hi + pad);
    const yOf = (v: number) => bottom - ((v - range.min) / (range.max - range.min)) * (bottom - top);
    const span = Math.max(1, p.n - 1);
    const xOf = (i: number) => left + (i / span) * (right - left);

    // Below the horizon.
    const y0 = yOf(0);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(left, y0, right - left, bottom - y0);

    // Y grid and labels.
    ctx.font = `11px ${FONT_MONO}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    for (let v = range.min; v <= range.max + 1e-9; v += range.step) {
      const val = Math.round(v * 1e6) / 1e6;
      const y = Math.round(yOf(val)) + 0.5;
      const zero = Math.abs(val) < 1e-9;
      ctx.strokeStyle = zero ? "rgba(255,255,255,0.4)" : COLORS.line;
      ctx.lineWidth = zero ? 1.25 : 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillStyle = zero ? COLORS.ink : COLORS.faint;
      ctx.fillText(fmtTick(val), left - 6, y);
    }

    // X ticks every 5 days.
    const days = (span * p.stepS) / DAY_S;
    ctx.textBaseline = "top";
    for (let d = 0; d <= days + 1e-9; d += 5) {
      const x = Math.round(xOf((d * DAY_S) / p.stepS)) + 0.5;
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, bottom);
      ctx.lineTo(x, bottom + 4);
      ctx.stroke();
      const text = p.dayLabel(d);
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = COLORS.faint;
      ctx.textAlign = x - tw / 2 < 0 ? "left" : x + tw / 2 > w ? "right" : "center";
      ctx.fillText(text, x, bottom + 7);
    }

    // Tracks.
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top - 2, right - left, bottom - top + 4);
    ctx.clip();
    ctx.lineJoin = "round";
    for (const t of p.tracks) {
      const m = Math.min(p.n, t.elevationDeg.length);
      if (m < 2) continue;
      if (t.horizonDeg) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([1.5, 3]);
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < m; i++) {
          const v = t.horizonDeg[i];
          if (v == null) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(xOf(i), yOf(v));
          else ctx.moveTo(xOf(i), yOf(v));
          pen = true;
        }
        ctx.stroke();
        ctx.restore();
      }
      const bright = new Path2D();
      const dim = new Path2D();
      for (let i = 0; i < m - 1; i++) {
        const on = t.state ? (t.state[i] ?? 0) > 0 : true;
        const path = on ? bright : dim;
        path.moveTo(xOf(i), yOf(t.elevationDeg[i]));
        path.lineTo(xOf(i + 1), yOf(t.elevationDeg[i + 1]));
      }
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(t.dashed ? [5, 3] : []);
      ctx.globalAlpha = 0.35;
      ctx.stroke(dim);
      ctx.globalAlpha = 1;
      ctx.stroke(bright);
    }
    ctx.restore();
  }

  function drawCursor(p: ElevationChartProps, ctx: CanvasRenderingContext2D, w: number) {
    if (p.cursorIndex == null || !Number.isFinite(p.cursorIndex)) return;
    const { left, right, top, bottom } = geom;
    const span = Math.max(1, p.n - 1);
    const idx = Math.min(span, Math.max(0, p.cursorIndex));
    const x = Math.round(left + (idx / span) * (right - left)) + 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    // Value chips, pushed apart vertically when they would overlap.
    const ys = yScale;
    if (!ys) return;
    ctx.font = `11px ${FONT_MONO}`;
    ctx.textBaseline = "middle";
    const chips = p.tracks
      .filter((t) => t.elevationDeg.length > 1)
      .map((t) => {
        const v = valueAt(t.elevationDeg, idx);
        return { t, v, y: ys(v), text: p.formatDeg(v) };
      })
      .sort((a, b) => a.y - b.y);
    const chipH = 17;
    for (let i = 0; i < chips.length; i++) {
      chips[i].y = Math.min(bottom - chipH / 2, Math.max(top + chipH / 2, chips[i].y));
      if (i > 0 && chips[i].y - chips[i - 1].y < chipH + 1) chips[i].y = chips[i - 1].y + chipH + 1;
    }
    for (const c of chips) {
      const tw = ctx.measureText(c.text).width + 12;
      const flip = x + 8 + tw > w - 2;
      const bx = flip ? x - 8 - tw : x + 8;
      ctx.fillStyle = "rgba(8,11,18,0.92)";
      ctx.strokeStyle = c.t.color;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.roundRect(bx, c.y - chipH / 2, tw, chipH, 5);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = c.t.color;
      ctx.textAlign = "left";
      ctx.fillText(c.text, bx + 6, c.y + 0.5);
      // Dot on the curve.
      ctx.beginPath();
      ctx.arc(x, ys(c.v), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let yScale: ((v: number) => number) | null = null;

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
      // Keep the y mapping for the cursor layer.
      yScale = rebuildScale(p);
      dirty = false;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    drawCursor(p, ctx, w);
  }

  function rebuildScale(p: ElevationChartProps): (v: number) => number {
    let lo = 0;
    let hi = 0;
    for (const t of p.tracks) {
      for (const v of t.elevationDeg) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (t.horizonDeg) {
        for (const v of t.horizonDeg) {
          if (v == null) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    const pad = Math.max(0.5, (hi - lo) * 0.08);
    const r = niceRange(lo - pad, hi + pad);
    const { top, bottom } = geom;
    return (v) => bottom - ((v - r.min) / (r.max - r.min)) * (bottom - top);
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

  function scrub(ev: PointerEvent) {
    if (!props?.onScrub) return;
    const rect = canvas.getBoundingClientRect();
    const f = (ev.clientX - rect.left - geom.left) / Math.max(1, geom.right - geom.left);
    props.onScrub(Math.min(1, Math.max(0, f)) * Math.max(1, props.n - 1));
  }
  const onDown = (ev: PointerEvent) => {
    if (!props?.onScrub) return;
    dragging = true;
    canvas.setPointerCapture(ev.pointerId);
    scrub(ev);
  };
  const onMove = (ev: PointerEvent) => {
    if (dragging) scrub(ev);
  };
  const onUp = (ev: PointerEvent) => {
    dragging = false;
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  function sameStatic(a: ElevationChartProps, b: ElevationChartProps): boolean {
    if (a.t0Ms !== b.t0Ms || a.stepS !== b.stepS || a.n !== b.n) return false;
    if (a.dayLabel !== b.dayLabel && a.dayLabel(5) !== b.dayLabel(5)) return false;
    if (a.tracks.length !== b.tracks.length) return false;
    return a.tracks.every((t, i) => {
      const u = b.tracks[i];
      return (
        t.id === u.id &&
        t.color === u.color &&
        t.dashed === u.dashed &&
        t.elevationDeg === u.elevationDeg &&
        t.state === u.state &&
        t.horizonDeg === u.horizonDeg
      );
    });
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
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      el.remove();
    },
  };
}
