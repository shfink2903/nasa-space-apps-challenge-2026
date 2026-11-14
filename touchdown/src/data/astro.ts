/**
 * Pure geometry shared by both 3D scenes. No rendering code here.
 *
 * Moon-fixed frame (MOON_ME) mapped to the scene axes:
 *   +Y = north pole, +Z = longitude 0° (sub-Earth meridian), +X = longitude 90° E.
 * Seen from +Z with +Y up, east is on the right, like the Moon seen from Earth.
 *
 * Local frame at a site: east / north / up. Azimuth is measured from north,
 * clockwise seen from the sky (north = 0°, east = 90°), as in data.md §8.
 */

export type Vec3 = readonly [number, number, number];

export const MOON_RADIUS_KM = 1737.4;
export const DEG = Math.PI / 180;

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 0 ? scale(a, 1 / l) : [0, 0, 0];
}

/** Unit vector from the Moon centre to a point at the given planetocentric coordinates. */
export function latLonToUnit(latDeg: number, lonDeg: number): Vec3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}

export interface LocalBasis {
  east: Vec3;
  north: Vec3;
  up: Vec3;
}

/** East / north / up unit vectors at a site, in the Moon-fixed scene frame. */
export function enuBasis(latDeg: number, lonDeg: number): LocalBasis {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return {
    east: [Math.cos(lon), 0, -Math.sin(lon)],
    north: [-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon)],
    up: latLonToUnit(latDeg, lonDeg),
  };
}

/** Direction for an azimuth / elevation, as [east, north, up] components. */
export function azElToEnu(azDeg: number, elDeg: number): Vec3 {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)];
}

/** Direction seen from a site (azimuth / elevation) expressed in the Moon-fixed scene frame. */
export function azElToMoonFixed(azDeg: number, elDeg: number, latDeg: number, lonDeg: number): Vec3 {
  const [e, n, u] = azElToEnu(azDeg, elDeg);
  const b = enuBasis(latDeg, lonDeg);
  return normalize(add(add(scale(b.east, e), scale(b.north, n)), scale(b.up, u)));
}

/**
 * [east, north, up] to the axes of the surface scene:
 * +X = east, +Y = up, +Z = south (right-handed, so north is -Z).
 */
export function enuToSurface(enu: Vec3): Vec3 {
  return [enu[0], enu[2], -enu[1]];
}

/** Shortest-path interpolation between two angles in degrees. Result is in [0, 360). */
export function lerpAngleDeg(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + d * t) % 360) + 360) % 360;
}

/** Spherical interpolation between two unit vectors. */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const c = Math.min(1, Math.max(-1, dot(a, b)));
  const omega = Math.acos(c);
  if (omega < 1e-6) return normalize(add(scale(a, 1 - t), scale(b, t)));
  if (Math.PI - omega < 1e-6) {
    // Antipodal: pick any great circle through a.
    const helper: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const axis = normalize(cross(a, helper));
    const mid = normalize(cross(axis, a));
    return t < 0.5 ? slerp(a, mid, t * 2) : slerp(mid, b, t * 2 - 1);
  }
  const s = Math.sin(omega);
  return add(scale(a, Math.sin((1 - t) * omega) / s), scale(b, Math.sin(t * omega) / s));
}
