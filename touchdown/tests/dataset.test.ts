import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  availableDates,
  metric,
  nextSunEvent,
  parseScenarioId,
  pickScenarioId,
  sampleSeries,
  type Scenario,
  type Series,
  type Site,
} from "../src/data/dataset";

const DATA = resolve(__dirname, "../../data/processed/v1");
const sites = JSON.parse(readFileSync(resolve(DATA, "sites.json"), "utf8")).sites as Site[];
const site = (id: string) => sites.find((s) => s.id === id)!;
const scenario = (id: string) => JSON.parse(readFileSync(resolve(DATA, "scenarios", `${id}.json`), "utf8")) as Scenario;
const series = (sc: Scenario) =>
  JSON.parse(gunzipSync(readFileSync(resolve(DATA, sc.seriesRef.path))).toString()) as Series;

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

describe("scenario choice", () => {
  it("uses the terrain-aware model where the dataset has one", () => {
    expect(parseScenarioId(pickScenarioId(site("im1"), "20261201")!)).toMatchObject({ model: "lola", heightM: 2 });
    expect(parseScenarioId(pickScenarioId(site("apollo11"), "20261201")!)).toMatchObject({
      model: "geometric",
      heightM: 2,
    });
    expect(pickScenarioId(site("apollo11"), "19690720")).toBeNull();
  });

  it("links terrain-aware scenarios to a horizon profile and the others to none", () => {
    expect(scenario(pickScenarioId(site("im1"), "20261201")!).profileId).toMatch(/^[0-9a-f]{12}$/);
    expect(scenario(pickScenarioId(site("apollo11"), "20261201")!).profileId).toBeNull();
  });
});

describe("series", () => {
  const sc = scenario(pickScenarioId(site("apollo11"), "20261201")!);
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

  it("reports events and metrics from the dataset only", () => {
    const t0 = Date.parse(s.t0Utc);
    const ev = nextSunEvent(sc, t0);
    expect(ev).not.toBeNull();
    expect(sc.events).toContain(ev);
    expect(Date.parse(ev!.tUtc)).toBeGreaterThan(t0);
    expect(nextSunEvent(sc, t0 + 40 * 86_400_000)).toBeNull();
    expect(metric(sc, "sun.anyDisk.fraction")).toBe(sc.metrics.find((m) => m.metricId === "sun.anyDisk.fraction")!.value);
    expect(metric(sc, "does.not.exist")).toBeNull();
  });
});
