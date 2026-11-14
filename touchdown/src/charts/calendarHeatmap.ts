/** "When to land": sites x weekly start dates, one coloured cell per 30-day period. */
import { ramp, type Ramp } from "./theme";

export interface HeatmapRow {
  id: string;
  label: string;
  sublabel?: string;
  values: (number | null)[];
}

export interface CalendarHeatmapProps {
  dates: string[];
  rows: HeatmapRow[];
  kind: Ramp;
  domain: [number, number];
  selectedDate: string;
  selectedRowId: string | null;
  formatValue: (v: number | null) => string;
  formatDate: (date: string) => string;
  monthLabel: (date: string) => string;
  onSelect?: (date: string, rowId: string) => void;
}

export interface CalendarHeatmap {
  el: HTMLElement;
  update(props: CalendarHeatmapProps): void;
  destroy(): void;
}

/** Indices of the first date of each month (YYYYMMDD strings). Includes 0 when there is at least one date. */
export function monthStarts(dates: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (i === 0 || dates[i].slice(0, 6) !== dates[i - 1].slice(0, 6)) out.push(i);
  }
  return out;
}

/** Maps a value to 0..1 (clamped). Null and non-finite values give null, never NaN. */
export function normalise(v: number | null, domain: [number, number]): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const [lo, hi] = domain;
  if (!(hi > lo)) return 0;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

interface RowNodes {
  label: HTMLElement;
  name: HTMLElement;
  sub: HTMLElement;
  cells: HTMLButtonElement[];
}

export function createCalendarHeatmap(): CalendarHeatmap {
  const el = document.createElement("div");
  el.className = "chart chart-calendar";

  const scroll = document.createElement("div");
  scroll.className = "cal-scroll";
  const grid = document.createElement("div");
  grid.className = "cal-grid";
  scroll.append(grid);

  const tip = document.createElement("div");
  tip.className = "cal-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  const tipRow = document.createElement("div");
  tipRow.className = "cal-tip-row";
  const tipDate = document.createElement("div");
  tipDate.className = "cal-tip-date";
  const tipValue = document.createElement("div");
  tipValue.className = "cal-tip-value";
  tip.append(tipRow, tipDate, tipValue);

  const legend = document.createElement("div");
  legend.className = "cal-legend";
  const legLo = document.createElement("span");
  const legBar = document.createElement("span");
  legBar.className = "cal-legend-bar";
  const legHi = document.createElement("span");
  legend.append(legLo, legBar, legHi);

  el.append(scroll, legend, tip);

  let props: CalendarHeatmapProps | null = null;
  let structureKey = "";
  let rowNodes: RowNodes[] = [];
  let months: HTMLElement[] = [];
  let ring: HTMLElement | null = null;

  function rebuild(p: CalendarHeatmapProps): void {
    grid.replaceChildren();
    grid.style.setProperty("--cols", String(p.dates.length));
    rowNodes = [];
    months = [];

    const corner = document.createElement("div");
    corner.className = "cal-corner";
    grid.append(corner);
    const starts = monthStarts(p.dates);
    starts.forEach((start, k) => {
      const end = k + 1 < starts.length ? starts[k + 1] : p.dates.length;
      const m = document.createElement("div");
      m.className = "cal-month";
      m.style.gridColumn = `${start + 2} / span ${end - start}`;
      m.style.gridRow = "1";
      grid.append(m);
      months.push(m);
    });

    p.rows.forEach((_, r) => {
      const label = document.createElement("div");
      label.className = "cal-label";
      label.style.gridColumn = "1";
      label.style.gridRow = String(r + 2);
      const name = document.createElement("span");
      name.className = "cal-label-name";
      const sub = document.createElement("span");
      sub.className = "cal-label-sub";
      label.append(name, sub);
      grid.append(label);
      const cells: HTMLButtonElement[] = [];
      p.dates.forEach((_, c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cal-cell";
        b.dataset.r = String(r);
        b.dataset.c = String(c);
        b.style.gridColumn = String(c + 2);
        b.style.gridRow = String(r + 2);
        grid.append(b);
        cells.push(b);
      });
      rowNodes.push({ label, name, sub, cells });
    });

    ring = document.createElement("div");
    ring.className = "cal-ring";
    ring.setAttribute("aria-hidden", "true");
    grid.append(ring);
  }

  function showTip(cell: HTMLElement): void {
    if (!props) return;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const row = props.rows[r];
    if (!row) return;
    tipRow.textContent = row.label;
    tipDate.textContent = props.formatDate(props.dates[c]);
    tipValue.textContent = props.formatValue(row.values[c] ?? null);
    tip.hidden = false;
    const box = el.getBoundingClientRect();
    const cb = cell.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = cb.left - box.left + cb.width / 2 - tw / 2;
    left = Math.max(0, Math.min(box.width - tw, left));
    let top = cb.top - box.top - th - 8;
    if (top < 0) top = cb.bottom - box.top + 8;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }
  const hideTip = (): void => {
    tip.hidden = true;
  };

  const cellOf = (e: Event): HTMLElement | null => {
    const t = e.target as HTMLElement | null;
    return t?.closest?.(".cal-cell") ?? null;
  };
  const onOver = (e: Event): void => {
    const c = cellOf(e);
    if (c) showTip(c);
  };
  const onOut = (e: Event): void => {
    const c = cellOf(e);
    if (c) hideTip();
  };
  const onClick = (e: Event): void => {
    const c = cellOf(e);
    if (!c || !props?.onSelect) return;
    const row = props.rows[Number(c.dataset.r)];
    const date = props.dates[Number(c.dataset.c)];
    if (row && date) props.onSelect(date, row.id);
  };
  grid.addEventListener("mouseover", onOver);
  grid.addEventListener("mouseout", onOut);
  grid.addEventListener("focusin", onOver);
  grid.addEventListener("focusout", onOut);
  grid.addEventListener("click", onClick);

  function update(p: CalendarHeatmapProps): void {
    props = p;
    const key = `${p.dates.join(",")}|${p.rows.map((r) => r.id).join(",")}`;
    if (key !== structureKey) {
      structureKey = key;
      rebuild(p);
    }
    const selCol = Math.max(0, p.dates.indexOf(p.selectedDate));
    const hasSel = p.dates.includes(p.selectedDate);

    months.forEach((m, k) => {
      const starts = monthStarts(p.dates);
      m.textContent = p.monthLabel(p.dates[starts[k]]);
    });

    p.rows.forEach((row, r) => {
      const n = rowNodes[r];
      n.name.textContent = row.label;
      n.name.title = row.label;
      n.sub.textContent = row.sublabel ?? "";
      n.sub.hidden = !row.sublabel;
      n.label.classList.toggle("is-selected", row.id === p.selectedRowId);
      n.cells.forEach((b, c) => {
        const v = row.values[c] ?? null;
        const t = normalise(v, p.domain);
        if (t === null) {
          b.style.background = "";
          b.classList.add("is-null");
        } else {
          b.style.background = ramp(p.kind, t);
          b.classList.remove("is-null");
        }
        b.classList.toggle("is-row", row.id === p.selectedRowId);
        b.tabIndex = c === selCol ? 0 : -1;
        b.setAttribute("aria-label", `${row.label}, ${p.formatDate(p.dates[c])}, ${p.formatValue(v)}`);
        b.setAttribute("aria-pressed", hasSel && c === selCol && row.id === p.selectedRowId ? "true" : "false");
      });
    });

    if (ring) {
      ring.hidden = !hasSel || p.rows.length === 0;
      ring.style.gridColumn = String(selCol + 2);
      ring.style.gridRow = `2 / span ${Math.max(1, p.rows.length)}`;
    }

    legLo.textContent = p.formatValue(p.domain[0]);
    legHi.textContent = p.formatValue(p.domain[1]);
    const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `${ramp(p.kind, t)} ${t * 100}%`).join(",");
    legBar.style.background = `linear-gradient(90deg,${stops})`;
  }

  function destroy(): void {
    grid.removeEventListener("mouseover", onOver);
    grid.removeEventListener("mouseout", onOut);
    grid.removeEventListener("focusin", onOver);
    grid.removeEventListener("focusout", onOut);
    grid.removeEventListener("click", onClick);
    el.remove();
  }

  return { el, update, destroy };
}
