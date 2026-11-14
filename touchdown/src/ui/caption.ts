import { sampleSeries, visibilityAt } from "../data/dataset";
import type { Actions, Store } from "../state";
import { h, icon } from "./dom";
import { formatDuration, siteLabel } from "./format";
import { T } from "./strings";

const ORDER = ["transfer", "descent", "final", "surface"] as const;

/**
 * Bottom-left: what is happening now. On a selected site it says whether the
 * Sun is up and offers the landing. No Sun, no landing: the button is replaced
 * by a jump to the next published sunrise.
 */
export function createCaption(store: Store, actions: Actions): HTMLElement {
  const kicker = h("small", { class: "kicker" });
  const title = h("h1", { class: "caption-title" });
  const text = h("p", { class: "caption-text" });
  const steps = T.steps.map((label) => h("li", { text: label }));
  const stepper = h("ol", { class: "stepper" }, ...steps);
  const land = h("button", { class: "button button-primary", type: "button" }, icon("nav"), T.land);
  const sunrise = h("button", { class: "button button-primary", type: "button" }, icon("sun"), T.toSunrise);
  const skip = h("button", { class: "button", type: "button" }, icon("skip"), T.skip);
  const back = h("button", { class: "button", type: "button" }, icon("back"), h("span"));
  const actionsRow = h("div", { class: "caption-actions" }, land, sunrise, skip, back);
  const el = h("section", { class: "caption", "aria-live": "polite" }, kicker, title, text, stepper, actionsRow);
  let riseMs: number | null = null;
  land.addEventListener("click", () => actions.land());
  sunrise.addEventListener("click", () => {
    // One display step after the rise, so the Sun is already above the terrain.
    if (riseMs !== null) actions.jumpTo(riseMs + 600_000);
  });
  skip.addEventListener("click", () => actions.skip());
  back.addEventListener("click", () => actions.back());

  const render = (): void => {
    const s = store.get();
    const site = s.sites.find((x) => x.id === s.siteId);
    const selected = s.phase !== "cruise" && site !== undefined;
    const flying = selected && s.phase !== "focus";
    kicker.textContent = T.phaseKicker[s.phase];
    title.textContent = selected ? siteLabel(site).title : T.cruiseTitle;
    el.dataset.phase = s.phase;
    stepper.hidden = !flying;
    const at = ORDER.indexOf(s.phase as (typeof ORDER)[number]);
    steps.forEach((step, i) => {
      step.classList.toggle("is-done", i < at);
      step.classList.toggle("is-current", i === at);
    });
    skip.hidden = !(s.phase === "transfer" || s.phase === "descent" || s.phase === "final");
    back.hidden = !selected;
    back.lastElementChild!.textContent = s.phase === "focus" ? T.close : T.back;

    land.hidden = true;
    sunrise.hidden = true;
    riseMs = null;
    if (!selected) text.textContent = T.cruiseText;
    else if (s.phase === "surface") text.textContent = T.surfaceText;
    else if (s.phase !== "focus") text.textContent = T.flightText;
    else if (s.scenario && s.series && s.lightSiteId === s.siteId) {
      const tMs = sampleSeries(s.series, s.index).tMs;
      const sun = visibilityAt(s.scenario, "sun.anyDisk", tMs);
      if (sun.visible) {
        text.textContent = T.focusSunUp(sun.changeMs === null ? null : formatDuration(sun.changeMs - tMs));
        land.hidden = false;
      } else if (sun.changeMs !== null) {
        text.textContent = T.focusSunDown;
        riseMs = sun.changeMs;
        sunrise.hidden = false;
      } else text.textContent = `${T.focusSunDown} ${T.focusNoRise}`;
    } else text.textContent = "";
  };
  store.subscribe((s, p) => {
    if (s.phase !== p.phase || s.siteId !== p.siteId || s.sites !== p.sites || s.scenario !== p.scenario || s.lightSiteId !== p.lightSiteId) render();
    else if (s.phase === "focus" && s.index !== p.index) render();
  });
  render();
  return el;
}
