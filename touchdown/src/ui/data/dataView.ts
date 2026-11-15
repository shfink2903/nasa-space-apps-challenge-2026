import { createCalendarHeatmap } from "../../charts/calendarHeatmap";
import { createElevationChart } from "../../charts/elevationChart";
import { createSensitivityGrid } from "../../charts/sensitivityGrid";
import { COLORS, type Ramp } from "../../charts/theme";
import { createWindowStrips } from "../../charts/windowStrips";
import { parseScenarioId, type Site } from "../../data/dataset";
import { groupOf, scopeSites } from "../../planner/catalog";
import { nextEvent, sampleScenario } from "../../planner/clock";
import { isLowerBound, readMetrics, type MetricKey, type SiteMetrics } from "../../planner/metrics";
import { CRITERION_METRIC, type Criterion, type RequirementKey } from "../../planner/ranking";
import { bundleFor, focusSite, modelFor, rankedOrder, rankingFor, selectedComparisonFor, siteById } from "../../planner/select";
import type { AppState } from "../../state";
import type { Ui } from "../context";
import { h, icon } from "../dom";

/** One colour per compared site, in the order they were picked. */
const SITE_COLORS = ["#ffd08a", "#8fe3c4", "#c9a6ff"];
const METRIC_TABS: { key: MetricKey; kind: Ramp }[] = [
  { key: "bothShare", kind: "both" },
  { key: "sunShare", kind: "sun" },
  { key: "earthShare", kind: "earth" },
];

function section(title: string, hint: string | null, ...children: (Node | null)[]): HTMLElement {
  return h("section", { class: "panel data-card" }, h("header", { class: "data-head" }, h("h2", { text: title }), hint ? h("p", { text: hint }) : null), ...children);
}

/** Three buttons to pick which share a chart shows. Calls `onPick` with the choice. */
function metricTabs(ui: Ui, initial: number, onPick: (index: number) => void): HTMLElement {
  const labels = [ui.t.bothShare, ui.t.sunShare, ui.t.earthShare];
  const buttons = labels.map((label, i) => {
    const b = h("button", { class: `segment ${i === initial ? "is-on" : ""}`, type: "button", text: label });
    b.addEventListener("click", () => {
      buttons.forEach((x, j) => x.classList.toggle("is-on", i === j));
      onPick(i);
    });
    return b;
  });
  return h("div", { class: "segments" }, ...buttons);
}

function toolbar(ui: Ui): HTMLElement {
  const { t, fmt, actions } = ui;
  const select = h("select", { class: "select", "aria-label": t.startDate });
  const prev = h("button", { class: "icon-button", type: "button", "aria-label": t.prevWeek, title: t.prevWeek }, icon("left"));
  const next = h("button", { class: "icon-button", type: "button", "aria-label": t.nextWeek, title: t.nextWeek }, icon("right"));
  const mast = [2, 10].map((m) => {
    const b = h("button", { class: "segment", type: "button", text: t.mastUnit(m) });
    b.addEventListener("click", () => actions.setHeight(m));
    return { m, b };
  });
  const scope = (["polar", "all"] as const).map((value) => {
    const b = h("button", { class: "segment", type: "button", text: value === "polar" ? t.scopePolar : t.scopeAll });
    b.addEventListener("click", () => actions.setScope(value));
    return { value, b };
  });
  const criterion = h(
    "select",
    { class: "select", "aria-label": t.criterion },
    ...(Object.keys(t.criteria) as Criterion[]).map((c) => h("option", { value: c, text: t.criteria[c] })),
  );
  select.addEventListener("change", () => actions.setDate(select.value));
  prev.addEventListener("click", () => actions.shiftDate(-1));
  next.addEventListener("click", () => actions.shiftDate(1));
  criterion.addEventListener("change", () => actions.setCriterion(criterion.value as Criterion));

  const field = (label: string, control: HTMLElement) => h("div", { class: "field" }, h("span", { class: "field-label", text: label }), control);
  const bar = h(
    "div",
    { class: "data-toolbar panel" },
    field(`${t.startDate} · ${t.days30}`, h("div", { class: "date-row" }, prev, select, next)),
    field(t.mast, h("div", { class: "segments" }, ...mast.map((x) => x.b))),
    field(t.scope, h("div", { class: "segments" }, ...scope.map((x) => x.b))),
    field(t.criterion, criterion),
  );
  ui.watch(
    (s) => [s.dates, s.date, s.heightM, s.scope, s.criterion],
    (s) => {
      if (select.options.length !== s.dates.length) select.replaceChildren(...s.dates.map((d) => h("option", { value: d, text: fmt.startDate(d) })));
      select.value = s.date;
      prev.disabled = s.dates.indexOf(s.date) <= 0;
      next.disabled = s.dates.indexOf(s.date) >= s.dates.length - 1;
      for (const x of mast) x.b.classList.toggle("is-on", x.m === s.heightM);
      for (const x of scope) x.b.classList.toggle("is-on", x.value === s.scope);
      criterion.value = s.criterion;
    },
  );
  return bar;
}

function rankingTable(ui: Ui): HTMLElement {
  const { t, fmt, actions, resources } = ui;
  const evaluationStatus = h("p", { class: "note", role: "status", "data-testid": "catalogue-comparison-status" });
  const tbody = h("tbody");
  const head = (label: string, key?: MetricKey) => h("th", { scope: "col", "data-key": key ?? "" }, label);
  const table = h(
    "table",
    { class: "rank-table" },
    h(
      "thead",
      null,
      h(
        "tr",
        null,
        head(t.colRank),
        head(t.colSite),
        head(t.criteriaShort.balanced, "bothShare"),
        head(t.sun, "sunShare"),
        head(t.colNight),
        head(t.earth, "earthShare"),
        head(t.colBlackout),
        head(t.colSunEl),
        head(t.colVerdict),
        head(t.colCompare),
      ),
    ),
    tbody,
  );
  const cellBar = (value: number | null, kind: Ramp, key: boolean) => {
    const fill = h("i");
    fill.style.width = `${Math.round((value ?? 0) * 100)}%`;
    return h("td", { class: `cell-share ${key ? "is-key" : ""}` }, h("span", { text: fmt.percent(value) }), h("span", { class: `share-track share-${kind}` }, fill));
  };

  ui.watch(
    (s) => [s.sites, s.scope, s.criterion, s.date, s.heightM, s.requirements, s.focusId, s.comparisons, s.dataVersion],
    (s) => {
      const ranking = rankingFor(s, resources);
      evaluationStatus.dataset.status = ranking.evaluationStatus;
      evaluationStatus.textContent = ranking.evaluationStatus === "available" ? t.compareVerified : ranking.evaluationStatus === "loading" ? t.compareLoading : t.compareUnavailable;
      const key = CRITERION_METRIC[s.criterion];
      table.querySelectorAll("th").forEach((th) => th.classList.toggle("is-key", th.dataset.key === key));
      const firstReference = ranking.references[0]?.siteId;
      tbody.replaceChildren(
        ...rankedOrder(ranking).flatMap((m) => {
          const row = ranking.rows.find((r) => r.metrics === m);
          const site = siteById(s, m.siteId)!;
          const v = ranking.verdicts[m.scenarioId] ?? "unknown";
          const check = h("input", { type: "checkbox", "aria-label": `${t.colCompare}: ${fmt.site(site)}` });
          check.checked = s.comparisons.some((c) => c.siteId === site.id && c.date === s.date);
          check.disabled = !check.checked && s.comparisons.length >= 3;
          check.title = check.disabled ? t.compareMax : "";
          check.addEventListener("change", () => actions.toggleCompare(site.id));
          const name = h("button", { class: "link-button", type: "button", text: fmt.site(site) });
          name.addEventListener("click", () => actions.selectSite(site.id));
          const group = groupOf(site);
          const tr = h(
            "tr",
            { class: site.id === s.focusId ? "is-selected" : "" },
            h("td", { class: "cell-rank" }, h("span", { class: `site-rank ${row?.rank === 1 ? "is-best" : ""}`, text: row?.rank ? String(row.rank) : "–" })),
            h(
              "td",
              { class: "cell-site" },
              name,
              h(
                "div",
                { class: "cell-tags" },
                h("span", { class: `tag tag-${group}`, text: group === "candidate" ? t.studyPoint : t.landed }),
                site.verification === "unverified" ? h("span", { class: "tag tag-warn", text: t.unverified }) : null,
                ranking.pareto.has(m.scenarioId) ? h("span", { class: "tag tag-pareto", title: t.paretoHelp, text: t.pareto }) : null,
              ),
            ),
            cellBar(m.bothShare, "both", key === "bothShare"),
            cellBar(m.sunShare, "sun", key === "sunShare"),
            h("td", { class: "cell-num", text: `${isLowerBound(m, "sunGapH") ? "≥ " : ""}${fmt.gap(m.sunGapH)}` }),
            cellBar(m.earthShare, "earth", key === "earthShare"),
            h("td", { class: "cell-num", text: `${isLowerBound(m, "earthGapH") ? "≥ " : ""}${fmt.gap(m.earthGapH)}` }),
            h("td", { class: "cell-num", text: fmt.elevation(m.sunMaxElDeg) }),
            h("td", null, h("span", { class: "verdict", "data-verdict": v, title: t.verdict[v], text: t.verdictShort[v] })),
            h("td", { class: "cell-check" }, check),
          );
          return site.id === firstReference ? [h("tr", { class: "row-divider" }, h("td", { colspan: 10, text: `${t.references} · ${t.unranked}` })), tr] : [tr];
        }),
      );
      table.classList.toggle("is-loading", !ranking.complete);
    },
  );
  return section(t.ranking, t.dataIntro, evaluationStatus, h("div", { class: "table-scroll" }, table));
}

function requirements(ui: Ui): HTMLElement {
  const { t, fmt, actions, store } = ui;
  const defs: { key: RequirementKey; label: string; max: number; step: number; fallback: number; show: (v: number) => string }[] = [
    { key: "minSunShare", label: t.reqMinSun, max: 1, step: 0.05, fallback: 0.25, show: (v) => fmt.percent(v) },
    { key: "minEarthShare", label: t.reqMinEarth, max: 1, step: 0.05, fallback: 0.25, show: (v) => fmt.percent(v) },
    { key: "maxDarkH", label: t.reqMaxDark, max: 720, step: 12, fallback: 360, show: (v) => fmt.gap(v) },
  ];
  const rows = defs.map((def) => {
    let last = store.get().requirements[def.key] ?? def.fallback;
    const on = h("input", { type: "checkbox", "aria-label": def.label, "data-testid": `requirement-${def.key}-enabled` });
    const range = h("input", { type: "range", min: 0, max: def.max, step: def.step, "aria-label": def.label, "data-testid": `requirement-${def.key}-value` });
    const value = h("b");
    on.addEventListener("change", () => actions.setRequirements({ [def.key]: on.checked ? last : null }));
    range.addEventListener("input", () => {
      last = Number(range.value);
      actions.setRequirements({ [def.key]: last });
    });
    const row = h("div", { class: "req-row" }, h("label", { class: "req-label" }, on, h("span", { text: def.label })), value, range);
    return {
      row,
      draw(s: AppState) {
        const v = s.requirements[def.key];
        if (v !== null) last = v;
        on.checked = v !== null;
        range.disabled = v === null;
        range.value = String(last);
        value.textContent = v === null ? "—" : def.show(v);
      },
    };
  });
  const brief = h("ul", { class: "brief" });
  const card = section(t.briefing, null, brief, h("h3", { class: "section-title", text: t.requirements }), ...rows.map((r) => r.row), h("p", { class: "note", text: t.requirementsNote }));

  ui.watch((s) => [s.requirements], (s) => rows.forEach((r) => r.draw(s)));
  ui.watch(
    (s) => [s.sites, s.scope, s.criterion, s.date, s.heightM, s.requirements, s.focusId, s.dataVersion],
    (s) => {
      const ranking = rankingFor(s, ui.resources);
      const lines: string[] = [];
      const name = (m: SiteMetrics): string => fmt.site(siteById(s, m.siteId)!);
      // The summary speaks about the candidates only.
      const all = ranking.rows.map((r) => r.metrics);
      const best = ranking.evaluationStatus === "available" ? ranking.rows.find((r) => r.rank === 1)?.metrics : undefined;
      const top = (key: MetricKey): SiteMetrics | undefined => [...all].filter((m) => m[key] !== null).sort((a, b) => b[key]! - a[key]!)[0];
      if (best) lines.push(t.briefBest(name(best), t.criteriaShort[s.criterion], fmt.percent(best[CRITERION_METRIC[s.criterion]])));
      const power = top("sunShare");
      const comms = top("earthShare");
      if (power && s.criterion !== "power") lines.push(t.briefPower(name(power), fmt.percent(power.sunShare)));
      if (comms && s.criterion !== "comms") lines.push(t.briefComms(name(comms), fmt.percent(comms.earthShare)));
      const noSun = all.filter((m) => m.sunShare === 0);
      const noEarth = all.filter((m) => m.earthShare === 0);
      if (noSun.length) lines.push(t.briefNoSun(noSun.map(name).join(", ")));
      if (noEarth.length) lines.push(t.briefNoEarth(noEarth.map(name).join(", ")));
      const active = Object.values(s.requirements).some((v) => v !== null);
      if (ranking.evaluationStatus !== "available") lines.push(ranking.evaluationStatus === "loading" ? t.compareLoading : t.compareUnavailable);
      if (active && all.length && ranking.evaluationStatus === "available" && !all.some((m) => ranking.verdicts[m.scenarioId] === "pass")) lines.push(t.noEligible);
      if (active && all.length && ranking.evaluationStatus === "available") lines.push(t.briefPass(all.filter((m) => ranking.verdicts[m.scenarioId] === "pass").length, all.length));
      // Best start date of the year for the selected site, on the chosen priority.
      const site = focusSite(s);
      const sweep = ui.resources.sweep(site.id, s.heightM, modelFor(s, site));
      if (sweep) {
        const key = CRITERION_METRIC[s.criterion];
        let bestIndex = -1;
        let bestValue = -Infinity;
        sweep.rows.forEach((row, i) => {
          const v = readMetrics(site.id, row.scenarioId, row.metrics)[key];
          if (v !== null && v > bestValue) {
            bestValue = v;
            bestIndex = i;
          }
        });
        // A descriptive sweep maximum is not a recommendation under user constraints.
        if (!active && bestIndex >= 0 && s.dates[bestIndex]) lines.push(t.briefDateTip(fmt.site(site), fmt.startDateShort(s.dates[bestIndex]), fmt.percent(bestValue)));
      }
      brief.replaceChildren(...lines.map((line) => h("li", { text: line })));
    },
  );
  return card;
}

function compare(ui: Ui): HTMLElement {
  const { t, fmt, actions, resources } = ui;
  const columns = h("div", { class: "compare-columns" });
  const strips = h("div", { class: "compare-strips" });
  const sunChart = createElevationChart();
  const earthChart = createElevationChart();
  const stripCharts = [createWindowStrips(), createWindowStrips(), createWindowStrips()];
  ui.onDispose(() => [sunChart, earthChart, ...stripCharts].forEach((c) => c.destroy()));
  const status = h("p", { class: "note", role: "status", "data-testid": "selection-comparison-status" });
  const legend = h("div", { class: "legend" });
  const charts = h("div", { class: "compare-charts" },
    h("div", null, h("div", { class: "field-label chart-caption" }, icon("sun"), `${t.sun} · ${t.elevationAxis}`), sunChart.el),
    h("div", null, h("div", { class: "field-label chart-caption" }, icon("earth"), `${t.earth} · ${t.elevationAxis}`), earthChart.el));
  const card = section(t.compareTitle, t.compareHint, status, columns, h("p", { class: "note", text: t.compareRelativeTime }), legend, strips, charts);
  ui.watch(
    (s) => [s.comparisons, s.date, s.heightM, s.scope, s.criterion, s.requirements, s.index, s.dataVersion],
    (s) => {
      const selection = selectedComparisonFor(s, resources);
      status.dataset.status = selection.evaluationStatus;
      status.textContent = selection.evaluationStatus === "available" ? t.compareVerified : selection.evaluationStatus === "loading" ? t.compareLoading : t.compareUnavailable;
      status.hidden = s.comparisons.length === 0;
      const loaded = s.comparisons.map((choice, i) => {
        const site = siteById(s, choice.siteId)!;
        const local = { ...s, date: choice.date };
        const bundle = bundleFor(local, resources, site);
        return { choice, site, bundle, i, metrics: selection.metrics.find((m) => m.scenarioId === selection.request?.scenarioIds[i]) };
      });
      const title = (site: Site, date: string) => `${fmt.site(site)} · ${fmt.startDateShort(date)}`;
      legend.replaceChildren(...loaded.map(({ site, choice, i }) => h("span", { class: "legend-item" }, h("i", { style: `background:${SITE_COLORS[i]}` }), title(site, choice.date))));
      columns.replaceChildren(...loaded.map(({ site, choice, bundle, i, metrics: m }) => {
        const id = selection.request?.scenarioIds[i];
        const rank = id ? selection.ranks[id] : undefined;
        const v = id ? selection.verdicts[id] ?? "unknown" : "unknown";
        const remove = h("button", { class: "icon-button", type: "button", "aria-label": t.removeCompare, title: t.removeCompare, "data-testid": `comparison-remove-${i}` }, icon("cross"));
        remove.addEventListener("click", () => actions.removeComparison(i));
        const open = h("button", { class: "link-button compare-name", type: "button", text: fmt.site(site) });
        open.addEventListener("click", () => { actions.setDate(choice.date); actions.selectSite(site.id); });
        const date = h("select", { class: "select", "aria-label": `${t.startDate} ${fmt.site(site)} ${i + 1}`, "data-testid": `comparison-date-${i}` }, ...s.dates.map((d) => {
          const option = h("option", { value: d, text: fmt.startDate(d) });
          option.disabled = s.comparisons.some((other, j) => j !== i && other.siteId === site.id && other.date === d);
          return option;
        }));
        date.value = choice.date;
        date.addEventListener("change", () => actions.setComparisonDate(i, date.value));
        const add = h("button", { class: "link-button", type: "button", text: t.compareAddDate, "data-testid": `comparison-add-date-${i}` });
        add.disabled = s.comparisons.length >= 3;
        add.addEventListener("click", () => actions.addComparison(site.id));
        const now = h("div", { class: "compare-now" });
        if (bundle) {
          const sample = sampleScenario(bundle.series, bundle.scenario, s.index);
          now.append(h("small", { class: "mono-small", text: new Date(sample.tMs).toISOString().replace("T", " ").replace(".000Z", " UTC") }));
          for (const [bodyName, el, state] of [["sun", sample.sunElDeg, sample.sunState], ["earth", sample.earthElDeg, sample.earthState]] as const) {
            const visible = state !== null && state > 0;
            const ev = nextEvent(bundle.scenario, bodyName, sample.tMs);
            const left = ev ? fmt.duration(Date.parse(ev.tUtc) - sample.tMs) : "";
            const countdown = state === null ? t.visibilityUnknown : ev ? (ev.type === "set" ? t.setIn(left) : t.riseIn(left)) : visible ? t.noSetInPeriod : t.noRiseInPeriod;
            now.append(h("div", { class: `now-row now-${bodyName} ${visible ? "" : "is-off"}` }, h("span", { class: "now-icon" }, icon(bodyName)), h("div", { class: "now-text" }, h("strong", { text: bodyName === "sun" ? t.sun : t.earth }), h("span", { class: "now-countdown", text: countdown })), h("div", { class: "now-side" }, h("span", { class: "now-value", text: fmt.elevation(el) }))));
          }
        } else now.append(h("p", { class: "note", text: t.loadingSite }));
        const fact = (label: string, value: string, key = false) => h("div", { class: `fact ${key ? "is-key" : ""}` }, h("span", { text: label }), h("b", { text: value }));
        const gap = (key: "sunGapH" | "earthGapH") => {
          const metric = m?.published[key];
          const lower = metric && (metric.truncatedStart || metric.truncatedEnd || metric.truncatedByMissingData);
          return `${lower ? "≥ " : ""}${fmt.gap(m?.[key] ?? null)}`;
        };
        const key = CRITERION_METRIC[s.criterion];
        return h("article", { class: "compare-column", style: `--site:${SITE_COLORS[i]}`, "data-testid": `comparison-column-${i}`, "data-scenario-id": id ?? "" },
          h("header", null, h("span", { class: `site-rank ${rank === 1 ? "is-best" : ""}`, text: rank ? String(rank) : "–" }), h("i", { class: "site-swatch", "aria-hidden": "true" }), open, remove),
          date, add, h("small", { class: "mono-small", text: fmt.coords(site.latDeg, site.lonDeg) }),
          id && selection.pareto.has(id) ? h("span", { class: "tag tag-pareto", text: t.pareto, title: t.paretoHelp }) : null,
          now, fact(t.bothShare, fmt.percent(m?.bothShare ?? null), key === "bothShare"), fact(t.sunShare, fmt.percent(m?.sunShare ?? null), key === "sunShare"), fact(t.earthShare, fmt.percent(m?.earthShare ?? null), key === "earthShare"),
          fact(t.longestNight, gap("sunGapH")), fact(t.longestBlackout, gap("earthGapH")), fact(t.sunMaxEl, fmt.elevation(m?.sunMaxElDeg ?? null)),
          h("div", { class: "fact fact-verdict" }, h("span", { text: t.requirements }), h("span", { class: "verdict", "data-verdict": v, text: t.verdict[v] })));
      }));
      const ready = loaded.filter((x) => x.bundle);
      const first = ready[0]?.bundle;
      charts.hidden = !first;
      strips.hidden = !first;
      if (!first) return;
      strips.replaceChildren(...ready.map(({ site, choice, bundle, i }) => {
        const chart = stripCharts[i];
        const t0 = Date.parse(bundle!.series.t0Utc);
        chart.update({ t0Ms: t0, durationMs: (bundle!.series.n - 1) * bundle!.series.stepS * 1000,
          rows: [{ id: "sun", label: t.rowSun, color: COLORS.sun, windows: bundle!.scenario.windows["sun.anyDisk"] ?? [] }, { id: "earth", label: t.rowEarth, color: COLORS.earth, windows: bundle!.scenario.windows["earth.anyDisk"] ?? [] }, { id: "both", label: t.rowBoth, color: COLORS.both, windows: bundle!.scenario.overlapWindows }],
          cursorMs: t0 + s.index * bundle!.series.stepS * 1000,
          onScrub: (tMs) => actions.setIndex((tMs - t0) / (bundle!.series.stepS * 1000)) });
        return h("div", { class: "compare-strip" }, h("span", { class: "legend-item" }, h("i", { style: `background:${SITE_COLORS[i]}` }), title(site, choice.date)), chart.el);
      }));
      const common = { t0Ms: Date.parse(first.series.t0Utc), stepS: first.series.stepS, n: first.series.n, cursorIndex: s.index, dayLabel: t.dayLabel, formatDeg: (deg: number) => fmt.elevation(deg), onScrub: (index: number) => actions.setIndex(index) };
      sunChart.update({ ...common, tracks: ready.map(({ site, choice, bundle, i }) => ({ id: bundle!.scenario.scenarioId, label: title(site, choice.date), color: SITE_COLORS[i], elevationDeg: bundle!.series.sunElDeg, state: bundle!.series.sunState })) });
      earthChart.update({ ...common, tracks: ready.map(({ site, choice, bundle, i }) => ({ id: bundle!.scenario.scenarioId, label: title(site, choice.date), color: SITE_COLORS[i], elevationDeg: bundle!.series.earthElDeg, state: bundle!.series.earthState })) });
    });
  return card;
}

function calendar(ui: Ui): HTMLElement {
  const { t, fmt, actions, resources, store } = ui;
  const chart = createCalendarHeatmap();
  ui.onDispose(() => chart.destroy());
  let tab = 0;
  const draw = (s: AppState): void => {
    const { key, kind } = METRIC_TABS[tab];
    const ranking = rankingFor(s, resources);
    const order = ranking.complete ? rankedOrder(ranking).map((m) => siteById(s, m.siteId)!) : scopeSites(s.sites, s.scope);
    const rows = order.map((site) => {
      const sweep = resources.sweep(site.id, s.heightM, modelFor(s, site));
      return {
        id: site.id,
        label: fmt.site(site),
        values: s.dates.map((_, i) => (sweep?.rows[i] ? readMetrics(site.id, sweep.rows[i].scenarioId, sweep.rows[i].metrics)[key] : null)),
      };
    });
    const max = Math.max(0.05, ...rows.flatMap((r) => r.values.filter((v): v is number => v !== null)));
    chart.update({
      dates: s.dates,
      rows,
      kind,
      domain: [0, max],
      selectedDate: s.date,
      selectedRowId: s.focusId,
      formatValue: (v) => fmt.percent(v),
      formatDate: (d) => fmt.startDateShort(d),
      monthLabel: (d) => fmt.month(d),
      onSelect: (date, rowId) => {
        actions.setDate(date);
        if (rowId !== store.get().focusId) actions.selectSite(rowId);
      },
    });
  };
  const tabs = metricTabs(ui, tab, (i) => {
    tab = i;
    draw(store.get());
  });
  ui.watch((s) => [s.sites, s.dates, s.scope, s.criterion, s.date, s.heightM, s.focusId, s.dataVersion], draw);
  return section(t.calendarTitle, t.calendarHint, tabs, chart.el);
}

function sensitivity(ui: Ui): HTMLElement {
  const { t, fmt, resources, store } = ui;
  const grids = h("div", { class: "grids" });
  const charts = new Map<string, ReturnType<typeof createSensitivityGrid>>();
  ui.onDispose(() => charts.forEach((c) => c.destroy()));
  const hint = h("p");
  let tab = 1;
  let visible = false;
  const draw = (s: AppState): void => {
    if (!visible) return; // the three grid files are large: wait until the section is on screen
    const { key, kind } = METRIC_TABS[tab];
    const studies = s.sites.filter((site) => site.status === "study_point");
    const loaded = studies.map((site) => ({ site, data: resources.sensitivity(site.id, s.heightM) }));
    const values = loaded.flatMap((x) => (x.data ? x.data.rows.map((r) => readMetrics(x.site.id, r.scenarioId, r.metrics)[key]) : []));
    const max = Math.max(0.05, ...values.filter((v): v is number => v !== null));
    const firstRow = loaded.find((x) => x.data)?.data?.rows[0];
    const period = firstRow ? parseScenarioId(firstRow.scenarioId)?.date : undefined;
    hint.textContent = period ? t.sensitivityHint(fmt.startDateShort(period)) : t.loadingSite;
    for (const { site, data } of loaded) {
      if (!data) continue;
      let chart = charts.get(site.id);
      if (!chart) {
        chart = createSensitivityGrid();
        charts.set(site.id, chart);
      }
      chart.update({
        title: fmt.site(site),
        cells: data.rows.map((r) => ({
          eastKm: r.eastOffsetKm,
          northKm: r.northOffsetKm,
          latDeg: r.latDeg,
          lonDeg: r.lonDeg,
          value: readMetrics(site.id, r.scenarioId, r.metrics)[key],
        })),
        kind,
        domain: [0, max],
        formatValue: (v) => fmt.percent(v),
        formatCoords: (lat, lon) => fmt.coords(lat, lon),
        labels: { north: t.gridNorth, scale: t.gridScale, center: t.gridCenter, best: t.gridBest, range: t.gridRange },
      });
    }
    // Keep the grids in catalogue order, whatever order the files arrived in.
    const ordered = studies.map((site) => charts.get(site.id)?.el).filter((el): el is HTMLElement => el !== undefined);
    if (ordered.some((el, i) => grids.children[i] !== el)) grids.replaceChildren(...ordered);
  };
  const tabs = metricTabs(ui, tab, (i) => {
    tab = i;
    draw(store.get());
  });
  const card = section(t.sensitivityTitle, null, hint, tabs, grids);
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !visible) {
      visible = true;
      draw(store.get());
    }
  });
  observer.observe(card);
  ui.onDispose(() => observer.disconnect());
  ui.watch((s) => [s.sites, s.heightM, s.dataVersion], draw);
  return card;
}

function method(ui: Ui): HTMLElement {
  const { t, resources } = ui;
  const limits = h("ul", { class: "limits" });
  const status = h("span", { class: "tag tag-warn" });
  ui.watch(
    (s) => [s.focusId, s.date, s.heightM, s.scope, s.dataVersion],
    (s) => {
      const site = focusSite(s);
      const bundle = bundleFor(s, resources, site);
      status.textContent = `${t.validation}: ${bundle?.scenario.validationStatus === "not_validated" ? t.notValidated : (bundle?.scenario.validationStatus ?? "…")} · ${modelFor(s, site) === "lola" ? t.modelLola : t.modelGeometric}`;
      limits.replaceChildren(...(bundle?.scenario.limits ?? []).map((line) => h("li", { text: line })));
    },
  );
  return section(
    t.methodTitle,
    null,
    h("div", { class: "method" }, ...t.methodBody.map((p) => h("p", { text: p }))),
    status,
    h("h3", { class: "section-title", text: t.limitsTitle }),
    limits,
    h("p", { class: "note", text: t.sources }),
  );
}

/** The "Compare sites" tab: ranking, side by side, calendar of the year, 1 km grids, method. */
export function createDataView(ui: Ui): HTMLElement {
  const sceneStatus = h("p", { class: "note", role: "status", "data-testid": "scene-status" });
  ui.watch((s) => [s.sceneStatus], (s) => {
    sceneStatus.dataset.status = s.sceneStatus;
    sceneStatus.hidden = s.sceneStatus === "ready";
    sceneStatus.textContent = s.sceneStatus === "loading" ? ui.t.sceneLoading : ui.t.sceneUnavailable;
  });
  return h(
    "main",
    { class: "data-view", id: "data-view" },
    h("header", { class: "data-title" }, h("h1", { text: ui.t.dataTitle })),
    sceneStatus,
    toolbar(ui),
    h("div", { class: "data-grid" }, rankingTable(ui), requirements(ui)),
    compare(ui),
    calendar(ui),
    sensitivity(ui),
    method(ui),
  );
}
