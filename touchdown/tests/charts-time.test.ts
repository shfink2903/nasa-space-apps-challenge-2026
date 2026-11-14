import { describe, expect, it } from "vitest";
import { niceRange } from "../src/charts/elevationChart";
import { windowSpans } from "../src/charts/windowStrips";
import { profileAt, wrapAzimuth } from "../src/charts/horizonPanorama";

describe("niceRange", () => {
  it("rounds the south-pole range to 5 degree ticks", () => {
    expect(niceRange(-8, 10)).toEqual({ min: -10, max: 10, step: 5 });
  });
  it("handles a degenerate range", () => {
    const r = niceRange(0, 0);
    expect(r.min).toBeLessThan(0);
    expect(r.max).toBeGreaterThan(0);
  });
  it("accepts swapped and non finite input", () => {
    expect(niceRange(10, -8)).toEqual(niceRange(-8, 10));
    expect(niceRange(NaN, NaN).step).toBeGreaterThan(0);
  });
  it("uses larger steps for mid latitudes", () => {
    expect(niceRange(-20, 75)).toEqual({ min: -30, max: 90, step: 30 });
    expect(niceRange(0, 90).step).toBe(15);
  });
  it("always covers the input and keeps at most 6 intervals", () => {
    for (const [a, b] of [[-3.2, 4.7], [-0.4, 0.9], [0, 12], [-55, 3], [0, 400]]) {
      const r = niceRange(a, b);
      expect(r.min).toBeLessThanOrEqual(a);
      expect(r.max).toBeGreaterThanOrEqual(b);
      expect((r.max - r.min) / r.step).toBeLessThanOrEqual(8);
      expect(Number.isInteger(Math.round(r.min / r.step))).toBe(true);
    }
  });
});

const T0 = Date.parse("2026-12-01T00:00:00Z");
const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("windowSpans", () => {
  it("returns nothing for no windows or an empty period", () => {
    expect(windowSpans([], T0, 30 * DAY)).toEqual([]);
    expect(windowSpans([{ startUtc: iso(T0), endUtc: iso(T0 + DAY) }], T0, 0)).toEqual([]);
  });
  it("converts a window to fractions", () => {
    const [s] = windowSpans([{ startUtc: iso(T0 + 3 * DAY), endUtc: iso(T0 + 6 * DAY) }], T0, 30 * DAY);
    expect(s.left).toBeCloseTo(0.1);
    expect(s.width).toBeCloseTo(0.1);
  });
  it("clips windows that start before or end after the period", () => {
    const spans = windowSpans(
      [
        { startUtc: iso(T0 - 5 * DAY), endUtc: iso(T0 + 3 * DAY) },
        { startUtc: iso(T0 + 28 * DAY), endUtc: iso(T0 + 40 * DAY) },
      ],
      T0,
      30 * DAY,
    );
    expect(spans[0].left).toBe(0);
    expect(spans[0].width).toBeCloseTo(0.1);
    expect(spans[1].left).toBeCloseTo(28 / 30);
    expect(spans[1].left + spans[1].width).toBeCloseTo(1);
  });
  it("drops windows outside the period, empty or invalid", () => {
    const spans = windowSpans(
      [
        { startUtc: iso(T0 - 9 * DAY), endUtc: iso(T0 - 1 * DAY) },
        { startUtc: iso(T0 + 31 * DAY), endUtc: iso(T0 + 33 * DAY) },
        { startUtc: iso(T0 + DAY), endUtc: iso(T0 + DAY) },
        { startUtc: "nope", endUtc: iso(T0 + DAY) },
        { startUtc: iso(T0 + 2 * DAY), endUtc: iso(T0 + DAY) },
      ],
      T0,
      30 * DAY,
    );
    expect(spans).toEqual([]);
  });
});

describe("wrapAzimuth", () => {
  it("is the identity range around the centre", () => {
    expect(wrapAzimuth(180, 180)).toBe(0);
    expect(wrapAzimuth(90, 180)).toBe(-90);
    expect(wrapAzimuth(270, 180)).toBe(90);
  });
  it("maps the seam to -180 and stays in [-180, 180)", () => {
    expect(wrapAzimuth(0, 180)).toBe(-180);
    expect(wrapAzimuth(360, 180)).toBe(-180);
    expect(wrapAzimuth(359, 180)).toBe(179);
    for (const az of [-720.5, -1, 0, 45, 359.99, 1000]) {
      for (const c of [0, 90, 180, 270]) {
        const w = wrapAzimuth(az, c);
        expect(w).toBeGreaterThanOrEqual(-180);
        expect(w).toBeLessThan(180);
      }
    }
  });
  it("wraps around another centre", () => {
    expect(wrapAzimuth(350, 0)).toBe(-10);
    expect(wrapAzimuth(10, 0)).toBe(10);
    expect(wrapAzimuth(10, 350)).toBe(20);
  });
});

describe("profileAt", () => {
  const profile = Array.from({ length: 3600 }, (_, i) => i / 10); // elevation = azimuth / 1
  it("returns null without data", () => {
    expect(profileAt(null, 10)).toBeNull();
    expect(profileAt([], 10)).toBeNull();
    expect(profileAt(profile, NaN)).toBeNull();
  });
  it("interpolates linearly", () => {
    expect(profileAt(profile, 12.3)).toBeCloseTo(12.3, 6);
    expect(profileAt(profile, 0.05)).toBeCloseTo(0.05, 6);
  });
  it("is periodic", () => {
    expect(profileAt(profile, 360 + 12.3)).toBeCloseTo(12.3, 6);
    expect(profileAt(profile, -347.7)).toBeCloseTo(12.3, 6);
    // Between the last sample (359.9) and the first (0): 359.95 is the midpoint.
    expect(profileAt(profile, 359.95)).toBeCloseTo((359.9 + 0) / 2, 6);
  });
  it("returns null next to a missing value", () => {
    const p: (number | null)[] = [1, null, 3, 4];
    expect(profileAt(p, 0)).toBeNull(); // between index 0 and null
    expect(profileAt(p, 90)).toBeNull(); // between null and 3
    expect(profileAt(p, 180)).toBe(3); // exact sample 2, neighbour 3 is valid
  });
  it("handles a single exact sample", () => {
    expect(profileAt([5, 7], 0)).toBe(5);
    expect(profileAt([5, 7], 180)).toBe(7);
    expect(profileAt([5, 7], 90)).toBe(6);
  });
});
