import type { HorizonProfile, Scenario, Series, Site } from "./data/dataset";
import type { Phase } from "./flight/timeline";

export interface AppState {
  sites: Site[];
  dates: string[];
  /** Analysis start date, YYYYMMDD. */
  date: string;
  /** Selected site: the one shown in the site sheet, flown to or stood on. Null while cruising. */
  siteId: string | null;
  /** Observer height above the ground, in metres. The dataset publishes 2 and 10. */
  heightM: number;
  /** Id of the criterion that orders the site list (see data/ranking.ts). */
  rankBy: string;
  compareOpen: boolean;
  hoverId: string | null;
  /** Fractional index in the display series (600 s steps). */
  index: number;
  playing: boolean;
  /** Dataset hours per real second while playing. */
  speedH: number;
  phase: Phase;
  /** Series that drives Sun and Earth. It belongs to `lightSiteId`. */
  series: Series | null;
  scenario: Scenario | null;
  /** Terrain horizon of the scenario, when the dataset has one. */
  horizon: HorizonProfile | null;
  lightSiteId: string | null;
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
      for (const l of listeners) l(state, prev);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** What the interface can ask the app to do. */
export interface Actions {
  selectSite(id: string): void;
  hover(id: string | null): void;
  /** Starts the illustrative flight to the selected site. Does nothing when the Sun is not visible there. */
  land(): void;
  setDate(date: string): void;
  setHeight(heightM: number): void;
  setRankBy(id: string): void;
  setCompare(open: boolean): void;
  /** Moves the time cursor to a UTC time inside the loaded 30 days. */
  jumpTo(tMs: number): void;
  setIndex(index: number): void;
  togglePlay(): void;
  setSpeed(hoursPerSecond: number): void;
  skip(): void;
  back(): void;
}
