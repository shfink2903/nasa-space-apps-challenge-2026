import type { Ui } from "./context";
import { h, icon } from "./dom";

/** Small help panel, opened from the top bar. */
export function createGuide(ui: Ui): HTMLElement {
  const { t, actions } = ui;
  const close = h("button", { class: "icon-button", type: "button", "aria-label": t.close, title: t.close }, icon("cross"));
  close.addEventListener("click", () => actions.setGuide(false));
  const step1 = h("button", { class: "button button-primary", type: "button" }, icon("sun"), h("span", { text: t.teachButton }));
  const step2 = h("button", { class: "button", type: "button" }, icon("target"), h("span", { text: t.teachButton2 }));
  step1.addEventListener("click", () => actions.showPoleVsApollo(1));
  step2.addEventListener("click", () => actions.showPoleVsApollo(2));
  const teach = h("div", { class: "teach-steps" }, h("p", { class: "note", text: t.teachStep1 }), step1, h("p", { class: "note", text: t.teachStep2 }), step2);
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
    h("h3", { class: "section-title", text: t.teachTitle }),
    h("p", { class: "guide-why", text: t.teachText }),
    teach,
    h("p", { class: "note", text: t.footer }),
  );
  ui.watch((s) => [s.guideOpen], (s) => (panel.hidden = !s.guideOpen));
  return panel;
}
