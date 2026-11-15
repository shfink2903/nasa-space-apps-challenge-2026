import { afterEach, describe, expect, it, vi } from "vitest";
import { DATASET_VERSION, loadDerived, loadHorizon, loadScenario, loadSites, type Derived, type Scenario, type Site } from "../src/data/dataset";
import { rankSites, criterionById } from "../src/data/ranking";
import { DEFAULT_CRITERIA, verdictAt } from "../src/data/mission";
import { terrainSegments } from "../src/ui/skychart";

afterEach(() => vi.unstubAllGlobals());
const id = (height: number) => `sp_s8600_20261201_30d_h${height}m_lola_abcdef`;
const site: Site = { id: "sp_s8600", name: "Study", mission: null, status: "study_point", latDeg: -86, lonDeg: 0,
  terrainProduct: "ldem_85s_20m", terrainMethodId: "method", verification: "team_defined", scenarioIds: [id(2), id(10)] };
const fixture = (): Derived => ({ datasetVersion: "v1.1-relief-30d", metricIds: ["sun.anyDisk.fraction", "earth.anyDisk.fraction"],
  sweeps: Object.fromEntries([2, 10].map(h => [`sp_s8600|${h}|lola`, { dates: ["20261201"], terrainMethodId: "method",
    coverageStatus: ["covered"], validationStatus: "not_validated", values: { "sun.anyDisk.fraction": [.8], "earth.anyDisk.fraction": [.9] } }])),
  comparisons: { "20261201|lola|2|method": { comparisonId: "two", exploredCount: 3, criteria: [], nonDominated: [id(2)] },
    "20261201|lola|10|method": { comparisonId: "ten", exploredCount: 3, criteria: [], nonDominated: [] } }, sensitivity: {} });

describe("relief delivery guards", () => {
  it("keeps comparisons at 2 m and 10 m separate", () => {
    const derived = fixture();
    expect(rankSites([site], derived, "20261201", 2, criterionById("sun"))[0].nonDominated).toBe(true);
    expect(rankSites([site], derived, "20261201", 10, criterionById("sun"))[0].nonDominated).toBe(false);
  });
  it.each(["partial", "method"])("does not rank or approve %s terrain", (kind) => {
    const derived = fixture();
    if (kind === "partial") derived.sweeps["sp_s8600|2|lola"].coverageStatus = ["partial"];
    else derived.sweeps["sp_s8600|2|lola"].terrainMethodId = "other-method";
    const row = rankSites([site], derived, "20261201", 2, criterionById("sun"))[0];
    expect(row.rank).toBeNull();
    expect(row.value).toBeNull();
    expect(row.values["sun.anyDisk.fraction"]).toBeNull();
    expect(row.nonDominated).toBe(false);
    expect(verdictAt(derived, site, 2, "20261201", DEFAULT_CRITERIA).status).toBe("unknown");
  });
  it("keeps narrow missing sectors as gaps in the graph", () => {
    const values: (number | null)[] = Array.from({ length: 3600 }, () => 3);
    values[7] = null;
    const segments = terrainSegments({ profileId: "x", azimuthStepDeg: .1, horizonElevationDeg: values }, 180);
    expect(segments).toHaveLength(2);
    expect(segments[0].at(-1)!.fraction).toBe(6 / 3600);
    expect(segments[1][0].fraction).toBe(8 / 3600);
    expect(segments.flat().some(p => p.elevation === 0)).toBe(false);
  });
  it("refuses a missing published horizon instead of drawing flat ground", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(loadHorizon({ scenarioId: id(2), siteId: site.id, profileId: "abc" } as Scenario)).rejects.toThrow("HTTP 404");
  });
  it.each([loadSites, () => loadScenario(id(2)), loadDerived])("rejects a dataset version mismatch", async load => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ datasetVersion: `${DATASET_VERSION}-wrong` }))));
    await expect(load()).rejects.toThrow(/version mismatch/);
  });
});
