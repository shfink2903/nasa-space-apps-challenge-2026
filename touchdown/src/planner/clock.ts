/**
 * "How long until the Sun or the Earth sets?" from the published events.
 * Times come from the dataset. Only the difference with the chosen time is computed here.
 */
import type { Scenario, ScenarioEvent, TimeWindow } from "../data/dataset";

export type Body = "sun" | "earth";

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
    if (Date.parse(w.startUtc) <= tMs && tMs <= Date.parse(w.endUtc)) return w;
  }
  return null;
}

/** Whole days, hours and minutes of a duration. */
export function splitDuration(ms: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}
