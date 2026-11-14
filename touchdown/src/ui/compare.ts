import { sweepFor, type Derived } from "../data/dataset";
import { criterionById, CRITERIA, rankSites, type Criterion, type RankRow } from "../data/ranking";
import type { Actions, AppState, Store } from "../state";
import { h, icon } from "./dom";
import { formatDeg, formatMonth, formatPercent0, formatShortDate, siteLabel } from "./format";
import { formatCriterion } from "./sitelist";
import { T } from "./strings";

const RGB: Record<string, string> = { overlap: "232,236,244", sun: "255,186,96", earth: "157,188,255" };
const FRACTIONS = CRITERIA.filter((c) => c.kind === "fraction");

/**
 * Centre sheet: every site side by side. "Table" gives the 30-day metrics for
 * the selected date; "Calendar" gives one metric for every site and every
 * weekly start of the year. All values are read from the dataset index.
 */
export function createCompare(store: Store, actions: Actions, derived: Derived): HTMLElement {
  let tab: "table" | "calendar" = "table";
  let calendarMetric = "sun";

  const subtitle = h("small", { class: "sheet-sub" });
  const tabTable = h("button", { class: "seg", type: "button", text: T.tabTable });
  const tabCalendar = h("button", { class: "seg", type: "button", text: T.tabCalendar });
  const close = h("button", { class: "panel-toggle", type: "button", "aria-label": T.closeLabel }, icon("close"));
  const body = h("div", { class: "sheet-body" });
  const note = h("p", { class: "note" });
  const sheet = h(
    "section",
    { class: "panel sheet", role: "dialog", "aria-modal": "true", "aria-label": T.compareTitle },
    h(
      "header",
      { class: "panel-head" },
      h("div", null, h("h2", { class: "panel-title panel-title-big", text: T.compareTitle }), subtitle),
      h("div", { class: "sheet-tools" }, h("div", { class: "segmented" }, tabTable, tabCalendar), close),
    ),
    body,
    note,
  );
  const backdrop = h("div", { class: "sheet-backdrop", hidden: true }, sheet);

  const open = (siteId: string, date?: string): void => {
    if (date) actions.setDate(date);
    actions.selectSite(siteId);
    actions.setCompare(false);
  };

  function table(s: AppState, rows: RankRow[], active: Criterion): HTMLElement {
    const head = (c: Criterion): HTMLElement => {
      const th = h("th", { class: `is-sortable ${c.id === active.id ? "is-active" : ""}`, scope: "col" }, h("button", { type: "button", text: T.criteriaShort[c.id] }));
      th.firstElementChild!.addEventListener("click", () => actions.setRankBy(c.id));
      return th;
    };
    const cell = (c: Criterion, r: RankRow): HTMLElement => {
      const value = r.values[c.metricId] ?? null;
      const td = h("td", { class: c.id === active.id ? "is-active" : "", text: formatCriterion(c, value) });
      if (c.kind === "fraction" && value !== null) td.style.setProperty("--fill", `${value * 100}%`);
      if (c.kind === "fraction") td.classList.add("has-bar");
      td.style.setProperty("--rgb", RGB[c.id] ?? "232,236,244");
      return td;
    };
    const degrees = (v: number | null): string => (v === null ? "—" : formatDeg(v));
    return h(
      "table",
      { class: "compare-table" },
      h(
        "thead",
        null,
        h("tr", null, h("th", { scope: "col", text: "#" }), h("th", { scope: "col", text: T.colSite }), h("th", { scope: "col", text: T.colModel }), ...CRITERIA.map(head), h("th", { scope: "col", text: T.maxSun })),
      ),
      h(
        "tbody",
        null,
        ...rows.map((r) => {
          const label = siteLabel(r.site);
          const tr = h(
            "tr",
            { class: r.site.id === s.siteId ? "is-selected" : "", tabindex: 0 },
            h("td", { class: "rank", text: r.rank === null ? "–" : String(r.rank) }),
            h(
              "th",
              { scope: "row" },
              label.title,
              r.site.status === "study_point" && h("em", { class: "tag tag-ice", text: T.studyTag }),
              r.nonDominated && h("em", { class: "tag tag-amber", title: T.nonDominatedHelp, text: "◆" }),
            ),
            h("td", { class: "model", text: T.modelShort[r.model] }),
            ...CRITERIA.map((c) => cell(c, r)),
            h("td", { text: degrees(r.values["sun.maxElevDeg"] ?? null) }),
          );
          tr.addEventListener("click", () => open(r.site.id));
          tr.addEventListener("keydown", (event) => {
            if (event.key === "Enter") open(r.site.id);
          });
          return tr;
        }),
      ),
    );
  }

  function calendar(s: AppState, rows: RankRow[]): HTMLElement {
    const criterion = criterionById(calendarMetric);
    const rgb = RGB[criterion.id];
    const dates = sweepFor(derived, rows[0].site, s.heightM)?.dates ?? [];
    const pick = h(
      "select",
      { class: "select select-small", "aria-label": T.calendarMetric },
      ...FRACTIONS.map((c) => h("option", { value: c.id, text: T.criteriaShort[c.id] })),
    );
    pick.value = criterion.id;
    pick.addEventListener("change", () => {
      calendarMetric = pick.value;
      render();
    });
    let lastMonth = "";
    const months = dates.map((d) => {
      const first = d.slice(0, 6) !== lastMonth;
      lastMonth = d.slice(0, 6);
      return h("span", { text: first ? formatMonth(d) : "" });
    });
    const grid = h("div", { class: "cal" }, h("span", { class: "cal-name" }, pick), h("div", { class: "cal-row cal-months" }, ...months));
    for (const r of rows) {
      const sweep = sweepFor(derived, r.site, s.heightM, r.model);
      const values = sweep?.values[criterion.metricId] ?? [];
      const cells = dates.map((d, i) => {
        const v = values[i] ?? null;
        const text = `${siteLabel(r.site).title} · ${formatShortDate(d)} · ${T.criteriaShort[criterion.id]} ${v === null ? "—" : formatPercent0(v)}`;
        const cell = h("button", { class: `cal-cell ${d === s.date ? "is-current" : ""}`, type: "button", "data-site": r.site.id, "data-date": d, title: text, "aria-label": text });
        cell.style.background = v === null ? "rgba(255,255,255,0.05)" : `rgba(${rgb},${(0.08 + 0.92 * v).toFixed(3)})`;
        return cell;
      });
      grid.append(
        h("span", { class: `cal-name ${r.site.id === s.siteId ? "is-selected" : ""}` }, siteLabel(r.site).title, h("em", { text: T.modelShort[r.model] })),
        h("div", { class: "cal-row" }, ...cells),
      );
    }
    grid.addEventListener("click", (event) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>(".cal-cell");
      if (cell?.dataset.site && cell.dataset.date) open(cell.dataset.site, cell.dataset.date);
    });
    return grid;
  }

  function render(): void {
    const s = store.get();
    backdrop.hidden = !s.compareOpen;
    if (!s.compareOpen || s.sites.length === 0) return;
    const active = criterionById(s.rankBy);
    const rows = rankSites(s.sites, derived, s.date, s.heightM, active);
    tabTable.classList.toggle("is-on", tab === "table");
    tabCalendar.classList.toggle("is-on", tab === "calendar");
    subtitle.textContent =
      tab === "table" ? `${T.startDate} : ${formatShortDate(s.date)} · ${T.days30} · ${s.heightM} m · ${T.rankBy.toLowerCase()} : ${T.criteria[active.id]}` : T.calendarNote;
    body.replaceChildren(tab === "table" ? table(s, rows, active) : calendar(s, rows));
    note.replaceChildren(
      h("em", { class: "tag tag-amber", text: "◆" }),
      ` ${T.nonDominatedHelp} ${T.rankNote(s.sites.length)} ${T.compareNote}`,
    );
  }

  tabTable.addEventListener("click", () => {
    tab = "table";
    render();
  });
  tabCalendar.addEventListener("click", () => {
    tab = "calendar";
    render();
  });
  close.addEventListener("click", () => actions.setCompare(false));
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) actions.setCompare(false);
  });
  store.subscribe((s, p) => {
    if (s.compareOpen !== p.compareOpen) {
      render();
      if (s.compareOpen) close.focus();
    } else if (s.compareOpen && (s.date !== p.date || s.heightM !== p.heightM || s.rankBy !== p.rankBy || s.siteId !== p.siteId)) render();
  });
  return backdrop;
}
