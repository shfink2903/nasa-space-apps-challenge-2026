import { focusSite } from "../../planner/select";
import type { Ui } from "../context";
import { h, icon } from "../dom";

const ORDER = ["transfer", "descent", "final", "surface"] as const;

/**
 * Centre strip. In the overview and the site view: one line of help and the
 * "fly on click" switch. During a landing: the steps, Skip and Back.
 */
export function createFlightBar(ui: Ui): HTMLElement {
  const { t, fmt, actions } = ui;
  const kicker = h("small", { class: "kicker" });
  const title = h("strong", { class: "flight-title" });
  const text = h("span", { class: "flight-text" });
  const steps = t.steps.map((label) => h("li", { text: label }));
  const stepper = h("ol", { class: "stepper" }, ...steps);
  const skip = h("button", { class: "button", type: "button" }, icon("skip"), t.skip);
  const back = h("button", { class: "button", type: "button" }, icon("back"), t.back);
  const overview = h("button", { class: "button", type: "button" }, icon("zoomOut"), t.overview);
  const auto = h("input", { type: "checkbox", id: "auto-flight" });
  const autoLabel = h("label", { class: "switch", for: "auto-flight" }, auto, h("span", { text: t.autoFlight }));
  skip.addEventListener("click", () => actions.skip());
  back.addEventListener("click", () => actions.back());
  overview.addEventListener("click", () => actions.overview());
  auto.addEventListener("change", () => actions.setAutoFlight(auto.checked));

  const bar = h(
    "section",
    { class: "flight-bar", "aria-live": "polite" },
    h("div", { class: "flight-head" }, kicker, title, text),
    stepper,
    h("div", { class: "flight-actions" }, overview, skip, back, autoLabel),
  );

  ui.watch(
    (s) => [s.phase, s.focusId, s.autoFlight, s.sites],
    (s) => {
      const flying = s.phase !== "cruise" && s.phase !== "focus";
      bar.dataset.phase = s.phase;
      kicker.textContent = t.phaseKicker[s.phase];
      title.textContent = s.phase === "cruise" ? t.cruiseTitle : fmt.site(focusSite(s));
      text.textContent = s.phase === "cruise" ? t.cruiseText : s.phase === "surface" ? t.surfaceText : flying ? t.flightText : "";
      text.hidden = text.textContent === "";
      stepper.hidden = !flying;
      const at = ORDER.indexOf(s.phase as (typeof ORDER)[number]);
      steps.forEach((step, i) => {
        step.classList.toggle("is-done", i < at);
        step.classList.toggle("is-current", i === at);
      });
      skip.hidden = !(s.phase === "transfer" || s.phase === "descent" || s.phase === "final");
      back.hidden = !flying;
      overview.hidden = s.phase !== "focus";
      autoLabel.hidden = flying;
      auto.checked = s.autoFlight;
    },
  );
  return bar;
}
