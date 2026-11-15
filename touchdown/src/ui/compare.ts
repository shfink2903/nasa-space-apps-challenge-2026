import { DATASET_VERSION, RELIEF_DEMO, sweepFor, type Derived, type Site } from "../data/dataset";
import { HOURS_30_DAYS, HOURS_YEAR, SOLAR_KW_PER_M2, solarEnergyKwhPerM2 } from "../data/energy";
import { EARTH, SUN, valuesAt, verdictAt } from "../data/mission";
import { criterionById, CRITERIA, rankSites, sitesIn, type Criterion, type RankRow } from "../data/ranking";
import type { Actions, AppState, CompareTab, Store } from "../state";
import { createCoordsForm, createRegionSwitch, monthGroups } from "./bits";
import { h, icon } from "./dom";
import { dateMs, formatCoords, formatDayMonth, formatDays, formatDaysExact, formatDaysShort, formatDeg, formatHours, formatInt, formatKw, formatMonth, formatShortDate, formatStartDate, siteLabel } from "./format";
import { createPlanner } from "./planner";
import { T } from "./strings";
import { createCriteria, failureLines, verdictPill } from "./verdict";

const RGB: Record<string, string> = { overlap: "232,236,244", sun: "255,186,96", earth: "157,188,255" };
const SORTS = ["overlap", "sun", "earth"];
/** One weekly date every PLAY_MS while the year plays. The bars and the rows move over the same time. */
const PLAY_MS = 520;
const MOVE_MS = 460;

interface Column {
  /** A criterion id (sortable), or "energy" / "maxSun" / "maxEarth". */
  id: string;
  criterion: Criterion | null;
  /** Small line under the title: the unit, or what is measured. */
  hint: string;
  /** Only shown with exact values. */
  detail: boolean;
}

const column = (id: string, hint: string, detail: boolean): Column => ({ id, criterion: CRITERIA.find((c) => c.id === id) ?? null, hint, detail });
const COLUMNS: Column[] = [
  column("sun", T.colDays, false),
  column("earth", T.colDays, false),
  column("overlap", T.colDays, false),
  column("energy", T.colEnergy, false),
  column("night", T.colNight, true),
  column("blackout", T.colBlackout, true),
  column("maxSun", T.colAbove, true),
  column("maxEarth", T.colAbove, true),
];

interface RowView {
  tr: HTMLTableRowElement;
  rank: HTMLElement;
  verdict: HTMLElement;
  cells: Map<string, { value: HTMLElement; fill: HTMLElement | null }>;
}

/**
 * "Evaluate the sites": the main page of the tool. Its blocks are panes of
 * glass over the 3D view, and the top right is left open as a window on the
 * Moon and the ship. The user's criteria and the sites studied stay on top.
 * Then three views: the ranking on one landing date, the full year, and the
 * launch delay. Values come from the dataset index; the only thing computed
 * here is the solar energy (see data/energy.ts).
 */
export function createCompare(store: Store, actions: Actions, derived: Derived): HTMLElement {
  let tab: CompareTab = store.get().compareTab;
  const planner = createPlanner(store, actions, derived);
  let exact = true;
  let timer = 0;
  let views = new Map<string, RowView>();
  let order = "";
  /** The cell the user clicked in the full-year view. */
  let picked: { siteId: string; date: string } | null = null;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  const tabDate = h("button", { class: "seg", type: "button", text: T.tabDate });
  const tabYear = h("button", { class: "seg", type: "button", text: T.tabYear });
  const tabDelay = h("button", { class: "seg", type: "button", text: T.tabDelay });
  const lead = h("p", { class: "page-lead" });

  // --- The sites studied: region, and the user's own coordinates. ---
  const yourPoint = h("p", { class: "your-point", hidden: true });
  const terrainNote = h("p", { class: "criteria-lead", text: T.coordsTitle });
  const sitesCard = h(
    "section",
    { class: "criteria sites-card" },
    h("header", { class: "criteria-head" }, h("h3", { class: "card-title", text: T.sitesTitle }), createRegionSwitch(store, actions)),
    terrainNote,
    !RELIEF_DEMO && createCoordsForm((lat, lon) => actions.addPoint(lat, lon)),
    yourPoint,
  );

  // --- Date control. ---
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

  // --- Ranking order, and the exact values (on from the start). ---
  const sortButtons = SORTS.map((id) => {
    const b = h("button", { class: "seg", type: "button", text: T.sort[id] });
    b.addEventListener("click", () => actions.setRankBy(id));
    return { id, b };
  });
  const exactBox = h("input", { class: "switch", type: "checkbox", id: "cmp-exact", role: "switch" });
  const options = h(
    "div",
    { class: "cmp-options" },
    h("div", { class: "cmp-option" }, h("span", { text: T.sortedBy }), h("div", { class: "segmented" }, ...sortButtons.map((x) => x.b))),
    h("label", { class: "cmp-option cmp-check", for: "cmp-exact" }, exactBox, h("span", { text: T.exact })),
  );

  const body = h("div", { class: "page-body" });
  const page = h(
    "section",
    { class: "page", "aria-label": T.evalTitle, hidden: true },
    h(
      "div",
      { class: "page-inner" },
      h(
        "div",
        { class: "page-top" },
        h(
          "div",
          { class: "page-top-main" },
          h("header", { class: "page-head" }, h("h1", { class: "page-title", text: T.evalTitle }), h("div", { class: "segmented page-tabs", role: "tablist" }, tabDate, tabYear, tabDelay)),
          lead,
          createCriteria(store, actions),
          sitesCard,
        ),
        // Left empty on purpose: the Moon and the ship show through here.
        h("div", { class: "page-window", "aria-hidden": "true" }),
      ),
      dateBar,
      options,
      body,
    ),
  );

  const stop = (): void => {
    window.clearInterval(timer);
    timer = 0;
    playLabel.textContent = T.datePlay;
    play.replaceChildren(icon("play"), playLabel);
    page.classList.remove("is-playing");
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

  /** The user's own point is written larger than the catalogue sites. */
  const own = (site: Site): string => (site.status === "custom" ? "is-own" : "");
  const siteName = (site: Site): HTMLElement => h("span", { class: "site-name", title: site.name }, h("span", { class: "site-name-text", text: siteLabel(site).title }));

  const text = (c: Column, r: RankRow): string => {
    if (c.id === "energy") {
      const sun = r.values[SUN] ?? null;
      return sun === null ? "—" : formatInt(solarEnergyKwhPerM2(sun, HOURS_30_DAYS));
    }
    if (!c.criterion) {
      const value = r.values[c.id === "maxSun" ? "sun.maxElevDeg" : "earth.maxElevDeg"] ?? null;
      return value === null ? "—" : formatDeg(value);
    }
    const value = r.values[c.criterion.metricId] ?? null;
    if (value === null) return "—";
    if (c.criterion.kind === "hours") return formatHours(value);
    return exact ? formatDaysExact(value) : formatDaysShort(value);
  };

  /** Builds the table once per precision level; `updateTable` then only changes values, so the bars animate. */
  function buildTable(s: AppState): HTMLElement {
    const columns = COLUMNS.filter((c) => exact || !c.detail);
    views = new Map();
    order = "";
    const head = h(
      "tr",
      null,
      h("th", { scope: "col", class: "rank" }),
      h("th", { scope: "col", class: "name", text: T.colSite }),
      h("th", { scope: "col", class: "verdict" }, h("span", { class: "col-title", text: T.colVerdict }), h("small", { text: T.colVerdictHint })),
      ...columns.map((c) => {
        const label = h("span", { class: "col-title", text: T.cols[c.id] });
        const hint = h("small", { text: c.hint });
        if (!c.criterion) return h("th", { scope: "col", "data-col": c.id }, label, hint);
        const button = h("button", { type: "button" }, label, hint);
        button.addEventListener("click", () => actions.setRankBy(c.id));
        return h("th", { scope: "col", "data-col": c.id, class: "is-sortable" }, button);
      }),
    );
    const tbody = h("tbody");
    for (const site of sitesIn(s.sites, s.region)) {
      const rank = h("td", { class: "rank" });
      const verdict = h("td", { class: "verdict" });
      const cells = new Map<string, { value: HTMLElement; fill: HTMLElement | null }>();
      const tds = columns.map((c) => {
        const value = h("b");
        const bar = c.criterion?.kind === "fraction";
        const fill = bar ? h("i") : null;
        if (fill) fill.style.background = `rgb(${RGB[c.id]})`;
        cells.set(c.id, { value, fill });
        return h("td", { "data-col": c.id, class: bar ? "has-bar" : "" }, fill && h("div", { class: "cmp-bar" }, fill), value);
      });
      const tr = h("tr", { tabindex: 0, class: own(site), "data-site-id": site.id }, rank, h("th", { scope: "row", class: "name" }, siteName(site)), verdict, ...tds);
      tr.addEventListener("click", () => open(site.id));
      tr.addEventListener("keydown", (event) => {
        if (event.key === "Enter") open(site.id);
      });
      // The point of the row lights up on the Moon, in the window above.
      tr.addEventListener("pointerenter", () => actions.hover(site.id));
      tr.addEventListener("pointerleave", () => actions.hover(null));
      tbody.append(tr);
      views.set(site.id, { tr, rank, verdict, cells });
    }
    return h("div", { class: "glass table-card" }, h("table", { class: `compare-table ${exact ? "is-precise" : ""}` }, h("thead", null, head), tbody), h("p", { class: "note", text: T.rowHint }));
  }

  function updateTable(s: AppState, rows: RankRow[], active: Criterion): void {
    const table = body.querySelector("table");
    if (!table) return;
    const tbody = table.tBodies[0];
    const columns = COLUMNS.filter((c) => exact || !c.detail);
    rows.forEach((r) => {
      const view = views.get(r.site.id);
      if (!view) return;
      view.rank.textContent = r.rank === null ? "" : String(r.rank);
      view.verdict.replaceChildren(verdictPill(verdictAt(derived, r.site, s.heightM, s.date, s.criteria), true));
      view.tr.classList.toggle("is-selected", r.site.id === s.siteId);
      view.tr.classList.toggle("is-first", r.rank === 1);
      for (const c of columns) {
        const cell = view.cells.get(c.id)!;
        cell.value.textContent = text(c, r);
        if (cell.fill) cell.fill.style.width = `${(r.values[c.criterion!.metricId] ?? 0) * 100}%`;
      }
    });
    // Reorder only when the ranking changes, and slide each row from its old place to the new one.
    const nextOrder = rows.map((r) => r.site.id).join(",");
    if (nextOrder !== order) {
      const moving = order !== "" && !still.matches;
      const before = new Map<string, number>();
      if (moving) for (const [id, view] of views) before.set(id, view.tr.getBoundingClientRect().top);
      order = nextOrder;
      for (const r of rows) tbody.append(views.get(r.site.id)!.tr);
      if (moving) {
        for (const [id, view] of views) {
          const delta = (before.get(id) ?? 0) - view.tr.getBoundingClientRect().top;
          if (delta === 0) continue;
          view.tr.style.transition = "none";
          view.tr.style.transform = `translateY(${delta}px)`;
        }
        void tbody.offsetHeight; // the browser takes the start position before the slide begins
        for (const view of views.values()) {
          view.tr.style.transition = `transform ${MOVE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
          view.tr.style.transform = "";
        }
      }
    }
    for (const el of table.querySelectorAll<HTMLElement>("[data-col]")) el.classList.toggle("is-active", el.dataset.col === active.id);
  }

  /** Full year: the solar energy received at each site, then the dates when landing is possible. */
  function yearView(s: AppState, shown: Site[]): HTMLElement {
    // --- Solar energy over a year, from the mean share of time with the Sun visible (52 weekly dates). ---
    const energy = shown
      .map((site) => {
        const values = sweepFor(derived, site, s.heightM)?.values[SUN] ?? [];
        const known = values.filter((v): v is number => v !== null && v !== undefined);
        const complete = known.length === s.dates.length && known.length > 0;
        return { site, mean: complete ? known.reduce((a, b) => a + b, 0) / known.length : null };
      })
      .sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1));
    const energyRows = energy.map(({ site, mean }) => {
      const fill = h("i");
      fill.style.width = `${(mean ?? 0) * 100}%`;
      return h(
        "div",
        { class: `energy-row ${own(site)}` },
        siteName(site),
        h("div", { class: "energy-bar" }, fill),
        h("b", { class: "energy-value", text: mean === null ? "—" : formatInt(solarEnergyKwhPerM2(mean, HOURS_YEAR)) }),
        h("span", { class: "energy-mean", text: mean === null ? T.pending : T.energyMean(formatKw(SOLAR_KW_PER_M2 * mean)) }),
      );
    });

    // --- Calendar: one cell per weekly landing date, possible or not by the user's criteria. ---
    const groups = monthGroups(s.dates);
    const monthsRow = h("div", { class: "cal-months" }, ...groups.map((g) => {
      const el = h("span", { text: formatMonth(g.dates[0]) });
      el.style.flexGrow = String(g.dates.length);
      return el;
    }));
    const rows = shown
      .map((site) => {
        const statuses = s.dates.map((d) => verdictAt(derived, site, s.heightM, d, s.criteria).status);
        return { site, statuses, count: statuses.filter((x) => x === "go").length };
      })
      .sort((a, b) => b.count - a.count);
    const grid = h("div", { class: "cal" }, h("span"), monthsRow, h("span"));
    for (const r of rows) {
      let at = 0;
      const row = h("div", { class: "cal-row" });
      for (const g of groups) {
        const group = h("div", { class: "cal-month" });
        group.style.flexGrow = String(g.dates.length);
        for (const d of g.dates) {
          const status = r.statuses[at++];
          const on = picked?.siteId === r.site.id && picked.date === d;
          const label = `${siteLabel(r.site).title}, ${formatShortDate(d)}`;
          group.append(h("button", { class: `cal-cell is-${status} ${on ? "is-picked" : ""}`, type: "button", "data-site": r.site.id, "data-date": d, title: label, "aria-label": label }));
        }
        row.append(group);
      }
      const name = siteName(r.site);
      name.className += ` ${own(r.site)}`;
      grid.append(name, row, h("span", { class: "cal-count", text: T.calCount(r.count, s.dates.length) }));
    }
    grid.addEventListener("click", (event) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>(".cal-cell");
      if (!cell?.dataset.site || !cell.dataset.date) return;
      picked = { siteId: cell.dataset.site, date: cell.dataset.date };
      render(true);
    });

    const detail = h("div", { class: "cal-detail" });
    const site = picked ? shown.find((x) => x.id === picked!.siteId) : undefined;
    if (picked && site) {
      const { date } = picked;
      const values = valuesAt(derived, site, s.heightM, date);
      const verdict = verdictAt(derived, site, s.heightM, date, s.criteria);
      const go = h("button", { class: "button button-primary", type: "button", text: T.calOpen });
      go.addEventListener("click", () => open(site.id, date));
      const days = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : formatDays(v));
      detail.append(
        h("div", null, h("b", { class: "cal-detail-title", text: `${siteLabel(site).title}, ${formatStartDate(date)}` }), verdictPill(verdict)),
        h("p", { text: T.sunValue(days(values[SUN])) }),
        h("p", { text: T.earthValue(days(values[EARTH])) }),
        ...failureLines(verdict, values, s.criteria).map((line) => h("p", { class: "plan-fail", text: line })),
        go,
      );
    } else detail.hidden = true;

    return h(
      "div",
      { class: "year" },
      h(
        "section",
        { class: "year-block energy" },
        h("h2", { class: "year-title", text: T.energyTitle }),
        h("p", { class: "year-lead", text: T.energyLead }),
        h("div", { class: "energy-head", "aria-hidden": "true" }, h("span"), h("span"), h("span", { text: T.energyUnit }), h("span")),
        h("div", { class: "energy-list" }, ...energyRows),
      ),
      h(
        "section",
        { class: "year-block" },
        h("h2", { class: "year-title", text: T.calTitle }),
        h("p", { class: "year-lead", text: T.calLead }),
        h("div", { class: "cal-legend" }, h("i", { class: "cal-key is-go" }), T.legendGo, h("i", { class: "cal-key is-nogo" }), T.legendNo),
        grid,
        detail,
      ),
    );
  }

  /** `rebuild` recreates the body; without it only the values change. */
  function render(rebuild: boolean): void {
    const s = store.get();
    page.hidden = !s.compareOpen;
    if (!s.compareOpen || s.sites.length === 0) return;
    const active = criterionById(s.rankBy);
    const shown = sitesIn(s.sites, s.region);
    const i = s.dates.indexOf(s.date);
    tabYear.hidden = s.dates.length < 52;
    if (tabYear.hidden && tab === "year") tab = "date";
    play.disabled = s.dates.length < 2;

    tabDate.classList.toggle("is-on", tab === "date");
    tabYear.classList.toggle("is-on", tab === "year");
    tabDelay.classList.toggle("is-on", tab === "delay");
    lead.textContent = tab === "date" ? T.leadDate : tab === "year" ? T.leadYear : T.leadDelay;
    lead.hidden = lead.textContent === "";
    const custom = s.sites.find((x) => x.status === "custom");
    if (RELIEF_DEMO) terrainNote.textContent = `Relief LOLA : 20 m près du site, 80–120 m au loin — expérimental. Trois points d’étude · hauteur commune ${s.heightM} m · ${DATASET_VERSION}`;
    yourPoint.hidden = !custom;
    if (custom) yourPoint.textContent = T.yourPoint(formatCoords(custom));
    dateBar.hidden = options.hidden = tab !== "date";
    for (const { id, b } of sortButtons) b.classList.toggle("is-on", id === active.id);
    exactBox.checked = exact;
    slider.max = String(Math.max(0, s.dates.length - 1));
    slider.value = String(Math.max(0, i));
    slider.style.setProperty("--p", `${(Math.max(0, i) / Math.max(1, s.dates.length - 1)) * 100}%`);
    dateText.textContent = formatStartDate(s.date);
    const t0 = dateMs(s.date);
    dateWeek.textContent = T.dateOf(i + 1, s.dates.length, formatDayMonth(t0), formatDayMonth(t0 + 29 * 86_400_000));
    prev.disabled = i <= 0;
    next.disabled = i >= s.dates.length - 1;

    if (tab === "delay") {
      if (body.firstElementChild !== planner.el) body.replaceChildren(planner.el);
      planner.render();
    } else if (tab === "year") body.replaceChildren(yearView(s, shown));
    else {
      if (rebuild || !body.querySelector("table")) body.replaceChildren(buildTable(s));
      updateTable(s, rankSites(shown, derived, s.date, s.heightM, active), active);
    }
  }

  const fillMonths = (dates: string[]): void => {
    let lastMonth = "";
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
    // While it plays, the bars and the date cursor glide from one week to the next.
    page.classList.add("is-playing");
    timer = window.setInterval(() => {
      if (!step(1)) stop();
    }, PLAY_MS);
  });
  exactBox.addEventListener("change", () => {
    exact = exactBox.checked;
    render(true);
  });
  tabDate.addEventListener("click", () => actions.setCompare(true, "date"));
  tabYear.addEventListener("click", () => actions.setCompare(true, "year"));
  tabDelay.addEventListener("click", () => actions.setCompare(true, "delay"));
  page.style.setProperty("--play-ms", `${PLAY_MS}ms`);
  store.subscribe((s, p) => {
    if (s.dates !== p.dates) fillMonths(s.dates);
    if (s.compareTab !== p.compareTab) {
      stop();
      tab = s.compareTab;
      if (s.compareOpen && p.compareOpen) render(true);
    }
    if (s.compareOpen !== p.compareOpen) {
      if (!s.compareOpen) stop();
      else {
        planner.reset();
        page.scrollTop = 0;
      }
      render(true);
    } else if (s.compareOpen) {
      const layout = s.sites !== p.sites || s.heightM !== p.heightM || s.region !== p.region;
      const values = s.date !== p.date || s.rankBy !== p.rankBy || s.siteId !== p.siteId || s.criteria !== p.criteria || s.customTick !== p.customTick;
      if (layout || values) render(layout);
    }
  });
  return page;
}
