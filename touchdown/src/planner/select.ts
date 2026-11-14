/** Values the views derive from the state and the loaded data. No DOM here. */
import { pickScenarioId, type Model, type Site } from "../data/dataset";
import type { Bundle, Resources } from "../data/resources";
import type { AppState } from "../state";
import { hasModel } from "../data/dataset";
import { groupOf, scopeModel, scopeSites } from "./catalog";
import { readMetrics, type SiteMetrics } from "./metrics";
import { CRITERION_METRIC, paretoFront, rankSites, type Ranked } from "./ranking";

export const siteById = (state: AppState, id: string | null): Site | undefined => state.sites.find((s) => s.id === id);

export const focusSite = (state: AppState): Site => siteById(state, state.focusId) ?? state.sites[0];

/** The model used for a site in the current scope. A site without terrain data falls back to geometric. */
export function modelFor(state: AppState, site: Site): Model {
  const model = scopeModel(state.scope);
  return hasModel(site, model) ? model : "geometric";
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
export function metricsFor(state: AppState, resources: Resources, site: Site, heightM = state.heightM): SiteMetrics | undefined {
  const row = resources.sweep(site.id, heightM, modelFor(state, site))?.rows[dateIndex(state)];
  return row ? readMetrics(site.id, row.scenarioId, row.metrics) : undefined;
}

export interface RankingView {
  /** The candidates (study points), best first for the chosen priority. */
  rows: Ranked[];
  /** Landed missions of the scope, for reference only: they are not ranked. Highest value first. */
  references: SiteMetrics[];
  /** Scenario ids of the dataset's non-dominated set (all sites of the scope, both mast heights). */
  pareto: Set<string>;
  /** False while some sweep files are still on their way. */
  complete: boolean;
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
  const both: SiteMetrics[] = [];
  let complete = true;
  for (const site of sites) {
    for (const heightM of [2, 10]) {
      const m = metricsFor(state, resources, site, heightM);
      if (!m) complete = false;
      else {
        both.push(m);
        if (heightM === state.heightM) (groupOf(site) === "candidate" ? candidates : references).push(m);
      }
    }
  }
  const key = CRITERION_METRIC[state.criterion];
  references.sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1));
  return { rows: rankSites(candidates, state.criterion), references, pareto: complete ? paretoFront(both) : new Set(), complete };
}

/** Candidates in rank order, then the references. */
export const rankedOrder = (view: RankingView): SiteMetrics[] => [...view.rows.map((r) => r.metrics), ...view.references];
