import {
  metric,
  parseScenarioId,
  sampleSeries,
  sweepFor,
  visibilityAt,
  type Derived,
  type DiskState,
  type Scenario,
  type Site,
  type Visibility,
} from "../data/dataset";
import type { Actions, AppState, Store } from "../state";
import { h, icon } from "./dom";
import {
  formatCoords,
  formatDeg,
  formatDuration,
  formatElevation,
  formatHours,
  formatMonth,
  formatPercent,
  formatPercent0,
  formatShortDate,
  siteLabel,
} from "./format";
import { createSkyChart } from "./skychart";
import { T } from "./strings";

const SUN_RGB = "255,186,96";
const EARTH_RGB = "157,188,255";
const HEIGHTS = [2, 10];

const stateText = (state: DiskState): string => (state === null ? T.state.unknown : T.state[state]);
const shade = (rgb: string, fraction: number | null): string =>
  fraction === null ? "rgba(255,255,255,0.05)" : `rgba(${rgb},${(0.1 + 0.9 * fraction).toFixed(3)})`;
const percent = (v: number | null): string => (v === null ? "—" : formatPercent(v));

/** "Sets in 19 h 50", "Rises in 16,7 j", or the plain fact when the window has no change. */
function countdown(v: Visibility, tMs: number): string {
  if (v.changeMs === null) return v.visible ? T.upAllWindow : T.downAllWindow;
  const left = formatDuration(v.changeMs - tMs);
  return v.visible ? T.setsIn(left) : T.risesIn(left);
}

/** Sentences that restate exact published values (0 or 1). No threshold is chosen here. */
function insights(scenario: Scenario): string[] {
  const sun = metric(scenario, "sun.anyDisk.fraction");
  const earth = metric(scenario, "earth.anyDisk.fraction");
  const overlap = metric(scenario, "overlap.sunAny_earthAny.fraction");
  const out: string[] = [];
  if (sun === 0) out.push(T.insights.noSun);
  if (earth === 0) out.push(T.insights.noEarth);
  if (earth === 1) out.push(T.insights.alwaysEarth);
  if (overlap === 0 && sun !== 0 && earth !== 0 && sun !== null && earth !== null) out.push(T.insights.noOverlap);
  return out;
}

/**
 * Left rail: everything published about the selected site. Sun (power) and
 * Earth (communication) now, the sky map, the 30-day metrics, the year and the
 * 1 km sensitivity. Shown as soon as a site is selected, before any flight.
 */
export function createSitePanel(store: Store, actions: Actions, derived: Derived): HTMLElement {
  const name = h("b", { class: "cond-site" });
  const place = h("small", { class: "cond-coords" });
  const tags = h("div", { class: "tags" });

  const nowRow = (label: string, kind: "sun" | "earth", role: string) => {
    const value = h("span", { class: "cond-value" });
    const state = h("small");
    const next = h("small", { class: "cond-next" });
    const row = h(
      "div",
      { class: "cond-row" },
      h("span", { class: `cond-icon cond-${kind}` }, icon(kind)),
      h("div", null, h("strong", null, label, h("em", { text: role })), state, next),
      value,
    );
    return { row, value, state, next };
  };
  const sun = nowRow(T.sun, "sun", T.power);
  const earth = nowRow(T.earth, "earth", T.comms);

  const sky = createSkyChart();
  const skyNote = h("p", { class: "note" });

  const bar = (label: string, rgb: string) => {
    const fill = h("i");
    fill.style.background = `rgb(${rgb})`;
    const value = h("b");
    const row = h("div", { class: "meter" }, h("span", { text: label }), value, h("div", { class: "meter-track" }, fill));
    return {
      row,
      set(v: number | null) {
        value.textContent = percent(v);
        fill.style.width = `${(v ?? 0) * 100}%`;
      },
    };
  };
  const line = (label: string) => {
    const value = h("b");
    return { row: h("div", { class: "cond-line" }, h("span", { text: label }), value), value };
  };
  const sunShare = bar(T.sunShare, SUN_RGB);
  const earthShare = bar(T.earthShare, EARTH_RGB);
  const overlapShare = bar(T.overlapShare, "232,236,244");
  const night = line(T.longestNight);
  const blackout = line(T.longestBlackout);
  const maxSun = line(T.maxSun);
  const maxEarth = line(T.maxEarth);
  const insightList = h("ul", { class: "insights" });

  const yearMonths = h("div", { class: "year-months", "aria-hidden": "true" });
  const yearGrid = h("div", { class: "year-grid" });
  const yearBlock = h(
    "div",
    { class: "block" },
    h("h3", { class: "block-title", text: T.yearTitle }),
    yearMonths,
    yearGrid,
    h(
      "div",
      { class: "legend" },
      h("i", { class: "dot dot-day" }),
      T.legendSun,
      h("i", { class: "dot dot-earth" }),
      T.legendEarth,
    ),
    h("p", { class: "note", text: T.yearNote }),
  );

  const sensBody = h("div", { class: "sens-body" });
  const sensBlock = h("div", { class: "block", hidden: true }, h("h3", { class: "block-title", text: T.sensTitle }), sensBody);

  const heightButtons = HEIGHTS.map((m) => {
    const b = h("button", { class: "seg", type: "button", text: `${m} m` });
    b.addEventListener("click", () => actions.setHeight(m));
    return b;
  });
  const model = h("p", { class: "cond-model" });
  const limits = h("ul", { class: "limits" });

  const panel = h(
    "section",
    { class: "panel conditions", "aria-label": T.sheetTitle, hidden: true },
    h("header", { class: "panel-head" }, h("h2", { class: "panel-title" }, icon("target"), T.sheetTitle)),
    h(
      "div",
      { class: "sheet-scroll" },
      h("div", { class: "cond-head" }, name, place, tags),
      h("h3", { class: "block-title", text: T.now }),
      sun.row,
      earth.row,
      h("p", { class: "cond-note", text: T.elevation }),
      h("div", { class: "block" }, h("h3", { class: "block-title", text: T.skyTitle }), sky.el, skyNote),
      h(
        "div",
        { class: "block" },
        h("h3", { class: "block-title", text: T.over30 }),
        sunShare.row,
        earthShare.row,
        overlapShare.row,
        night.row,
        blackout.row,
        maxSun.row,
        maxEarth.row,
        insightList,
      ),
      yearBlock,
      sensBlock,
      h(
        "div",
        { class: "block" },
        h("h3", { class: "block-title", text: T.height }),
        h("div", { class: "segmented" }, ...heightButtons),
        h("p", { class: "note", text: T.heightNote }),
        model,
        h("p", { class: "note", text: T.notModeled }),
        h("details", { class: "limits-box" }, h("summary", { text: T.limitsTitle }), h("p", { class: "note", text: T.limitsNote }), limits),
      ),
    ),
  );

  yearGrid.addEventListener("click", (event) => {
    const date = (event.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset.date;
    if (date) actions.setDate(date);
  });

  function renderYear(site: Site, s: AppState): void {
    const sweep = sweepFor(derived, site, s.heightM);
    yearBlock.hidden = sweep === null;
    if (!sweep) return;
    const suns = sweep.values["sun.anyDisk.fraction"] ?? [];
    const earths = sweep.values["earth.anyDisk.fraction"] ?? [];
    let lastMonth = "";
    yearMonths.replaceChildren(
      ...sweep.dates.map((date) => {
        const month = date.slice(0, 6);
        const first = month !== lastMonth;
        lastMonth = month;
        return h("span", { text: first ? formatMonth(date).slice(0, 1).toUpperCase() : "" });
      }),
    );
    yearGrid.replaceChildren(
      ...sweep.dates.map((date, i) => {
        const top = h("i");
        const bottom = h("i");
        top.style.background = shade(SUN_RGB, suns[i] ?? null);
        bottom.style.background = shade(EARTH_RGB, earths[i] ?? null);
        const label = T.yearCell(formatShortDate(date), percent(suns[i] ?? null), percent(earths[i] ?? null));
        return h(
          "button",
          { class: `year-cell ${date === s.date ? "is-current" : ""}`, type: "button", "data-date": date, title: label, "aria-label": label },
          top,
          bottom,
        );
      }),
    );
  }

  function renderSensitivity(site: Site, s: AppState): void {
    const entry = derived.sensitivity[`${site.id}|${s.heightM}`];
    sensBlock.hidden = entry === undefined;
    if (!entry) return;
    const [rows, cols] = entry.size;
    const grid = (rgb: string, key: "sun" | "earth", label: string) => {
      const cells = [...entry.cells]
        .sort((a, b) => b.northKm - a.northKm || a.eastKm - b.eastKm)
        .map((c) => {
          const cell = h("i", {
            class: c.northKm === 0 && c.eastKm === 0 ? "is-center" : "",
            title: `${c.northKm >= 0 ? "+" : ""}${c.northKm} km N, ${c.eastKm >= 0 ? "+" : ""}${c.eastKm} km E · ${percent(c[key])}`,
          });
          cell.style.background = shade(rgb, c[key]);
          return cell;
        });
      const box = h("div", { class: "sens-grid" }, ...cells);
      box.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      box.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
      const range = entry.ranges.find((r) => r.metricId === `${key}.anyDisk.fraction`);
      const text =
        range && range.min !== null && range.max !== null ? T.sensRange(label, formatPercent0(range.min), formatPercent0(range.max)) : label;
      return h("figure", { class: "sens-fig" }, box, h("figcaption", { text }));
    };
    sensBody.replaceChildren(
      h("div", { class: "sens-pair" }, grid(SUN_RGB, "sun", T.sunShare), grid(EARTH_RGB, "earth", T.earthShare)),
      h("p", { class: "note", text: T.sensNote(entry.cells.length, formatShortDate(entry.date)) }),
      h("p", { class: "note", text: T.sensLimit }),
    );
  }

  function renderStill(site: Site, s: AppState, scenario: Scenario): void {
    const label = siteLabel(site);
    name.textContent = label.title;
    place.textContent = label.place ? `${label.place} · ${formatCoords(site)}` : formatCoords(site);
    tags.replaceChildren(
      h("span", { class: "tag", text: site.status === "study_point" ? T.statusStudy : T.statusHistorical }),
      h("span", { class: `tag ${site.verification === "unverified" ? "tag-warn" : ""}`, text: T.verification[site.verification] ?? site.verification }),
    );

    sky.setData(s.series, s.horizon, site.latDeg < 0);
    const lola = parseScenarioId(scenario.scenarioId)?.model === "lola";
    skyNote.textContent = lola && s.horizon ? T.skyNote : T.skyNoteFlat;

    sunShare.set(metric(scenario, "sun.anyDisk.fraction"));
    earthShare.set(metric(scenario, "earth.anyDisk.fraction"));
    overlapShare.set(metric(scenario, "overlap.sunAny_earthAny.fraction"));
    const hours = (id: string): string => {
      const v = metric(scenario, id);
      return v === null ? "—" : formatHours(v);
    };
    const degrees = (id: string): string => {
      const v = metric(scenario, id);
      return v === null ? "—" : formatDeg(v);
    };
    night.value.textContent = hours("sun.anyDisk.longestGapH");
    blackout.value.textContent = hours("earth.anyDisk.longestGapH");
    maxSun.value.textContent = degrees("sun.maxElevDeg");
    maxEarth.value.textContent = degrees("earth.maxElevDeg");
    insightList.replaceChildren(...insights(scenario).map((text) => h("li", { text })));

    renderYear(site, s);
    renderSensitivity(site, s);
    heightButtons.forEach((b, i) => b.classList.toggle("is-on", HEIGHTS[i] === s.heightM));
    model.textContent = lola ? T.modelLola : T.modelGeometric;
    limits.replaceChildren(...scenario.limits.map((text) => h("li", { text })));
  }

  function renderNow(s: AppState, scenario: Scenario): void {
    if (!s.series) return;
    const sample = sampleSeries(s.series, s.index);
    sun.value.textContent = formatElevation(sample.sunElDeg);
    sun.state.textContent = stateText(sample.sunState);
    sun.next.textContent = countdown(visibilityAt(scenario, "sun.anyDisk", sample.tMs), sample.tMs);
    earth.value.textContent = formatElevation(sample.earthElDeg);
    earth.state.textContent = stateText(sample.earthState);
    earth.next.textContent = countdown(visibilityAt(scenario, "earth.anyDisk", sample.tMs), sample.tMs);
    sky.setNow(sample);
  }

  store.subscribe((s, p) => {
    const site = s.sites.find((x) => x.id === s.siteId);
    const ready = site !== undefined && s.lightSiteId === s.siteId && s.series !== null && s.scenario !== null;
    const show = s.phase !== "cruise" && site !== undefined;
    const wasHidden = panel.hidden;
    panel.hidden = !show;
    panel.classList.toggle("is-loading", show && !ready);
    if (!show || !ready || !site || !s.scenario) return;
    const still = wasHidden || s.scenario !== p.scenario || s.series !== p.series || s.horizon !== p.horizon || s.heightM !== p.heightM || s.lightSiteId !== p.lightSiteId;
    if (still) renderStill(site, s, s.scenario);
    if (still || s.index !== p.index) renderNow(s, s.scenario);
  });
  return panel;
}
