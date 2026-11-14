/**
 * Orders the sites by one published metric, chosen by the user.
 *
 * This is a sort, not a score: no weight and no threshold is invented (data.md
 * §10.2). "Non-dominated" is read from the comparison files of the dataset; it
 * is never recomputed here. A missing value is never treated as zero.
 */
import { bestModel, pickScenarioId, sweepFor, type Derived, type ScenarioKey, type Site } from "./dataset";

export interface Criterion {
  id: string;
  metricId: string;
  /** "max": a higher value comes first. "min": a lower value comes first. */
  direction: "max" | "min";
  kind: "fraction" | "hours";
}

/** The first one is the team default (origin: team_default_hackathon). The user can change it. */
export const CRITERIA: Criterion[] = [
  { id: "overlap", metricId: "overlap.sunAny_earthAny.fraction", direction: "max", kind: "fraction" },
  { id: "sun", metricId: "sun.anyDisk.fraction", direction: "max", kind: "fraction" },
  { id: "earth", metricId: "earth.anyDisk.fraction", direction: "max", kind: "fraction" },
  { id: "night", metricId: "sun.anyDisk.longestGapH", direction: "min", kind: "hours" },
  { id: "blackout", metricId: "earth.anyDisk.longestGapH", direction: "min", kind: "hours" },
];

export const criterionById = (id: string): Criterion => CRITERIA.find((c) => c.id === id) ?? CRITERIA[0];

export interface RankRow {
  site: Site;
  model: ScenarioKey["model"];
  scenarioId: string | null;
  /** Published 30-day metrics for the chosen start date, by metric id. */
  values: Record<string, number | null>;
  /** Value of the chosen criterion. */
  value: number | null;
  /** 1 = first. Equal values share a rank. Null when the value is unknown. */
  rank: number | null;
  /** In the non-dominated set published by DATA for this date and model level. */
  nonDominated: boolean;
}

export function rankSites(sites: Site[], derived: Derived, date: string, heightM: number, criterion: Criterion): RankRow[] {
  const rows: RankRow[] = sites.map((site) => {
    const model = bestModel(site);
    const sweep = sweepFor(derived, site, heightM, model);
    const i = sweep ? sweep.dates.indexOf(date) : -1;
    const values: Record<string, number | null> = {};
    for (const id of derived.metricIds) values[id] = i < 0 ? null : (sweep!.values[id]?.[i] ?? null);
    const scenarioId = pickScenarioId(site, date, heightM, model);
    const comparison = derived.comparisons[`${date}|${model}`];
    return {
      site,
      model,
      scenarioId,
      values,
      value: values[criterion.metricId] ?? null,
      rank: null,
      nonDominated: scenarioId !== null && comparison !== undefined && comparison.nonDominated.includes(scenarioId),
    };
  });

  const sign = criterion.direction === "max" ? -1 : 1;
  rows.sort((a, b) => {
    if (a.value === null || b.value === null) return a.value === b.value ? 0 : a.value === null ? 1 : -1;
    return a.value === b.value ? 0 : sign * (a.value - b.value);
  });
  rows.forEach((row, i) => {
    if (row.value === null) return;
    const prev = rows[i - 1];
    row.rank = prev && prev.value === row.value ? prev.rank : i + 1;
  });
  return rows;
}
