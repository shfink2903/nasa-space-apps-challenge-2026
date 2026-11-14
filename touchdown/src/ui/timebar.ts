import { sampleSeries, type Series } from "../data/dataset";
import type { Actions, Store } from "../state";
import { h, icon } from "./dom";
import { formatClock, formatDay, formatShortDate, formatStartDate, siteLabel } from "./format";
import { LOCALE, T } from "./strings";

const SUN_RGB = "255,186,96";
const EARTH_RGB = "157,188,255";

/** Two bands over the 30 days, from the published states: Sun on top, Earth under it. */
function drawTrack(canvas: HTMLCanvasElement, series: Series | null): void {
  const ratio = Math.min(window.devicePixelRatio, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const hgt = Math.max(1, Math.round(canvas.clientHeight * ratio));
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, hgt);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, w, hgt);
  if (!series) return;
  const gap = Math.max(1, Math.round(2 * ratio));
  const band = Math.floor((hgt - gap) / 2);
  ctx.clearRect(0, band, w, gap);
  for (let x = 0; x < w; x++) {
    const i = Math.round((x / (w - 1 || 1)) * (series.n - 1));
    for (const [state, rgb, y] of [
      [series.sunState[i], SUN_RGB, 0],
      [series.earthState[i], EARTH_RGB, band + gap],
    ] as const) {
      ctx.fillStyle =
        state === 2 ? `rgba(${rgb},0.95)` : state === 1 ? `rgba(${rgb},0.45)` : state === 0 ? "rgba(96,112,150,0.22)" : "rgba(255,255,255,0.12)";
      ctx.fillRect(x, y, 1, band);
    }
  }
  ctx.fillStyle = "rgba(5,7,12,0.55)";
  for (let d = 5; d < 30; d += 5) ctx.fillRect(Math.round((d / 30) * w), 0, Math.max(1, ratio), hgt);
}

/** Top-right: clock, start date, 30-day scrubber, play and speed. */
export function createTimeBar(store: Store, actions: Actions): HTMLElement {
  const clock = h("span", { class: "clock-time", text: "--:--" });
  const date = h("span", { class: "clock-date", text: "" });
  const offset = h("span", { class: "scrub-now", text: `${T.dayLetter} + 0` });
  const select = h("select", { class: "select", id: "start-date", "aria-label": T.startDate });
  // Any date and time inside the data: the app finds the weekly start that contains it.
  const when = h("input", { class: "select when", id: "landing-time", type: "datetime-local", min: "2026-12-01T00:00", max: "2027-12-23T00:00" });
  const period = h("p", { class: "note" });
  when.addEventListener("change", () => {
    const t = Date.parse(`${when.value}Z`);
    if (Number.isFinite(t)) actions.goToTime(t);
  });
  const track = h("canvas", { class: "scrub-track", "aria-hidden": "true" });
  const range = h("input", { class: "scrub-range", type: "range", min: 0, max: 4320, step: 1, value: 0, "aria-label": T.timeTitle });
  const playLabel = h("span", { text: T.play });
  const play = h("button", { class: "button", type: "button" }, icon("play"), playLabel);
  const speed = h(
    "select",
    { class: "select select-small", "aria-label": T.speed },
    ...T.speeds.map((s) => h("option", { value: s.value, text: s.label })),
  );
  const lightOf = h("span", { class: "legend-site", text: "" });

  const panel = h(
    "section",
    { class: "panel time", "aria-label": T.timeTitle },
    h("header", { class: "panel-head" }, h("h2", { class: "panel-title" }, icon("clock"), T.timeTitle), h("span", { class: "badge", text: "UTC" })),
    h("div", { class: "clock" }, clock, date),
    h("label", { class: "field-label", for: "landing-time", text: T.landingTime }),
    when,
    period,
    h("label", { class: "field-label only-expert", for: "start-date" }, T.startDate, h("span", { text: T.days30 })),
    h("div", { class: "only-expert" }, select),
    h("div", { class: "scrub" }, track, range),
    h("div", { class: "scrub-scale" }, h("span", { text: `${T.dayLetter} + 0` }), offset, h("span", { text: `${T.dayLetter} + 30` })),
    h("div", { class: "legend" }, h("i", { class: "dot dot-day" }), T.legendSun, h("i", { class: "dot dot-earth" }), T.legendEarth, lightOf),
    h("div", { class: "time-actions" }, play, speed),
  );

  select.addEventListener("change", () => actions.setDate(select.value));
  range.addEventListener("input", () => actions.setIndex(Number(range.value)));
  play.addEventListener("click", () => actions.togglePlay());
  speed.addEventListener("change", () => actions.setSpeed(Number(speed.value)));
  new ResizeObserver(() => drawTrack(track, store.get().series)).observe(track);

  const fraction = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  store.subscribe((s, p) => {
    if (s.dates !== p.dates) {
      select.replaceChildren(...s.dates.map((d) => h("option", { value: d, text: formatStartDate(d) })));
    }
    if (s.date !== p.date || s.dates !== p.dates) select.value = s.date;
    if (s.series !== p.series) {
      if (s.series) {
        const t0 = Date.parse(s.series.t0Utc);
        const day = (ms: number): string => formatShortDate(new Date(ms).toISOString().slice(0, 10).replaceAll("-", ""));
        period.textContent = T.windowOf(day(t0), day(t0 + (s.series.n - 1) * s.series.stepS * 1000));
      }
      drawTrack(track, s.series);
      if (s.series) range.max = String(s.series.n - 1);
    }
    if (s.lightSiteId !== p.lightSiteId || s.sites !== p.sites) {
      const site = s.sites.find((x) => x.id === s.lightSiteId);
      lightOf.textContent = site ? T.lightOf(siteLabel(site).title) : "";
    }
    if ((s.index !== p.index || s.series !== p.series) && s.series) {
      const sample = sampleSeries(s.series, s.index);
      clock.textContent = formatClock(sample.tMs);
      const stamp = new Date(sample.tMs).toISOString().slice(0, 16);
      if (document.activeElement !== when && when.value !== stamp) when.value = stamp;
      date.textContent = formatDay(sample.tMs);
      offset.textContent = `${T.dayLetter} + ${fraction.format((s.index * s.series.stepS) / 86400)}`;
      if (document.activeElement !== range) range.value = String(Math.round(s.index));
      range.style.setProperty("--p", `${(s.index / (s.series.n - 1)) * 100}%`);
    }
    if (s.playing !== p.playing) {
      play.replaceChildren(icon(s.playing ? "pause" : "play"), playLabel);
      playLabel.textContent = s.playing ? T.pause : T.play;
      play.classList.toggle("is-on", s.playing);
    }
    if (s.speedH !== p.speedH) speed.value = String(s.speedH);
  });
  return panel;
}
