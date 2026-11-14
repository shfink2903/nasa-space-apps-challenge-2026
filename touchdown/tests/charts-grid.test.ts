import { describe, expect, it } from "vitest";
import { monthStarts, normalise } from "../src/charts/calendarHeatmap";
import { bestCell, gridMatrix, type GridCell } from "../src/charts/sensitivityGrid";

const cell = (eastKm: number, northKm: number, value: number | null): GridCell => ({ eastKm, northKm, value, latDeg: -89, lonDeg: 0 });
const full = (f: (e: number, n: number) => number | null): GridCell[] => {
  const out: GridCell[] = [];
  for (let n = -2; n <= 2; n++) for (let e = -2; e <= 2; e++) out.push(cell(e, n, f(e, n)));
  return out;
};

describe("monthStarts", () => {
  it("finds the first date of each month", () => {
    expect(monthStarts(["20261201", "20261208", "20261215", "20261222", "20261229", "20270105", "20270202"])).toEqual([0, 5, 6]);
  });
  it("handles a single date and empty input", () => {
    expect(monthStarts(["20261201"])).toEqual([0]);
    expect(monthStarts([])).toEqual([]);
  });
  it("always includes 0 even when all dates share a month", () => {
    expect(monthStarts(["20261201", "20261208"])).toEqual([0]);
  });
  it("separates the same month of different years", () => {
    expect(monthStarts(["20261228", "20271228"])).toEqual([0, 1]);
  });
});

describe("normalise", () => {
  it("maps linearly and clamps", () => {
    expect(normalise(0.5, [0, 1])).toBe(0.5);
    expect(normalise(-1, [0, 1])).toBe(0);
    expect(normalise(9, [0, 1])).toBe(1);
    expect(normalise(15, [10, 20])).toBe(0.5);
  });
  it("returns null for null and non-finite values, never NaN", () => {
    expect(normalise(null, [0, 1])).toBeNull();
    expect(normalise(NaN, [0, 1])).toBeNull();
    expect(normalise(Infinity, [0, 1])).toBeNull();
  });
  it("gives 0 for an empty or inverted domain", () => {
    expect(normalise(3, [2, 2])).toBe(0);
    expect(normalise(3, [5, 1])).toBe(0);
  });
});

describe("gridMatrix", () => {
  it("puts north at the top and east on the right", () => {
    const m = gridMatrix(full((e, n) => e * 10 + n));
    expect(m).toHaveLength(5);
    expect(m.every((r) => r.length === 5)).toBe(true);
    expect(m[0][0]).toMatchObject({ eastKm: -2, northKm: 2 });
    expect(m[0][4]).toMatchObject({ eastKm: 2, northKm: 2 });
    expect(m[4][0]).toMatchObject({ eastKm: -2, northKm: -2 });
    expect(m[2][2]).toMatchObject({ eastKm: 0, northKm: 0 });
  });
  it("leaves missing cells null", () => {
    const m = gridMatrix([cell(0, 0, 1)]);
    expect(m.flat().filter((c) => c !== null)).toHaveLength(1);
    expect(m[2][2]).not.toBeNull();
    expect(m[0][0]).toBeNull();
    expect(gridMatrix([]).flat().every((c) => c === null)).toBe(true);
  });
  it("ignores cells outside -2..2 or off the km grid", () => {
    const m = gridMatrix([cell(3, 0, 1), cell(0, -3, 1), cell(0.5, 0, 1)]);
    expect(m.flat().every((c) => c === null)).toBe(true);
  });
});

describe("bestCell", () => {
  it("returns the highest value", () => {
    expect(bestCell(full((e, n) => (e === 1 && n === -1 ? 9 : 1)))).toMatchObject({ eastKm: 1, northKm: -1 });
  });
  it("returns the first one on ties", () => {
    const cells = [cell(-2, -2, 5), cell(0, 0, 5), cell(2, 2, 5)];
    expect(bestCell(cells)).toBe(cells[0]);
  });
  it("skips null values and returns null when all are null or empty", () => {
    const cells = [cell(0, 0, null), cell(1, 0, 0.2)];
    expect(bestCell(cells)).toBe(cells[1]);
    expect(bestCell([cell(0, 0, null), cell(1, 1, null)])).toBeNull();
    expect(bestCell([])).toBeNull();
  });
  it("handles zero and negative values", () => {
    expect(bestCell([cell(0, 0, -3), cell(1, 0, 0)])).toMatchObject({ eastKm: 1 });
  });
});
