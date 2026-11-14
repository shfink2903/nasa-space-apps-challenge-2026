import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  availableDates,
  hasModel,
  parseScenarioId,
  pickScenarioId,
  sampleSeries,
  type Scenario,
  type Sensitivity,
  type Series,
  type Site,
  type Sweep,
} from "../src/data/dataset";
import { groupOf, isPolar, orderedSites, scopeModel, scopeSites } from "../src/planner/catalog";

const DATA = resolve(__dirname, "../../data/processed/v1");
const json = <T>(path: string): T => JSON.parse(readFileSync(resolve(DATA, path), "utf8")) as T;
const sites = json<{ sites: Site[] }>("sites.json").sites;
const site = (id: string) => sites.find((s) => s.id === id)!;
const scenario = (id: string) => json<Scenario>(`scenarios/${id}.json`);
const series = (sc: Scenario) => JSON.parse(gunzipSync(readFileSync(resolve(DATA, sc.seriesRef.path))).toString()) as Series;

describe("catalogue", () => {
  it("has 10 historical landings and 3 study points, never mixed", () => {
    expect(sites.filter((s) => s.status === "historical")).toHaveLength(10);
    const study = sites.filter((s) => s.status === "study_point");
    expect(study.map((s) => s.id).sort()).toEqual(["sp_s8600", "sp_s8800", "sp_s8950"]);
    for (const s of study) expect(s.mission).toBeNull();
  });

  it("reads every published scenario id", () => {
    for (const s of sites) for (const id of s.scenarioIds) expect(parseScenarioId(id)?.siteId).toBe(s.id);
  });

  it("offers the same 52 weekly start dates for every site", () => {
    const ref = availableDates(site("apollo11"));
    expect(ref).toHaveLength(52);
    expect(ref[0]).toBe("20261201");
    for (const s of sites) expect(availableDates(s)).toEqual(ref);
  });
});

describe("south-pole grouping", () => {
  it("puts the study points first as candidates, then the two polar landings, then the rest", () => {
    expect(sites.filter((s) => groupOf(s) === "candidate").map((s) => s.id).sort()).toEqual(["sp_s8600", "sp_s8800", "sp_s8950"]);
    expect(sites.filter((s) => groupOf(s) === "polarRef").map((s) => s.id).sort()).toEqual(["chandrayaan3", "im1"]);
    expect(sites.filter((s) => groupOf(s) === "historical")).toHaveLength(8);
    const order = orderedSites(sites).map(groupOf);
    expect(order.slice(0, 3)).toEqual(["candidate", "candidate", "candidate"]);
    expect(order.slice(3, 5)).toEqual(["polarRef", "polarRef"]);
    expect(orderedSites(sites)).toHaveLength(sites.length);
  });

  it("never calls a landed mission a candidate", () => {
    for (const s of sites) if (s.status === "historical") expect(groupOf(s)).not.toBe("candidate");
  });

  it("compares the polar scope with the terrain model, which exists for exactly those sites", () => {
    const polar = scopeSites(sites, "polar");
    expect(polar.map((s) => s.id).sort()).toEqual(["chandrayaan3", "im1", "sp_s8600", "sp_s8800", "sp_s8950"]);
    expect(scopeModel("polar")).toBe("lola");
    expect(scopeModel("all")).toBe("geometric");
    for (const s of sites) {
      expect(hasModel(s, "lola")).toBe(isPolar(s));
      expect(hasModel(s, "geometric")).toBe(true);
    }
    expect(scopeSites(sites, "all")).toHaveLength(13);
  });
});

describe("scenario choice", () => {
  it("finds the scenario for a site, date, mast height and model", () => {
    expect(parseScenarioId(pickScenarioId(site("im1"), "20261201", 2, "lola")!)).toEqual({ siteId: "im1", date: "20261201", heightM: 2, model: "lola" });
    expect(parseScenarioId(pickScenarioId(site("im1"), "20261201", 10, "geometric")!)).toMatchObject({ heightM: 10, model: "geometric" });
    expect(pickScenarioId(site("apollo11"), "20261201", 2, "lola")).toBeNull();
    expect(pickScenarioId(site("apollo11"), "19690720", 2, "geometric")).toBeNull();
  });

  it("links terrain-aware scenarios to a horizon profile and the others to none", () => {
    expect(scenario(pickScenarioId(site("im1"), "20261201", 2, "lola")!).profileId).toMatch(/^[0-9a-f]{12}$/);
    expect(scenario(pickScenarioId(site("apollo11"), "20261201", 2, "geometric")!).profileId).toBeNull();
  });

  it("carries windows for Sun, Earth and both, and the published limits", () => {
    const sc = scenario(pickScenarioId(site("sp_s8950"), "20261201", 2, "lola")!);
    expect(sc.windows["sun.anyDisk"].length).toBeGreaterThan(0);
    expect(sc.windows["earth.anyDisk"].length).toBeGreaterThan(0);
    expect(sc.overlapWindows.length).toBeGreaterThan(0);
    expect(sc.validationStatus).toBe("not_validated");
    expect(sc.limits.some((l) => l.includes("Visibility does not establish"))).toBe(true);
  });
});

describe("sweeps and grids", () => {
  it("has one sweep row per start date, in date order, for the chosen scenario", () => {
    const sweep = json<Sweep>("sweeps/sp_s8600_h2m_lola_dates.json");
    const dates = availableDates(site("sp_s8600"));
    expect(sweep.rows).toHaveLength(52);
    sweep.rows.forEach((row, i) => {
      expect(parseScenarioId(row.scenarioId)).toEqual({ siteId: "sp_s8600", date: dates[i], heightM: 2, model: "lola" });
    });
    expect(sweep.rows[0].scenarioId).toBe(pickScenarioId(site("sp_s8600"), dates[0], 2, "lola"));
  });

  it("has a 5 x 5 grid at 1 km around each study point", () => {
    for (const id of ["sp_s8950", "sp_s8800", "sp_s8600"]) {
      const grid = json<Sensitivity>(`sensitivity/${id}_h2m_grid1km.json`);
      expect(grid.grid).toMatchObject({ size: [5, 5], spacingKm: 1 });
      expect(grid.rows).toHaveLength(25);
      const offsets = new Set(grid.rows.map((r) => `${r.eastOffsetKm},${r.northOffsetKm}`));
      expect(offsets.size).toBe(25);
      expect(offsets.has("0,0")).toBe(true);
      expect(offsets.has("-2,2")).toBe(true);
    }
  });
});

describe("series", () => {
  const sc = scenario(pickScenarioId(site("apollo11"), "20261201", 2, "geometric")!);
  const s = series(sc);

  it("decodes 30 days at 600 s", () => {
    expect(s.n).toBe(4321);
    expect(s.stepS).toBe(600);
    expect(s.sunElDeg).toHaveLength(4321);
    expect(s.t0Utc).toBe("2026-12-01T00:00:00.000Z");
  });

  it("samples published values exactly on a step and stays inside the range", () => {
    const a = sampleSeries(s, 100);
    expect(a.sunElDeg).toBe(s.sunElDeg[100]);
    expect(a.sunState).toBe(s.sunState[100]);
    expect(a.tMs).toBe(Date.parse(s.t0Utc) + 100 * 600_000);
    expect(sampleSeries(s, -5).tMs).toBe(Date.parse(s.t0Utc));
    expect(sampleSeries(s, 99999).sunElDeg).toBe(s.sunElDeg[4320]);
  });

  it("interpolates azimuth through the wrap without a jump", () => {
    const fake: Series = { ...s, n: 2, sunAzDeg: [359.5, 0.5], earthAzDeg: [0.5, 359.5] };
    expect(sampleSeries(fake, 0.5).sunAzDeg).toBeCloseTo(0, 6);
    expect(sampleSeries(fake, 0.5).earthAzDeg).toBeCloseTo(0, 6);
  });
});
