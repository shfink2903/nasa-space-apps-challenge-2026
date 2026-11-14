import { sweepFor, type Derived } from "../data/dataset";
import { verdictAt } from "../data/mission";
import { criterionById, CRITERIA, rankSites, sitesIn, type Criterion, type RankRow } from "../data/ranking";
import type { Actions, AppState, CompareTab, Store } from "../state";
import { h, icon } from "./dom";
import { formatDeg, formatMonth, formatPercent0, formatShortDate, formatStartDate, siteLabel } from "./format";
import { createPlanner } from "./planner";
import { createRegionSwitch, formatCriterion } from "./sitelist";
import { T } from "./strings";
import { createCriteria, verdictPill } from "./verdict";

const RGB: Record<string, string> = { overlap: "232,236,244", sun: "255,186,96", earth: "157,188,255" };
const FRACTIONS = ["sun", "earth", "overlap"].map(criterionById);
const PLAY_MS = 650;

interface Column {
  /** A criterion id (sortable), or "maxSun" / "maxEarth" / "model". */
  id: string;
  criterion: Criterion | null;
  title: string;
  hint: string;
  /** Only shown at the detailed precision level. */
  detail: boolean;
}

const column = (id: string, detail: boolean): Column => {
  const criterion = CRITERIA.find((c) => c.id === id) ?? null;
  const title = criterion ? T.criteriaShort[id] : id === "maxSun" ? T.colMaxSun : id === "maxEarth" ? T.colMaxEarth : T.colModel;
  return { id, criterion, title, hint: T.colHints[id] ?? "", detail };
};
/** Dataset metric behind each column, shown to scientists under the title. */
const METRIC_OF: Record<string, string> = { maxSun: "sun.maxElevDeg", maxEarth: "earth.maxElevDeg" };
const metricOf = (c: Column): string | null => c.criterion?.metricId ?? METRIC_OF[c.id] ?? null;
const COLUMNS: Column[] = [
  column("sun", false),
  column("earth", false),
  column("overlap", false),
  column("night", true),
  column("blackout", true),
  column("maxSun", true),
  column("maxEarth", true),
  column("model", true),
];

interface RowView {
  tr: HTMLTableRowElement;
  rank: HTMLElement;
  verdict: HTMLElement;
  mark: HTMLElement;
  cells: Map<string, { value: HTMLElement; fill: HTMLElement | null }>;
}

/**
 * Centre sheet, the main tool: every site side by side.
 * "By date": drag the start date (or play the year) and the bars and the
 * ranking move. "Over the year": one metric for every site and every week.
 * The precision switch adds the detailed columns. Values come from the
 * dataset index; nothing is computed here.
 */
export function createCompare(store: Store, actions: Actions, derived: Derived): HTMLElement {
  let tab: CompareTab = store.get().compareTab;
  const planner = createPlanner(store, actions, derived);
  /** The scientist display starts detailed. Everyone always gets the three simple bars. */
  let detailed = true;
  let precise = false;
  let calendarMetric = "verdict";
  let timer = 0;
  let views = new Map<string, RowView>();
  let order = "";

  const tabDate = h("button", { class: "seg", type: "button", text: T.tabTable });
  const tabYear = h("button", { class: "seg", type: "button", text: T.tabCalendar });
  const tabDelay = h("button", { class: "seg", type: "button", text: T.tabDelay });
  const close = h("button", { class: "panel-toggle", type: "button", "aria-label": T.closeLabel }, icon("close"));

  // --- Date control: the interactive part. ---
  const dateText = h("b", { class: "cmp-date-text" });
  const dateWeek = h("small");
  const slider = h("input", { class: "cmp-slider", type: "range", min: 0, max: 51, step: 1, value: 0, "aria-label": T.dateLabel });
  const prev = h("button", { class: "button button-icon", type: "button", "aria-label": T.datePrev, title: T.datePrev }, icon("left"));
  const next = h("button", { class: "button button-icon", type: "button", "aria-label": T.dateNext, title: T.dateNext }, icon("right"));
  const playLabel = h("span", { text: T.datePlay });
  const play = h("button", { class: "button button-primary", type: "button" }, icon("play"), playLabel);
  const months = h("div", { class: "cmp-months", "aria-hidden": "true" });
  const dateBar = h(
    "div",
    { class: "cmp-date" },
    h("div", { class: "cmp-date-head" }, h("div", null, h("small", { class: "kicker", text: T.dateLabel }), dateText, dateWeek), play),
    h("div", { class: "cmp-date-row" }, prev, h("div", { class: "cmp-slider-box" }, slider, months), next),
  );

  // --- Options: ranking criterion and precision. ---
  const sortSelect = h(
    "select",
    { class: "select select-small", id: "cmp-sort", "aria-label": T.sortedBy },
    ...CRITERIA.map((c) => h("option", { value: c.id, text: T.criteria[c.id] })),
  );
  const simpleBtn = h("button", { class: "seg", type: "button", text: T.simple });
  const preciseBtn = h("button", { class: "seg", type: "button", text: T.precise });
  const sortOption = h("label", { class: "cmp-option", for: "cmp-sort" }, h("span", { text: T.sortedBy }), sortSelect);
  const precisionOption = h("div", { class: "cmp-option only-expert" }, h("span", { text: T.precision }), h("div", { class: "segmented" }, simpleBtn, preciseBtn));
  const options = h(
    "div",
    { class: "cmp-options" },
    h("div", { class: "cmp-option" }, h("span", { text: T.regionLabel }), createRegionSwitch(store, actions)),
    sortOption,
    precisionOption,
  );

  // The thresholds behind every verdict: one line when closed, the three sliders when opened.
  const critSummary = h("span");
  const criteria = h(
    "details",
    { class: "crit-details" },
    h("summary", null, critSummary, h("em", { text: T.critEdit })),
    createCriteria(store, actions),
  );
  const sheetTitle = h("h2", { class: "sheet-title", text: T.compareTitle });
  const sheetSub = h("p", { class: "sheet-sub", text: T.compareLead });
  const body = h("div", { class: "sheet-body" });
  const note = h("p", { class: "note" });
  const sheet = h(
    "section",
    { class: "panel sheet", role: "dialog", "aria-modal": "true", "aria-label": T.compareTitle },
    h(
      "header",
      { class: "panel-head" },
      h("div", null, sheetTitle, sheetSub),
      h("div", { class: "sheet-tools" }, h("div", { class: "segmented" }, tabDate, tabYear, tabDelay), close),
    ),
    criteria,
    dateBar,
    options,
    body,
    note,
  );
  const backdrop = h("div", { class: "sheet-backdrop", hidden: true }, sheet);

  const stop = (): void => {
    window.clearInterval(timer);
    timer = 0;
    playLabel.textContent = T.datePlay;
    play.replaceChildren(icon("play"), playLabel);
  };
  const step = (delta: number): boolean => {
    const s = store.get();
    const i = s.dates.indexOf(s.date) + delta;
    if (i < 0 || i >= s.dates.length) return false;
    actions.setDate(s.dates[i]);
    return true;
  };
  const open = (siteId: string, date?: string): void => {
    stop();
    if (date) actions.setDate(date);
    actions.selectSite(siteId);
    actions.setCompare(false);
  };

  const text = (c: Column, r: RankRow): string => {
    if (c.id === "model") return T.modelShort[r.model];
    const value = r.values[metricOf(c)!] ?? null;
    if (value === null) return "—";
    if (!c.criterion) return formatDeg(value);
    return formatCriterion(c.criterion, value, store.get().mode);
  };

  /** Builds the table once per precision level; `updateTable` then only changes values, so the bars animate. */
  function buildTable(s: AppState): HTMLElement {
    const columns = COLUMNS.filter((c) => precise || !c.detail);
    views = new Map();
    order = "";
    const head = h(
      "tr",
      null,
      h("th", { scope: "col", class: "rank", text: "#" }),
      h("th", { scope: "col", class: "name", text: T.colSite }),
      h("th", { scope: "col", class: "verdict", title: T.verdictNote }, h("span", { class: "col-title", text: T.verdictCol }), h("small", { text: T.verdictHint })),
      ...columns.map((c) => {
        const label = h("span", { class: "col-title", text: c.title });
        const id = metricOf(c);
        const hint = h("small", null, c.hint, id && h("code", { class: "only-expert", text: id }));
        const kind = c.detail ? "is-detail" : "";
        if (!c.criterion) return h("th", { scope: "col", "data-col": c.id, class: kind, title: c.hint }, label, hint);
        const button = h("button", { type: "button" }, label, hint);
        button.addEventListener("click", () => actions.setRankBy(c.id));
        return h("th", { scope: "col", "data-col": c.id, class: `is-sortable ${kind}`, title: c.hint }, button);
      }),
    );
    const tbody = h("tbody");
    for (const site of sitesIn(s.sites, s.region)) {
      const label = siteLabel(site);
      const free = site.computed === true;
      const rank = h("td", { class: "rank" });
      const verdict = h("td", { class: "verdict" });
      const mark = h("em", { class: "tag tag-amber only-expert", title: T.nonDominatedHelp, text: "◆", hidden: true });
      const cells = new Map<string, { value: HTMLElement; fill: HTMLElement | null }>();
      const tds = columns.map((c) => {
        const value = h("b");
        const bar = c.criterion?.kind === "fraction";
        const fill = bar ? h("i") : null;
        if (fill) fill.style.background = `rgb(${RGB[c.id]})`;
        cells.set(c.id, { value, fill });
        return h("td", { "data-col": c.id, class: bar ? "has-bar" : "" }, fill && h("div", { class: "cmp-bar" }, fill), value);
      });
      const tr = h(
        "tr",
        { tabindex: 0 },
        rank,
        h("th", { scope: "row", class: "name", title: site.name }, h("span", null, label.title, site.status === "study_point" && h("em", { class: "tag tag-ice", text: T.studyTag }), free && h("em", { class: "tag tag-warn", title: T.customWarning, text: "≈" }), mark)),
        verdict,
        ...tds,
      );
      tr.addEventListener("click", () => open(site.id));
      tr.addEventListener("keydown", (event) => {
        if (event.key === "Enter") open(site.id);
      });
      tbody.append(tr);
      views.set(site.id, { tr, rank, verdict, mark, cells });
    }
    return h("table", { class: `compare-table ${precise ? "is-precise" : ""}` }, h("thead", null, head), tbody);
  }

  function updateTable(s: AppState, rows: RankRow[], active: Criterion): void {
    const table = body.querySelector("table");
    if (!table) return;
    const tbody = table.tBodies[0];
    const columns = COLUMNS.filter((c) => precise || !c.detail);
    rows.forEach((r) => {
      const view = views.get(r.site.id);
      if (!view) return;
      view.rank.textContent = r.rank === null ? "–" : String(r.rank);
      view.verdict.replaceChildren(verdictPill(verdictAt(derived, r.site, s.heightM, s.date, s.criteria), true));
      view.mark.hidden = !r.nonDominated;
      view.tr.classList.toggle("is-selected", r.site.id === s.siteId);
      view.tr.classList.toggle("is-first", r.rank === 1);
      for (const c of columns) {
        const cell = view.cells.get(c.id)!;
        cell.value.textContent = text(c, r);
        if (cell.fill) cell.fill.style.width = `${(r.values[c.criterion!.metricId] ?? 0) * 100}%`;
      }
    });
    // Reorder only when the ranking changes: moving a row cuts its bar animation.
    const nextOrder = rows.map((r) => r.site.id).join(",");
    if (nextOrder !== order) {
      order = nextOrder;
      for (const r of rows) tbody.append(views.get(r.site.id)!.tr);
    }
    for (const el of table.querySelectorAll<HTMLElement>("[data-col]")) el.classList.toggle("is-active", el.dataset.col === active.id);
  }

  function calendar(s: AppState, rows: RankRow[]): HTMLElement {
    const byVerdict = calendarMetric === "verdict";
    const criterion = criterionById(byVerdict ? "sun" : calendarMetric);
    const rgb = RGB[criterion.id];
    const pick = h("div", { class: "segmented" });
    for (const [id, label] of [["verdict", T.verdictCol], ...FRACTIONS.map((c) => [c.id, T.criteriaShort[c.id]])]) {
      const b = h("button", { class: `seg ${id === calendarMetric ? "is-on" : ""}`, type: "button", text: label });
      b.addEventListener("click", () => {
        calendarMetric = id;
        render(true);
      });
      pick.append(b);
    }
    let lastMonth = "";
    const monthCells = s.dates.map((d) => {
      const first = d.slice(0, 6) !== lastMonth;
      lastMonth = d.slice(0, 6);
      return h("span", { text: first ? formatMonth(d) : "" });
    });
    const grid = h("div", { class: "cal" }, h("span"), h("div", { class: "cal-row cal-months" }, ...monthCells));
    for (const r of rows) {
      const values = sweepFor(derived, r.site, s.heightM, r.model)?.values[criterion.metricId] ?? [];
      const cells = s.dates.map((d, i) => {
        const v = values[i] ?? null;
        const status = byVerdict ? verdictAt(derived, r.site, s.heightM, d, s.criteria).status : null;
        const what = status ? (status === "go" ? T.go : status === "nogo" ? T.nogo : T.unknownVerdict) : `${T.criteriaShort[criterion.id]} ${v === null ? "—" : formatPercent0(v)}`;
        const label = `${siteLabel(r.site).title} · ${formatShortDate(d)} · ${what}`;
        const cell = h("button", { class: `cal-cell ${d === s.date ? "is-current" : ""}`, type: "button", "data-site": r.site.id, "data-date": d, title: label, "aria-label": label });
        cell.style.background = status
          ? status === "go"
            ? "rgba(126,224,161,0.9)"
            : status === "nogo"
              ? "rgba(255,154,138,0.22)"
              : "rgba(255,255,255,0.05)"
          : v === null
            ? "rgba(255,255,255,0.05)"
            : `rgba(${rgb},${(0.06 + 0.94 * v).toFixed(3)})`;
        return cell;
      });
      grid.append(h("span", { class: `cal-name ${r.site.id === s.siteId ? "is-selected" : ""}`, text: siteLabel(r.site).title }), h("div", { class: "cal-row" }, ...cells));
    }
    grid.addEventListener("click", (event) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>(".cal-cell");
      if (cell?.dataset.site && cell.dataset.date) open(cell.dataset.site, cell.dataset.date);
    });
    const scale = byVerdict
      ? h("div", { class: "cal-scale" }, h("i", { class: "dot dot-go" }), T.go, h("i", { class: "dot dot-nogo" }), T.nogo)
      : h("div", { class: "cal-scale" }, h("span", { text: "0 %" }), h("i", { class: "cal-ramp" }), h("span", { text: "100 %" }));
    if (!byVerdict) (scale.children[1] as HTMLElement).style.background = `linear-gradient(to right, rgba(${rgb},0.06), rgb(${rgb}))`;
    return h("div", null, h("div", { class: "cmp-options" }, h("div", { class: "cmp-option" }, h("span", { text: T.calendarMetric }), pick), scale), grid);
  }

  /** `rebuild` recreates the body; without it only the values change. */
  function render(rebuild: boolean): void {
    const s = store.get();
    backdrop.hidden = !s.compareOpen;
    if (!s.compareOpen || s.sites.length === 0) return;
    const active = criterionById(s.rankBy);
    const wasPrecise = precise;
    precise = s.mode === "expert" && detailed;
    if (precise !== wasPrecise) rebuild = true;
    const shown = sitesIn(s.sites, s.region);
    const rows = rankSites(shown, derived, s.date, s.heightM, active);
    const i = s.dates.indexOf(s.date);

    tabDate.classList.toggle("is-on", tab === "date");
    tabYear.classList.toggle("is-on", tab === "year");
    tabDelay.classList.toggle("is-on", tab === "delay");
    sheetTitle.textContent = tab === "delay" ? T.delayTitle : T.compareTitle;
    sheetSub.textContent = tab === "delay" ? T.delayLead : T.compareLead;
    const share = criterionById("sun");
    critSummary.textContent = T.critSummary(
      formatCriterion(share, s.criteria.minSun, s.mode),
      formatCriterion(share, s.criteria.minEarth, s.mode),
      s.criteria.maxNightH === null ? T.critNoLimit : formatCriterion(criterionById("night"), s.criteria.maxNightH, s.mode),
    );
    options.hidden = tab === "delay";
    simpleBtn.classList.toggle("is-on", !precise);
    preciseBtn.classList.toggle("is-on", precise);
    dateBar.hidden = tab !== "date";
    sortOption.hidden = tab !== "date";
    precisionOption.hidden = tab !== "date";
    sortSelect.value = active.id;
    slider.max = String(Math.max(0, s.dates.length - 1));
    slider.value = String(Math.max(0, i));
    slider.style.setProperty("--p", `${(Math.max(0, i) / Math.max(1, s.dates.length - 1)) * 100}%`);
    dateText.textContent = formatStartDate(s.date);
    dateWeek.textContent = `${T.dateOf(i + 1, s.dates.length)} · ${T.days30} · ${s.heightM} m`;
    prev.disabled = i <= 0;
    next.disabled = i >= s.dates.length - 1;

    if (tab === "delay") {
      if (body.firstElementChild !== planner.el) body.replaceChildren(planner.el);
      planner.render();
      note.replaceChildren(T.verdictNote);
      return;
    }
    if (tab === "year") body.replaceChildren(calendar(s, rows));
    else {
      if (rebuild || !body.querySelector("table")) body.replaceChildren(buildTable(s));
      updateTable(s, rows, active);
    }
    note.replaceChildren(
      tab === "date" ? `${T.clickToSort} ` : `${T.calendarNote} `,
      `${T.rankNote(shown.length)} ${s.region === "south" ? `${T.regionHint} ` : ""}`,
      h("span", { class: "only-expert" }, h("em", { class: "tag tag-amber", title: T.nonDominatedHelp, text: "◆" }), ` ${T.nonDominatedHelp} ${T.compareNote}`),
    );
  }

  let lastMonth = "";
  const fillMonths = (dates: string[]): void => {
    lastMonth = "";
    months.replaceChildren(
      ...dates.map((d) => {
        const first = d.slice(0, 6) !== lastMonth;
        lastMonth = d.slice(0, 6);
        return h("span", { text: first ? formatMonth(d) : "" });
      }),
    );
  };

  slider.addEventListener("input", () => {
    stop();
    const date = store.get().dates[Number(slider.value)];
    if (date) actions.setDate(date);
  });
  prev.addEventListener("click", () => {
    stop();
    step(-1);
  });
  next.addEventListener("click", () => {
    stop();
    step(1);
  });
  play.addEventListener("click", () => {
    if (timer) return stop();
    const s = store.get();
    // At the end of the year, start again from the first week.
    if (s.dates.indexOf(s.date) >= s.dates.length - 1) actions.setDate(s.dates[0]);
    playLabel.textContent = T.dateStop;
    play.replaceChildren(icon("pause"), playLabel);
    timer = window.setInterval(() => {
      if (!step(1)) stop();
    }, PLAY_MS);
  });
  sortSelect.addEventListener("change", () => actions.setRankBy(sortSelect.value));
  simpleBtn.addEventListener("click", () => {
    detailed = false;
    render(true);
  });
  preciseBtn.addEventListener("click", () => {
    detailed = true;
    render(true);
  });
  tabDate.addEventListener("click", () => actions.setCompare(true, "date"));
  tabYear.addEventListener("click", () => actions.setCompare(true, "year"));
  tabDelay.addEventListener("click", () => actions.setCompare(true, "delay"));
  close.addEventListener("click", () => actions.setCompare(false));
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) actions.setCompare(false);
  });
  store.subscribe((s, p) => {
    if (s.dates !== p.dates) fillMonths(s.dates);
    if (s.compareOpen && s.compareOpen === p.compareOpen && (s.sites !== p.sites || s.customTick !== p.customTick)) render(s.sites !== p.sites || tab === "year");
    if (s.compareTab !== p.compareTab) {
      stop();
      tab = s.compareTab;
      if (s.compareOpen === p.compareOpen && s.compareOpen) render(true);
    }
    if (s.compareOpen !== p.compareOpen) {
      if (!s.compareOpen) stop();
      else planner.reset();
      render(true);
      if (s.compareOpen) slider.focus();
    } else if (s.compareOpen && (s.date !== p.date || s.heightM !== p.heightM || s.rankBy !== p.rankBy || s.siteId !== p.siteId || s.region !== p.region || s.mode !== p.mode || s.criteria !== p.criteria)) {
      render(tab === "year" || s.heightM !== p.heightM || s.region !== p.region || s.mode !== p.mode);
    }
  });
  return backdrop;
}
