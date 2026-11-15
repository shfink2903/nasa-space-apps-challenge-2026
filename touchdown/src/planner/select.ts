/** Values the views derive from the state and the loaded data. No DOM here. */
import { pickScenarioId, type Model, type Site } from "../data/dataset";
import type { Bundle, Resources } from "../data/resources";
import type { AppState } from "../state";
import { groupOf, scopeModel, scopeSites } from "./catalog";
import { readMetrics, type SiteMetrics } from "./metrics";
import { CRITERION_METRIC, rankSites, type Ranked, type RequirementResult, type Verdict } from "./ranking";
import { comparisonChecks, comparisonRequest, comparisonVerdict, requestForIds, type ComparisonRequest } from "./comparison";

export const siteById = (state: AppState, id: string | null): Site | undefined => state.sites.find((s) => s.id === id);

export const focusSite = (state: AppState): Site => siteById(state, state.focusId) ?? state.sites[0];

/** Missing terrain scenarios remain unavailable; the requested model is never substituted. */
export function modelFor(state: AppState, _site: Site): Model {
  return scopeModel(state.scope);
}

export function scenarioIdFor(state: AppState, site: Site): string | null {
  return pickScenarioId(site, state.date, state.heightM, modelFor(state, site));
}

export function bundleFor(state: AppState, resources: Resources, site: Site): Bundle | undefined {
  const id = scenarioIdFor(state, site);
  return id ? resources.bundle(id) : undefined;
}

/** Index of the chosen start date among the 52 weekly starts. */
export const dateIndex = (state: AppState): number => Math.max(0, state.dates.indexOf(state.date));

/** Published metrics of one site for the chosen date, height and scope model. Undefined while loading. */
export function metricsFor(state: AppState, resources: Resources, site: Site, heightM = state.heightM, date = state.date): SiteMetrics | undefined {
  const id = pickScenarioId(site, date, heightM, modelFor(state, site));
  const row = resources.sweep(site.id, heightM, modelFor(state, site))?.rows.find((r) => r.scenarioId === id);
  return row ? readMetrics(site.id, row.scenarioId, row.metrics) : undefined;
}

export interface RankingView {
  /** The candidates (study points), best first for the chosen priority. */
  rows: Ranked[];
  /** Landed missions of the scope, for reference only: they are not ranked. Highest value first. */
  references: SiteMetrics[];
  /** Server-computed non-dominated scenarios of this scope at the chosen height and date. */
  pareto: Set<string>;
  /** False while some sweep files are still on their way. */
  complete: boolean;
  verdicts: Record<string, Verdict>;
  checks: Record<string, RequirementResult[]>;
  evaluationStatus: "loading" | "available" | "unavailable";
}

/**
 * The planner looks for sites for future missions, so only the candidates are
 * ranked. Sites where a mission already landed are kept beside them as known
 * reference points.
 */
export function rankingFor(state: AppState, resources: Resources): RankingView {
  const sites = scopeSites(state.sites, state.scope);
  const candidates: SiteMetrics[] = [];
  const references: SiteMetrics[] = [];
  let complete = true;
  for (const site of sites) {
    const m = metricsFor(state, resources, site);
    if (!m) complete = false;
    else (groupOf(site) === "candidate" ? candidates : references).push(m);
  }
  const key = CRITERION_METRIC[state.criterion];
  references.sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1));
  const all = [...candidates, ...references];
  const request = all.length && complete ? requestForIds(state, all.map((m) => m.scenarioId)) : null;
  const evaluation = evaluateSelection(state, resources, request, all);
  const candidateRequest = complete && candidates.length ? requestForIds(state, candidates.map((m) => m.scenarioId)) : null;
  const candidateResult = candidateRequest ? resources.comparison(candidateRequest) : undefined;
  const candidateStatus = candidateResult || !candidates.length ? "available" : candidateRequest && resources.comparisonFailed(candidateRequest) ? "unavailable" : "loading";
  const evaluationStatus = evaluation.evaluationStatus === "unavailable" || candidateStatus === "unavailable" ? "unavailable" : evaluation.evaluationStatus === "available" && candidateStatus === "available" ? "available" : "loading";
  const rows = rankSites(candidates, state.criterion).map((r) => ({ ...r, rank: candidateResult?.rankByScenarioId[r.metrics.scenarioId] ?? null }));
  if (candidateResult) rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  return { rows, references, complete, ...evaluation, evaluationStatus };
}

function evaluateSelection(state: AppState, resources: Resources, request: ComparisonRequest | null, metrics: SiteMetrics[]) {
  const result = request ? resources.comparison(request) : undefined;
  const evaluationStatus = result ? "available" as const : request && resources.comparisonFailed(request) ? "unavailable" as const : "loading" as const;
  return {
    evaluationStatus,
    pareto: new Set(result?.nonDominatedScenarioIds ?? []),
    ranks: result?.rankByScenarioId ?? {},
    verdicts: Object.fromEntries(metrics.map((m) => [m.scenarioId, comparisonVerdict(result, m.scenarioId, state.requirements)])),
    checks: Object.fromEntries(metrics.map((m) => [m.scenarioId, comparisonChecks(result, m.scenarioId)])),
  };
}

/** The side-by-side view evaluates only its explicit site/date pairs. */
export function selectedComparisonFor(state: AppState, resources: Resources) {
  const request = comparisonRequest(state);
  const rows = state.comparisons.map((selection) => {
    const site = siteById(state, selection.siteId);
    return site ? metricsFor(state, resources, site, state.heightM, selection.date) : undefined;
  });
  const metrics = rows.filter((m): m is SiteMetrics => m !== undefined);
  return { request, metrics, complete: rows.length === metrics.length, ...evaluateSelection(state, resources, request, metrics) };
}

/** Candidates in rank order, then the references. */
export const rankedOrder = (view: RankingView): SiteMetrics[] => [...view.rows.map((r) => r.metrics), ...view.references];
