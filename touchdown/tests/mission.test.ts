import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Derived, Site } from "../src/data/dataset";
import { DEFAULT_CRITERIA, evaluate, nextGoDate, shiftDate, soonestOptions, valuesAt, verdictAt, EARTH, NIGHT, SUN, type Criteria } from "../src/data/mission";
import { EXTRA_SITES } from "../src/data/targets";

const DATA = resolve(__dirname, "../../data/processed/v1");
const sites = (JSON.parse(readFileSync(resolve(DATA, "sites.json"), "utf8")) as { sites: Site[] }).sites;
const site = (id: string) => sites.find((s) => s.id === id)!;
const derived = JSON.parse(readFileSync(resolve(__dirname, "../public/derived/v1.json"), "utf8")) as Derived;
const dates = derived.sweeps["apollo11|2|geometric"].dates;
const DATE = "20261201";

describe("go / no-go from the user's thresholds", () => {
  it("names every threshold that is not met", () => {
    const c: Criteria = { minSun: 0.4, minEarth: 0.5, maxNightH: 240 };
    expect(evaluate({ [SUN]: 0.5, [EARTH]: 1, [NIGHT]: 100 }, c)).toEqual({ status: "go", failed: [] });
    expect(evaluate({ [SUN]: 0.39, [EARTH]: 0.2, [NIGHT]: 300 }, c)).toEqual({ status: "nogo", failed: ["sun", "earth", "night"] });
    expect(evaluate({ [SUN]: 0.4, [EARTH]: 0.5, [NIGHT]: 240 }, c).status).toBe("go");
  });

  it("never reads a missing value as a pass", () => {
    expect(evaluate({ [SUN]: null, [EARTH]: 1 }, DEFAULT_CRITERIA).status).toBe("unknown");
    expect(evaluate({}, DEFAULT_CRITERIA).status).toBe("unknown");
    expect(evaluate({ [SUN]: null, [EARTH]: 0.1 }, DEFAULT_CRITERIA).status).toBe("nogo");
    expect(verdictAt(derived, site("im1"), 2, "19990101", DEFAULT_CRITERIA).status).toBe("unknown");
  });

  it("follows the thresholds: stricter can only remove sites", () => {
    const strict: Criteria = { minSun: 0.6, minEarth: 0.9, maxNightH: null };
    for (const s of sites) {
      const loose = verdictAt(derived, s, 2, DATE, DEFAULT_CRITERIA).status;
      const hard = verdictAt(derived, s, 2, DATE, strict).status;
      if (hard === "go") expect(loose).toBe("go");
    }
    expect(verdictAt(derived, site("change4"), 2, DATE, DEFAULT_CRITERIA)).toEqual({ status: "nogo", failed: ["earth"] });
    expect(verdictAt(derived, site("sp_s8800"), 2, DATE, DEFAULT_CRITERIA).failed).toContain("sun");
  });
});

describe("launch delay", () => {
  it("shifts by weekly starts and stops at the end of the explored year", () => {
    expect(shiftDate(dates, DATE, 0)).toBe(DATE);
    expect(shiftDate(dates, DATE, 2)).toBe("20261215");
    expect(shiftDate(dates, dates[dates.length - 1], 1)).toBeNull();
  });

  it("finds the first date where a site meets the thresholds, never an earlier one", () => {
    for (const s of sites) {
      const from = "20270105";
      const next = nextGoDate(derived, s, 2, from, DEFAULT_CRITERIA);
      if (next === null) {
        for (const d of dates.slice(dates.indexOf(from))) expect(verdictAt(derived, s, 2, d, DEFAULT_CRITERIA).status).not.toBe("go");
      } else {
        expect(next >= from).toBe(true);
        expect(verdictAt(derived, s, 2, next, DEFAULT_CRITERIA).status).toBe("go");
        for (const d of dates.slice(dates.indexOf(from), dates.indexOf(next))) expect(verdictAt(derived, s, 2, d, DEFAULT_CRITERIA).status).not.toBe("go");
      }
    }
  });

  it("lists the sites ready soonest, soonest first, each with the values of its own date", () => {
    const options = soonestOptions(derived, sites, 2, "20270302", DEFAULT_CRITERIA);
    expect(options.length).toBeGreaterThan(0);
    for (let i = 1; i < options.length; i++) expect(options[i].waitWeeks).toBeGreaterThanOrEqual(options[i - 1].waitWeeks);
    for (const o of options) {
      expect(o.waitWeeks).toBe(dates.indexOf(o.date) - dates.indexOf("20270302"));
      expect(o.values).toEqual(valuesAt(derived, o.site, 2, o.date));
    }
    expect(options.some((o) => o.site.id === "change4")).toBe(false);
  });
});

describe("sites added to the catalogue", () => {
  it("are all sourced, computed and inside the Moon's coordinate range", () => {
    expect(EXTRA_SITES.length).toBeGreaterThan(0);
    for (const s of EXTRA_SITES) {
      expect(s.computed).toBe(true);
      expect(s.source?.url).toMatch(/^https:\/\//);
      expect(Math.abs(s.latDeg)).toBeLessThanOrEqual(90);
      expect(Math.abs(s.lonDeg)).toBeLessThanOrEqual(180);
      expect(sites.some((x) => x.id === s.id)).toBe(false);
    }
  });
});
