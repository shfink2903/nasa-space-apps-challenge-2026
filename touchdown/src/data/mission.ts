/**
 * Mission criteria and the go / no-go answer.
 *
 * The thresholds are the user's: the tool never decides what a mission needs
 * (data.md R2, §10.1). The starting values are a team default, shown as an
 * assumption and meant to be changed. A verdict only says whether the
 * published 30-day values meet these thresholds. It is not a mission
 * validation: power, thermal balance, radio link and landing safety are not
 * modelled.
 */
import { sweepFor, type Derived, type Site } from "./dataset";

export interface Criteria {
  /** Smallest share of the 30 days with the Sun visible (0..1). */
  minSun: number;
  /** Smallest share of the 30 days with the Earth visible (0..1). */
  minEarth: number;
  /** Longest night accepted, in hours. Null: no limit. */
  maxNightH: number | null;
}

/** Team default (origin: team_default_hackathon). An assumption, not a mission requirement. */
export const DEFAULT_CRITERIA: Criteria = { minSun: 0.4, minEarth: 0.5, maxNightH: null };

export type Failure = "sun" | "earth" | "night";

export interface Verdict {
  /** "unknown": a needed value is not published or not computed yet. It is never read as a pass. */
  status: "go" | "nogo" | "unknown";
  failed: Failure[];
}

export const SUN = "sun.anyDisk.fraction";
export const EARTH = "earth.anyDisk.fraction";
export const NIGHT = "sun.anyDisk.longestGapH";
export const BOTH = "overlap.sunAny_earthAny.fraction";

export function evaluate(values: Record<string, number | null | undefined>, c: Criteria): Verdict {
  const sun = values[SUN] ?? null;
  const earth = values[EARTH] ?? null;
  const night = values[NIGHT] ?? null;
  const failed: Failure[] = [];
  if (sun !== null && sun < c.minSun) failed.push("sun");
  if (earth !== null && earth < c.minEarth) failed.push("earth");
  if (c.maxNightH !== null && night !== null && night > c.maxNightH) failed.push("night");
  if (failed.length > 0) return { status: "nogo", failed };
  const missing = sun === null || earth === null || (c.maxNightH !== null && night === null);
  return { status: missing ? "unknown" : "go", failed };
}

/** Published 30-day values of a site for one weekly start. Empty when the date is not in the dataset. */
export function valuesAt(derived: Derived, site: Site, heightM: number, date: string): Record<string, number | null> {
  const sweep = sweepFor(derived, site, heightM);
  const i = sweep ? sweep.dates.indexOf(date) : -1;
  const out: Record<string, number | null> = {};
  if (!sweep || i < 0) return out;
  for (const id of Object.keys(sweep.values)) out[id] = sweep.values[id][i] ?? null;
  return out;
}

export const verdictAt = (derived: Derived, site: Site, heightM: number, date: string, c: Criteria): Verdict =>
  evaluate(valuesAt(derived, site, heightM, date), c);

/** Date `weeks` weekly starts after `date`. Null when it leaves the explored year. */
export function shiftDate(dates: string[], date: string, weeks: number): string | null {
  const i = dates.indexOf(date);
  return i < 0 ? null : (dates[i + weeks] ?? null);
}

/** First weekly start, from `fromDate` on, where the site meets the criteria. Null: none in the explored year. */
export function nextGoDate(derived: Derived, site: Site, heightM: number, fromDate: string, c: Criteria): string | null {
  const sweep = sweepFor(derived, site, heightM);
  if (!sweep) return null;
  const start = sweep.dates.indexOf(fromDate);
  if (start < 0) return null;
  for (let i = start; i < sweep.dates.length; i++) {
    if (verdictAt(derived, site, heightM, sweep.dates[i], c).status === "go") return sweep.dates[i];
  }
  return null;
}

export interface Option {
  site: Site;
  /** Earliest weekly start, from the asked date on, where the site meets the criteria. */
  date: string;
  /** Weekly starts to wait after the asked date. 0: ready on that date. */
  waitWeeks: number;
  values: Record<string, number | null>;
}

/**
 * Sites that meet the criteria soonest from `fromDate` on. Soonest first, then
 * the larger share of time with Sun and Earth together. "Best" here only means
 * best among the explored sites and weekly starts, for these criteria.
 */
export function soonestOptions(derived: Derived, sites: Site[], heightM: number, fromDate: string, c: Criteria): Option[] {
  const out: Option[] = [];
  for (const site of sites) {
    const date = nextGoDate(derived, site, heightM, fromDate, c);
    const sweep = sweepFor(derived, site, heightM);
    if (!date || !sweep) continue;
    out.push({ site, date, waitWeeks: sweep.dates.indexOf(date) - sweep.dates.indexOf(fromDate), values: valuesAt(derived, site, heightM, date) });
  }
  return out.sort((a, b) => a.waitWeeks - b.waitWeeks || (b.values[BOTH] ?? -1) - (a.values[BOTH] ?? -1));
}
