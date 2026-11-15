import { sampleSeries, type Series } from "../data/dataset";
import type { Actions, Store } from "../state";
import { h, icon } from "./dom";
import { formatClock, formatDayMonth, siteLabel } from "./format";
import { T } from "./strings";

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
  if (!series) return;
  const gap = Math.max(2, Math.round(6 * ratio));
  const band = Math.floor((hgt - gap) / 2);
  for (let x = 0; x < w; x++) {
    const i = Math.round((x / (w - 1 || 1)) * (series.n - 1));
    for (const [state, rgb, y] of [
      [series.sunState[i], SUN_RGB, 0],
      [series.earthState[i], EARTH_RGB, band + gap],
    ] as const) {
      ctx.fillStyle = state === 2 ? `rgb(${rgb})` : state === 1 ? `rgba(${rgb},0.5)` : "rgba(255,255,255,0.08)";
      ctx.fillRect(x, y, 1, band);
    }
  }
}

/**
 * Bottom bar, shown with a site: the 30 studied days as two bands (Sun
 * visible, Earth visible) and one cursor. Play moves the cursor.
 */
export function createTimeBar(store: Store, actions: Actions): HTMLElement {
  const title = h("b", { class: "dock-title" });
  const day = h("b", { class: "dock-day" });
  const moment = h("span", { class: "dock-moment" });
  const from = h("span");
  const to = h("span");
  const track = h("canvas", { class: "scrub-track", "aria-hidden": "true" });
  const range = h("input", { class: "scrub-range", type: "range", min: 0, max: 4320, step: 1, value: 0, "aria-label": T.timeTitle });
  const playLabel = h("span", { text: T.play });
  const play = h("button", { class: "button button-primary dock-play", type: "button" }, icon("play"), playLabel);

  const panel = h(
    "section",
    { class: "panel time dock", "aria-label": T.timeTitle },
    h("div", { class: "dock-side" }, play, h("div", { class: "dock-now" }, day, moment)),
    h(
      "div",
      { class: "dock-main" },
      title,
      h(
        "div",
        { class: "dock-bands" },
        h("div", { class: "band-labels", "aria-hidden": "true" }, h("span", { class: "band-sun", text: T.bandSun }), h("span", { class: "band-earth", text: T.bandEarth })),
        h("div", { class: "scrub" }, track, range),
      ),
      h("div", { class: "dock-scale" }, h("span"), h("div", null, from, to)),
    ),
  );

  range.addEventListener("input", () => actions.setIndex(Number(range.value)));
  play.addEventListener("click", () => actions.togglePlay());
  new ResizeObserver(() => drawTrack(track, store.get().series)).observe(track);

  store.subscribe((s, p) => {
    if (s.phase !== p.phase || s.touring !== p.touring || s.compareOpen !== p.compareOpen) panel.hidden = s.phase === "cruise" || s.touring || s.compareOpen;
    if (s.series !== p.series) {
      drawTrack(track, s.series);
      if (s.series) {
        const t0 = Date.parse(s.series.t0Utc);
        range.max = String(s.series.n - 1);
        from.textContent = `${T.dayN(1)}, ${formatDayMonth(t0)}`;
        to.textContent = `${T.dayN(30)}, ${formatDayMonth(t0 + 29 * 86_400_000)}`;
      }
    }
    if (s.lightSiteId !== p.lightSiteId || s.sites !== p.sites) {
      const site = s.sites.find((x) => x.id === s.lightSiteId);
      title.textContent = site ? T.dockTitle(siteLabel(site).title) : T.timeTitle;
    }
    if ((s.index !== p.index || s.series !== p.series) && s.series) {
      const sample = sampleSeries(s.series, s.index);
      day.textContent = T.dayN(Math.min(30, Math.floor((s.index * s.series.stepS) / 86400) + 1));
      moment.textContent = `${formatDayMonth(sample.tMs)}, ${formatClock(sample.tMs)} UTC`;
      if (document.activeElement !== range) range.value = String(Math.round(s.index));
      range.style.setProperty("--p", `${(s.index / (s.series.n - 1)) * 100}%`);
    }
    if (s.playing !== p.playing) {
      play.replaceChildren(icon(s.playing ? "pause" : "play"), playLabel);
      playLabel.textContent = s.playing ? T.pause : T.play;
    }
  });
  panel.hidden = true;
  return panel;
}
