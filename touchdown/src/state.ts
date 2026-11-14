import type { Scenario, Series, Site } from "./data/dataset";
import type { Phase } from "./flight/timeline";

export interface AppState {
  sites: Site[];
  dates: string[];
  /** Analysis start date, YYYYMMDD. */
  date: string;
  /** Site the ship flies to or stands on. Null while cruising. */
  siteId: string | null;
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
  setDate(date: string): void;
  setIndex(index: number): void;
  togglePlay(): void;
  setSpeed(hoursPerSecond: number): void;
  skip(): void;
  back(): void;
}
