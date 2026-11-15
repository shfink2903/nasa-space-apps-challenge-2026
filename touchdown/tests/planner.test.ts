import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Scenario, Sweep } from "../src/data/dataset";
import { nextEvent, splitDuration, windowAt } from "../src/planner/clock";
import { readMetrics, type SiteMetrics } from "../src/planner/metrics";
import { checkRequirements, paretoFront, rankSites, verdict } from "../src/planner/ranking";

const DATA = resolve(__dirname, "../../data/processed/v1");
const json = <T>(path: string): T => JSON.parse(readFileSync(resolve(DATA, path), "utf8")) as T;

/** Published metrics of every scenario, from the 36 sweep files. */
const byScenario = new Map<string, SiteMetrics>();
for (const file of readdirSync(resolve(DATA, "sweeps"))) {
  const sweep = json<Sweep>(`sweeps/${file}`);
  for (const row of sweep.rows) byScenario.set(row.scenarioId, readMetrics(sweep.siteId, row.scenarioId, row.metrics));
}

const row = (siteId: string, values: Partial<SiteMetrics>): SiteMetrics => ({
  siteId,
  scenarioId: `${siteId}-scenario`,
  comparable: true,
  darkGapCut: "000",
  sunGapAtLeast: false,
  earthGapAtLeast: false,
  sunShare: null,
  sunFullShare: null,
  sunGapH: null,
  sunMaxElDeg: null,
  sunMeanElDeg: null,
  earthShare: null,
  earthGapH: null,
  earthMaxElDeg: null,
  bothShare: null,
  ...values,
});

describe("metrics", () => {
  it("copies the published values and keeps missing ones as null", () => {
    const sweep = json<Sweep>("sweeps/sp_s8950_h2m_lola_dates.json");
    const first = sweep.rows[0];
    const m = readMetrics("sp_s8950", first.scenarioId, first.metrics);
    const published = (id: string) => first.metrics.find((x) => x.metricId === id)!.value;
    expect(m.sunShare).toBe(published("sun.anyDisk.fraction"));
    expect(m.earthGapH).toBe(published("earth.anyDisk.longestGapH"));
    expect(m.bothShare).toBe(published("overlap.sunAny_earthAny.fraction"));
    expect(readMetrics("x", "y", []).sunShare).toBeNull();
  });

  it("covers all 1,872 scenarios of the dataset", () => {
    expect(byScenario.size).toBe(1872);
  });
});

describe("ranking", () => {
  const rows = [
    row("a", { bothShare: 0.2, sunShare: 0.5, earthShare: 0.3 }),
    row("b", { bothShare: 0.4, sunShare: 0.1, earthShare: 0.9 }),
    row("c", { bothShare: 0.4, sunShare: 0.3, earthShare: null }),
    row("d", { sunShare: 0.3, earthShare: 0.1 }),
  ];

  it("orders on the chosen metric, shares a rank on ties and leaves missing values unranked", () => {
    const balanced = rankSites(rows, "balanced");
    expect(balanced.map((r) => [r.metrics.siteId, r.rank])).toEqual([["b", 1], ["c", 1], ["a", 3], ["d", null]]);
    expect(rankSites(rows, "power").map((r) => r.metrics.siteId)).toEqual(["a", "c", "d", "b"]);
    expect(rankSites(rows, "comms").map((r) => [r.metrics.siteId, r.rank])).toEqual([["b", 1], ["a", 2], ["d", 3], ["c", null]]);
  });

  it("does not change its input", () => {
    const before = rows.map((r) => r.siteId);
    rankSites(rows, "power");
    expect(rows.map((r) => r.siteId)).toEqual(before);
  });
});

/**
 * The dataset holds 104 comparisons (52 dates x 2 models), each with its
 * non-dominated set. The planner computes the set in the browser, so it must
 * give exactly the same answer for every one of them.
 */
describe("Pareto set", () => {
  const files = readdirSync(resolve(DATA, "comparisons"));

  it("is the same as the dataset for all 104 published comparisons", () => {
    expect(files).toHaveLength(104);
    for (const file of files) {
      const c = json<{ scenarioIds: string[]; nonDominatedScenarioIds: string[] }>(`comparisons/${file}`);
      const front = paretoFront(c.scenarioIds.map((id) => byScenario.get(id)!));
      expect([...front].sort(), file).toEqual([...c.nonDominatedScenarioIds].sort());
    }
  });

  it("keeps a scenario that cannot be compared, as the dataset does", () => {
    const full = { sunShare: 0.5, earthShare: 0.5, sunGapH: 100, bothShare: 0.3 };
    const worse = { sunShare: 0.4, earthShare: 0.4, sunGapH: 200, bothShare: 0.2 };
    expect([...paretoFront([row("a", full), row("b", worse)])]).toEqual(["a-scenario"]);
    expect([...paretoFront([row("a", full), row("b", { ...worse, comparable: false })])]).toEqual(["a-scenario", "b-scenario"]);
    expect([...paretoFront([row("a", full), row("b", { ...worse, darkGapCut: "010" })])]).toEqual(["a-scenario", "b-scenario"]);
  });
});

describe("requirements", () => {
  const m = row("a", { sunShare: 0.3, earthShare: 0.4, sunGapH: 400 });

  it("checks each active limit against the published metric", () => {
    const results = checkRequirements(m, { minSunShare: 0.25, minEarthShare: 0.5, maxDarkH: 400 });
    expect(results.map((r) => [r.key, r.ok])).toEqual([["minSunShare", true], ["minEarthShare", false], ["maxDarkH", true]]);
    expect(verdict(results)).toBe("fail");
    expect(verdict(checkRequirements(m, { minSunShare: 0.25, minEarthShare: null, maxDarkH: 500 }))).toBe("pass");
  });

  it("says so when no limit is set or a metric is missing", () => {
    expect(verdict(checkRequirements(m, { minSunShare: null, minEarthShare: null, maxDarkH: null }))).toBe("none");
    const missing = checkRequirements(row("b", { sunShare: 0.9 }), { minSunShare: 0.5, minEarthShare: 0.5, maxDarkH: null });
    expect(missing.map((r) => r.ok)).toEqual([true, null]);
    expect(verdict(missing)).toBe("unknown");
  });
});

describe("longest night cut by the edge of the period", () => {
  const cut = row("c", { sunShare: 0.5, sunGapH: 224, sunGapAtLeast: true });

  it("is a lower bound: under the limit the check cannot conclude", () => {
    const [r] = checkRequirements(cut, { minSunShare: null, minEarthShare: null, maxDarkH: 360 });
    expect(r.ok).toBeNull();
    expect(r.atLeast).toBe(true);
    expect(verdict([r])).toBe("unknown");
  });

  it("over the limit it surely fails", () => {
    const [r] = checkRequirements(cut, { minSunShare: null, minEarthShare: null, maxDarkH: 200 });
    expect(r.ok).toBe(false);
  });

  it("is read from the published truncation flags", () => {
    const all = [...byScenario.values()];
    const flagged = all.filter((m) => m.sunGapAtLeast);
    expect(flagged.length).toBeGreaterThan(0);
    for (const m of flagged) expect(m.darkGapCut).not.toBe("000");
    for (const m of all.filter((x) => !x.sunGapAtLeast)) expect(m.darkGapCut).toBe("000");
  });
});

describe("countdown", () => {
  const sc = json<Scenario>("scenarios/sp_s8950_20261201_30d_h2m_lola_a0a2541a.json");
  const t0 = Date.parse("2026-12-01T00:00:00Z");

  it("finds the next published rise or set of each body", () => {
    const sunset = nextEvent(sc, "sun", t0)!;
    expect(sunset.type).toBe("set");
    expect(sunset.tUtc).toBe("2026-12-01T03:34:10.781Z");
    expect(sc.events).toContain(sunset);
    const earthrise = nextEvent(sc, "earth", t0)!;
    expect(earthrise.type).toBe("rise");
    expect(Date.parse(earthrise.tUtc)).toBeGreaterThan(t0);
    expect(nextEvent(sc, "sun", t0 + 40 * 86_400_000)).toBeNull();
  });

  it("never returns a grazing or full-disc event", () => {
    for (let d = 0; d < 30; d++) {
      const ev = nextEvent(sc, "sun", t0 + d * 86_400_000);
      if (ev) expect([ev.convention, ev.type === "grazing"]).toEqual(["anyDisk", false]);
    }
  });

  it("knows whether a body is inside a published window", () => {
    expect(windowAt(sc, "sun", t0 + 3_600_000)).not.toBeNull(); // before the 03:34 sunset
    expect(windowAt(sc, "sun", t0 + 5 * 3_600_000)).toBeNull();
    expect(windowAt(sc, "earth", t0)).toBeNull(); // Earth rises on 14 December
    expect(windowAt(sc, "earth", Date.parse("2026-12-20T00:00:00Z"))).not.toBeNull();
  });

  it("splits a duration into days, hours and minutes", () => {
    expect(splitDuration(((2 * 24 + 5) * 60 + 7) * 60_000 + 59_000)).toEqual({ days: 2, hours: 5, minutes: 7 });
    expect(splitDuration(-5)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});
