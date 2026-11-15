import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { availableDates, type Site, type Sweep } from "../src/data/dataset";
import { Resources } from "../src/data/resources";
import { assertComparisonResponse, comparisonRequest, EMPTY_REQUIREMENTS, requirementsToConstraints, type ComparisonRequest, type ComparisonResult } from "../src/planner/comparison";
import { metricsFor, rankingFor, selectedComparisonFor } from "../src/planner/select";
import type { AppState } from "../src/state";

const DATA = resolve(__dirname, "../../data/processed/v1");
const json = <T>(path: string): T => JSON.parse(readFileSync(resolve(DATA, path), "utf8")) as T;
const sites = json<{ sites: Site[] }>("sites.json").sites;
const state = (patch: Partial<AppState> = {}): AppState => ({
  locale: "fr", tab: "data", sites, dates: availableDates(sites[0]), date: "20261201", heightM: 2,
  scope: "polar", criterion: "balanced", requirements: { ...EMPTY_REQUIREMENTS }, focusId: "sp_s8600",
  comparisons: [], sceneStatus: "unavailable", hoverId: null, index: 0, playing: false, speedH: 6,
  phase: "cruise", autoFlight: false, assistantOpen: false, guideOpen: false, dataVersion: 0, ...patch,
});

const response = (request: ComparisonRequest): ComparisonResult => ({
  comparisonId: "test-comparison", scenarioIds: request.scenarioIds, method: { priority: request.priority },
  verdicts: Object.fromEntries(request.scenarioIds.map((id) => [id, {
    status: request.constraints.length ? "unknown" : "not_evaluated",
    constraints: request.constraints.map((constraint) => ({ constraint, status: "unknown", value: null })),
  }])),
  rankByScenarioId: {}, nonDominatedScenarioIds: [],
});

afterEach(() => vi.unstubAllGlobals());

describe("comparison request", () => {
  it("has no invented mission requirements and falls back to the focused scenario only", () => {
    expect(requirementsToConstraints(EMPTY_REQUIREMENTS)).toEqual([]);
    const request = comparisonRequest(state())!;
    expect(request.scenarioIds).toHaveLength(1);
    expect(request.scenarioIds[0]).toContain("sp_s8600_20261201_30d_h2m_lola_");
    expect(request.constraints).toEqual([]);
  });

  it("preserves two selected dates of the same site, common mast/model and explicit thresholds", () => {
    const request = comparisonRequest(state({
      comparisons: [{ siteId: "sp_s8600", date: "20270713" }, { siteId: "sp_s8600", date: "20261201" }],
      requirements: { minSunShare: .25, minEarthShare: null, maxDarkH: 360 }, criterion: "power", heightM: 10,
    }))!;
    expect(request.scenarioIds[0]).toContain("sp_s8600_20270713_30d_h10m_lola_");
    expect(request.scenarioIds[1]).toContain("sp_s8600_20261201_30d_h10m_lola_");
    expect(request.priority).toEqual(["sun.anyDisk.fraction"]);
    expect(request.constraints).toEqual([
      { metricId: "sun.anyDisk.fraction", op: ">=", value: .25, unit: "1", origin: "user" },
      { metricId: "sun.anyDisk.longestGapH", op: "<=", value: 360, unit: "h", origin: "user" },
    ]);
  });

  it("does not substitute another date or silently duplicate a scenario", () => {
    expect(comparisonRequest(state({ comparisons: [{ siteId: "sp_s8600", date: "20261202" }] }))).toBeNull();
    expect(comparisonRequest(state({ comparisons: [{ siteId: "sp_s8600", date: "20261201" }, { siteId: "sp_s8600", date: "20261201" }] }))).toBeNull();
  });

  it("reads the selected date by scenario identity, even if sweep rows are reordered", () => {
    const s = state({ date: "20270713" });
    const sweep = json<Sweep>("sweeps/sp_s8600_h2m_lola_dates.json");
    const resources = { sweep: () => ({ ...sweep, rows: [...sweep.rows].reverse() }) } as unknown as Resources;
    expect(metricsFor(s, resources, sites.find((site) => site.id === s.focusId)!)?.scenarioId).toContain("20270713");
  });
});

describe("comparison API evidence", () => {
  it("rejects stale dates, priority and constraints", () => {
    const request = comparisonRequest(state({ requirements: { minSunShare: .25, minEarthShare: null, maxDarkH: null } }))!;
    expect(() => assertComparisonResponse(response(request), request)).not.toThrow();
    expect(() => assertComparisonResponse({ ...response(request), scenarioIds: ["stale"] }, request)).toThrow();
    expect(() => assertComparisonResponse({ ...response(request), method: { priority: ["earth.anyDisk.fraction"] } }, request)).toThrow();
    const wrong = response(request);
    wrong.verdicts[request.scenarioIds[0]].constraints[0].constraint = { ...request.constraints[0], value: .75 };
    expect(() => assertComparisonResponse(wrong, request)).toThrow();
  });

  it("keeps comparisons unavailable and active compliance unknown without the API", () => {
    const s = state({ comparisons: [{ siteId: "sp_s8600", date: "20270713" }], requirements: { minSunShare: .25, minEarthShare: .25, maxDarkH: 360 } });
    const resources = {
      sweep: () => json<Sweep>("sweeps/sp_s8600_h2m_lola_dates.json"),
      comparison: () => undefined, comparisonFailed: () => true,
    } as unknown as Resources;
    const result = selectedComparisonFor(s, resources);
    expect(result.evaluationStatus).toBe("unavailable");
    expect(result.metrics[0].sunShare).toBeCloseTo(.4001924189814815);
    expect(Object.values(result.verdicts)).toEqual(["unknown"]);
    expect(result.pareto.size).toBe(0);
    expect(result.ranks).toEqual({});
  });

  it("does not call the catalogue ranking verified while its candidate comparison is pending or failed", () => {
    const s = state();
    let failed = false;
    const resources = {
      sweep: (id: string, height: number, model: string) => json<Sweep>(`sweeps/${id}_h${height}m_${model}_dates.json`),
      comparison: (request: ComparisonRequest) => request.scenarioIds.length === 5 ? response(request) : undefined,
      comparisonFailed: () => failed,
    } as unknown as Resources;
    const pending = rankingFor(s, resources);
    expect(pending.complete).toBe(true);
    expect(pending.evaluationStatus).toBe("loading");
    expect(pending.rows.every((r) => r.rank === null)).toBe(true);
    failed = true;
    const unavailable = rankingFor(s, resources);
    expect(unavailable.evaluationStatus).toBe("unavailable");
    expect(unavailable.rows.every((r) => r.rank === null)).toBe(true);
  });

  it("cannot attach a slower previous response to a newer selection", async () => {
    const pending = new Map<string, (value: Response) => void>();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve) => pending.set(init.body as string, resolve))));
    const resources = new Resources(() => {});
    const first = comparisonRequest(state())!;
    const second = comparisonRequest(state({ date: "20270713", criterion: "comms" }))!;
    expect(resources.comparison(first)).toBeUndefined();
    expect(resources.comparison(second)).toBeUndefined();
    pending.get(JSON.stringify(first))!(new Response(JSON.stringify(response(first))));
    await vi.waitFor(() => expect(resources.comparison(first)?.scenarioIds).toEqual(first.scenarioIds));
    expect(resources.comparison(second)).toBeUndefined();
    pending.get(JSON.stringify(second))!(new Response(JSON.stringify(response(second))));
    await vi.waitFor(() => expect(resources.comparison(second)?.scenarioIds).toEqual(second.scenarioIds));
  });
});
