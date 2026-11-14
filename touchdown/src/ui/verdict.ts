import { EARTH, NIGHT, SUN, type Criteria, type Verdict } from "../data/mission";
import { criterionById } from "../data/ranking";
import type { Actions, Mode, Store } from "../state";
import { h } from "./dom";
import { formatCriterion } from "./sitelist";
import { T } from "./strings";

/** Green, red or grey label for a verdict. `short` is for table cells. */
export function verdictPill(verdict: Verdict, short = false): HTMLElement {
  const text = verdict.status === "go" ? (short ? T.goShort : T.go) : verdict.status === "nogo" ? (short ? T.nogoShort : T.nogo) : short ? "—" : T.unknownVerdict;
  return h("span", { class: `pill pill-${verdict.status}`, text });
}

/** One sentence per threshold that is not met: the value, then the threshold. */
export function failureLines(verdict: Verdict, values: Record<string, number | null>, c: Criteria, mode: Mode): string[] {
  const sun = criterionById("sun");
  const night = criterionById("night");
  return verdict.failed.map((f) =>
    f === "sun"
      ? T.fail.sun(formatCriterion(sun, values[SUN] ?? null, mode), formatCriterion(sun, c.minSun, mode))
      : f === "earth"
        ? T.fail.earth(formatCriterion(sun, values[EARTH] ?? null, mode), formatCriterion(sun, c.minEarth, mode))
        : T.fail.night(formatCriterion(night, values[NIGHT] ?? null, mode), formatCriterion(night, c.maxNightH, mode)),
  );
}

/** The three thresholds, as sliders. Several copies can exist: they all follow the store. */
export function createCriteria(store: Store, actions: Actions): HTMLElement {
  const sun = criterionById("sun");
  const night = criterionById("night");
  const slider = (label: string, max: number, step: number) => {
    const input = h("input", { class: "crit-range", type: "range", min: 0, max, step, "aria-label": label });
    const value = h("b");
    return { input, value, row: h("label", { class: "crit-row" }, h("span", { text: label }), value, input) };
  };
  const minSun = slider(T.critSun, 100, 5);
  const minEarth = slider(T.critEarth, 100, 5);
  // 1 to 30 days; the last notch means "no limit".
  const maxNight = slider(T.critNight, 31, 1);
  maxNight.input.min = "1";
  const reset = h("button", { class: "button button-small", type: "button", text: T.critReset });

  minSun.input.addEventListener("input", () => actions.setCriteria({ minSun: Number(minSun.input.value) / 100 }));
  minEarth.input.addEventListener("input", () => actions.setCriteria({ minEarth: Number(minEarth.input.value) / 100 }));
  maxNight.input.addEventListener("input", () => {
    const days = Number(maxNight.input.value);
    actions.setCriteria({ maxNightH: days >= 31 ? null : days * 24 });
  });
  reset.addEventListener("click", () => actions.setCriteria({ minSun: 0.4, minEarth: 0.5, maxNightH: null }));

  const paint = (): void => {
    const { criteria: c, mode } = store.get();
    minSun.input.value = String(Math.round(c.minSun * 100));
    minEarth.input.value = String(Math.round(c.minEarth * 100));
    maxNight.input.value = String(c.maxNightH === null ? 31 : Math.round(c.maxNightH / 24));
    minSun.value.textContent = formatCriterion(sun, c.minSun, mode);
    minEarth.value.textContent = formatCriterion(sun, c.minEarth, mode);
    maxNight.value.textContent = c.maxNightH === null ? T.critNoLimit : formatCriterion(night, c.maxNightH, mode);
  };
  store.subscribe((s, p) => {
    if (s.criteria !== p.criteria || s.mode !== p.mode) paint();
  });
  paint();
  return h(
    "section",
    { class: "criteria" },
    h("header", { class: "criteria-head" }, h("h3", { class: "block-title", text: T.criteriaTitle }), reset),
    h("div", { class: "criteria-rows" }, minSun.row, minEarth.row, maxNight.row),
    h("p", { class: "note", text: T.criteriaNote }),
  );
}
