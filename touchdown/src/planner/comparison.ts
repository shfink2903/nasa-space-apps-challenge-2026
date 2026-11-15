/** Shared request contract for the deterministic comparison API and the AI context. */
import { pickScenarioId } from "../data/dataset";
import type { AppState, ComparisonSelection } from "../state";
import { scopeModel } from "./catalog";
import { METRIC_IDS } from "./metrics";
import { CRITERION_METRIC, type RequirementResult, type Requirements, type Verdict } from "./ranking";

export interface Constraint { metricId: string; op: ">=" | "<="; value: number; unit: "1" | "h"; origin: "user" }
export interface ComparisonRequest {
  scenarioIds: string[];
  priority: string[];
  constraints: Constraint[];
}
export interface ComparisonResult {
  comparisonId: string;
  scenarioIds: string[];
  method: { priority: string[] | null };
  verdicts: Record<string, { status: "pass" | "fail" | "unknown" | "not_evaluated"; constraints: { constraint: Constraint; status: "pass" | "fail" | "unknown"; value: number | null }[] }>;
  nonDominatedScenarioIds: string[];
  rankByScenarioId: Record<string, number>;
}

export const EMPTY_REQUIREMENTS: Requirements = { minSunShare: null, minEarthShare: null, maxDarkH: null };

const FIELDS = [
  { key: "minSunShare", metric: "sunShare", op: ">=", unit: "1" },
  { key: "minEarthShare", metric: "earthShare", op: ">=", unit: "1" },
  { key: "maxDarkH", metric: "sunGapH", op: "<=", unit: "h" },
] as const;

export function requirementsToConstraints(requirements: Requirements): Constraint[] {
  return FIELDS.flatMap(({ key, metric, op, unit }) => requirements[key] === null ? [] : [{ metricId: METRIC_IDS[metric], op, value: requirements[key]!, unit, origin: "user" as const }]);
}

export function selectionScenarioId(state: AppState, selection: ComparisonSelection): string | null {
  const site = state.sites.find((s) => s.id === selection.siteId);
  return site ? pickScenarioId(site, selection.date, state.heightM, scopeModel(state.scope)) : null;
}

/** Never broadens a missing selection to the whole catalogue. */
export function comparisonRequest(state: AppState): ComparisonRequest | null {
  const selections = state.comparisons.length ? state.comparisons : [{ siteId: state.focusId, date: state.date }];
  if (selections.length > 3) return null;
  const ids = selections.map((s) => selectionScenarioId(state, s));
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) return null;
  return requestForIds(state, ids as string[]);
}

export function requestForIds(state: AppState, scenarioIds: string[]): ComparisonRequest {
  return { scenarioIds, priority: [METRIC_IDS[CRITERION_METRIC[state.criterion]]], constraints: requirementsToConstraints(state.requirements) };
}

export function comparisonVerdict(result: ComparisonResult | undefined, id: string, requirements: Requirements): Verdict {
  const status = result?.verdicts[id]?.status;
  return status === "not_evaluated" ? "none" : status ?? (requirementsToConstraints(requirements).length ? "unknown" : "none");
}

export function comparisonChecks(result: ComparisonResult | undefined, id: string): RequirementResult[] {
  return (result?.verdicts[id]?.constraints ?? []).flatMap((row) => {
    const field = FIELDS.find((f) => METRIC_IDS[f.metric] === row.constraint.metricId);
    return field ? [{ key: field.key, metric: field.metric, limit: row.constraint.value, value: row.value, ok: row.status === "unknown" ? null : row.status === "pass" }] : [];
  });
}

/** Reject a stale or unrelated response before putting verdicts next to data. */
export function assertComparisonResponse(value: unknown, request: ComparisonRequest): asserts value is ComparisonResult {
  const r = value as ComparisonResult | null;
  if (!r || typeof r.comparisonId !== "string" || JSON.stringify(r.scenarioIds) !== JSON.stringify(request.scenarioIds)
    || JSON.stringify(r.method?.priority) !== JSON.stringify(request.priority) || !r.verdicts || !r.rankByScenarioId
    || !Array.isArray(r.nonDominatedScenarioIds) || r.nonDominatedScenarioIds.some((id) => !request.scenarioIds.includes(id))
    || Object.entries(r.rankByScenarioId).some(([id, rank]) => !request.scenarioIds.includes(id) || !Number.isInteger(rank) || rank < 1)) throw new Error("Comparison response does not match the requested scenarios.");
  for (const id of request.scenarioIds) {
    const v = r.verdicts[id];
    if (!v || !["pass", "fail", "unknown", "not_evaluated"].includes(v.status) || !Array.isArray(v.constraints)
      || v.constraints.length !== request.constraints.length || (v.status === "not_evaluated") !== (request.constraints.length === 0)) throw new Error("Comparison verdict is missing.");
    for (const [i, row] of v.constraints.entries()) {
      const expected = request.constraints[i];
      if (!["pass", "fail", "unknown"].includes(row.status) || (row.value !== null && (typeof row.value !== "number" || !Number.isFinite(row.value))) || !row.constraint || Object.keys(expected).some((k) => row.constraint[k as keyof Constraint] !== expected[k as keyof Constraint])) throw new Error("Comparison constraints differ from the request.");
    }
  }
}
