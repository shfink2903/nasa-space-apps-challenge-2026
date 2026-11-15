import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { checkCoordinates, longestGap, projectSeries, summarize, windowsFromSamples, type RefSeries } from "../src/planner/customPoint";

const DATA = resolve(__dirname, "../../data/processed/v1");
const raw = JSON.parse(readFileSync(resolve(DATA, "sites.json"), "utf8"));
const sites = (Array.isArray(raw) ? raw : raw.data ?? raw.sites) as { id: string; latDeg: number; lonDeg: number }[];
const site = (id: string) => sites.find((s) => s.id === id)!;
const seriesFiles = readdirSync(resolve(DATA, "series")).filter((f) => f.endsWith(".json.gz"));
const series = (siteId: string, date: string, h: number) => {
  const file = seriesFiles.find((f) => f.startsWith(`${siteId}_${date}_30d_h${h}m_geometric_`))!;
  return JSON.parse(gunzipSync(readFileSync(resolve(DATA, "series", file))).toString()) as RefSeries & {
    sunState: (0 | 1 | 2 | null)[];
    earthState: (0 | 1 | 2 | null)[];
  };
};

/**
 * The projection must give back a published geometric series when it looks from
 * another published site. Pairs cover the equator, the far side and the south pole.
 */
const PAIRS: [string, string, string, number][] = [
  ["apollo11", "apollo15", "20261201", 2],
  ["apollo11", "change4", "20270601", 2],
  ["sp_s8950", "sp_s8600", "20261201", 2],
  ["sp_s8600", "chandrayaan3", "20270316", 10],
  ["apollo17", "sp_s8800", "20271026", 10],
];

describe("custom point projection agrees with the published geometric series", () => {
  for (const [from, to, date, h] of PAIRS) {
    it(`${from} → ${to}, ${date}, ${h} m`, () => {
      const ref = series(from, date, h);
      const truth = series(to, date, h);
      const p = projectSeries(ref, site(from), site(to), h);
      let maxEl = 0;
      let maxAz = 0;
      let stateMismatch = 0;
      for (const body of ["sun", "earth"] as const) {
        const el = truth[`${body}ElDeg`];
        const az = truth[`${body}AzDeg`];
        const st = truth[`${body}State`];
        for (let i = 0; i < p.n; i++) {
          maxEl = Math.max(maxEl, Math.abs(p[body].elDeg[i] - el[i]));
          // Azimuth is meaningless near the zenith; the bodies stay low except at the equator.
          if (Math.abs(el[i]) < 80) maxAz = Math.max(maxAz, Math.abs(((p[body].azDeg[i] - az[i] + 540) % 360) - 180));
          if (p[body].state[i] !== st[i]) stateMismatch++;
        }
      }
      // Published values are rounded to 0.001°; allow a few roundings.
      expect(maxEl).toBeLessThan(0.01);
      expect(maxAz).toBeLessThan(0.05);
      // A state can flip only on a rounded edge sample.
      expect(stateMismatch / (2 * p.n)).toBeLessThan(0.002);
    });
  }
});

describe("every published site is given back from one reference", () => {
  for (const date of ["20261201", "20270601"]) {
    for (const h of [2, 10]) {
      it(`apollo11 → all sites, ${date}, ${h} m`, () => {
        const ref = series("apollo11", date, h);
        let worst = 0;
        let mismatch = 0;
        let total = 0;
        for (const target of sites) {
          const truth = series(target.id, date, h);
          const p = projectSeries(ref, site("apollo11"), target, h);
          for (const body of ["sun", "earth"] as const) {
            for (let i = 0; i < p.n; i++) {
              worst = Math.max(worst, Math.abs(p[body].elDeg[i] - truth[`${body}ElDeg`][i]));
              if (p[body].state[i] !== truth[`${body}State`][i]) mismatch++;
              total++;
            }
          }
        }
        expect(sites).toHaveLength(13);
        expect(worst).toBeLessThan(0.002);
        // Published elevations are rounded to 0.001°: a sample right on the horizon can flip.
        expect(mismatch / total).toBeLessThan(1e-4);
      });
    }
  }
});

describe("sampled windows and gaps", () => {
  it("finds runs and cut edges", () => {
    const v = [false, false, true, true, false, false, false, true];
    expect(longestGap(v, 3600)).toEqual({ hours: 3, cut: false });
    expect(longestGap([false, false, false, true], 3600)).toEqual({ hours: 3, cut: true });
    const w = windowsFromSamples(v, 0, 3600);
    expect(w).toHaveLength(2);
    expect(w[0].startUtc).toBe(new Date(1.5 * 3600e3).toISOString());
    expect(w[1].endUtc).toBe(new Date(7 * 3600e3).toISOString());
  });

  it("summarizes a whole period", () => {
    const ref = series("sp_s8950", "20261201", 2);
    const s = summarize(projectSeries(ref, site("sp_s8950"), { latDeg: -89.6, lonDeg: -150 }, 2));
    expect(s.sunShare).toBeGreaterThanOrEqual(0);
    expect(s.sunShare).toBeLessThanOrEqual(1);
    expect(s.bothShare).toBeLessThanOrEqual(Math.min(s.sunShare, s.earthShare));
  });

  it("refuses bad coordinates and the polar axis", () => {
    expect(checkCoordinates(-89.5, 0)).toBeNull();
    expect(checkCoordinates(-90, 0)).toBe("pole");
    expect(checkCoordinates(-91, 0)).toBe("lat");
    expect(checkCoordinates(0, 400)).toBe("lon");
    expect(checkCoordinates(Number.NaN, 0)).toBe("lat");
  });
});
