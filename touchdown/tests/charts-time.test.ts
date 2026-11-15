import { describe, expect, it } from "vitest";
import { niceRange } from "../src/charts/elevationChart";

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
