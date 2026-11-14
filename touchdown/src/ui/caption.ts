import type { Actions, Store } from "../state";
import { h, icon } from "./dom";
import { siteLabel } from "./format";
import { T } from "./strings";

const ORDER = ["transfer", "descent", "final", "surface"] as const;

/** Bottom-left: what is happening now, the flight steps, Skip and Back. */
export function createCaption(store: Store, actions: Actions): HTMLElement {
  const kicker = h("small", { class: "kicker" });
  const title = h("h1", { class: "caption-title" });
  const text = h("p", { class: "caption-text" });
  const steps = T.steps.map((label) => h("li", { text: label }));
  const stepper = h("ol", { class: "stepper" }, ...steps);
  const skip = h("button", { class: "button", type: "button" }, icon("skip"), T.skip);
  const back = h("button", { class: "button", type: "button" }, icon("back"), T.back);
  const actionsRow = h("div", { class: "caption-actions" }, skip, back);
  const el = h("section", { class: "caption", "aria-live": "polite" }, kicker, title, text, stepper, actionsRow);
  skip.addEventListener("click", () => actions.skip());
  back.addEventListener("click", () => actions.back());

  const render = (): void => {
    const s = store.get();
    const site = s.sites.find((x) => x.id === s.siteId);
    const flying = s.phase !== "cruise" && site !== undefined;
    kicker.textContent = T.phaseKicker[s.phase];
    title.textContent = flying ? siteLabel(site).title : T.cruiseTitle;
    text.textContent = !flying ? T.cruiseText : s.phase === "surface" ? T.surfaceText : T.flightText;
    el.dataset.phase = s.phase;
    stepper.hidden = !flying;
    const at = ORDER.indexOf(s.phase as (typeof ORDER)[number]);
    steps.forEach((step, i) => {
      step.classList.toggle("is-done", i < at);
      step.classList.toggle("is-current", i === at);
    });
    skip.hidden = !(s.phase === "transfer" || s.phase === "descent" || s.phase === "final");
    back.hidden = !flying;
  };
  store.subscribe((s, p) => {
    if (s.phase !== p.phase || s.siteId !== p.siteId || s.sites !== p.sites) render();
  });
  render();
  return el;
}
