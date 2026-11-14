import type { Actions, Mode, Store } from "../state";
import { h, icon } from "./dom";
import { LANG, switchLang, T } from "./strings";

/** Top-left: three steps. The current step follows the flight phase. */
export function createGuide(store: Store, actions: Actions): HTMLElement {
  const modeButton = (mode: Mode, label: string): HTMLButtonElement => {
    const b = h("button", { class: "seg", type: "button", text: label, title: T.modeHint });
    b.addEventListener("click", () => actions.setMode(mode));
    return b;
  };
  const simple = modeButton("simple", T.modeSimple);
  const expert = modeButton("expert", T.modeExpert);
  const modes = h("div", { class: "segmented segmented-wide mode-switch", role: "group", "aria-label": T.modeLabel }, simple, expert);
  const paintMode = (): void => {
    const { mode } = store.get();
    simple.classList.toggle("is-on", mode === "simple");
    expert.classList.toggle("is-on", mode === "expert");
  };
  paintMode();
  const steps = T.guideSteps.map((step, i) =>
    h(
      "li",
      { class: "guide-step" },
      h("span", { class: "guide-num", text: `0${i + 1}` }),
      h("div", null, h("strong", { text: step.title }), h("p", { text: step.text })),
    ),
  );
  const lang = h("button", { class: "panel-toggle lang", type: "button", "aria-label": T.otherLangLabel, title: T.otherLangLabel, text: T.otherLang });
  lang.addEventListener("click", () => switchLang(LANG === "fr" ? "en" : "fr"));
  const toggle = h("button", { class: "panel-toggle", type: "button", "aria-expanded": "true", "aria-controls": "guide-body" }, icon("chevron"));
  const body = h("ol", { class: "guide-list", id: "guide-body" }, ...steps);
  const panel = h(
    "section",
    { class: "panel guide", "aria-label": T.guideTitle },
    h(
      "header",
      { class: "panel-head" },
      h("div", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }), h("div", null, h("b", { text: T.brand }), h("small", { text: T.tagline }))),
      h("div", { class: "guide-tools" }, lang, toggle),
    ),
    modes,
    h("h2", { class: "panel-title" }, icon("nav"), T.guideTitle),
    body,
  );
  toggle.addEventListener("click", () => setOpen(panel.classList.contains("is-closed")));
  const setOpen = (open: boolean): void => {
    panel.classList.toggle("is-closed", !open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  if (window.matchMedia("(max-width: 860px)").matches) setOpen(false);

  const render = (): void => {
    const { phase } = store.get();
    const current = phase === "cruise" ? 0 : phase === "focus" ? 1 : 3;
    steps.forEach((el, i) => el.classList.toggle("is-current", i === current));
  };
  store.subscribe((s, p) => {
    if (s.mode !== p.mode) paintMode();
    if (s.phase === p.phase) return;
    render();
    // The site sheet needs the room: fold the guide when a site opens.
    if (p.phase === "cruise") setOpen(false);
  });
  render();
  return panel;
}
