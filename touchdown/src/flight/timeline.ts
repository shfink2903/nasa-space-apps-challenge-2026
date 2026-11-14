/**
 * Pure timing and shape of the illustrative flight. No rendering code here.
 * Nothing in this file is a vehicle parameter: these numbers only shape the
 * animation, and none of them is shown to the user.
 */
import { length, normalize, scale, slerp, type Vec3 } from "../data/astro";

/** "focus" is the orbit view zoomed on the selected site, before any flight. */
export type Phase = "cruise" | "focus" | "transfer" | "descent" | "final" | "surface";

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Orbit scene distances are in Moon radii from the Moon centre. */
export const HOLD_RADIUS = 1.1;
export const ORBIT_TOUCH_RADIUS = 1.035;

export const DESCENT_SECONDS = 6.5;
export const FINAL_SECONDS = 11;

/** A longer swing around the Moon gets a little more time. */
export function transferSeconds(angleRad: number): number {
  return 5 + 2.5 * clamp01(angleRad / Math.PI);
}

/**
 * Point on the transfer arc of the camera: the direction turns around the Moon
 * on a great circle while the distance from the centre changes smoothly. The
 * arc can never pass under the lower of its two ends.
 */
export function arcPoint(from: Vec3, to: Vec3, k: number): Vec3 {
  const e = easeInOutCubic(clamp01(k));
  const direction = slerp(normalize(from), normalize(to), e);
  return scale(direction, mix(length(from), length(to), e));
}

/** Ship distance from the Moon centre during the orbital part of the descent. */
export function descentRadius(k: number): number {
  return mix(HOLD_RADIUS, ORBIT_TOUCH_RADIUS, easeInOutCubic(clamp01(k)));
}

/** Final descent (surface scene). k runs 0..1 over FINAL_SECONDS. */
export const TOUCHDOWN_K = 0.78;
export const CUTOFF_K = 0.86;
export const FINAL_START_ALTITUDE_M = 320;
const DUST_ALTITUDE_M = 90;

/** Height of the ship base above the pad. The speed goes to zero at touchdown. */
export function finalAltitudeM(k: number): number {
  const s = clamp01(k / TOUCHDOWN_K);
  return FINAL_START_ALTITUDE_M * Math.pow(1 - s, 2.2);
}

/** Engine level 0..1. Full during the descent, then a short ramp down after touchdown. */
export function throttle(k: number): number {
  return 1 - smoothstep(TOUCHDOWN_K, CUTOFF_K, k);
}

/** Dust level 0..1. Dust starts when the flame is near the ground and stops with the engines. */
export function dustLevel(k: number): number {
  const near = 1 - smoothstep(DUST_ALTITUDE_M * 0.35, DUST_ALTITUDE_M, finalAltitudeM(k));
  return near * throttle(k);
}
