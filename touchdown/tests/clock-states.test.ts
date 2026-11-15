import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Scenario, Series, TimeWindow } from "../src/data/dataset";
import { sampleScenario, visibilityState, windowAt } from "../src/planner/clock";

const root = resolve(__dirname, "../../data/processed/v1");
const published: Scenario = JSON.parse(readFileSync(resolve(root, "scenarios/sp_s8950_20261201_30d_h2m_lola_a0a2541a.json"), "utf8"));
const series: Series = JSON.parse(gunzipSync(readFileSync(resolve(root, published.seriesRef.path))).toString());
const start = Date.parse(series.t0Utc);
const instant = (seconds: number) => new Date(start + seconds * 1000).toISOString();
const window = (a: number, b: number): TimeWindow => ({ startUtc: instant(a), endUtc: instant(b), truncatedStart: false, truncatedEnd: false });

function fixture(): Scenario {
  return {
    ...published,
    windows: { "sun.anyDisk": [window(120, 180)], "sun.fullDisk": [window(130, 170)] },
    analysableWindows: { "sun.anyDisk": [window(0, 600)], "sun.fullDisk": [window(0, 600)] },
  };
}

describe("exact published visibility states", () => {
  it("uses half-open any/full windows at every contact, including windows shorter than a display step", () => {
    const sc = fixture();
    for (const [second, state] of [[119.999, 0], [120, 1], [130, 2], [169.999, 2], [170, 1], [180, 0]] as const) {
      expect(visibilityState(sc, "sun", start + second * 1000)).toBe(state);
    }
    expect(windowAt(sc, "sun", start + 180_000)).toBeNull();
  });

  it("ignores display states for decisions between samples", () => {
    const display = { ...series, sunState: series.sunState.map(() => 0 as const) };
    expect(sampleScenario(display, fixture(), 150 / series.stepS).sunState).toBe(2);
    expect(sampleScenario(display, fixture(), 180 / series.stepS).sunState).toBe(0);
  });

  it("does not turn missing intervals, missing quality, or out-of-domain times into darkness", () => {
    const sc = fixture();
    sc.analysableWindows!["sun.anyDisk"] = [window(0, 140), window(160, 600)];
    expect(visibilityState(sc, "sun", start + 150_000)).toBeNull();
    expect(visibilityState(sc, "sun", start - 1)).toBeNull();
    expect(visibilityState(sc, "sun", start + 600_000)).toBeNull();
    expect(visibilityState({ ...sc, analysableWindows: undefined }, "sun", start)).toBeNull();
    expect(visibilityState({ ...fixture(), coverageStatus: "outside" }, "sun", start)).toBeNull();
    expect(visibilityState({ ...fixture(), processingStatus: "failed" }, "sun", start)).toBeNull();
    const unknown = { ...fixture(), metrics: published.metrics.map((m) => ({ ...m, quality: "unknown" })) };
    expect(visibilityState(unknown, "sun", start + 150_000)).toBeNull();
    expect(visibilityState({ ...fixture(), metrics: [] }, "sun", start + 150_000)).toBeNull();
  });

  it("requires full-disc coverage before declaring partial or full visibility", () => {
    const sc = fixture();
    sc.analysableWindows!["sun.fullDisk"] = [];
    expect(visibilityState(sc, "sun", start + 150_000)).toBeNull();
    expect(visibilityState(sc, "sun", start)).toBe(0);
  });

  it("switches at the published real sunset, not the nearest 600-second state", () => {
    const sunset = published.events.find((e) => e.body === "sun" && e.type === "set" && e.convention === "anyDisk")!;
    const t = Date.parse(sunset.tUtc);
    expect(visibilityState(published, "sun", t - 1)).not.toBe(0);
    expect(visibilityState(published, "sun", t)).toBe(0);
    expect(sampleScenario(series, published, (t - start) / (series.stepS * 1000)).sunState).toBe(0);
  });
});
