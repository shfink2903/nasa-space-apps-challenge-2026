/**
 * "How long until the Sun or the Earth sets?" from the published events.
 * Times come from the dataset. Only the difference with the chosen time is computed here.
 */
import { sampleSeries, type DiskState, type Sample, type Scenario, type ScenarioEvent, type Series, type TimeWindow } from "../data/dataset";

export type Body = "sun" | "earth";

/** Published intervals are half-open: a set instant belongs to the hidden interval. */
function contains(windows: TimeWindow[] | undefined, tMs: number): boolean {
  return Array.isArray(windows) && windows.some((w) => Date.parse(w.startUtc) <= tMs && tMs < Date.parse(w.endUtc));
}

/** State from the exact published windows, never from the 600-second display samples. */
export function visibilityState(scenario: Scenario, body: Body, tMs: number): DiskState {
  if (!Number.isFinite(tMs) || scenario.coverageStatus === "outside" || scenario.processingStatus === "failed") return null;
  const any = `${body}.anyDisk`, full = `${body}.fullDisk`;
  const quality = scenario.metrics.find((m) => m.metricId === `${any}.fraction`)?.quality;
  if ((quality !== "complete" && quality !== "partial") || !contains(scenario.analysableWindows?.[any], tMs)) return null;
  if (!Array.isArray(scenario.windows[any])) return null;
  if (!contains(scenario.windows[any], tMs)) return 0;
  if (!contains(scenario.analysableWindows?.[full], tMs) || !Array.isArray(scenario.windows[full])) return null;
  const fullQuality = scenario.metrics.find((m) => m.metricId === `${full}.fraction`)?.quality;
  if (fullQuality !== "complete" && fullQuality !== "partial") return null;
  return contains(scenario.windows[full], tMs) ? 2 : 1;
}

/** Interpolated angles for drawing, exact interval membership for every state and action. */
export function sampleScenario(series: Series, scenario: Scenario, index: number): Sample {
  const sample = sampleSeries(series, index);
  return { ...sample, sunState: visibilityState(scenario, "sun", sample.tMs), earthState: visibilityState(scenario, "earth", sample.tMs) };
}

/** Next published rise or set of a body (any part of the disc) after a time, or null. */
export function nextEvent(scenario: Scenario, body: Body, tMs: number): ScenarioEvent | null {
  let best: ScenarioEvent | null = null;
  let bestT = Infinity;
  for (const ev of scenario.events) {
    if (ev.body !== body || ev.convention !== "anyDisk" || ev.type === "grazing") continue;
    const t = Date.parse(ev.tUtc);
    if (t > tMs && t < bestT) {
      best = ev;
      bestT = t;
    }
  }
  return best;
}

/** The published window of a body that contains a time, or null when the body is not visible then. */
export function windowAt(scenario: Scenario, body: Body, tMs: number): TimeWindow | null {
  for (const w of scenario.windows[`${body}.anyDisk`] ?? []) {
    if (Date.parse(w.startUtc) <= tMs && tMs < Date.parse(w.endUtc)) return w;
  }
  return null;
}

/** Whole days, hours and minutes of a duration. */
export function splitDuration(ms: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}
