import { sampleSeries, visibilityAt, type Derived } from "../data/dataset";
import { verdictAt } from "../data/mission";
import type { Actions, AppState, Store } from "../state";
import { h, icon } from "./dom";
import { formatDuration, formatMoment, siteLabel } from "./format";
import { T } from "./strings";

const ORDER = ["transfer", "descent", "final", "surface"] as const;

export interface LandingChoice {
  /** What the site sheet offers: land, jump to sunrise, look at other sites, or nothing. */
  kind: "land" | "sunrise" | "options" | "none";
  /** One answer, never two: possible, night at this time, not possible, or still computing. */
  tone: "go" | "wait" | "nogo" | "unknown";
  title: string;
  text: string;
  riseMs: number | null;
}

/**
 * Can the ship land on the selected site, on this date and at this time?
 * No when the user's criteria are not met for the period. Not now when the
 * criteria are met but the Sun is down at the chosen time. One answer only.
 */
export function landingChoice(s: AppState, derived: Derived): LandingChoice | null {
  const site = s.sites.find((x) => x.id === s.siteId);
  if (!site || !s.scenario || !s.series || s.lightSiteId !== s.siteId) return null;
  const verdict = verdictAt(derived, site, s.heightM, s.date, s.criteria).status;
  if (verdict === "nogo") return { kind: "options", tone: "nogo", title: T.nogo, text: "", riseMs: null };
  if (verdict === "unknown") return { kind: "none", tone: "unknown", title: T.unknownVerdict, text: T.unknownText, riseMs: null };
  const tMs = sampleSeries(s.series, s.index).tMs;
  const sun = visibilityAt(s.scenario, "sun.anyDisk", tMs);
  if (sun.visible) return { kind: "land", tone: "go", title: T.go, text: T.goText(sun.changeMs === null ? null : formatDuration(sun.changeMs - tMs)), riseMs: null };
  if (sun.changeMs !== null) return { kind: "sunrise", tone: "wait", title: T.wait, text: T.waitText(formatMoment(sun.changeMs)), riseMs: sun.changeMs };
  return { kind: "none", tone: "wait", title: T.wait, text: T.waitNoRise, riseMs: null };
}

/**
 * Home: what the tool is for and its two entries. During the flight and on the
 * ground: the steps, Skip and Back. With a site open the sheet says everything,
 * so this stays out of the way.
 */
export function createCaption(store: Store, actions: Actions): HTMLElement {
  const kicker = h("small", { class: "kicker" });
  const title = h("h1", { class: "caption-title" });
  const text = h("p", { class: "caption-text" });
  const south = h("p", { class: "caption-south", text: T.heroSouth });
  const steps = T.steps.map((label) => h("li", { text: label }));
  const stepper = h("ol", { class: "stepper" }, ...steps);
  const evaluate = h("button", { class: "button button-primary button-big", type: "button", text: T.navEvaluate });
  const explore = h("button", { class: "button button-big", type: "button", text: T.navExplore });
  const hint = h("p", { class: "caption-hint", text: T.heroHint });
  const skip = h("button", { class: "button", type: "button" }, icon("skip"), T.skip);
  const back = h("button", { class: "button", type: "button" }, icon("back"), T.back);
  const el = h("section", { class: "caption", "aria-live": "polite" }, kicker, title, text, south, stepper, h("div", { class: "caption-actions" }, evaluate, explore, skip, back), hint);
  evaluate.addEventListener("click", () => actions.setCompare(true, "date"));
  explore.addEventListener("click", () => actions.startTour());
  skip.addEventListener("click", () => actions.skip());
  back.addEventListener("click", () => actions.back());

  const render = (): void => {
    const s = store.get();
    const site = s.sites.find((x) => x.id === s.siteId);
    const cruise = s.phase === "cruise" || !site;
    const flying = !cruise && s.phase !== "focus";
    el.hidden = s.touring || s.compareOpen || (!cruise && !flying);
    kicker.textContent = cruise ? T.heroKicker : T.phaseKicker[s.phase];
    title.textContent = cruise ? T.heroTitle : siteLabel(site).title;
    text.textContent = cruise ? T.heroText : s.phase === "surface" ? T.surfaceText : T.flightText;
    stepper.hidden = !flying;
    const at = ORDER.indexOf(s.phase as (typeof ORDER)[number]);
    steps.forEach((step, i) => {
      step.classList.toggle("is-done", i < at);
      step.classList.toggle("is-current", i === at);
    });
    evaluate.hidden = explore.hidden = hint.hidden = south.hidden = !cruise;
    skip.hidden = !(s.phase === "transfer" || s.phase === "descent" || s.phase === "final");
    back.hidden = !flying;
  };
  store.subscribe((s, p) => {
    if (s.phase !== p.phase || s.siteId !== p.siteId || s.sites !== p.sites || s.touring !== p.touring || s.compareOpen !== p.compareOpen) render();
  });
  render();
  return el;
}
