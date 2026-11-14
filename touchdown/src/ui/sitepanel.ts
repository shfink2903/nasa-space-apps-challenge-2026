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
  formatHoursExact,
  formatShareDays,
  formatStamp,
  formatMonth,
  formatPercent,
  formatPercent0,
  formatShortDate,
  siteLabel,
} from "./format";
import { nextGoDate, valuesAt, verdictAt } from "../data/mission";
import { landingChoice } from "./caption";
import { createSkyChart } from "./skychart";
import { failureLines, verdictPill } from "./verdict";
import { T } from "./strings";

const SUN_RGB = "255,186,96";
const EARTH_RGB = "157,188,255";
const HEIGHTS = [2, 10];

const diskText = (state: DiskState): string => (state === null ? T.state.unknown : T.state[state]);
const sunStatus = (state: DiskState): string => (state === null ? T.sunStatus.unknown : T.sunStatus[state]);
const earthStatus = (state: DiskState): string => (state === null ? T.earthStatus.unknown : T.earthStatus[state]);
const shade = (rgb: string, fraction: number | null): string =>
  fraction === null ? "rgba(255,255,255,0.05)" : `rgba(${rgb},${(0.1 + 0.9 * fraction).toFixed(3)})`;
const percent = (v: number | null): string => (v === null ? "—" : formatPercent(v));

/** "Night in 19 h 50", "Link back in 16,7 j", or the plain fact when the window has no change. */
function countdown(v: Visibility, tMs: number, body: "sun" | "earth"): string {
  const sun = body === "sun";
  if (v.changeMs === null) return v.visible ? (sun ? T.sunUpAll : T.earthUpAll) : sun ? T.sunDownAll : T.earthDownAll;
  const left = formatDuration(v.changeMs - tMs);
  if (v.visible) return sun ? T.sunSetsIn(left) : T.earthSetsIn(left);
  return sun ? T.sunRisesIn(left) : T.earthRisesIn(left);
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

  /** One big card per question: is the site lit, can it talk to Earth. No angle here. */
  const card = (kind: "sun" | "earth", title: string, rgb: string) => {
    const status = h("b", { class: "status-text" });
    const next = h("span", { class: "status-next" });
    // Scientist display: angles, disc state and the exact UTC time of the next event.
    const exact = h("span", { class: "status-exact only-expert" });
    const event = h("span", { class: "status-exact only-expert" });
    const why = h("p", { class: "status-why only-simple", text: kind === "sun" ? T.whySun : T.whyEarth });
    const share = h("span");
    const fill = h("i");
    fill.style.background = `rgb(${rgb})`;
    const el = h(
      "div",
      { class: `status status-${kind}` },
      h("span", { class: `cond-icon cond-${kind}` }, icon(kind)),
      h("div", { class: "status-main" }, h("small", { class: "status-kicker", text: title }), status, next, exact, event),
      h("div", { class: "status-share" }, h("div", { class: "meter-track" }, fill), h("small", null, share), why),
    );
    return { el, status, next, exact, event, share, fill };
  };
  const panelLine = h("p", { class: "status-why" });
  const sun = card("sun", T.power, SUN_RGB);
  sun.el.append(panelLine);
  const earth = card("earth", T.comms, EARTH_RGB);
  const bothFill = h("i");
  const bothValue = h("b");
  const both = h("div", { class: "meter" }, h("span", { text: T.bothShare }), bothValue, h("div", { class: "meter-track" }, bothFill));

  const sky = createSkyChart();
  const skyNote = h("p", { class: "note" });
  const line = (label: string) => {
    const value = h("b");
    return { row: h("div", { class: "cond-line" }, h("span", { text: label }), value), value };
  };
  const sunHeight = line(T.sunHeight);
  const earthHeight = line(T.earthHeight);
  const night = line(T.longestNight);
  const blackout = line(T.longestBlackout);
  const maxSun = line(T.maxSun);
  const maxEarth = line(T.maxEarth);
  const meanSun = line(T.meanSun);
  const traceScenario = line(T.scenarioLabel);
  const traceModel = line(T.modelLevel);
  const traceValidation = line(T.validation);
  const traceCoverage = line(T.coverage);
  const customNote = h("p", { class: "warn-box", text: T.customWarning, hidden: true });
  // Go / no-go for this site and this date, by the user's criteria, with a way out when it is no.
  const verdictBox = h("div", { class: "verdict-box" });
  const uses = h(
    "div",
    { class: "block" },
    h("h3", { class: "block-title", text: T.solarTitle }),
    h("ul", { class: "facts" }, ...T.solarUses.map((text) => h("li", { text }))),
    h("h3", { class: "block-title", text: T.whyChanges }),
    h("ul", { class: "facts" }, h("li", { text: T.whyDay }), h("li", { text: T.whySeason }), h("li", { text: T.whyEarthMoves })),
  );
  const factList = h("ul", { class: "facts" });
  const facts = h("div", { class: "block only-simple" }, h("h3", { class: "block-title", text: T.factsTitle }), factList);
  const insightList = h("ul", { class: "insights" });
  const compare = h("button", { class: "button button-wide", type: "button" }, icon("table"), T.compareThis);
  compare.addEventListener("click", () => actions.setCompare(true));

  const yearMonths = h("div", { class: "year-months", "aria-hidden": "true" });
  const yearGrid = h("div", { class: "year-grid" });
  const yearBlock = h(
    "div",
    { class: "block" },
    h("h3", { class: "block-title", text: T.yearTitle }),
    yearMonths,
    yearGrid,
    h("p", { class: "note", text: T.yearNote }),
  );

  const sensBody = h("div", { class: "sens-body" });
  const sensBlock = h("div", { class: "block sens-block", hidden: true }, h("h3", { class: "block-title", text: T.sensTitle }), sensBody);

  const heightButtons = HEIGHTS.map((m) => {
    const b = h("button", { class: "seg", type: "button", text: `${m} m` });
    b.addEventListener("click", () => actions.setHeight(m));
    return b;
  });
  const model = h("p", { class: "cond-model" });
  const limits = h("ul", { class: "limits" });

  // Everything precise lives here. Closed for everyone, open and first-class for scientists.
  const more = h(
    "details",
    { class: "more", open: true },
    h("summary", { text: T.moreTitle }),
    h("h3", { class: "block-title", text: T.now }),
    sunHeight.row,
    earthHeight.row,
    h("p", { class: "note", text: T.elevation }),
    h("h3", { class: "block-title", text: T.over30 }),
    night.row,
    blackout.row,
    maxSun.row,
    maxEarth.row,
    meanSun.row,
    h("h3", { class: "block-title", text: T.height }),
    h("div", { class: "segmented" }, ...heightButtons),
    h("p", { class: "note", text: T.heightNote }),
    model,
    h("p", { class: "note", text: T.notModeled }),
    h("details", { class: "limits-box" }, h("summary", { text: T.limitsTitle }), h("p", { class: "note", text: T.limitsNote }), limits),
  );
  more.append(
    h("h3", { class: "block-title", text: T.traceTitle }),
    traceScenario.row,
    traceModel.row,
    traceValidation.row,
    traceCoverage.row,
  );

  // Head of the sheet: what the site is, the verdict, and the one action that makes sense now.
  const verdictSlot = h("span");
  const actionText = h("p", { class: "sheet-action-text" });
  const land = h("button", { class: "button button-primary", type: "button" }, icon("nav"), T.land);
  const sunrise = h("button", { class: "button button-primary", type: "button" }, icon("sun"), T.toSunrise);
  const options = h("button", { class: "button button-primary", type: "button" }, icon("table"), T.seeOptions);
  const close = h("button", { class: "panel-toggle", type: "button", "aria-label": T.closeSheet, title: T.closeSheet }, icon("close"));
  let riseMs: number | null = null;
  land.addEventListener("click", () => actions.land());
  sunrise.addEventListener("click", () => {
    // One display step after the rise, so the Sun is already above the terrain.
    if (riseMs !== null) actions.jumpTo(riseMs + 600_000);
  });
  options.addEventListener("click", () => actions.setCompare(true, "delay"));
  close.addEventListener("click", () => actions.back());

  // Four short tabs instead of one long scroll.
  type Tab = "summary" | "year" | "learn" | "detail";
  let tab: Tab = "summary";
  const panes: Record<Tab, HTMLElement> = {
    summary: h(
      "div",
      { class: "pane" },
      customNote,
      verdictBox,
      sun.el,
      earth.el,
      both,
      h("figure", { class: "sky-fig" }, sky.el, h("figcaption", { class: "note" }, h("span", { class: "only-simple", text: T.skyCaption }), h("span", { class: "only-expert" }, skyNote))),
      insightList,
    ),
    year: h("div", { class: "pane" }, yearBlock, sensBlock, compare),
    learn: h("div", { class: "pane" }, uses, facts),
    detail: h("div", { class: "pane" }, more),
  };
  const tabButtons = (Object.keys(panes) as Tab[]).map((id) => {
    const label = { summary: T.tabSummary, year: T.tabYear, learn: T.tabLearn, detail: T.tabDetail }[id];
    const b = h("button", { class: `seg ${id === "detail" ? "only-expert" : ""}`, type: "button", text: label });
    b.addEventListener("click", () => showTab(id));
    return { id, b };
  });
  function showTab(next: Tab): void {
    tab = next;
    for (const { id, b } of tabButtons) {
      b.classList.toggle("is-on", id === tab);
      panes[id].hidden = id !== tab;
    }
  }
  showTab("summary");

  const panel = h(
    "section",
    { class: "panel conditions", "aria-label": T.sheetTitle, hidden: true },
    h("header", { class: "sheet-head" }, h("div", { class: "cond-head" }, name, place, tags), close),
    h("div", { class: "sheet-action" }, h("div", { class: "sheet-action-row" }, verdictSlot, land, sunrise, options), actionText),
    h("div", { class: "segmented segmented-wide sheet-tabs" }, ...tabButtons.map((t) => t.b)),
    h("div", { class: "sheet-scroll" }, ...Object.values(panes)),
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
    const custom = site.computed === true;
    customNote.hidden = !custom;
    const statusText =
      site.status === "custom" ? T.statusCustom : site.status === "study_point" ? T.statusStudy : site.status === "announced" ? T.statusAnnounced : T.statusHistorical;
    tags.replaceChildren(
      h("span", { class: "tag", text: statusText }),
      custom
        ? h("span", { class: "tag tag-warn", text: T.customTag })
        : h("span", { class: `tag ${site.verification === "unverified" ? "tag-warn" : ""}`, text: T.verification[site.verification] ?? site.verification }),
    );

    sky.setData(s.series, s.horizon, site.latDeg < 0);
    const lola = parseScenarioId(scenario.scenarioId)?.model === "lola";
    skyNote.textContent = lola && s.horizon ? T.skyNote : T.skyNoteFlat;

    const expert = s.mode === "expert";
    // Everyone: days out of 30. Scientist: percent with one decimal, for both disc conventions.
    const share = (id: string, fill: HTMLElement): string => {
      const v = metric(scenario, id);
      fill.style.width = `${(v ?? 0) * 100}%`;
      return v === null ? "—" : expert ? percent(v) : formatShareDays(v);
    };
    const sunAny = share("sun.anyDisk.fraction", sun.fill);
    const earthAny = share("earth.anyDisk.fraction", earth.fill);
    sun.share.textContent = expert ? T.expertShares(sunAny, percent(metric(scenario, "sun.fullDisk.fraction"))) : T.litShare(sunAny);
    earth.share.textContent = expert ? T.expertShares(earthAny, percent(metric(scenario, "earth.fullDisk.fraction"))) : T.linkShare(earthAny);
    bothValue.textContent = share("overlap.sunAny_earthAny.fraction", bothFill);
    const hours = (id: string): string => {
      const v = metric(scenario, id);
      return v === null ? "—" : expert ? `${formatHoursExact(v)} (${formatHours(v)})` : formatHours(v);
    };

    // Plain facts for everyone, picked by where the site is. General knowledge, not dataset values.
    const polar = site.latDeg <= -80;
    const earthShare = metric(scenario, "earth.anyDisk.fraction");
    factList.replaceChildren(
      ...[T.facts.day, polar ? T.facts.pole : null, polar ? T.facts.poleEarth : earthShare === 1 ? T.facts.nearSide : null]
        .filter((text): text is string => text !== null)
        .map((text) => h("li", { text })),
    );
    // The precision tab is for scientists: leaving that display brings back the summary.
    if (!expert && tab === "detail") showTab("summary");

    const verdict = verdictAt(derived, site, s.heightM, s.date, s.criteria);
    const lines = failureLines(verdict, valuesAt(derived, site, s.heightM, s.date), s.criteria, s.mode).map((text) => h("p", { class: "plan-fail", text }));
    const exits: HTMLElement[] = [];
    if (verdict.status === "nogo") {
      const next = nextGoDate(derived, site, s.heightM, s.date, s.criteria);
      if (next) {
        const go = h("button", { class: "button button-small", type: "button" }, icon("right"), T.goToDate);
        go.addEventListener("click", () => actions.setDate(next));
        const weeks = s.dates.indexOf(next) - s.dates.indexOf(s.date);
        exits.push(h("p", { class: "plan-next", text: T.nextGo(formatShortDate(next), weeks) }), go);
      } else exits.push(h("p", { class: "plan-next", text: T.nextGoNone }));
    }
    verdictSlot.replaceChildren(verdictPill(verdict));
    // The reasons and the ways out are only needed when the answer is not a plain yes.
    verdictBox.hidden = verdict.status === "go";
    verdictBox.className = `verdict-box is-${verdict.status}`;
    verdictBox.replaceChildren(...lines, ...exits, h("p", { class: "note", text: T.verdictNote }));
    traceScenario.value.textContent = scenario.scenarioId;
    traceModel.value.textContent = scenario.modelLevel;
    traceValidation.value.textContent = scenario.validationStatus;
    traceCoverage.value.textContent = scenario.coverageStatus;
    const degrees = (id: string): string => {
      const v = metric(scenario, id);
      return v === null ? "—" : formatDeg(v);
    };
    night.value.textContent = hours("sun.anyDisk.longestGapH");
    blackout.value.textContent = hours("earth.anyDisk.longestGapH");
    maxSun.value.textContent = degrees("sun.maxElevDeg");
    maxEarth.value.textContent = degrees("earth.maxElevDeg");
    meanSun.value.textContent = degrees("sun.meanElevWhenAnyDiskDeg");
    insightList.replaceChildren(...insights(scenario).map((text) => h("li", { text })));

    renderYear(site, s);
    renderSensitivity(site, s);
    heightButtons.forEach((b, i) => b.classList.toggle("is-on", HEIGHTS[i] === s.heightM));
    model.textContent = custom ? T.modelCustom : lola ? T.modelLola : T.modelGeometric;
    limits.replaceChildren(...scenario.limits.map((text) => h("li", { text })));
    if (site.source) limits.append(h("li", { text: `Position: ${site.source.title} — ${site.source.url}` }));
  }

  function renderNow(s: AppState, scenario: Scenario): void {
    if (!s.series) return;
    const sample = sampleSeries(s.series, s.index);
    const sunNow = visibilityAt(scenario, "sun.anyDisk", sample.tMs);
    const earthNow = visibilityAt(scenario, "earth.anyDisk", sample.tMs);
    sun.status.textContent = sunStatus(sample.sunState);
    sun.next.textContent = countdown(sunNow, sample.tMs, "sun");
    sun.el.classList.toggle("is-off", !sunNow.visible);
    earth.status.textContent = earthStatus(sample.earthState);
    earth.next.textContent = countdown(earthNow, sample.tMs, "earth");
    earth.el.classList.toggle("is-off", !earthNow.visible);
    sunHeight.value.textContent = formatElevation(sample.sunElDeg);
    earthHeight.value.textContent = formatElevation(sample.earthElDeg);
    sun.exact.textContent = `${T.expertNow(formatElevation(sample.sunElDeg), formatDeg(sample.sunAzDeg))} · ${diskText(sample.sunState)}`;
    earth.exact.textContent = `${T.expertNow(formatElevation(sample.earthElDeg), formatDeg(sample.earthAzDeg))} · ${diskText(sample.earthState)}`;
    const at = (v: Visibility, set: string, rise: string): string => (v.changeMs === null ? "" : `${v.visible ? set : rise} : ${formatStamp(new Date(v.changeMs).toISOString())}`);
    sun.event.textContent = at(sunNow, T.eventLabels.sunSet, T.eventLabels.sunRise);
    // Light caught by a flat panel: the sine of the Sun's height. Geometry only, no panel size or power.
    const flat = Math.max(0, Math.sin((sample.sunElDeg * Math.PI) / 180));
    panelLine.hidden = !sunNow.visible;
    panelLine.textContent =
      s.mode === "expert" ? T.panelExpert(flat.toFixed(2)) : flat < 0.5 ? T.panelFlat(formatPercent0(flat)) : T.panelHigh(formatPercent0(flat));
    earth.event.textContent = at(earthNow, T.eventLabels.earthSet, T.eventLabels.earthRise);
    sky.setNow(sample);

    // One action at a time, and only before the flight.
    const choice = s.phase === "focus" ? landingChoice(s, derived) : { kind: "none" as const, text: "", riseMs: null };
    land.hidden = choice.kind !== "land";
    sunrise.hidden = choice.kind !== "sunrise";
    options.hidden = choice.kind !== "options";
    riseMs = choice.riseMs;
    actionText.textContent = choice.text;
    actionText.hidden = choice.text === "";
  }

  store.subscribe((s, p) => {
    const site = s.sites.find((x) => x.id === s.siteId);
    const ready = site !== undefined && s.lightSiteId === s.siteId && s.series !== null && s.scenario !== null;
    const show = s.phase !== "cruise" && site !== undefined;
    const wasHidden = panel.hidden;
    panel.hidden = !show;
    panel.classList.toggle("is-loading", show && !ready);
    if (!show || !ready || !site || !s.scenario) return;
    const still = wasHidden || s.mode !== p.mode || s.criteria !== p.criteria || s.date !== p.date || s.customTick !== p.customTick || s.scenario !== p.scenario || s.series !== p.series || s.horizon !== p.horizon || s.heightM !== p.heightM || s.lightSiteId !== p.lightSiteId;
    if (still) renderStill(site, s, s.scenario);
    if (still || s.index !== p.index || s.phase !== p.phase) renderNow(s, s.scenario);
  });
  return panel;
}
