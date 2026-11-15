import { describe, expect, it } from "vitest";
import { toCsv } from "../src/ui/csv";
import { decodeState, encodeState } from "../src/ui/share";
import type { AppState } from "../src/state";

const sites = [{ id: "a" }, { id: "b" }, { id: "c" }];
const dates = ["20261201", "20261208"];
const state = {
  tab: "data",
  focusId: "b",
  date: "20261208",
  heightM: 10,
  scope: "all",
  criterion: "power",
  compareIds: ["a", "c"],
  index: 1234.6,
  requirements: { minSunShare: 0.3, minEarthShare: null, maxDarkH: 200 },
} as unknown as AppState;

describe("shareable link", () => {
  it("round-trips the scenario", () => {
    const back = decodeState(encodeState(state), sites, dates, 4320);
    expect(back).toEqual({ ...state, index: 1235 });
  });

  it("drops what it does not know instead of guessing", () => {
    const back = decodeState("#tab=x&site=zzz&date=20991231&h=7&scope=y&crit=z&cmp=zzz,a,a&t=99999&req=2,0,0", sites, dates, 4320);
    expect(back).toEqual({ compareIds: ["a"], index: 4320 });
  });
});

describe("csv", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(toCsv([["a", 1, null], ['x,"y"', "l1\nl2", 2.5]])).toBe('a,1,\r\n"x,""y""","l1\nl2",2.5');
  });
});
