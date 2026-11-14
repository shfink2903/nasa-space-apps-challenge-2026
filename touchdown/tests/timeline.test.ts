import { describe, expect, it } from "vitest";
import { latLonToUnit, length, scale } from "../src/data/astro";
import {
  arcPoint,
  CUTOFF_K,
  descentRadius,
  dustLevel,
  finalAltitudeM,
  FINAL_START_ALTITUDE_M,
  HOLD_RADIUS,
  ORBIT_TOUCH_RADIUS,
  throttle,
  TOUCHDOWN_K,
  transferSeconds,
} from "../src/flight/timeline";

describe("transfer", () => {
  it("never passes under the lower end of the arc, also to the far side", () => {
    const from = scale(latLonToUnit(8, -12), 4.2);
    for (const site of [latLonToUnit(0.67, 23.47), latLonToUnit(-45.444, 177.599), latLonToUnit(-89.5, 0)]) {
      const to = scale(site, 1.3);
      for (let k = 0; k <= 1.0001; k += 0.02) expect(length(arcPoint(from, to, k))).toBeGreaterThanOrEqual(1.3 - 1e-9);
      expect(length(arcPoint(from, to, 0))).toBeCloseTo(4.2, 9);
      const end = arcPoint(from, to, 1);
      expect(Math.hypot(end[0] - to[0], end[1] - to[1], end[2] - to[2])).toBeLessThan(1e-9);
    }
  });

  it("takes longer for a longer swing, within fixed bounds", () => {
    expect(transferSeconds(0)).toBe(5);
    expect(transferSeconds(Math.PI)).toBe(7.5);
    expect(transferSeconds(1)).toBeGreaterThan(transferSeconds(0.5));
  });
});

describe("descent", () => {
  it("goes down from the hold radius to just above the surface", () => {
    expect(descentRadius(0)).toBeCloseTo(HOLD_RADIUS, 9);
    expect(descentRadius(1)).toBeCloseTo(ORBIT_TOUCH_RADIUS, 9);
    for (let k = 0.02; k <= 1; k += 0.02) expect(descentRadius(k)).toBeLessThanOrEqual(descentRadius(k - 0.02));
  });

  it("lands softly: altitude only goes down and is zero from touchdown", () => {
    expect(finalAltitudeM(0)).toBe(FINAL_START_ALTITUDE_M);
    let prev = Infinity;
    for (let k = 0; k <= 1.0001; k += 0.01) {
      const alt = finalAltitudeM(k);
      expect(alt).toBeGreaterThanOrEqual(0);
      expect(alt).toBeLessThanOrEqual(prev);
      prev = alt;
    }
    expect(finalAltitudeM(TOUCHDOWN_K)).toBe(0);
    expect(finalAltitudeM(1)).toBe(0);
    // Last metres are slow.
    expect(finalAltitudeM(TOUCHDOWN_K - 0.02)).toBeLessThan(1);
  });

  it("cuts the engines after touchdown and stops the dust with them", () => {
    expect(throttle(0.3)).toBe(1);
    expect(throttle(TOUCHDOWN_K)).toBe(1);
    expect(throttle(CUTOFF_K)).toBe(0);
    expect(dustLevel(0)).toBe(0);
    expect(dustLevel(TOUCHDOWN_K - 0.01)).toBeGreaterThan(0.9);
    expect(dustLevel(CUTOFF_K)).toBe(0);
    expect(dustLevel(1)).toBe(0);
  });
});
