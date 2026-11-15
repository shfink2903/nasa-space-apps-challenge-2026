import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Site } from "../src/data/dataset";
import { buildChatRequest } from "../src/planner/assistantRequest";
import type { AppState } from "../src/state";

const sites: Site[] = JSON.parse(readFileSync(resolve(__dirname, "../../data/processed/v1/sites.json"), "utf8")).sites;
const state = (patch: Partial<AppState> = {}): AppState => ({
  sites, focusId: "sp_s8950", comparisons: [], date: "20261201", heightM: 2,
  scope: "polar", criterion: "balanced", locale: "fr",
  requirements: { minSunShare: null, minEarthShare: null, maxDarkH: null },
  ...patch,
} as AppState);

describe("assistant selection contract", () => {
  it("uses only the focused scenario when every comparison was removed", () => {
    const r = buildChatRequest(state(), "Conditions");
    expect(r?.context.scenarioIds).toHaveLength(1);
    expect(r?.context.scenarioIds[0]).toMatch(/^sp_s8950_20261201_30d_h2m_lola_/);
    expect(r?.constraints).toEqual([]);
  });

  it("keeps a single explicit comparison instead of broadening to the catalogue", () => {
    const r = buildChatRequest(state({ scope: "all", comparisons: [{ siteId: "apollo11", date: "20261208" }] }), "Conditions");
    expect(r?.context.scenarioIds).toHaveLength(1);
    expect(r?.context.scenarioIds[0]).toMatch(/^apollo11_20261208_30d_h2m_geometric_/);
  });

  it("passes the displayed user thresholds, priority, height and different dates exactly", () => {
    const r = buildChatRequest(state({
      comparisons: [{ siteId: "sp_s8600", date: "20261201" }, { siteId: "sp_s8600", date: "20270713" }],
      heightM: 10, criterion: "comms",
      requirements: { minSunShare: 0.25, minEarthShare: 0.5, maxDarkH: 360 },
    }), "Compare", "existing-session");
    expect(r?.context.scenarioIds).toHaveLength(2);
    expect(r?.context.scenarioIds[0]).toMatch(/^sp_s8600_20261201_30d_h10m_lola_/);
    expect(r?.context.scenarioIds[1]).toMatch(/^sp_s8600_20270713_30d_h10m_lola_/);
    expect(r?.context.priority).toEqual(["earth.anyDisk.fraction"]);
    expect(r?.constraints).toEqual([
      { metricId: "sun.anyDisk.fraction", op: ">=", value: 0.25, unit: "1", origin: "user" },
      { metricId: "earth.anyDisk.fraction", op: ">=", value: 0.5, unit: "1", origin: "user" },
      { metricId: "sun.anyDisk.longestGapH", op: "<=", value: 360, unit: "h", origin: "user" },
    ]);
    expect(r?.sessionId).toBe("existing-session");
  });

  it("explicitly clears constraints in a continuing session", () => {
    expect(buildChatRequest(state(), "Sans contraintes", "existing-session")?.constraints).toEqual([]);
  });

  it("does not substitute a missing date or unsupported terrain model", () => {
    expect(buildChatRequest(state({ comparisons: [{ siteId: "sp_s8600", date: "20350101" }] }), "Conditions")).toBeNull();
    expect(buildChatRequest(state({ comparisons: [{ siteId: "apollo11", date: "20261201" }] }), "Conditions")).toBeNull();
  });
});
