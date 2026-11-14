import type { Actions, Store } from "../state";
import { h, icon } from "./dom";
import { T } from "./strings";

/** What each step shows. The texts are in strings.ts, in the same order. */
const SCENES: ((actions: Actions, store: Store) => void)[] = [
  (actions) => {
    actions.setRegion("all");
    actions.selectSite("apollo11");
    // Start late in the night: the Sun rises within seconds, then two weeks of light follow.
    actions.setIndex(12 * 144);
    actions.setSpeed(24);
  },
  (actions) => actions.selectSite("apollo11"),
  (actions) => actions.selectSite("change4"),
  (actions) => actions.selectSite("sp_s8950"),
  (actions) => {
    actions.selectSite("sp_s8600");
    // The 1 km grids are lower in the sheet: bring them into view once the sheet is drawn.
    window.setTimeout(() => document.querySelector(".sens-block")?.scrollIntoView({ behavior: "smooth", block: "center" }), 900);
  },
  (actions) => actions.setRegion("south"),
];

/**
 * Guided tour for classrooms and first visits: six steps that drive the real
 * tool (same sites, same data) to show why the Moon, and its south pole, are
 * hard places to light and to talk to.
 */
export function createTour(store: Store, actions: Actions): { el: HTMLElement; start(): void } {
  let at = -1;
  const kicker = h("small", { class: "kicker" });
  const title = h("h2", { class: "tour-title" });
  const text = h("p", { class: "tour-text" });
  const dots = h("div", { class: "tour-dots", "aria-hidden": "true" }, ...SCENES.map(() => h("i")));
  const prev = h("button", { class: "button", type: "button", text: T.tourPrev });
  const next = h("button", { class: "button button-primary", type: "button" });
  const close = h("button", { class: "panel-toggle", type: "button", "aria-label": T.closeLabel }, icon("close"));
  const el = h(
    "section",
    { class: "panel tour", "aria-live": "polite", hidden: true },
    h("header", { class: "panel-head" }, kicker, close),
    title,
    text,
    h("div", { class: "tour-foot" }, dots, h("div", { class: "tour-actions" }, prev, next)),
  );

  const show = (index: number): void => {
    at = index;
    el.hidden = index < 0;
    document.body.classList.toggle("is-touring", index >= 0);
    if (index < 0) return;
    const last = index === SCENES.length - 1;
    kicker.textContent = T.tourKicker(index + 1, SCENES.length);
    title.textContent = T.tourSteps[index].title;
    text.textContent = T.tourSteps[index].text;
    prev.disabled = index === 0;
    next.replaceChildren(last ? icon("table") : icon("right"), last ? T.tourEnd : T.tourNext);
    [...dots.children].forEach((dot, i) => dot.classList.toggle("is-on", i <= index));
    SCENES[index](actions, store);
    // Time runs during the tour, so day, night and the link bands move by themselves.
    if (!store.get().playing) actions.togglePlay();
  };
  const end = (): void => {
    if (store.get().playing) actions.togglePlay();
    show(-1);
  };

  prev.addEventListener("click", () => show(Math.max(0, at - 1)));
  next.addEventListener("click", () => {
    if (at < SCENES.length - 1) return show(at + 1);
    end();
    actions.setCompare(true);
  });
  close.addEventListener("click", end);
  return { el, start: () => show(0) };
}
