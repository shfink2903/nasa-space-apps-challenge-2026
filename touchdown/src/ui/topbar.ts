import type { Actions, Mode, Store } from "../state";
import { h, icon } from "./dom";
import { LANG, switchLang, T } from "./strings";

/**
 * Top bar: the three things the tool is for (compare, replan after a delay,
 * learn), then the display level and the language. Always in view.
 */
export function createTopBar(store: Store, actions: Actions): HTMLElement {
  const compare = h("button", { class: "nav-button is-primary", type: "button" }, icon("table"), h("span", { text: T.navCompare }));
  const delay = h("button", { class: "nav-button", type: "button" }, icon("clock"), h("span", { text: T.navDelay }));
  const tour = h("button", { class: "nav-button", type: "button" }, icon("play"), h("span", { text: T.navTour }));
  compare.addEventListener("click", () => actions.setCompare(true, "date"));
  delay.addEventListener("click", () => actions.setCompare(true, "delay"));
  tour.addEventListener("click", () => {
    actions.setCompare(false);
    actions.startTour();
  });

  const modeButton = (mode: Mode, label: string): HTMLButtonElement => {
    const b = h("button", { class: "seg", type: "button", text: label, title: T.modeHint });
    b.addEventListener("click", () => actions.setMode(mode));
    return b;
  };
  const simple = modeButton("simple", T.modeSimple);
  const expert = modeButton("expert", T.modeExpert);
  const lang = h("button", { class: "panel-toggle lang", type: "button", "aria-label": T.otherLangLabel, title: T.otherLangLabel, text: T.otherLang });
  lang.addEventListener("click", () => switchLang(LANG === "fr" ? "en" : "fr"));

  const paint = (): void => {
    const s = store.get();
    simple.classList.toggle("is-on", s.mode === "simple");
    expert.classList.toggle("is-on", s.mode === "expert");
    compare.classList.toggle("is-current", s.compareOpen && s.compareTab !== "delay");
    delay.classList.toggle("is-current", s.compareOpen && s.compareTab === "delay");
  };
  store.subscribe((s, p) => {
    if (s.mode !== p.mode || s.compareOpen !== p.compareOpen || s.compareTab !== p.compareTab) paint();
  });
  paint();

  return h(
    "header",
    { class: "panel topbar" },
    h("div", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }), h("div", null, h("b", { text: T.brand }), h("small", { text: T.tagline }))),
    h("nav", { class: "topnav", "aria-label": T.brand }, compare, delay, tour),
    h("div", { class: "toptools" }, h("div", { class: "segmented", role: "group", "aria-label": T.modeLabel }, simple, expert), lang),
  );
}
