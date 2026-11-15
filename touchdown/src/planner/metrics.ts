/**
 * The published metrics the planner shows, read from dataset rows.
 * Nothing here computes a new physical quantity: values are copied as they are.
 */
import type { Metric } from "../data/dataset";

export const METRIC_IDS = {
  sunShare: "sun.anyDisk.fraction",
  sunFullShare: "sun.fullDisk.fraction",
  sunGapH: "sun.anyDisk.longestGapH",
  sunMaxElDeg: "sun.maxElevDeg",
  sunMeanElDeg: "sun.meanElevWhenAnyDiskDeg",
  earthShare: "earth.anyDisk.fraction",
  earthGapH: "earth.anyDisk.longestGapH",
  earthMaxElDeg: "earth.maxElevDeg",
  bothShare: "overlap.sunAny_earthAny.fraction",
} as const;

export type MetricKey = keyof typeof METRIC_IDS;

/** One site on one date: the metrics of its 30-day scenario. A null value was not published. */
export type SiteMetrics = {
  siteId: string;
  scenarioId: string;
  /**
   * False when one of the four comparison criteria is missing or of partial
   * quality. The dataset then does not compare this scenario with the others.
   */
  comparable: boolean;
  /** Which edges of the period cut the longest dark gap. Gaps cut in different ways are not compared. */
  darkGapCut: string;
  /**
   * True when the longest gap touches an edge of the 30-day period (or missing data):
   * the published value is then only a lower bound, the real gap can be longer.
   */
  sunGapAtLeast: boolean;
  earthGapAtLeast: boolean;
} & Record<MetricKey, number | null>;

/** The criteria of the dataset comparisons (comparisons/*.json, method.criteria). */
export const PARETO_CRITERIA: { key: MetricKey; sign: 1 | -1 }[] = [
  { key: "sunShare", sign: 1 },
  { key: "earthShare", sign: 1 },
  { key: "sunGapH", sign: -1 },
  { key: "bothShare", sign: 1 },
];

export function readMetrics(siteId: string, scenarioId: string, metrics: Metric[]): SiteMetrics {
  const find = (key: MetricKey): Metric | undefined => metrics.find((m) => m.metricId === METRIC_IDS[key]);
  const out = { siteId, scenarioId } as SiteMetrics;
  for (const key of Object.keys(METRIC_IDS) as MetricKey[]) out[key] = find(key)?.value ?? null;
  out.comparable = PARETO_CRITERIA.every(({ key }) => {
    const m = find(key);
    return m !== undefined && m.value !== null && m.quality !== "unknown" && m.quality !== "partial";
  });
  const gap = find("sunGapH");
  out.darkGapCut = [gap?.truncatedStart, gap?.truncatedEnd, gap?.truncatedByMissingData].map((f) => (f ? "1" : "0")).join("");
  const cut = (m: Metric | undefined): boolean => Boolean(m?.truncatedStart || m?.truncatedEnd || m?.truncatedByMissingData);
  out.sunGapAtLeast = cut(gap);
  out.earthGapAtLeast = cut(find("earthGapH"));
  return out;
}

/** True for metrics where a smaller value is better (dark or silent gaps). */
export const LOWER_IS_BETTER: Record<MetricKey, boolean> = {
  sunShare: false,
  sunFullShare: false,
  sunGapH: true,
  sunMaxElDeg: false,
  sunMeanElDeg: false,
  earthShare: false,
  earthGapH: true,
  earthMaxElDeg: false,
  bothShare: false,
};
