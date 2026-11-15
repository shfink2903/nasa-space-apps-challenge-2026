import type { HorizonProfile, Scenario, Series, Site } from "./data/dataset";
import type { Criteria } from "./data/mission";
import type { Region } from "./data/ranking";
import type { Phase } from "./flight/timeline";

export type CompareTab = "date" | "year" | "delay";

export interface AppState {
  /** The user's mission thresholds. They decide the go / no-go answer. */
  criteria: Criteria;
  compareTab: CompareTab;
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
  /** Sites shown in the ranking and the comparison: the south pole (default) or every site. */
  region: Region;
  /** The "Evaluate the sites" page is open (it covers the Moon). */
  compareOpen: boolean;
  /** The "Explore the mission" tour is running. */
  touring: boolean;
  /** Goes up each time a value of the free point is computed, so the panels redraw. */
  customTick: number;
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
  /** Creates (or moves) the free point at these lunar coordinates and opens it. */
  selectPoint(latDeg: number, lonDeg: number): void;
  /** Creates (or moves) the free point without leaving the current page: it joins the tables. */
  addPoint(latDeg: number, lonDeg: number): void;
  /** Back to the home view: the whole Moon, no page, no tour. */
  home(): void;
  hover(id: string | null): void;
  /** Starts the illustrative flight to the selected site. Does nothing when the Sun is not visible there. */
  land(): void;
  setDate(date: string): void;
  setHeight(heightM: number): void;
  setRankBy(id: string): void;
  setRegion(region: Region): void;
  setCompare(open: boolean, tab?: CompareTab): void;
  setCriteria(patch: Partial<Criteria>): void;
  /** Moves to a UTC date and time: picks the weekly start that contains it, then the time inside it. */
  goToTime(tMs: number): void;
  startTour(): void;
  /** From any view to the whole Moon, with no site selected. */
  overview(): void;
  /** Moves the time cursor to a UTC time inside the loaded 30 days. */
  jumpTo(tMs: number): void;
  setIndex(index: number): void;
  togglePlay(): void;
  setSpeed(hoursPerSecond: number): void;
  skip(): void;
  back(): void;
}
