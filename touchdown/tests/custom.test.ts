import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { customMetrics, customSeries, customSite } from "../src/data/custom";
import { metric, pickScenarioId, type Scenario, type Series, type Site } from "../src/data/dataset";

const DATA = resolve(__dirname, "../../data/processed/v1");
const sites = (JSON.parse(readFileSync(resolve(DATA, "sites.json"), "utf8")) as { sites: Site[] }).sites;
const site = (id: string) => sites.find((s) => s.id === id)!;
const scenario = (id: string) => JSON.parse(readFileSync(resolve(DATA, "scenarios", `${id}.json`), "utf8")) as Scenario;
const series = (sc: Scenario) => JSON.parse(gunzipSync(readFileSync(resolve(DATA, sc.seriesRef.path))).toString()) as Series;
const angle = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

const REFERENCE = site("apollo11");
/** Known sites used as if they were free points, compared with what DATA published for them (geometric level). */
const TARGETS = ["apollo15", "change4", "chandrayaan3", "im1", "sp_s8600", "sp_s8950"];

describe("free point geometry against the published geometric scenarios", () => {
  for (const date of ["20261201", "20270615"]) {
    for (const heightM of [2, 10]) {
      const ref = series(scenario(pickScenarioId(REFERENCE, date, heightM, "geometric")!));
      for (const id of TARGETS) {
        it(`${id}, ${date}, ${heightM} m`, () => {
          const target = site(id);
          const published = scenario(pickScenarioId(target, date, heightM, "geometric")!);
          const want = series(published);
          const got = customSeries(REFERENCE, ref, target.latDeg, target.lonDeg, heightM);

          let worstEl = 0;
          let worstAz = 0;
          let stateMismatch = 0;
          for (let i = 0; i < want.n; i++) {
            worstEl = Math.max(worstEl, Math.abs(got.sunElDeg[i] - want.sunElDeg[i]), Math.abs(got.earthElDeg[i] - want.earthElDeg[i]));
            // Azimuth loses meaning near the zenith: compare it only when the body is not overhead.
            if (want.sunElDeg[i] < 80) worstAz = Math.max(worstAz, angle(got.sunAzDeg[i], want.sunAzDeg[i]));
            if (want.earthElDeg[i] < 80) worstAz = Math.max(worstAz, angle(got.earthAzDeg[i], want.earthAzDeg[i]));
            if (got.sunState[i] !== want.sunState[i]) stateMismatch++;
            if (got.earthState[i] !== want.earthState[i]) stateMismatch++;
          }
          expect(worstEl).toBeLessThan(0.02);
          expect(worstAz).toBeLessThan(0.2);
          expect(stateMismatch / (2 * want.n)).toBeLessThan(0.002);

          const { values } = customMetrics(got);
          for (const idm of ["sun.anyDisk.fraction", "earth.anyDisk.fraction", "overlap.sunAny_earthAny.fraction", "sun.fullDisk.fraction"]) {
            expect(Math.abs(values[idm]! - metric(published, idm)!)).toBeLessThan(0.002);
          }
          for (const idm of ["sun.anyDisk.longestGapH", "earth.anyDisk.longestGapH"]) {
            expect(Math.abs(values[idm]! - metric(published, idm)!)).toBeLessThan(0.5);
          }
        });
      }
    }
  }
});

describe("free point entry", () => {
  it("keeps coordinates in range", () => {
    expect(customSite(-95, 190)).toMatchObject({ latDeg: -89.9, lonDeg: -170, status: "custom" });
    expect(customSite(10, 180).lonDeg).toBe(180);
    expect(customSite(10, -180).lonDeg).toBe(180);
  });
});
