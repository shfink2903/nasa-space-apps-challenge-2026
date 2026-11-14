/** Visibility windows as thin bars, one row per body, with a shared cursor. DOM + CSS. */

export interface StripRow {
  id: string;
  label: string;
  color: string;
  windows: { startUtc: string; endUtc: string }[];
}

export interface WindowStripsProps {
  t0Ms: number;
  durationMs: number;
  rows: StripRow[];
  cursorMs: number | null;
  onScrub?: (tMs: number) => void;
}

export interface WindowStrips {
  el: HTMLElement;
  update(props: WindowStripsProps): void;
  destroy(): void;
}

/** Windows as fractions 0..1 of the period, clipped to it. Empty or invalid ones are dropped. */
export function windowSpans(
  windows: { startUtc: string; endUtc: string }[],
  t0Ms: number,
  durationMs: number,
): { left: number; width: number }[] {
  if (!(durationMs > 0)) return [];
  const out: { left: number; width: number }[] = [];
  for (const w of windows) {
    const a = Date.parse(w.startUtc);
    const b = Date.parse(w.endUtc);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const s = Math.max(a, t0Ms);
    const e = Math.min(b, t0Ms + durationMs);
    if (e <= s) continue;
    out.push({ left: (s - t0Ms) / durationMs, width: (e - s) / durationMs });
  }
  return out;
}

export function createWindowStrips(): WindowStrips {
  const el = document.createElement("div");
  el.className = "chart chart-strips";
  const rowsEl = document.createElement("div");
  rowsEl.className = "chart-strips-rows";
  const overlay = document.createElement("div");
  overlay.className = "chart-strips-overlay";
  const cursor = document.createElement("div");
  cursor.className = "chart-strips-cursor";
  cursor.hidden = true;
  overlay.append(cursor);
  el.append(rowsEl, overlay);

  let props: WindowStripsProps | null = null;
  let rowsKey: StripRow[] | null = null;
  let built = { t0Ms: NaN, durationMs: NaN };
  let lastCursor = "";
  let dragging = false;

  function build(p: WindowStripsProps) {
    rowsEl.textContent = "";
    for (const row of p.rows) {
      const r = document.createElement("div");
      r.className = "chart-strips-row";
      const label = document.createElement("span");
      label.className = "chart-strips-label";
      label.textContent = row.label;
      const track = document.createElement("div");
      track.className = "chart-strips-track";
      for (const s of windowSpans(row.windows, p.t0Ms, p.durationMs)) {
        const bar = document.createElement("i");
        bar.className = "chart-strips-bar";
        bar.style.left = `${(s.left * 100).toFixed(3)}%`;
        bar.style.width = `${(s.width * 100).toFixed(3)}%`;
        bar.style.background = row.color;
        track.append(bar);
      }
      r.append(label, track);
      rowsEl.append(r);
    }
  }

  function scrub(ev: PointerEvent) {
    if (!props?.onScrub) return;
    const rect = overlay.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (ev.clientX - rect.left) / Math.max(1, rect.width)));
    props.onScrub(props.t0Ms + f * props.durationMs);
  }
  const onDown = (ev: PointerEvent) => {
    if (!props?.onScrub) return;
    dragging = true;
    el.setPointerCapture(ev.pointerId);
    scrub(ev);
  };
  const onMove = (ev: PointerEvent) => {
    if (dragging) scrub(ev);
  };
  const onUp = (ev: PointerEvent) => {
    dragging = false;
    if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
  };
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);

  function sameRows(a: StripRow[] | null, b: StripRow[]): boolean {
    if (!a || a.length !== b.length) return false;
    return a.every(
      (r, i) => r.id === b[i].id && r.label === b[i].label && r.color === b[i].color && r.windows === b[i].windows,
    );
  }

  return {
    el,
    update(next) {
      props = next;
      if (!sameRows(rowsKey, next.rows) || built.t0Ms !== next.t0Ms || built.durationMs !== next.durationMs) {
        build(next);
        rowsKey = next.rows.map((r) => ({ ...r }));
        built = { t0Ms: next.t0Ms, durationMs: next.durationMs };
      }
      const c = next.cursorMs;
      if (c == null || !(next.durationMs > 0)) {
        if (!cursor.hidden) cursor.hidden = true;
        lastCursor = "";
        return;
      }
      const left = `${(Math.min(1, Math.max(0, (c - next.t0Ms) / next.durationMs)) * 100).toFixed(3)}%`;
      if (left !== lastCursor) {
        cursor.style.left = left;
        lastCursor = left;
      }
      if (cursor.hidden) cursor.hidden = false;
    },
    destroy() {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.remove();
    },
  };
}
