/** "A small move changes everything": a 5 x 5 km grid of metric values around one point. */
import { ramp, type Ramp } from "./theme";

export interface GridCell {
  eastKm: number;
  northKm: number;
  value: number | null;
  latDeg: number;
  lonDeg: number;
}

export interface SensitivityGridProps {
  title: string;
  cells: GridCell[];
  kind: Ramp;
  domain: [number, number];
  formatValue: (v: number | null) => string;
  formatCoords: (latDeg: number, lonDeg: number) => string;
  labels: { north: string; scale: string; center: string; best: string; range: string };
}

export interface SensitivityGrid {
  el: HTMLElement;
  update(props: SensitivityGridProps): void;
  destroy(): void;
}

const SIZE = 5;
const HALF = 2;

/** 5 rows (top = north) x 5 columns (left = west). Missing or out-of-range cells are null. */
export function gridMatrix(cells: GridCell[]): (GridCell | null)[][] {
  const m: (GridCell | null)[][] = Array.from({ length: SIZE }, () => Array<GridCell | null>(SIZE).fill(null));
  for (const c of cells) {
    const col = c.eastKm + HALF;
    const row = HALF - c.northKm;
    if (Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < SIZE && row >= 0 && row < SIZE) m[row][col] = c;
  }
  return m;
}

/** Cell with the highest non-null value. On ties the first in input order wins. Null if no value. */
export function bestCell(cells: GridCell[]): GridCell | null {
  let best: GridCell | null = null;
  for (const c of cells) {
    if (c.value === null || !Number.isFinite(c.value)) continue;
    if (best === null || c.value > (best.value as number)) best = c;
  }
  return best;
}

/** Dark text on light cells, light text on dark cells (rgb(r,g,b) input). */
function textFor(rgb: string): string {
  const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) return "#eef1f6";
  const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
  return lum > 0.55 ? "#0b0f17" : "#eef1f6";
}

export function createSensitivityGrid(): SensitivityGrid {
  const el = document.createElement("div");
  el.className = "chart chart-grid";

  const title = document.createElement("div");
  title.className = "sg-title";

  const body = document.createElement("div");
  body.className = "sg-body";
  const grid = document.createElement("div");
  grid.className = "sg-cells";
  const buttons: HTMLButtonElement[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sg-cell";
      b.dataset.r = String(r);
      b.dataset.c = String(c);
      const v = document.createElement("span");
      v.className = "sg-val";
      const badge = document.createElement("span");
      badge.className = "sg-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.hidden = true;
      b.append(v, badge);
      grid.append(b);
      buttons.push(b);
    }
  }

  const foot = document.createElement("div");
  foot.className = "sg-foot";
  const north = document.createElement("span");
  north.className = "sg-north";
  const scale = document.createElement("span");
  scale.className = "sg-scale";
  const scaleBar = document.createElement("span");
  scaleBar.className = "sg-scale-bar";
  const scaleLabel = document.createElement("span");
  scale.append(scaleBar, scaleLabel);
  foot.append(north, scale);
  body.append(grid, foot);

  const range = document.createElement("div");
  range.className = "sg-range";
  const readout = document.createElement("div");
  readout.className = "sg-readout";
  readout.setAttribute("aria-live", "polite");

  el.append(title, body, range, readout);

  let props: SensitivityGridProps | null = null;
  let matrix: (GridCell | null)[][] = [];
  let best: GridCell | null = null;

  function describe(cell: GridCell | null): string {
    if (!props || !cell) return "";
    const parts = [props.formatCoords(cell.latDeg, cell.lonDeg), props.formatValue(cell.value)];
    if (cell.eastKm === 0 && cell.northKm === 0) parts.unshift(props.labels.center);
    if (best && cell === best) parts.push(props.labels.best);
    return parts.join(" · ");
  }
  function resetReadout(): void {
    readout.textContent = describe(matrix[HALF]?.[HALF] ?? null);
  }
  function show(b: HTMLElement): void {
    const cell = matrix[Number(b.dataset.r)]?.[Number(b.dataset.c)] ?? null;
    if (cell) readout.textContent = describe(cell);
  }

  const btnOf = (e: Event): HTMLElement | null => (e.target as HTMLElement | null)?.closest?.(".sg-cell") ?? null;
  const onIn = (e: Event): void => {
    const b = btnOf(e);
    if (b) show(b);
  };
  const onOut = (e: Event): void => {
    if (btnOf(e)) resetReadout();
  };
  const onKey = (e: KeyboardEvent): void => {
    const b = btnOf(e);
    if (!b) return;
    const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const step = d[e.key];
    if (!step) return;
    const r = Math.min(SIZE - 1, Math.max(0, Number(b.dataset.r) + step[0]));
    const c = Math.min(SIZE - 1, Math.max(0, Number(b.dataset.c) + step[1]));
    buttons[r * SIZE + c].focus();
    e.preventDefault();
  };
  grid.addEventListener("mouseover", onIn);
  grid.addEventListener("focusin", onIn);
  grid.addEventListener("mouseout", onOut);
  grid.addEventListener("focusout", onOut);
  grid.addEventListener("keydown", onKey);

  function update(p: SensitivityGridProps): void {
    props = p;
    matrix = gridMatrix(p.cells);
    best = bestCell(p.cells);
    title.textContent = p.title;
    north.textContent = `${p.labels.north} ↑`;
    scaleLabel.textContent = p.labels.scale;

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const b = buttons[r * SIZE + c];
        const cell = matrix[r][c];
        const val = b.firstElementChild as HTMLElement;
        const badge = b.lastElementChild as HTMLElement;
        if (!cell) {
          b.disabled = true;
          b.style.background = "";
          b.style.color = "";
          val.textContent = "";
          b.classList.add("is-null");
          b.classList.remove("is-center");
          badge.hidden = true;
          b.removeAttribute("aria-label");
          continue;
        }
        b.disabled = false;
        b.classList.remove("is-null");
        const t = cell.value === null ? null : Math.min(1, Math.max(0, p.domain[1] > p.domain[0] ? (cell.value - p.domain[0]) / (p.domain[1] - p.domain[0]) : 0));
        if (t === null) {
          b.style.background = "";
          b.style.color = "";
          b.classList.add("is-null");
        } else {
          const bg = ramp(p.kind, t);
          b.style.background = bg;
          b.style.color = textFor(bg);
        }
        val.textContent = p.formatValue(cell.value);
        const isCenter = cell.eastKm === 0 && cell.northKm === 0;
        b.classList.toggle("is-center", isCenter);
        badge.hidden = cell !== best;
        badge.title = p.labels.best;
        b.tabIndex = isCenter ? 0 : -1;
        b.setAttribute("aria-label", describe(cell));
      }
    }

    const vals = p.cells.map((c) => c.value).filter((v): v is number => v !== null && Number.isFinite(v));
    range.textContent = vals.length
      ? `${p.labels.range} ${p.formatValue(Math.min(...vals))} → ${p.formatValue(Math.max(...vals))}`
      : "";
    resetReadout();
  }

  function destroy(): void {
    grid.removeEventListener("mouseover", onIn);
    grid.removeEventListener("focusin", onIn);
    grid.removeEventListener("mouseout", onOut);
    grid.removeEventListener("focusout", onOut);
    grid.removeEventListener("keydown", onKey);
    el.remove();
  }

  return { el, update, destroy };
}
