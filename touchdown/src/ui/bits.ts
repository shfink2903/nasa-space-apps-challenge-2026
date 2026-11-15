import type { Criterion, Region } from "../data/ranking";
import type { Actions, Store } from "../state";
import { h } from "./dom";
import { formatDays, formatHours, formatHoursExact, formatMonth, formatPercent } from "./format";
import { T } from "./strings";

/**
 * A published metric as short text: days out of the 30 studied days and plain
 * durations. `exact` gives the percentage with one decimal and exact hours.
 * A missing value stays "—", never zero.
 */
export function formatCriterion(criterion: Criterion, value: number | null, exact = false): string {
  if (value === null) return "—";
  if (criterion.kind === "fraction") return exact ? formatPercent(value) : formatDays(value);
  return exact ? formatHoursExact(value) : formatHours(value);
}

/** Two-way switch: south pole sites only, or every site. */
export function createRegionSwitch(store: Store, actions: Actions): HTMLElement {
  const make = (region: Region, label: string): HTMLButtonElement => {
    const b = h("button", { class: "seg", type: "button", text: label, title: T.regionHint });
    b.addEventListener("click", () => actions.setRegion(region));
    return b;
  };
  const south = make("south", T.regionSouth);
  const all = make("all", T.regionAll);
  const paint = (): void => {
    const { region } = store.get();
    south.classList.toggle("is-on", region === "south");
    all.classList.toggle("is-on", region === "all");
  };
  store.subscribe((s, p) => {
    if (s.region !== p.region) paint();
  });
  paint();
  return h("div", { class: "segmented", role: "group", "aria-label": T.regionLabel }, south, all);
}

/** Latitude, longitude and one button. The challenge asks for any lunar point, not only the catalogue. */
export function createCoordsForm(onPoint: (latDeg: number, lonDeg: number) => void): HTMLFormElement {
  const lat = h("input", { class: "input", id: "coords-lat", type: "number", min: -90, max: 90, step: "any", placeholder: T.latHint, inputmode: "decimal" });
  const lon = h("input", { class: "input", id: "coords-lon", type: "number", min: -180, max: 180, step: "any", placeholder: T.lonHint, inputmode: "decimal" });
  const error = h("small", { class: "coords-error", text: T.coordsError, hidden: true });
  const form = h(
    "form",
    { class: "coords" },
    h("label", { class: "coords-field", for: "coords-lat" }, h("span", { text: T.latLabel }), lat),
    h("label", { class: "coords-field", for: "coords-lon" }, h("span", { text: T.lonLabel }), lon),
    h("button", { class: "button button-primary", type: "submit", text: T.coordsGo }),
    error,
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const a = Number(lat.value);
    const b = Number(lon.value);
    const ok = lat.value !== "" && lon.value !== "" && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180;
    error.hidden = ok;
    if (ok) onPoint(a, b);
  });
  return form;
}

/** The weekly dates, grouped by calendar month, in order. */
export function monthGroups(dates: string[]): { label: string; dates: string[] }[] {
  const out: { key: string; label: string; dates: string[] }[] = [];
  for (const date of dates) {
    const key = date.slice(0, 6);
    const last = out[out.length - 1];
    if (last && last.key === key) last.dates.push(date);
    else out.push({ key, label: formatMonth(date), dates: [date] });
  }
  return out;
}
