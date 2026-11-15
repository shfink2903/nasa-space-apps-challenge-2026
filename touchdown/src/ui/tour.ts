import { parseScenarioId, type Derived } from "../data/dataset";
import { EARTH, SUN, valuesAt, verdictAt } from "../data/mission";
import { PLAY_SPEED_H, type Actions, type Store } from "../state";
import { landingChoice } from "./caption";
import { h } from "./dom";
import { formatDays, formatShortDate, siteLabel } from "./format";
import { T } from "./strings";
import { verdictPill } from "./verdict";

interface Scene {
  /** Site shown at this step. Null: the whole Moon. */
  site: string | null;
  /** Runs through the weekly dates, so the answer changes on screen. */
  cycle?: boolean;
  /** Flies to the site and lands. */
  land?: boolean;
}

/** What each step shows. The texts are in strings.ts, in the same order. */
const SCENES: Scene[] = [{ site: null }, { site: "sp_s8950" }, { site: "change4" }, { site: "im1", cycle: true }, { site: "chandrayaan3", land: true }, { site: null }];
const CYCLE_MS = 900;

/**
 * "Explore the mission": six steps that drive the real tool (same sites, same
 * data) to show why a landing needs the Sun and the Earth, and why the date
 * matters. It has the screen to itself: no sheet, no time bar.
 */
export function createTour(store: Store, actions: Actions, derived: Derived): { el: HTMLElement; start(): void; stop(): void } {
  let at = -1;
  let timer = 0;
  const kicker = h("small", { class: "kicker" });
  const title = h("h2", { class: "tour-title" });
  const text = h("p", { class: "tour-text" });
  const here = h("b", { class: "tour-here" });
  const pill = h("span");
  const stat = (label: string, kind: string) => {
    const value = h("b");
    const fill = h("i");
    return { value, fill, row: h("div", { class: `tour-stat tour-${kind}` }, h("span", { text: label }), value, h("div", { class: "meter-track" }, fill)) };
  };
  const sun = stat(T.bandSun, "sun");
  const earth = stat(T.bandEarth, "earth");
  const stats = h("div", { class: "tour-stats" }, h("div", { class: "tour-stats-head" }, here, pill), sun.row, earth.row);
  const dots = h("div", { class: "tour-dots", "aria-hidden": "true" }, ...SCENES.map(() => h("i")));
  const prev = h("button", { class: "button button-big", type: "button", text: T.tourPrev });
  const next = h("button", { class: "button button-primary button-big", type: "button" });
  const quit = h("button", { class: "button button-small", type: "button", text: T.tourQuit });
  const el = h(
    "section",
    { class: "panel tour", "aria-live": "polite", hidden: true },
    h("header", { class: "panel-head" }, kicker, quit),
    title,
    text,
    stats,
    h("div", { class: "tour-foot" }, dots, h("div", { class: "tour-actions" }, prev, next)),
  );

  /** The two numbers of the site on screen, for the date on screen. */
  const paintStats = (): void => {
    const scene = SCENES[at];
    const s = store.get();
    const site = scene?.site ? s.sites.find((x) => x.id === scene.site) : undefined;
    stats.hidden = !site || scene?.land === true;
    if (!site) return;
    const values = valuesAt(derived, site, s.heightM, s.date);
    here.textContent = T.tourHere(siteLabel(site).title, formatShortDate(s.date));
    pill.replaceChildren(verdictPill(verdictAt(derived, site, s.heightM, s.date, s.criteria), true));
    for (const [row, v] of [
      [sun, values[SUN] ?? null],
      [earth, values[EARTH] ?? null],
    ] as const) {
      row.value.textContent = v === null ? "—" : formatDays(v);
      row.fill.style.width = `${(v ?? 0) * 100}%`;
    }
  };

  const clear = (): void => {
    window.clearInterval(timer);
    timer = 0;
  };
  const setPlaying = (on: boolean): void => {
    if (store.get().playing !== on) actions.togglePlay();
  };

  const show = (index: number): void => {
    clear();
    at = index;
    const scene = SCENES[index];
    const last = index === SCENES.length - 1;
    kicker.textContent = T.tourKicker(index + 1, SCENES.length);
    title.textContent = T.tourSteps[index].title;
    text.textContent = T.tourSteps[index].text;
    prev.disabled = index === 0;
    next.textContent = last ? T.tourEnd : T.tourNext;
    [...dots.children].forEach((dot, i) => dot.classList.toggle("is-on", i <= index));

    if (!scene.site) {
      // The whole Moon, with time running fast: day and night sweep across it.
      actions.overview();
      actions.setSpeed(24);
      setPlaying(true);
    } else {
      setPlaying(false);
      actions.selectSite(scene.site);
    }
    if (scene.cycle) {
      timer = window.setInterval(() => {
        const s = store.get();
        actions.setDate(s.dates[(s.dates.indexOf(s.date) + 1) % s.dates.length]);
      }, CYCLE_MS);
    }
    if (scene.land) {
      // Wait for the site's 30 days, go to daylight if needed, then start the flight.
      timer = window.setInterval(() => {
        const s = store.get();
        if (s.siteId !== scene.site || s.phase !== "focus" || !s.scenario || parseScenarioId(s.scenario.scenarioId)?.date !== s.date) return;
        const choice = landingChoice(s, derived);
        if (!choice) return;
        if (choice.kind === "sunrise" && choice.riseMs !== null) return actions.jumpTo(choice.riseMs + 600_000);
        clear();
        if (choice.kind === "land") actions.land();
      }, 400);
    }
    paintStats();
  };

  const stop = (): void => {
    if (at < 0) return;
    clear();
    at = -1;
    el.hidden = true;
    setPlaying(false);
    actions.setSpeed(PLAY_SPEED_H);
    store.set({ touring: false });
    actions.overview();
  };

  prev.addEventListener("click", () => show(Math.max(0, at - 1)));
  next.addEventListener("click", () => {
    if (at < SCENES.length - 1) return show(at + 1);
    stop();
    actions.setCompare(true, "date");
  });
  quit.addEventListener("click", stop);
  store.subscribe((s, p) => {
    if (at >= 0 && (s.date !== p.date || s.customTick !== p.customTick || s.criteria !== p.criteria || s.sites !== p.sites)) paintStats();
  });
  return {
    el,
    start() {
      if (at >= 0) return;
      store.set({ touring: true });
      el.hidden = false;
      show(0);
    },
    stop,
  };
}
