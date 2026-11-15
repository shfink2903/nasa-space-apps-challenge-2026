/**
 * Engineering estimates built on the published 30-day metrics.
 *
 * These are team estimates, not dataset values. They turn "visible" into units a
 * mission planner sizes hardware with, under simple stated assumptions:
 * - Panel: flat, vertical, turning to face the Sun in azimuth (usual at the poles).
 *   Incident power = solar constant × cos(Sun elevation).
 * - Whole disc visible counts fully; part of the disc counts as half (a coarse mean).
 * - Sun elevation: the published mean elevation while any part of the disc is visible.
 * - No panel efficiency, dust, temperature or Sun-Moon distance correction.
 * - Battery: the load runs through the longest published night, with no margin.
 */
import type { SiteMetrics } from "./metrics";

/** Mean total solar irradiance at 1 AU (W/m²). */
export const SOLAR_CONSTANT_W_M2 = 1361;
/** Length of one analysed period: 30 days. */
export const PERIOD_H = 30 * 24;
/** Example survival load (heaters, computer, radio on standby), in W. */
export const DEFAULT_SURVIVAL_LOAD_W = 100;

/** Sunlight reaching 1 m² of vertical, Sun-facing panel over the 30 days, in kWh/m². Null if not published. */
export function incidentEnergyKWhM2(m: Pick<SiteMetrics, "sunShare" | "sunFullShare" | "sunMeanElDeg">): number | null {
  if (m.sunShare === null) return null;
  const full = Math.min(m.sunFullShare ?? m.sunShare, m.sunShare);
  const partial = Math.max(0, m.sunShare - full);
  const litHours = PERIOD_H * (full + 0.5 * partial);
  const cosEl = m.sunMeanElDeg === null ? 1 : Math.cos((m.sunMeanElDeg * Math.PI) / 180);
  return (SOLAR_CONSTANT_W_M2 * cosEl * litHours) / 1000;
}

/** Mean incident power over the whole period, in W/m² (energy spread over 720 h, night included). */
export function meanPowerWM2(energyKWhM2: number | null): number | null {
  return energyKWhM2 === null ? null : (energyKWhM2 * 1000) / PERIOD_H;
}

/** Battery energy to carry a load through the longest night, in kWh. */
export function batteryKWh(longestNightH: number | null, loadW = DEFAULT_SURVIVAL_LOAD_W): number | null {
  return longestNightH === null ? null : (longestNightH * loadW) / 1000;
}
