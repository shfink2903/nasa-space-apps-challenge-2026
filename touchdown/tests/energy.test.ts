import { describe, expect, it } from "vitest";
import { HOURS_30_DAYS, HOURS_YEAR, SOLAR_KW_PER_M2, solarEnergyKwhPerM2 } from "../src/data/energy";

describe("solar energy received", () => {
  it("uses the solar constant and nothing about the lander", () => {
    expect(SOLAR_KW_PER_M2).toBe(1.361);
    expect(HOURS_30_DAYS).toBe(720);
    expect(HOURS_YEAR).toBe(8760);
  });

  it("is zero without Sun and full when the Sun is always visible", () => {
    expect(solarEnergyKwhPerM2(0, HOURS_30_DAYS)).toBe(0);
    expect(solarEnergyKwhPerM2(1, HOURS_30_DAYS)).toBeCloseTo(979.92, 2);
    expect(solarEnergyKwhPerM2(1, HOURS_YEAR)).toBeCloseTo(11922.36, 2);
  });

  it("grows in proportion to the share of time with the Sun visible", () => {
    expect(solarEnergyKwhPerM2(0.5, HOURS_30_DAYS)).toBeCloseTo(solarEnergyKwhPerM2(1, HOURS_30_DAYS) / 2, 6);
  });
});
