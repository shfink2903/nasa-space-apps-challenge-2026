import type { Site } from "./data/dataset";
import type { Phase } from "./flight/timeline";
import type { Locale } from "./i18n";
import type { Criterion, Requirements } from "./planner/ranking";

export type Tab = "explorer" | "data";
/** "polar": the five south-pole sites with the terrain model. "all": every site with the geometric model. */
export type Scope = "polar" | "all";

export interface AppState {
  locale: Locale;
  tab: Tab;
  sites: Site[];
  dates: string[];
  /** Start of the 30-day period, YYYYMMDD. */
  date: string;
  /** Observer height above the ground: 2 m (lander deck) or 10 m (mast). */
  heightM: number;
  scope: Scope;
  criterion: Criterion;
  requirements: Requirements;
  /** The site everything is shown for. There is always one. */
  focusId: string;
  /** Sites shown side by side, 3 at most. */
  compareIds: string[];
  hoverId: string | null;
  /** Fractional index in the display series (600 s steps). */
  index: number;
  playing: boolean;
  /** Dataset hours per real second while playing. */
  speedH: number;
  phase: Phase;
  /** When true, a click on a site starts the cinematic flight at once. */
  autoFlight: boolean;
  assistantOpen: boolean;
  guideOpen: boolean;
  /** Goes up each time data arrives from the network, so views draw again. */
  dataVersion: number;
}

export type Listener = (state: AppState, prev: AppState) => void;

export interface Store {
  get(): AppState;
  set(patch: Partial<AppState>): void;
  subscribe(listener: Listener): () => void;
}

export function createStore(initial: AppState): Store {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      for (const l of [...listeners]) l(state, prev);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** What the interface can ask the app to do. */
export interface Actions {
  setLocale(locale: Locale): void;
  setTab(tab: Tab): void;
  /** Shows a site: camera, numbers and charts. No flight unless "fly on click" is on. */
  selectSite(id: string): void;
  hover(id: string | null): void;
  toggleCompare(id: string): void;
  setDate(date: string): void;
  shiftDate(weeks: number): void;
  setHeight(heightM: number): void;
  setScope(scope: Scope): void;
  setCriterion(criterion: Criterion): void;
  setRequirements(patch: Partial<Requirements>): void;
  setIndex(index: number): void;
  /** Moves the time to a UTC instant inside the period. */
  setTime(tMs: number): void;
  togglePlay(): void;
  setSpeed(hoursPerSecond: number): void;
  setAutoFlight(on: boolean): void;
  /** Starts the cinematic landing on the selected site, if the Sun is visible there. */
  land(): void;
  jumpToSunrise(): void;
  skip(): void;
  /** From the ground back to the site view. */
  back(): void;
  /** Zooms out to the whole south pole. */
  overview(): void;
  setAssistant(open: boolean): void;
  setGuide(open: boolean): void;
}
