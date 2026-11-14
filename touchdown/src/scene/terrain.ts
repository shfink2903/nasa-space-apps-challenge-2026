/**
 * Procedural ground around the landing pad. Pure functions, no rendering code.
 * The ground is generic lunar soil: craters of many sizes on gentle swells.
 * It is seeded by the site id, so a site always looks the same. It is not a
 * terrain model of the real site.
 */

export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic value in [0, 1) for a grid cell. */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Crater cell sizes in metres, large to small. */
const CELLS = [1600, 800, 400, 200, 100, 50, 25, 12];
const PAD_FLAT_M = 45;
const PAD_BLEND_M = 260;

export interface GroundSample {
  /** Height in metres above the pad level. */
  height: number;
  /** Brightness factor around 1: fresh rims are lighter, bowls a little darker. */
  tone: number;
}

export function sampleGround(x: number, z: number, seed: number): GroundSample {
  let height = 0;
  let tone = 1;
  for (let o = 0; o < CELLS.length; o++) {
    const cell = CELLS[o];
    const s = seed + o * 1013;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    const relief = cell >= 800 ? 0.55 : 1; // keep the largest bowls shallow near the pad
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const gx = cx + i;
        const gz = cz + j;
        if (hash2(gx, gz, s) > 0.55) continue; // not every cell has a crater
        const radius = cell * (0.12 + 0.26 * hash2(gx, gz, s + 1));
        const px = (gx + 0.2 + 0.6 * hash2(gx, gz, s + 2)) * cell;
        const pz = (gz + 0.2 + 0.6 * hash2(gx, gz, s + 3)) * cell;
        const d = Math.hypot(x - px, z - pz) / radius;
        if (d >= 2.5) continue;
        const age = hash2(gx, gz, s + 4); // 1 = fresh and sharp
        const depth = radius * (0.1 + 0.2 * age) * relief;
        const rim = radius * 0.05 * (0.4 + 0.6 * age) * relief;
        if (d < 1) {
          height += -depth + (depth + rim) * Math.pow(d, 2.4);
          tone -= 0.05 * (1 - d) * age;
        } else {
          const fade = 1 - smooth((d - 1) / 1.5);
          height += rim * fade * fade;
        }
        tone += 0.14 * age * Math.exp(-Math.pow((d - 1) * 3.2, 2));
      }
    }
  }
  height += (valueNoise(x / 900, z / 900, seed + 31) - 0.5) * 22;
  height += (valueNoise(x / 240, z / 240, seed + 37) - 0.5) * 7;
  height += (valueNoise(x / 60, z / 60, seed + 41) - 0.5) * 1.6;
  tone += (valueNoise(x / 130, z / 130, seed + 43) - 0.5) * 0.12;

  // The ship stands on a level pad. Blend the relief in around it.
  const r = Math.hypot(x, z);
  const w = r <= PAD_FLAT_M ? 0 : smooth(Math.min(1, (r - PAD_FLAT_M) / (PAD_BLEND_M - PAD_FLAT_M)));
  return { height: w === 0 ? 0 : height * w, tone: Math.min(1.35, Math.max(0.7, tone)) };
}
