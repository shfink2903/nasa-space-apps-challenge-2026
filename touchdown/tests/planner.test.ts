import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bestModel,
  indexAt,
  metric,
  pickScenarioId,
  sweepValue,
  visibilityAt,
  type Derived,
  type Scenario,
  type Series,
  type Site,
} from "../src/data/dataset";
import { CRITERIA, criterionById, rankSites, sitesIn, SOUTH_REGION_MAX_LAT_DEG } from "../src/data/ranking";
import { formatShareDays } from "../src/ui/format";
import { formatCriterion } from "../src/ui/sitelist";

const DATA = resolve(__dirname, "../../data/processed/v1");
const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(DATA, path), "utf8")) as T;
const sites = read<{ sites: Site[] }>("sites.json").sites;
const site = (id: string) => sites.find((s) => s.id === id)!;
const scenario = (id: string) => read<Scenario>(`scenarios/${id}.json`);
const derived = JSON.parse(readFileSync(resolve(__dirname, "../public/derived/v1.json"), "utf8")) as Derived;
const DATE = "20261201";

describe("derived index is a faithful copy of the dataset", () => {
  it("covers every sweep, comparison and sensitivity file", () => {
    expect(Object.keys(derived.sweeps)).toHaveLength(readdirSync(resolve(DATA, "sweeps")).length);
    expect(Object.keys(derived.comparisons)).toHaveLength(readdirSync(resolve(DATA, "comparisons")).length);
    expect(Object.keys(derived.sensitivity)).toHaveLength(readdirSync(resolve(DATA, "sensitivity")).length);
  });

  it("has the same 30-day metrics as the scenario files", () => {
    for (const id of ["apollo11", "change4", "im1", "sp_s8800", "sp_s8950"]) {
      const s = site(id);
      for (const heightM of [2, 10]) {
        const sc = scenario(pickScenarioId(s, DATE, heightM)!);
        for (const metricId of derived.metricIds) expect(sweepValue(derived, s, heightM, DATE, metricId)).toBe(metric(sc, metricId));
      }
    }
  });

  it("copies the non-dominated set and the sensitivity ranges as published", () => {
    for (const [key, entry] of Object.entries(derived.comparisons).slice(0, 12)) {
      const doc = read<{ nonDominatedScenarioIds: string[]; modelLevel: string; exploredCount: number }>(`comparisons/${entry.comparisonId}.json`);
      expect(entry.nonDominated).toEqual(doc.nonDominatedScenarioIds);
      expect(key.endsWith(`|${doc.modelLevel}`)).toBe(true);
      expect(entry.exploredCount).toBe(doc.exploredCount);
    }
    const sens = read<{ ranges: { metricId: string; min: number | null; max: number | null }[] }>("sensitivity/sp_s8600_h2m_grid1km.json");
    for (const r of derived.sensitivity["sp_s8600|2"].ranges) {
      const source = sens.ranges.find((x) => x.metricId === r.metricId)!;
      expect([r.min, r.max]).toEqual([source.min, source.max]);
    }
    expect(derived.sensitivity["sp_s8600|2"].cells).toHaveLength(25);
  });
});

describe("visibility from the published windows", () => {
  const im1 = scenario(pickScenarioId(site("im1"), DATE)!);
  const t0 = Date.parse("2026-12-01T00:00:00Z");

  it("gives the exact time of the next sunset and of the next sunrise", () => {
    const up = visibilityAt(im1, "sun.anyDisk", t0);
    expect(up.visible).toBe(true);
    expect(up.changeMs).toBe(Date.parse(im1.windows["sun.anyDisk"][0].endUtc));
    const down = visibilityAt(im1, "sun.anyDisk", up.changeMs! + 1000);
    expect(down.visible).toBe(false);
    expect(down.changeMs).toBe(Date.parse(im1.windows["sun.anyDisk"][1].startUtc));
  });

  it("invents no set when the body stays up to the end of the analysis", () => {
    const earth = visibilityAt(im1, "earth.anyDisk", t0 + 30 * 86400_000);
    expect(earth).toEqual({ visible: true, changeMs: null });
  });

  it("invents no rise when the body never shows: far side Earth, polar night Sun", () => {
    const farSide = scenario(pickScenarioId(site("change4"), DATE)!);
    expect(visibilityAt(farSide, "earth.anyDisk", t0)).toEqual({ visible: false, changeMs: null });
    const polar = scenario(pickScenarioId(site("sp_s8800"), DATE)!);
    expect(metric(polar, "sun.anyDisk.fraction")).toBe(0);
    expect(visibilityAt(polar, "sun.anyDisk", t0 + 86400_000)).toEqual({ visible: false, changeMs: null });
  });

  it("maps a time to the display index", () => {
    const series = { t0Utc: "2026-12-01T00:00:00Z", stepS: 600, n: 4321 } as Series;
    expect(indexAt(series, t0 + 3600_000)).toBe(6);
    expect(indexAt(series, t0 - 1)).toBe(0);
    expect(indexAt(series, t0 + 40 * 86400_000)).toBe(4320);
  });
});

describe("ranking", () => {
  it("uses the terrain model where the dataset has one", () => {
    expect(bestModel(site("sp_s8950"))).toBe("lola");
    expect(bestModel(site("apollo11"))).toBe("geometric");
  });

  it("orders every site by the chosen published metric, in the declared direction", () => {
    for (const criterion of CRITERIA) {
      const rows = rankSites(sites, derived, DATE, 2, criterion);
      expect(rows).toHaveLength(sites.length);
      const known = rows.filter((r) => r.value !== null).map((r) => r.value!);
      const sorted = [...known].sort((a, b) => (criterion.direction === "max" ? b - a : a - b));
      expect(known).toEqual(sorted);
      expect(rows[0].rank).toBe(1);
      for (const r of rows) expect(r.value).toBe(sweepValue(derived, r.site, 2, DATE, criterion.metricId));
    }
  });

  it("gives equal values the same rank and never ranks an unknown value", () => {
    const rows = rankSites(sites, derived, DATE, 2, criterionById("overlap"));
    const zeros = rows.filter((r) => r.value === 0);
    expect(zeros.length).toBeGreaterThan(1);
    expect(new Set(zeros.map((r) => r.rank)).size).toBe(1);
    const none = rankSites(sites, derived, "19990101", 2, criterionById("sun"));
    expect(none.every((r) => r.value === null && r.rank === null)).toBe(true);
  });

  it("reads the non-dominated mark from the DATA comparison, at the row's model level", () => {
    for (const r of rankSites(sites, derived, DATE, 2, criterionById("sun"))) {
      const published = derived.comparisons[`${DATE}|${r.model}`].nonDominated;
      expect(r.nonDominated).toBe(published.includes(r.scenarioId!));
    }
  });
});

describe("region filter", () => {
  it("keeps only the sites south of the shown limit, and ranks among them", () => {
    const south = sitesIn(sites, "south");
    expect(south.map((s) => s.id).sort()).toEqual(["chandrayaan3", "im1", "sp_s8600", "sp_s8800", "sp_s8950"]);
    expect(south.every((s) => s.latDeg <= SOUTH_REGION_MAX_LAT_DEG)).toBe(true);
    expect(sitesIn(sites, "all")).toHaveLength(sites.length);
    const rows = rankSites(south, derived, DATE, 2, criterionById("overlap"));
    expect(rows).toHaveLength(5);
    expect(rows[0].rank).toBe(1);
  });
});

describe("display modes", () => {
  it("says a share in days for everyone, and keeps 0 and 30 for exact values only", () => {
    expect(formatShareDays(0)).toContain("0");
    expect(formatShareDays(1)).toContain("30");
    expect(formatShareDays(0.443)).toMatch(/^13\b/);
    expect(formatShareDays(0.02)).toContain("< 1");
    expect(formatShareDays(0.99)).toContain("> 29");
  });

  it("keeps the exact value for scientists and never shows a missing value as zero", () => {
    const sun = criterionById("sun");
    const night = criterionById("night");
    expect(formatCriterion(sun, 0.4431, "expert")).toMatch(/44[.,]3/);
    expect(formatCriterion(night, 401.3, "expert")).toMatch(/401[.,]3/);
    expect(formatCriterion(sun, null, "simple")).toBe("—");
    expect(formatCriterion(sun, null, "expert")).toBe("—");
  });
});
