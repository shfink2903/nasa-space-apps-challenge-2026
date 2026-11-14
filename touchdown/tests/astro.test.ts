import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  azElToEnu,
  azElToMoonFixed,
  cross,
  DEG,
  dot,
  enuBasis,
  enuToSurface,
  latLonToUnit,
  length,
  lerpAngleDeg,
  slerp,
  type Vec3,
} from "../src/data/astro";

const DATA = resolve(__dirname, "../../data/processed/v1");
const close = (a: Vec3, b: Vec3, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);

describe("frames", () => {
  it("maps longitude 0 to +Z, 90° E to +X, north pole to +Y", () => {
    expect(close(latLonToUnit(0, 0), [0, 0, 1])).toBe(true);
    expect(close(latLonToUnit(0, 90), [1, 0, 0])).toBe(true);
    expect(close(latLonToUnit(90, 37), [0, 1, 0])).toBe(true);
  });

  it("gives a right-handed orthonormal east/north/up basis everywhere", () => {
    for (const [lat, lon] of [[0.67, 23.47], [-89.5, 0], [-45.4, 177.6], [26.1, -3.6]]) {
      const b = enuBasis(lat, lon);
      expect(length(b.east)).toBeCloseTo(1, 12);
      expect(length(b.north)).toBeCloseTo(1, 12);
      expect(dot(b.east, b.north)).toBeCloseTo(0, 12);
      expect(dot(b.east, b.up)).toBeCloseTo(0, 12);
      expect(close(cross(b.east, b.north), b.up, 1e-12)).toBe(true);
    }
  });

  it("uses north = 0° and east = 90° for azimuth", () => {
    expect(close(azElToEnu(0, 0), [0, 1, 0])).toBe(true);
    expect(close(azElToEnu(90, 0), [1, 0, 0])).toBe(true);
    expect(close(azElToEnu(123, 90), [0, 0, 1])).toBe(true);
    // Surface scene: +X east, +Y up, +Z south.
    expect(close(enuToSurface(azElToEnu(0, 0)), [0, 0, -1])).toBe(true);
    expect(close(enuToSurface(azElToEnu(90, 0)), [1, 0, 0])).toBe(true);
  });

  it("puts a body at the zenith on the site direction", () => {
    expect(close(azElToMoonFixed(0, 90, -45.444, 177.599), latLonToUnit(-45.444, 177.599))).toBe(true);
  });
});

describe("angles and arcs", () => {
  it("interpolates angles across the 0°/360° wrap", () => {
    expect(lerpAngleDeg(359, 1, 0.5)).toBeCloseTo(0, 9);
    expect(lerpAngleDeg(10, 350, 0.25)).toBeCloseTo(5, 9);
  });

  it("keeps a slerp arc on the unit sphere, also for opposite points", () => {
    const a = latLonToUnit(0.67, 23.47);
    for (const b of [latLonToUnit(-45.4, 177.6), [-a[0], -a[1], -a[2]] as Vec3]) {
      for (let t = 0; t <= 1; t += 0.05) expect(length(slerp(a, b, t))).toBeCloseTo(1, 9);
      expect(close(slerp(a, b, 0), a, 1e-9)).toBe(true);
      expect(close(slerp(a, b, 1), b, 1e-9)).toBe(true);
    }
  });
});

/**
 * Check against the dataset itself. The series give the sub-solar latitude and
 * the sub-Earth point. The direction we rebuild from azimuth / elevation at a
 * site must point to the same place. This proves the azimuth sense, the
 * longitude sign and the frame mapping with real numbers.
 */
describe("dataset cross-check", () => {
  const sites = JSON.parse(readFileSync(resolve(DATA, "sites.json"), "utf8")).sites as {
    id: string;
    latDeg: number;
    lonDeg: number;
  }[];
  const files = readdirSync(resolve(DATA, "series"));

  for (const id of ["apollo11", "change4", "im1"]) {
    it(`rebuilds the sub-solar latitude and the sub-Earth point from ${id}`, () => {
      const site = sites.find((s) => s.id === id)!;
      const file = files.find((f) => f.startsWith(`${id}_20261201_30d_h2m_geometric_`))!;
      const s = JSON.parse(gunzipSync(readFileSync(resolve(DATA, "series", file))).toString());
      for (let i = 0; i < s.n; i += 97) {
        const sun = azElToMoonFixed(s.sunAzDeg[i], s.sunElDeg[i], site.latDeg, site.lonDeg);
        expect(Math.abs(Math.asin(sun[1]) / DEG - s.subSolarLatDeg[i])).toBeLessThan(0.02);
        // Earth is close: the site sees it up to 0.26° away from the centre-to-centre line.
        const earth = azElToMoonFixed(s.earthAzDeg[i], s.earthElDeg[i], site.latDeg, site.lonDeg);
        const expected = latLonToUnit(s.subEarthLatDeg[i], s.subEarthLonDeg[i]);
        expect(Math.acos(Math.min(1, dot(earth, expected))) / DEG).toBeLessThan(0.3);
      }
    });
  }
});
