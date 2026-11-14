/**
 * Ordering and screening of sites on the published metrics.
 *
 * - The rank orders sites on one published metric that the user picks.
 * - The Pareto set uses the four criteria declared in the dataset
 *   (comparisons/*.json, "team_default_hackathon") and gives the same set.
 * - The requirement check compares published metrics with limits the user sets.
 * None of this is a feasibility verdict: visibility is not power or a radio link.
 */
import { PARETO_CRITERIA, type MetricKey, type SiteMetrics } from "./metrics";

/** What the mission cares about most. Each maps to one published metric. */
export type Criterion = "balanced" | "power" | "comms";

export const CRITERION_METRIC: Record<Criterion, MetricKey> = {
  balanced: "bothShare", // Sun and Earth visible at the same time
  power: "sunShare",
  comms: "earthShare",
};

export interface Ranked {
  metrics: SiteMetrics;
  /** 1 = best. Equal values share a rank. Null when the metric was not published. */
  rank: number | null;
}

/** Best first. Sites without the metric come last, unranked. */
export function rankSites(rows: SiteMetrics[], criterion: Criterion): Ranked[] {
  const key = CRITERION_METRIC[criterion];
  const known = rows.filter((r) => r[key] !== null).sort((a, b) => b[key]! - a[key]! || a.siteId.localeCompare(b.siteId));
  const ranked: Ranked[] = [];
  known.forEach((metrics, i) => {
    const prev = ranked[i - 1];
    const rank = prev && prev.metrics[key] === metrics[key] ? prev.rank : i + 1;
    ranked.push({ metrics, rank });
  });
  for (const metrics of rows) if (metrics[key] === null) ranked.push({ metrics, rank: null });
  return ranked;
}

/**
 * Scenario ids that no other scenario beats on every criterion at once.
 * Same rule as the dataset (lunar_data/compare.py): a scenario that cannot be
 * compared (missing or partial metric) is never beaten, so it stays in the set.
 */
export function paretoFront(rows: SiteMetrics[]): Set<string> {
  const dominates = (a: SiteMetrics, b: SiteMetrics): boolean => {
    if (!a.comparable || !b.comparable || a.darkGapCut !== b.darkGapCut) return false;
    let better = false;
    for (const c of PARETO_CRITERIA) {
      const d = (a[c.key]! - b[c.key]!) * c.sign;
      if (d < 0) return false;
      if (d > 0) better = true;
    }
    return better;
  };
  return new Set(rows.filter((r) => !rows.some((o) => o !== r && dominates(o, r))).map((r) => r.scenarioId));
}

/** Limits the user sets. Null turns a limit off. Shares are 0..1, the gap is in hours. */
export interface Requirements {
  minSunShare: number | null;
  minEarthShare: number | null;
  maxDarkH: number | null;
}

export type RequirementKey = keyof Requirements;

export interface RequirementResult {
  key: RequirementKey;
  metric: MetricKey;
  limit: number;
  value: number | null;
  /** Null when the metric was not published: the check cannot be made. */
  ok: boolean | null;
}

const REQUIREMENT_METRIC: Record<RequirementKey, MetricKey> = {
  minSunShare: "sunShare",
  minEarthShare: "earthShare",
  maxDarkH: "sunGapH",
};

/** One result per active limit. */
export function checkRequirements(metrics: SiteMetrics, requirements: Requirements): RequirementResult[] {
  const results: RequirementResult[] = [];
  for (const key of Object.keys(REQUIREMENT_METRIC) as RequirementKey[]) {
    const limit = requirements[key];
    if (limit === null) continue;
    const metric = REQUIREMENT_METRIC[key];
    const value = metrics[metric];
    const ok = value === null ? null : key === "maxDarkH" ? value <= limit : value >= limit;
    results.push({ key, metric, limit, value, ok });
  }
  return results;
}

export type Verdict = "pass" | "fail" | "unknown" | "none";

/** "none" = no limit is active. "unknown" = a needed metric is missing and nothing fails. */
export function verdict(results: RequirementResult[]): Verdict {
  if (results.length === 0) return "none";
  if (results.some((r) => r.ok === false)) return "fail";
  return results.some((r) => r.ok === null) ? "unknown" : "pass";
}
