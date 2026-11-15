import { describe, expect, it } from "vitest";
import { batteryKWh, incidentEnergyKWhM2, meanPowerWM2, PERIOD_H, SOLAR_CONSTANT_W_M2 } from "../src/planner/power";

describe("power estimates", () => {
  it("full Sun all period at 0° gives solar constant × 720 h", () => {
    const e = incidentEnergyKWhM2({ sunShare: 1, sunFullShare: 1, sunMeanElDeg: 0 })!;
    expect(e).toBeCloseTo((SOLAR_CONSTANT_W_M2 * PERIOD_H) / 1000, 6);
    expect(meanPowerWM2(e)).toBeCloseTo(SOLAR_CONSTANT_W_M2, 6);
  });

  it("counts part of the disc as half and applies cos(elevation)", () => {
    const e = incidentEnergyKWhM2({ sunShare: 0.6, sunFullShare: 0.4, sunMeanElDeg: 60 })!;
    expect(e).toBeCloseTo((SOLAR_CONSTANT_W_M2 * 0.5 * PERIOD_H * (0.4 + 0.1)) / 1000, 6);
  });

  it("is zero with no Sun and null when not published", () => {
    expect(incidentEnergyKWhM2({ sunShare: 0, sunFullShare: 0, sunMeanElDeg: null })).toBe(0);
    expect(incidentEnergyKWhM2({ sunShare: null, sunFullShare: null, sunMeanElDeg: null })).toBeNull();
  });

  it("sizes the battery for the longest night", () => {
    expect(batteryKWh(336, 100)).toBeCloseTo(33.6, 6);
    expect(batteryKWh(null)).toBeNull();
  });
});
