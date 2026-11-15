import { createElevationChart } from "../../charts/elevationChart";
import { COLORS } from "../../charts/theme";
import { createWindowStrips } from "../../charts/windowStrips";
import { pickScenarioId, type Series } from "../../data/dataset";
import { checkCoordinates, projectSeries, summarize, windowsFromSamples, type LatLon, type ProjectedSeries, type RefSeries } from "../../planner/customPoint";
import { batteryKWh, DEFAULT_SURVIVAL_LOAD_W, incidentEnergyKWhM2 } from "../../planner/power";
import type { Ui } from "../context";
import { h } from "../dom";

/** Starting points with a published source. "approx" ones are not final or not published as a point. */
const PRESETS: { id: string; latDeg: number; lonDeg: number; approx: boolean }[] = [
  { id: "im2", latDeg: -84.7906, lonDeg: 29.1957, approx: false }, // LROC image 1408, landed 6 Mar 2025
  { id: "change7", latDeg: -88.8, lonDeg: 123.4, approx: true }, // candidate on Shackleton's ridge, not final
  { id: "luna25", latDeg: -69.545, lonDeg: 43.544, approx: false }, // planned site (NASA LRO release)
];

/** Reference site for the projection: any site with the geometric model works. The first one is enough. */
const REF_SITE_ID = "apollo11";

/**
 * "Any coordinates": a quick look without terrain, computed in the browser from a
 * published geometric series (see planner/customPoint.ts). Clearly marked as such.
 */
export function customPoint(ui: Ui, section: (title: string, hint: string | null, ...children: (Node | null)[]) => HTMLElement): HTMLElement {
  const { t, fmt, store, actions, resources } = ui;

  const lat = h("input", { class: "select coord-input", type: "number", step: "0.0001", min: -90, max: 90, value: "-84.7906", "aria-label": t.customLat });
  const lon = h("input", { class: "select coord-input", type: "number", step: "0.0001", min: -180, max: 360, value: "29.1957", "aria-label": t.customLon });
  const go = h("button", { class: "button button-primary", type: "submit", text: t.customGo });
  const error = h("p", { class: "verdict-why", hidden: true });
  const presets = h(
    "div",
    { class: "segments custom-presets" },
    ...PRESETS.map((p) => {
      const b = h("button", { class: "segment", type: "button", text: t.customPresets[p.id] + (p.approx ? ` (${t.approx})` : "") });
      b.addEventListener("click", () => {
        lat.value = String(p.latDeg);
        lon.value = String(p.lonDeg);
        apply();
      });
      return b;
    }),
  );
  const form = h(
    "form",
    { class: "custom-form" },
    h("label", { class: "field" }, h("span", { class: "field-label", text: t.customLat }), lat),
    h("label", { class: "field" }, h("span", { class: "field-label", text: t.customLon }), lon),
    go,
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    apply();
  });

  const result = h("div", { class: "custom-result", hidden: true });
  const facts = h("div", { class: "custom-facts" });
  const strips = createWindowStrips();
  const chart = createElevationChart();
  ui.onDispose(() => {
    strips.destroy();
    chart.destroy();
  });
  result.append(h("p", { class: "verdict-why is-note", text: t.customWarning }), facts, strips.el, chart.el);

  let point: LatLon | null = null;
  let cache: { key: string; projected: ProjectedSeries } | null = null;

  function apply(): void {
    const latDeg = Number(lat.value);
    const lonDeg = Number(lon.value);
    const why = checkCoordinates(latDeg, lonDeg);
    error.hidden = why === null;
    error.textContent = why ? t.customErrors[why] : "";
    if (why) {
      point = null;
      result.hidden = true;
      return;
    }
    point = { latDeg, lonDeg: lonDeg > 180 ? lonDeg - 360 : lonDeg };
    render();
  }

  function render(): void {
    const s = store.get();
    if (!point) return;
    const ref = s.sites.find((x) => x.id === REF_SITE_ID);
    const id = ref ? pickScenarioId(ref, s.date, s.heightM, "geometric") : null;
    const bundle = id ? resources.bundle(id) : undefined;
    result.hidden = false;
    if (!ref || !bundle) {
      facts.replaceChildren(h("p", { class: "note", text: t.loadingSite }));
      return;
    }
    const series = bundle.series as Series & Partial<RefSeries>;
    if (!series.sunDistanceKm || !series.earthDistanceKm) {
      facts.replaceChildren(h("p", { class: "note", text: t.loadError }));
      return;
    }
    const key = `${id}:${point.latDeg}:${point.lonDeg}`;
    if (cache?.key !== key) cache = { key, projected: projectSeries(series as RefSeries, ref, point, s.heightM) };
    const p = cache.projected;
    const m = summarize(p);
    const kwh = incidentEnergyKWhM2(m);
    const bat = batteryKWh(m.sunGapH);
    const fact = (label: string, value: string) => h("div", { class: "fact" }, h("span", { text: label }), h("b", { text: value }));
    facts.replaceChildren(
      h("h3", { class: "section-title", text: `${fmt.coords(point.latDeg, point.lonDeg)} · ${fmt.startDateShort(s.date)} · ${t.mastUnit(s.heightM)}` }),
      fact(t.bothShare, fmt.percent(m.bothShare)),
      fact(t.sunShare, fmt.percent(m.sunShare)),
      fact(t.earthShare, fmt.percent(m.earthShare)),
      fact(t.longestNight, fmt.gap(m.sunGapH, m.sunGapAtLeast)),
      fact(t.longestBlackout, fmt.gap(m.earthGapH, m.earthGapAtLeast)),
      fact(t.sunMaxEl, fmt.elevation(m.sunMaxElDeg)),
      fact(t.energyLabel, kwh === null ? "—" : `${fmt.number(kwh, 0)} kWh/m²`),
      fact(t.batteryLabel(fmt.number(DEFAULT_SURVIVAL_LOAD_W, 0)), bat === null ? "—" : `${m.sunGapAtLeast ? "≥ " : ""}${t.kwh(fmt.number(bat, 1))}`),
    );
    const t0 = Date.parse(p.t0Utc);
    const sunOn = p.sun.state.map((x) => (x ?? 0) > 0);
    const earthOn = p.earth.state.map((x) => (x ?? 0) > 0);
    strips.update({
      t0Ms: t0,
      durationMs: (p.n - 1) * p.stepS * 1000,
      rows: [
        { id: "sun", label: t.rowSun, color: COLORS.sun, windows: windowsFromSamples(sunOn, t0, p.stepS) },
        { id: "earth", label: t.rowEarth, color: COLORS.earth, windows: windowsFromSamples(earthOn, t0, p.stepS) },
        { id: "both", label: t.rowBoth, color: COLORS.both, windows: windowsFromSamples(sunOn.map((on, i) => on && earthOn[i]), t0, p.stepS) },
      ],
      cursorMs: t0 + s.index * p.stepS * 1000,
      onScrub: (tMs) => actions.setTime(tMs),
    });
    chart.update({
      t0Ms: t0,
      stepS: p.stepS,
      n: p.n,
      tracks: [
        { id: "sun", label: t.sun, color: COLORS.sun, elevationDeg: p.sun.elDeg, state: p.sun.state },
        { id: "earth", label: t.earth, color: COLORS.earth, elevationDeg: p.earth.elDeg, state: p.earth.state },
      ],
      cursorIndex: s.index,
      dayLabel: t.dayLabel,
      formatDeg: (deg) => fmt.elevation(deg),
      onScrub: (index) => actions.setIndex(index),
    });
  }

  ui.watch(
    (s) => [s.tab, s.date, s.heightM, s.index, s.dataVersion],
    (s) => {
      if (s.tab !== "data") return; // hidden: no work
      render();
    },
  );

  return section(t.customTitle, t.customHint, presets, form, error, result);
}
