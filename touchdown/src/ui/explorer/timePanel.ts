import { createElevationChart } from "../../charts/elevationChart";
import { profileAt } from "../../charts/horizonPanorama";
import { COLORS } from "../../charts/theme";
import { createWindowStrips } from "../../charts/windowStrips";
import { sampleSeries } from "../../data/dataset";
import type { Bundle } from "../../data/resources";
import { bundleFor, focusSite } from "../../planner/select";
import type { Ui } from "../context";
import { h, icon } from "../dom";

const SPEEDS = [1, 6, 24, 72];

/** Terrain horizon in the direction of a body at each step. Cached per bundle: the profile lookup is not free. */
const horizonCache = new WeakMap<Bundle, { sun: (number | null)[]; earth: (number | null)[] } | null>();
export function horizonTracks(bundle: Bundle): { sun: (number | null)[]; earth: (number | null)[] } | null {
  if (!horizonCache.has(bundle)) {
    const profile = bundle.horizon?.horizonElevationDeg;
    horizonCache.set(
      bundle,
      profile
        ? {
            sun: bundle.series.sunAzDeg.map((az) => profileAt(profile, az)),
            earth: bundle.series.earthAzDeg.map((az) => profileAt(profile, az)),
          }
        : null,
    );
  }
  return horizonCache.get(bundle)!;
}

/**
 * Right panel, top: the clock, the start date of the 30-day period, the mast
 * height, and the period itself: when the Sun and the Earth are visible, and
 * how high they are. Click or drag in the charts to move the time.
 */
export function createTimePanel(ui: Ui): HTMLElement {
  const { t, fmt, actions, resources } = ui;

  const clock = h("span", { class: "clock-time", text: "--:--" });
  const date = h("span", { class: "clock-date" });
  const offset = h("span", { class: "clock-offset" });
  const select = h("select", { class: "select", id: "start-date", "aria-label": t.startDate });
  const prev = h("button", { class: "icon-button", type: "button", "aria-label": t.prevWeek, title: t.prevWeek }, icon("left"));
  const next = h("button", { class: "icon-button", type: "button", "aria-label": t.nextWeek, title: t.nextWeek }, icon("right"));
  const mast = [2, 10].map((m) => {
    const b = h("button", { class: "segment", type: "button", text: t.mastUnit(m) });
    b.addEventListener("click", () => actions.setHeight(m));
    return { m, b };
  });
  const strips = createWindowStrips();
  const chart = createElevationChart();
  ui.onDispose(() => {
    strips.destroy();
    chart.destroy();
  });
  const range = h("input", { class: "scrub-range", type: "range", min: 0, max: 4320, step: 1, value: 0, "aria-label": t.timeTitle });
  const playLabel = h("span", { text: t.play });
  const play = h("button", { class: "button", type: "button" }, icon("play"), playLabel);
  const speed = h(
    "select",
    { class: "select select-small", "aria-label": t.speed },
    ...SPEEDS.map((value, i) => h("option", { value, text: t.speeds[i] })),
  );

  const panel = h(
    "section",
    { class: "panel time", "aria-label": t.timeTitle },
    h("header", { class: "panel-head" }, h("h2", { class: "panel-title" }, icon("clock"), t.timeTitle), h("span", { class: "badge", text: "UTC" })),
    h("div", { class: "clock" }, clock, h("div", { class: "clock-side" }, date, offset)),
    h(
      "div",
      { class: "time-fields" },
      h("label", { class: "field" }, h("span", { class: "field-label", text: `${t.startDate} · ${t.days30}` }), h("div", { class: "date-row" }, prev, select, next)),
      h("div", { class: "field" }, h("span", { class: "field-label", text: t.mast }), h("div", { class: "segments" }, ...mast.map((x) => x.b))),
    ),
    strips.el,
    h("div", { class: "field-label chart-caption", text: t.elevationAxis }),
    chart.el,
    range,
    h("div", { class: "time-actions" }, play, speed),
  );

  select.addEventListener("change", () => actions.setDate(select.value));
  prev.addEventListener("click", () => actions.shiftDate(-1));
  next.addEventListener("click", () => actions.shiftDate(1));
  range.addEventListener("input", () => actions.setIndex(Number(range.value)));
  play.addEventListener("click", () => actions.togglePlay());
  speed.addEventListener("change", () => actions.setSpeed(Number(speed.value)));

  ui.watch(
    (s) => [s.dates, s.date, s.heightM, s.playing, s.speedH],
    (s) => {
      if (select.options.length !== s.dates.length) {
        select.replaceChildren(...s.dates.map((d) => h("option", { value: d, text: fmt.startDate(d) })));
      }
      select.value = s.date;
      prev.disabled = s.dates.indexOf(s.date) <= 0;
      next.disabled = s.dates.indexOf(s.date) >= s.dates.length - 1;
      for (const x of mast) x.b.classList.toggle("is-on", x.m === s.heightM);
      play.replaceChildren(icon(s.playing ? "pause" : "play"), playLabel);
      playLabel.textContent = s.playing ? t.pause : t.play;
      play.classList.toggle("is-on", s.playing);
      speed.value = String(s.speedH);
    },
  );

  ui.watch(
    (s) => [s.focusId, s.date, s.heightM, s.scope, s.index, s.dataVersion],
    (s) => {
      const bundle = bundleFor(s, resources, focusSite(s));
      panel.classList.toggle("is-loading", !bundle);
      if (!bundle) return;
      const { series, scenario } = bundle;
      const sample = sampleSeries(series, s.index);
      const t0 = Date.parse(series.t0Utc);
      clock.textContent = fmt.clock(sample.tMs);
      date.textContent = fmt.day(sample.tMs);
      offset.textContent = t.dayOffset(fmt.number((s.index * series.stepS) / 86400));
      range.max = String(series.n - 1);
      if (document.activeElement !== range) range.value = String(Math.round(s.index));

      const durationMs = (series.n - 1) * series.stepS * 1000;
      strips.update({
        t0Ms: t0,
        durationMs,
        rows: [
          { id: "sun", label: t.rowSun, color: COLORS.sun, windows: scenario.windows["sun.anyDisk"] ?? [] },
          { id: "earth", label: t.rowEarth, color: COLORS.earth, windows: scenario.windows["earth.anyDisk"] ?? [] },
          { id: "both", label: t.rowBoth, color: COLORS.both, windows: scenario.overlapWindows },
        ],
        cursorMs: sample.tMs,
        onScrub: (tMs) => actions.setTime(tMs),
      });
      const horizon = horizonTracks(bundle);
      chart.update({
        t0Ms: t0,
        stepS: series.stepS,
        n: series.n,
        tracks: [
          { id: "sun", label: t.sun, color: COLORS.sun, elevationDeg: series.sunElDeg, state: series.sunState, horizonDeg: horizon?.sun },
          { id: "earth", label: t.earth, color: COLORS.earth, elevationDeg: series.earthElDeg, state: series.earthState, horizonDeg: horizon?.earth },
        ],
        cursorIndex: s.index,
        dayLabel: t.dayLabel,
        formatDeg: (deg) => fmt.elevation(deg),
        onScrub: (index) => actions.setIndex(index),
      });
    },
  );
  return panel;
}
