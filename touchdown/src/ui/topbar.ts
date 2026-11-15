import type { Actions, Store } from "../state";
import { h } from "./dom";
import { LANG, switchLang, T } from "./strings";

/**
 * Top bar: the three tabs of the tool (the Moon, evaluate the sites, explore
 * the mission) and the language. Always in view.
 */
export function createTopBar(store: Store, actions: Actions): HTMLElement {
  const tab = (label: string): HTMLButtonElement => h("button", { class: "nav-button", type: "button", text: label });
  const home = tab(T.navHome);
  const evaluate = tab(T.navEvaluate);
  const explore = tab(T.navExplore);
  home.addEventListener("click", () => actions.home());
  evaluate.addEventListener("click", () => actions.setCompare(true));
  explore.addEventListener("click", () => actions.startTour());

  const lang = h("button", { class: "panel-toggle lang", type: "button", "aria-label": T.otherLangLabel, title: T.otherLangLabel, text: T.otherLang });
  lang.addEventListener("click", () => switchLang(LANG === "fr" ? "en" : "fr"));

  const paint = (): void => {
    const s = store.get();
    const set = (b: HTMLButtonElement, on: boolean): void => {
      b.classList.toggle("is-current", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    };
    set(home, !s.compareOpen && !s.touring);
    set(evaluate, s.compareOpen);
    set(explore, s.touring && !s.compareOpen);
  };
  store.subscribe((s, p) => {
    if (s.compareOpen !== p.compareOpen || s.touring !== p.touring) paint();
  });
  paint();

  return h(
    "header",
    { class: "panel topbar" },
    h("div", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }), h("div", null, h("b", { text: T.brand }), h("small", { text: T.tagline }))),
    h("nav", { class: "topnav", "aria-label": T.brand }, home, evaluate, explore),
    h("div", { class: "toptools" }, lang),
  );
}
