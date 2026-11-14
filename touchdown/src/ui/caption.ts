import { sampleSeries, visibilityAt, type Derived } from "../data/dataset";
import { verdictAt } from "../data/mission";
import type { Actions, AppState, Store } from "../state";
import { h, icon } from "./dom";
import { formatDuration, siteLabel } from "./format";
import { T } from "./strings";

const ORDER = ["transfer", "descent", "final", "surface"] as const;

export interface LandingChoice {
  /** What the site sheet offers: land, jump to sunrise, look at other options, or nothing. */
  kind: "land" | "sunrise" | "options" | "none";
  text: string;
  riseMs: number | null;
}

/**
 * Can the ship land on the selected site now? No when the user's criteria are
 * not met for this date, and no when the Sun is not up at the chosen time.
 */
export function landingChoice(s: AppState, derived: Derived): LandingChoice {
  const site = s.sites.find((x) => x.id === s.siteId);
  if (!site || !s.scenario || !s.series || s.lightSiteId !== s.siteId) return { kind: "none", text: "", riseMs: null };
  if (verdictAt(derived, site, s.heightM, s.date, s.criteria).status === "nogo") return { kind: "options", text: T.focusNoGo, riseMs: null };
  const tMs = sampleSeries(s.series, s.index).tMs;
  const sun = visibilityAt(s.scenario, "sun.anyDisk", tMs);
  if (sun.visible) return { kind: "land", text: T.focusSunUp(sun.changeMs === null ? null : formatDuration(sun.changeMs - tMs)), riseMs: null };
  if (sun.changeMs !== null) return { kind: "sunrise", text: T.focusSunDown, riseMs: sun.changeMs };
  return { kind: "none", text: `${T.focusSunDown} ${T.focusNoRise}`, riseMs: null };
}

/**
 * Centre of the screen. On the overview: the question the tool answers and its
 * two entries. During the flight and on the ground: the steps, Skip and Back.
 * With a site open the sheet says everything, so this stays out of the way.
 */
export function createCaption(store: Store, actions: Actions): HTMLElement {
  const kicker = h("small", { class: "kicker" });
  const title = h("h1", { class: "caption-title" });
  const text = h("p", { class: "caption-text" });
  const steps = T.steps.map((label) => h("li", { text: label }));
  const stepper = h("ol", { class: "stepper" }, ...steps);
  const compare = h("button", { class: "button button-primary button-big", type: "button" }, icon("table"), T.compare);
  const tour = h("button", { class: "button button-big", type: "button" }, icon("play"), T.tourStart);
  const hint = h("span", { class: "caption-hint", text: T.heroHint });
  const skip = h("button", { class: "button", type: "button" }, icon("skip"), T.skip);
  const back = h("button", { class: "button", type: "button" }, icon("back"), T.back);
  const el = h("section", { class: "caption", "aria-live": "polite" }, kicker, title, text, stepper, h("div", { class: "caption-actions" }, compare, tour, hint, skip, back));
  compare.addEventListener("click", () => actions.setCompare(true, "date"));
  tour.addEventListener("click", () => actions.startTour());
  skip.addEventListener("click", () => actions.skip());
  back.addEventListener("click", () => actions.back());

  const render = (): void => {
    const s = store.get();
    const site = s.sites.find((x) => x.id === s.siteId);
    const cruise = s.phase === "cruise" || !site;
    const flying = !cruise && s.phase !== "focus";
    el.hidden = !cruise && !flying;
    el.dataset.phase = s.phase;
    kicker.textContent = cruise ? T.heroKicker : T.phaseKicker[s.phase];
    title.textContent = cruise ? T.cruiseTitle : siteLabel(site).title;
    text.textContent = cruise ? T.cruiseText : s.phase === "surface" ? T.surfaceText : T.flightText;
    stepper.hidden = !flying;
    const at = ORDER.indexOf(s.phase as (typeof ORDER)[number]);
    steps.forEach((step, i) => {
      step.classList.toggle("is-done", i < at);
      step.classList.toggle("is-current", i === at);
    });
    compare.hidden = tour.hidden = hint.hidden = !cruise;
    skip.hidden = !(s.phase === "transfer" || s.phase === "descent" || s.phase === "final");
    back.hidden = !flying;
  };
  store.subscribe((s, p) => {
    if (s.phase !== p.phase || s.siteId !== p.siteId || s.sites !== p.sites) render();
  });
  render();
  return el;
}
