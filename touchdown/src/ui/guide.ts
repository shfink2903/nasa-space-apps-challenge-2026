import type { Ui } from "./context";
import { h, icon } from "./dom";

/** Small help panel, opened from the top bar. */
export function createGuide(ui: Ui): HTMLElement {
  const { t, actions } = ui;
  const close = h("button", { class: "icon-button", type: "button", "aria-label": t.close, title: t.close }, icon("cross"));
  close.addEventListener("click", () => actions.setGuide(false));
  const panel = h(
    "aside",
    { class: "panel guide", "aria-label": t.guideTitle, hidden: true },
    h("header", { class: "panel-head" }, h("h2", { class: "panel-title panel-title-big" }, icon("help"), t.guideTitle), close),
    h("p", { class: "guide-why", text: t.guideWhy }),
    h(
      "ol",
      { class: "guide-list" },
      ...t.guideSteps.map((step, i) => h("li", { class: "guide-step" }, h("span", { class: "guide-num", text: `0${i + 1}` }), h("div", null, h("strong", { text: step.title }), h("p", { text: step.text })))),
    ),
    h("p", { class: "note", text: t.footer }),
  );
  ui.watch((s) => [s.guideOpen], (s) => (panel.hidden = !s.guideOpen));
  return panel;
}
