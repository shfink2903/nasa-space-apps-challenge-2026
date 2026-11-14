import { describe, expect, it } from "vitest";
import { hash2, sampleGround, seedFromId } from "../src/scene/terrain";

describe("procedural ground", () => {
  it("is the same for the same site and differs between sites", () => {
    const a = seedFromId("apollo11");
    expect(seedFromId("apollo11")).toBe(a);
    expect(seedFromId("apollo12")).not.toBe(a);
    expect(sampleGround(812.5, -340.25, a)).toEqual(sampleGround(812.5, -340.25, a));
    expect(sampleGround(812.5, -340.25, a).height).not.toBe(sampleGround(812.5, -340.25, seedFromId("im1")).height);
  });

  it("keeps the pad level and blends without a step", () => {
    const seed = seedFromId("change4");
    for (let a = 0; a < 6.28; a += 0.3) {
      for (const r of [0, 10, 30, 44.9]) expect(sampleGround(Math.cos(a) * r, Math.sin(a) * r, seed).height).toBe(0);
      expect(Math.abs(sampleGround(Math.cos(a) * 46, Math.sin(a) * 46, seed).height)).toBeLessThan(0.05);
    }
  });

  it("stays finite and within believable bounds over the whole patch", () => {
    const seed = seedFromId("sp_s8950");
    let min = Infinity;
    let max = -Infinity;
    for (let x = -7000; x <= 7000; x += 173) {
      for (let z = -7000; z <= 7000; z += 191) {
        const g = sampleGround(x, z, seed);
        expect(Number.isFinite(g.height)).toBe(true);
        expect(g.tone).toBeGreaterThanOrEqual(0.7);
        expect(g.tone).toBeLessThanOrEqual(1.35);
        min = Math.min(min, g.height);
        max = Math.max(max, g.height);
      }
    }
    expect(min).toBeGreaterThan(-400);
    expect(max).toBeLessThan(150);
    expect(max - min).toBeGreaterThan(30); // there is real relief
  });

  it("gives hash values in [0, 1)", () => {
    for (let i = -50; i < 50; i++) {
      const h = hash2(i, i * 7 - 3, 12345);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});
