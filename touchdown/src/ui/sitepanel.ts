import { DATA_BASE, DATASET_VERSION, RELIEF_DEMO, metric, parseScenarioId, sampleSeries, visibilityAt, type Derived, type DiskState, type Scenario, type Site, type Visibility } from "../data/dataset";
import { EARTH, nextGoDate, SUN, valuesAt, verdictAt } from "../data/mission";
import type { Actions, AppState, Store } from "../state";
import { monthGroups } from "./bits";
import { landingChoice } from "./caption";
import { h, icon } from "./dom";
import {
  dateMs,
  formatCoords,
  formatDayMonth,
  formatDays,
  formatDeg,
  formatDuration,
  formatElevation,
  formatHours,
  formatHoursExact,
  formatPercent,
  formatPercent0,
  formatShortDate,
  formatStamp,
  siteLabel,
} from "./format";
import { createElevationChart } from "../charts/elevationChart";
import { createSkyChart } from "./skychart";
import { T } from "./strings";
import { createCriteria, failureLines } from "./verdict";

const SUN_RGB = "255,186,96";
const EARTH_RGB = "157,188,255";
const HEIGHTS = [2, 10];
const WEEK_MS = 7 * 86_400_000;

const diskText = (state: DiskState): string => (state === null ? T.state.unknown : T.state[state]);
const sunStatus = (state: DiskState): string => (state === null ? T.sunStatus.unknown : T.sunStatus[state]);
const earthStatus = (state: DiskState): string => (state === null ? T.earthStatus.unknown : T.earthStatus[state]);
const shade = (rgb: string, fraction: number | null): string => (fraction === null ? "rgba(255,255,255,0.05)" : `rgba(${rgb},${(0.1 + 0.9 * fraction).toFixed(3)})`);
const percent = (v: number | null): string => (v === null ? "—" : formatPercent(v));

/** "Night in 19 h 50", "Earth back in 16,7 days", or the plain fact when nothing changes in the period. */
function countdown(v: Visibility, tMs: number, body: "sun" | "earth"): string {
  const sun = body === "sun";
  if (v.changeMs === null) return v.visible ? (sun ? T.sunUpAll : T.earthUpAll) : sun ? T.sunDownAll : T.earthDownAll;
  const left = formatDuration(v.changeMs - tMs);
  if (v.visible) return sun ? T.sunSetsIn(left) : T.earthSetsIn(left);
  return sun ? T.sunRisesIn(left) : T.earthRisesIn(left);
}

/**
 * Left side: one sheet for the selected site, read from top to bottom.
 * The landing date, one answer (possible or not), the Sun and the Earth in
 * days, the year, the user's criteria, three points to understand, and the
 * scientific details folded at the end.
 */
export function createSitePanel(store: Store, actions: Actions, derived: Derived): HTMLElement {
  const name = h("b", { class: "cond-site" });
  const place = h("small", { class: "cond-coords" });
  const tags = h("div", { class: "tags" });
  const close = h("button", { class: "panel-toggle", type: "button", "aria-label": T.closeSheet, title: T.closeSheet }, icon("close"));
  const estimate = h("p", { class: "warn-box", text: T.estimateNote, hidden: true });
  close.addEventListener("click", () => actions.back());

  // --- Landing date and time: any date of the year studied. ---
  const dateInput = h("input", { class: "input date-input", id: "landing-date", type: "date" });
  const hourSelect = h(
    "select",
    { class: "select hour-select", "aria-label": T.hourLabel, title: T.hourLabel },
    ...Array.from({ length: 24 }, (_, i) => h("option", { value: i, text: T.hourOption(String(i).padStart(2, "0")) })),
  );
  const weekPrev = h("button", { class: "button button-icon", type: "button", "aria-label": T.weekPrev, title: T.weekPrev }, icon("left"));
  const weekNext = h("button", { class: "button button-icon", type: "button", "aria-label": T.weekNext, title: T.weekNext }, icon("right"));
  const period = h("p", { class: "note" });
  const dateBlock = h(
    "div",
    { class: "sheet-date" },
    h("label", { class: "card-title", for: "landing-date", text: T.dateTitle }),
    h("div", { class: "date-row" }, weekPrev, dateInput, hourSelect, weekNext),
    period,
  );
  let nowMs = 0;
  const goTo = (): void => {
    const t = Date.parse(`${dateInput.value}T${hourSelect.value.padStart(2, "0")}:00:00Z`);
    if (Number.isFinite(t)) actions.goToTime(t);
  };
  dateInput.addEventListener("change", goTo);
  hourSelect.addEventListener("change", goTo);
  weekPrev.addEventListener("click", () => actions.goToTime(nowMs - WEEK_MS));
  weekNext.addEventListener("click", () => actions.goToTime(nowMs + WEEK_MS));

  // --- One answer: possible, night at this time, or not possible. Then the one useful action. ---
  const verdictTitle = h("b", { class: "verdict-title" });
  const verdictText = h("p", { class: "verdict-text" });
  const reasons = h("div", { class: "verdict-reasons" });
  const land = h("button", { class: "button button-primary", type: "button", text: T.land });
  const sunrise = h("button", { class: "button button-primary", type: "button", text: T.toSunrise });
  const goDate = h("button", { class: "button button-primary", type: "button", text: T.goToDate });
  const options = h("button", { class: "button", type: "button", text: T.seeOptions });
  const verdictBox = h("div", { class: "verdict-box" }, verdictTitle, verdictText, reasons, h("div", { class: "verdict-actions" }, land, sunrise, goDate, options));
  let riseMs: number | null = null;
  let nextDate: string | null = null;
  land.addEventListener("click", () => actions.land());
  sunrise.addEventListener("click", () => {
    // One display step after the rise, so the Sun is already above the terrain.
    if (riseMs !== null) actions.jumpTo(riseMs + 600_000);
  });
  goDate.addEventListener("click", () => {
    if (nextDate) actions.setDate(nextDate);
  });
  options.addEventListener("click", () => actions.setCompare(true, "date"));

  // --- The Sun and the Earth: now, and in days out of the 30 studied. ---
  const card = (kind: "sun" | "earth", title: string, daysLabel: string, rgb: string) => {
    const status = h("b", { class: "status-text" });
    const next = h("span", { class: "status-next" });
    const days = h("b", { class: "status-days" });
    const fill = h("i");
    fill.style.background = `rgb(${rgb})`;
    const el = h(
      "div",
      { class: `status status-${kind}` },
      h("span", { class: `cond-icon cond-${kind}` }, icon(kind)),
      h("div", { class: "status-main" }, h("small", { class: "status-kicker", text: title }), status, next),
      h("div", { class: "status-share" }, h("p", null, days, " ", daysLabel), h("div", { class: "meter-track" }, fill)),
    );
    return { el, status, next, days, fill };
  };
  const sun = card("sun", T.sunCard, T.sunDays, SUN_RGB);
  const earth = card("earth", T.earthCard, T.earthDays, EARTH_RGB);

  // --- The year: one cell per weekly landing date. ---
  const yearGrid = h("div", { class: "year-grid" });
  const yearBlock = h(
    "div",
    { class: "block" },
    h("h3", { class: "card-title", text: T.yearTitle }),
    h("p", { class: "note", text: T.yearLead }),
    yearGrid,
    h("div", { class: "cal-legend" }, h("i", { class: "cal-key is-go" }), T.legendGo, h("i", { class: "cal-key is-nogo" }), T.legendNo),
  );
  yearGrid.addEventListener("click", (event) => {
    const date = (event.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset.date;
    if (date) actions.setDate(date);
  });

  const learn = h(
    "div",
    { class: "learn-block" },
    h("h3", { class: "card-title", text: T.learnTitle }),
    h(
      "ul",
      { class: "learn" },
      ...T.learn.map((item, i) => h("li", null, h("span", { class: `cond-icon cond-${["sun", "earth", "date"][i]}` }, icon(["sun", "earth", "clock"][i])), h("div", null, h("b", { text: item.title }), h("p", { text: item.text })))),
    ),
  );

  // --- Scientific details: folded, complete. ---
  const sky = createSkyChart();
  const skyNote = h("p", { class: "note" });
  const elevation = createElevationChart();
  const line = (label: string) => {
    const value = h("b");
    return { row: h("div", { class: "cond-line" }, h("span", { text: label }), value), value };
  };
  const sunHeight = line(T.sunHeight);
  const sunDisk = line(T.sunDisk);
  const sunEvent = line(T.nextSun);
  const panel = line(T.panelFactor);
  const earthHeight = line(T.earthHeight);
  const earthDisk = line(T.earthDisk);
  const earthEvent = line(T.nextEarth);
  const sunAny = line(T.sunAny);
  const sunFull = line(T.sunFull);
  const earthAny = line(T.earthAny);
  const earthFull = line(T.earthFull);
  const both = line(T.bothShare);
  const night = line(T.longestNight);
  const blackout = line(T.longestBlackout);
  const maxSun = line(T.maxSun);
  const maxEarth = line(T.maxEarth);
  const meanSun = line(T.meanSun);
  const traceScenario = line(T.scenarioLabel);
  const traceModel = line(T.modelLevel);
  const traceValidation = line(T.validation);
  const traceCoverage = line(T.coverage);
  const sensBody = h("div", { class: "sens-body" });
  const sensBlock = h("div", { hidden: true }, h("h3", { class: "block-title", text: T.sensTitle }), sensBody);
  const heightButtons = HEIGHTS.map((m) => {
    const b = h("button", { class: "seg", type: "button", text: `${m} m` });
    b.addEventListener("click", () => actions.setHeight(m));
    return b;
  });
  const model = h("p", { class: "cond-model" });
  const limits = h("ul", { class: "limits" });
  const more = h(
    "details",
    { class: "more" },
    h("summary", { text: T.moreTitle }),
    h("figure", { class: "sky-fig" }, sky.el, h("figcaption", null, skyNote)),
    h("h3", { class: "block-title", text: T.elevTitle }),
    elevation.el,
    h("p", { class: "note", text: T.elevNote }),
    h("h3", { class: "block-title", text: T.now }),
    sunHeight.row,
    sunDisk.row,
    sunEvent.row,
    panel.row,
    earthHeight.row,
    earthDisk.row,
    earthEvent.row,
    h("h3", { class: "block-title", text: T.over30 }),
    sunAny.row,
    sunFull.row,
    earthAny.row,
    earthFull.row,
    both.row,
    night.row,
    blackout.row,
    maxSun.row,
    maxEarth.row,
    meanSun.row,
    sensBlock,
    h("h3", { class: "block-title", text: T.height }),
    h("div", { class: "segmented" }, ...heightButtons),
    h("p", { class: "note", text: T.heightNote }),
    model,
    h("p", { class: "note", text: T.notModeled }),
    h("details", { class: "limits-box" }, h("summary", { text: T.limitsTitle }), h("p", { class: "note", text: T.limitsNote }), limits),
    h("h3", { class: "block-title", text: T.traceTitle }),
    traceScenario.row,
    traceModel.row,
    traceValidation.row,
    traceCoverage.row,
    h("p", { class: "note", text: T.credits }),
  );

  // Two tabs: the conditions of the site, and what they mean.
  const sitePane = h("div", { class: "pane" }, estimate, dateBlock, verdictBox, sun.el, earth.el, yearBlock, h("div", { class: "block" }, createCriteria(store, actions)), more);
  const learnPane = h("div", { class: "pane", hidden: true }, learn);
  const siteTab = h("button", { class: "seg is-on", type: "button", text: T.tabSite });
  const learnTab = h("button", { class: "seg", type: "button", text: T.tabLearn });
  const showTab = (learning: boolean): void => {
    siteTab.classList.toggle("is-on", !learning);
    learnTab.classList.toggle("is-on", learning);
    sitePane.hidden = learning;
    learnPane.hidden = !learning;
  };
  siteTab.addEventListener("click", () => showTab(false));
  learnTab.addEventListener("click", () => showTab(true));

  const sheet = h(
    "section",
    { class: "panel conditions", "aria-label": T.sheetTitle, hidden: true },
    h("header", { class: "sheet-head" }, h("div", { class: "cond-head" }, name, place, tags), close),
    h("div", { class: "segmented segmented-wide sheet-tabs" }, siteTab, learnTab),
    h("div", { class: "sheet-scroll" }, sitePane, learnPane),
  );

  function renderYear(site: Site, s: AppState): void {
    yearBlock.hidden = s.dates.length < 52;
    yearGrid.replaceChildren(
      ...monthGroups(s.dates).map((g) =>
        h(
          "div",
          { class: "year-month" },
          h("small", { text: g.label }),
          h(
            "div",
            { class: "year-cells" },
            ...g.dates.map((date) => {
              const values = valuesAt(derived, site, s.heightM, date);
              const status = verdictAt(derived, site, s.heightM, date, s.criteria).status;
              const days = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : formatDays(v));
              const verdict = status === "go" ? T.go : status === "nogo" ? T.nogo : T.unknownVerdict;
              const label = T.cellTitle(formatShortDate(date), days(values[SUN]), days(values[EARTH]), verdict);
              return h("button", { class: `cal-cell is-${status} ${date === s.date ? "is-picked" : ""}`, type: "button", "data-date": date, title: label, "aria-label": label });
            }),
          ),
        ),
      ),
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
            title: `${c.northKm >= 0 ? "+" : ""}${c.northKm} km N, ${c.eastKm >= 0 ? "+" : ""}${c.eastKm} km E, ${percent(c[key])}`,
          });
          cell.style.background = shade(rgb, c[key]);
          return cell;
        });
      const box = h("div", { class: "sens-grid" }, ...cells);
      box.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      box.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
      const range = entry.ranges.find((r) => r.metricId === `${key}.anyDisk.fraction`);
      const text = range && range.min !== null && range.max !== null ? T.sensRange(label, formatPercent0(range.min), formatPercent0(range.max)) : label;
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
    place.textContent = label.place ? `${label.place}, ${formatCoords(site)}` : formatCoords(site);
    const custom = site.computed === true;
    estimate.hidden = !custom;
    const statusText = site.status === "custom" ? T.statusCustom : site.status === "study_point" ? T.statusStudy : site.status === "announced" ? T.statusAnnounced : T.statusHistorical;
    tags.replaceChildren(h("span", { class: "tag", text: statusText }));
    if (custom) tags.append(h("span", { class: "tag tag-warn", text: T.estimateTag }));

    // The period studied: 30 days from the weekly date that contains the chosen moment.
    const t0 = dateMs(s.date);
    period.textContent = T.periodOf(formatDayMonth(t0), formatDayMonth(t0 + 29 * 86_400_000));
    if (s.dates.length > 0) {
      dateInput.min = new Date(dateMs(s.dates[0])).toISOString().slice(0, 10);
      dateInput.max = new Date(dateMs(s.dates[s.dates.length - 1]) + 29 * 86_400_000).toISOString().slice(0, 10);
    }

    const share = (id: string, target: { days: HTMLElement; fill: HTMLElement }): void => {
      const v = metric(scenario, id);
      target.fill.style.width = `${(v ?? 0) * 100}%`;
      target.days.textContent = v === null ? "—" : formatDays(v);
    };
    share(SUN, sun);
    share(EARTH, earth);

    // Why the answer is no, and the way out: the next date when this site is possible again.
    const verdict = verdictAt(derived, site, s.heightM, s.date, s.criteria);
    nextDate = null;
    const lines = failureLines(verdict, valuesAt(derived, site, s.heightM, s.date), s.criteria).map((text) => h("p", { text }));
    if (verdict.status === "nogo") {
      nextDate = nextGoDate(derived, site, s.heightM, s.date, s.criteria);
      lines.push(h("p", { class: "verdict-next", text: nextDate ? T.nextGo(formatShortDate(nextDate), s.dates.indexOf(nextDate) - s.dates.indexOf(s.date)) : T.nextGoNone }));
    }
    reasons.replaceChildren(...lines);
    reasons.hidden = lines.length === 0;

    renderYear(site, s);

    // Scientific details.
    sky.setData(s.series, s.horizon, site.latDeg < 0);
    const lola = parseScenarioId(scenario.scenarioId)?.model === "lola";
    skyNote.textContent = lola && s.horizon ? T.skyNote : T.skyNoteFlat;
    const hours = (id: string): string => {
      const v = metric(scenario, id);
      return v === null ? "—" : `${formatHoursExact(v)} (${formatHours(v)})`;
    };
    const degrees = (id: string): string => {
      const v = metric(scenario, id);
      return v === null ? "—" : formatDeg(v);
    };
    sunAny.value.textContent = percent(metric(scenario, "sun.anyDisk.fraction"));
    sunFull.value.textContent = percent(metric(scenario, "sun.fullDisk.fraction"));
    earthAny.value.textContent = percent(metric(scenario, "earth.anyDisk.fraction"));
    earthFull.value.textContent = percent(metric(scenario, "earth.fullDisk.fraction"));
    both.value.textContent = percent(metric(scenario, "overlap.sunAny_earthAny.fraction"));
    night.value.textContent = hours("sun.anyDisk.longestGapH");
    blackout.value.textContent = hours("earth.anyDisk.longestGapH");
    maxSun.value.textContent = degrees("sun.maxElevDeg");
    maxEarth.value.textContent = degrees("earth.maxElevDeg");
    meanSun.value.textContent = degrees("sun.meanElevWhenAnyDiskDeg");
    renderSensitivity(site, s);
    heightButtons.forEach((b, i) => b.classList.toggle("is-on", HEIGHTS[i] === s.heightM));
    model.textContent = custom ? T.modelCustom : lola ? T.modelLola : T.modelGeometric;
    if (RELIEF_DEMO && lola) model.textContent = `Relief LOLA : 20 m près du site, 80–120 m au loin — expérimental · ${DATASET_VERSION} · hauteur ${s.heightM} m · ${scenario.coverageStatus}`;
    limits.replaceChildren(...scenario.limits.map((text) => h("li", { text })));
    if (RELIEF_DEMO) {
      limits.append(h("li", null, h("a", { href: "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_85s_20m.lbl", target: "_blank", rel: "noopener", text: "Source : NASA/PDS — LOLA LDEM 85S 20M" })));
      limits.append(h("li", { text: "Le sol de la scène 3D est illustratif. Le graphique d’horizon utilise les données de relief calculées. La précision physique reste non validée." }));
      for (const [label, href] of [
        ["Provenance, produits et paramètres", `${DATA_BASE}/manifest.json`],
        ["Scénario, fenêtres et métriques sources", `${DATA_BASE}/scenarios/${scenario.scenarioId}.json`],
        ["Contrôles numériques de décembre", "/relief-numerical-checks.json"],
      ]) limits.append(h("li", null, h("a", { href, target: "_blank", rel: "noopener", text: label })));
    }
    if (site.source) limits.append(h("li", { text: `Position: ${site.source.title}, ${site.source.url}` }));
    if (!custom && site.verification !== "verified" && T.verification[site.verification]) limits.append(h("li", { text: T.verification[site.verification] }));
    traceScenario.value.textContent = scenario.scenarioId;
    traceModel.value.textContent = scenario.modelLevel;
    traceValidation.value.textContent = scenario.validationStatus;
    traceCoverage.value.textContent = scenario.coverageStatus;
  }

  function renderNow(s: AppState, scenario: Scenario): void {
    if (!s.series) return;
    const sample = sampleSeries(s.series, s.index);
    nowMs = sample.tMs;
    const iso = new Date(sample.tMs).toISOString();
    if (document.activeElement !== dateInput && dateInput.value !== iso.slice(0, 10)) dateInput.value = iso.slice(0, 10);
    if (document.activeElement !== hourSelect) hourSelect.value = String(Number(iso.slice(11, 13)));

    const sunNow = visibilityAt(scenario, "sun.anyDisk", sample.tMs);
    const earthNow = visibilityAt(scenario, "earth.anyDisk", sample.tMs);
    sun.status.textContent = sunStatus(sample.sunState);
    sun.next.textContent = countdown(sunNow, sample.tMs, "sun");
    sun.el.classList.toggle("is-off", !sunNow.visible);
    earth.status.textContent = earthStatus(sample.earthState);
    earth.next.textContent = countdown(earthNow, sample.tMs, "earth");
    earth.el.classList.toggle("is-off", !earthNow.visible);

    // One answer and one action, and only before the flight.
    const choice = landingChoice(s, derived);
    const idle = s.phase === "focus";
    verdictBox.hidden = choice === null;
    if (choice) {
      verdictBox.className = `verdict-box is-${choice.tone}`;
      verdictTitle.textContent = choice.title;
      verdictText.textContent = choice.text;
      verdictText.hidden = choice.text === "";
      riseMs = choice.riseMs;
      land.hidden = !idle || choice.kind !== "land";
      sunrise.hidden = !idle || choice.kind !== "sunrise";
      goDate.hidden = !idle || choice.kind !== "options" || nextDate === null;
      options.hidden = !idle || choice.kind !== "options";
    }

    // Scientific details.
    sunHeight.value.textContent = `${formatElevation(sample.sunElDeg)}, ${formatDeg(sample.sunAzDeg)}`;
    earthHeight.value.textContent = `${formatElevation(sample.earthElDeg)}, ${formatDeg(sample.earthAzDeg)}`;
    sunDisk.value.textContent = diskText(sample.sunState);
    earthDisk.value.textContent = diskText(sample.earthState);
    const at = (v: Visibility): string => (v.changeMs === null ? T.noEvent : formatStamp(new Date(v.changeMs).toISOString()));
    sunEvent.value.textContent = at(sunNow);
    earthEvent.value.textContent = at(earthNow);
    // Light caught by a flat panel: the sine of the Sun's height. Geometry only, no panel size or power.
    panel.value.textContent = formatPercent0(sunNow.visible ? Math.max(0, Math.sin((sample.sunElDeg * Math.PI) / 180)) : 0);
    sky.setNow(sample);
    if (more.open) drawElevation(s);
  }

  /** Elevation of both bodies over the 30 days, with the cursor. Drawn only while the details are open. */
  function drawElevation(s: AppState): void {
    const series = s.series;
    if (!series) return;
    elevation.update({
      t0Ms: Date.parse(series.t0Utc),
      stepS: series.stepS,
      n: series.n,
      tracks: [
        { id: "sun", label: T.sunTrack, color: `rgb(${SUN_RGB})`, elevationDeg: series.sunElDeg, state: series.sunState },
        { id: "earth", label: T.earthTrack, color: `rgb(${EARTH_RGB})`, elevationDeg: series.earthElDeg, state: series.earthState },
      ],
      cursorIndex: s.index,
      dayLabel,
      formatDeg: formatElevation,
      onScrub: (index) => actions.setIndex(index),
    });
  }
  const dayLabel = (day: number): string => T.daysShort(String(day));
  more.addEventListener("toggle", () => {
    if (more.open) drawElevation(store.get());
  });

  store.subscribe((s, p) => {
    const site = s.sites.find((x) => x.id === s.siteId);
    const loaded = s.scenario ? parseScenarioId(s.scenario.scenarioId) : null;
    const selectionMatches = !RELIEF_DEMO || loaded?.date === s.date && loaded.heightM === s.heightM;
    const ready = selectionMatches && site !== undefined && s.lightSiteId === s.siteId && s.series !== null && s.scenario !== null;
    const show = s.phase !== "cruise" && site !== undefined && !s.touring && !s.compareOpen;
    const wasHidden = sheet.hidden;
    sheet.hidden = !show;
    sheet.classList.toggle("is-loading", show && !ready);
    if (RELIEF_DEMO) {
      sheet.setAttribute("aria-busy", String(show && !ready));
      sheet.querySelector<HTMLElement>(".sheet-scroll")!.style.visibility = ready ? "visible" : "hidden";
    }
    if (!show || !ready || !site || !s.scenario) return;
    const still =
      wasHidden ||
      s.criteria !== p.criteria ||
      s.date !== p.date ||
      s.customTick !== p.customTick ||
      s.scenario !== p.scenario ||
      s.series !== p.series ||
      s.horizon !== p.horizon ||
      s.heightM !== p.heightM ||
      s.lightSiteId !== p.lightSiteId;
    if (still) renderStill(site, s, s.scenario);
    if (still || s.index !== p.index || s.phase !== p.phase) renderNow(s, s.scenario);
  });
  return sheet;
}
