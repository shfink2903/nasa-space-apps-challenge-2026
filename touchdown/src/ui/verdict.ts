import { DEFAULT_CRITERIA, EARTH, NIGHT, SUN, type Criteria, type Verdict } from "../data/mission";
import type { Actions, Store } from "../state";
import { h } from "./dom";
import { formatDays, formatHours } from "./format";
import { T } from "./strings";

/** Label for a verdict. `short` is for table cells. */
export function verdictPill(verdict: Verdict, short = false): HTMLElement {
  const text = verdict.status === "go" ? (short ? T.goShort : T.go) : verdict.status === "nogo" ? (short ? T.nogoShort : T.nogo) : short ? "—" : T.unknownVerdict;
  return h("span", { class: `pill pill-${verdict.status}`, text });
}

const nightDays = (hours: number): string => T.days(String(Math.round(hours / 24)));

/** One sentence per threshold that is not met: the value, then the threshold. */
export function failureLines(verdict: Verdict, values: Record<string, number | null>, c: Criteria): string[] {
  return verdict.failed.map((f) => {
    if (f === "sun") return T.fail.sun(formatDays(values[SUN] ?? 0), formatDays(c.minSun));
    if (f === "earth") return T.fail.earth(formatDays(values[EARTH] ?? 0), formatDays(c.minEarth));
    return T.fail.night(formatHours(values[NIGHT] ?? 0), nightDays(c.maxNightH ?? 0));
  });
}

/**
 * The three thresholds, as sliders counted in days out of the 30 studied days.
 * Several copies can exist: they all follow the store.
 */
export function createCriteria(store: Store, actions: Actions): HTMLElement {
  const slider = (label: string, min: number, max: number) => {
    const input = h("input", { class: "crit-range", type: "range", min, max, step: 1, "aria-label": label });
    const value = h("b");
    return { input, value, row: h("label", { class: "crit-row" }, h("span", { text: label }), value, input) };
  };
  const minSun = slider(T.critSun, 0, 30);
  const minEarth = slider(T.critEarth, 0, 30);
  // 1 to 30 days; the last notch means "no limit".
  const maxNight = slider(T.critNight, 1, 31);
  const reset = h("button", { class: "button button-small", type: "button", text: T.critReset });

  minSun.input.addEventListener("input", () => actions.setCriteria({ minSun: Number(minSun.input.value) / 30 }));
  minEarth.input.addEventListener("input", () => actions.setCriteria({ minEarth: Number(minEarth.input.value) / 30 }));
  maxNight.input.addEventListener("input", () => {
    const days = Number(maxNight.input.value);
    actions.setCriteria({ maxNightH: days >= 31 ? null : days * 24 });
  });
  reset.addEventListener("click", () => actions.setCriteria({ ...DEFAULT_CRITERIA }));

  const paint = (): void => {
    const c = store.get().criteria;
    const sun = Math.round(c.minSun * 30);
    const earth = Math.round(c.minEarth * 30);
    const night = c.maxNightH === null ? 31 : Math.round(c.maxNightH / 24);
    const fill = (input: HTMLInputElement, v: number): void => {
      input.value = String(v);
      input.style.setProperty("--p", `${((v - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`);
    };
    fill(minSun.input, sun);
    fill(minEarth.input, earth);
    fill(maxNight.input, night);
    minSun.value.textContent = T.days(String(sun));
    minEarth.value.textContent = T.days(String(earth));
    maxNight.value.textContent = c.maxNightH === null ? T.critNoLimit : T.days(String(night));
  };
  store.subscribe((s, p) => {
    if (s.criteria !== p.criteria) paint();
  });
  paint();
  return h(
    "section",
    { class: "criteria" },
    h("header", { class: "criteria-head" }, h("h3", { class: "card-title", text: T.criteriaTitle }), reset),
    h("p", { class: "criteria-lead", text: T.criteriaLead }),
    h("div", { class: "criteria-rows" }, minSun.row, minEarth.row, maxNight.row),
    h("p", { class: "note", text: T.criteriaNote }),
  );
}
