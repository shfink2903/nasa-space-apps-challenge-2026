import { criterionById, CRITERIA, rankSites, sitesIn, type Criterion, type RankRow, type Region } from "../data/ranking";
import type { Derived } from "../data/dataset";
import type { Actions, Store } from "../state";
import { h, icon } from "./dom";
import { formatHours, formatPercent0, formatShortDate, siteLabel } from "./format";
import { T } from "./strings";

/** A published metric as short text, by kind. A missing value stays "—", never zero. */
export function formatCriterion(criterion: Criterion, value: number | null): string {
  if (value === null) return "—";
  return criterion.kind === "fraction" ? formatPercent0(value) : formatHours(value);
}

/** Two-way switch: south pole sites only, or every site. Shared by the ranking and the compare sheet. */
export function createRegionSwitch(store: Store, actions: Actions): HTMLElement {
  const make = (region: Region, label: string): HTMLButtonElement => {
    const b = h("button", { class: "seg", type: "button", text: label, title: T.regionHint });
    b.addEventListener("click", () => actions.setRegion(region));
    return b;
  };
  const south = make("south", T.regionSouth);
  const all = make("all", T.regionAll);
  const paint = (): void => {
    const { region } = store.get();
    south.classList.toggle("is-on", region === "south");
    all.classList.toggle("is-on", region === "all");
  };
  store.subscribe((s, p) => {
    if (s.region !== p.region) paint();
  });
  paint();
  return h("div", { class: "segmented segmented-wide", role: "group", "aria-label": T.regionLabel }, south, all);
}

/**
 * Bottom-right: the sites ordered by the criterion the user picks, for the
 * selected date. Real landings and study points stay marked apart.
 */
export function createSiteList(store: Store, actions: Actions, derived: Derived): HTMLElement {
  const date = h("span", { class: "badge", text: "" });
  const body = h("div", { class: "site-scroll" });
  const note = h("p", { class: "note rank-note" });
  const rows = new Map<string, HTMLButtonElement>();
  const select = h(
    "select",
    { class: "select", id: "rank-by", "aria-label": T.rankBy },
    ...CRITERIA.map((c, i) => h("option", { value: c.id, text: i === 0 ? `${T.criteria[c.id]} (${T.defaultCriterion})` : T.criteria[c.id] })),
  );
  const compare = h("button", { class: "button button-primary button-wide button-big", type: "button" }, icon("table"), T.compare);
  select.addEventListener("change", () => actions.setRankBy(select.value));
  compare.addEventListener("click", () => actions.setCompare(true));

  const row = (r: RankRow, criterion: Criterion): HTMLButtonElement => {
    const { site } = r;
    const label = siteLabel(site);
    const study = site.status === "study_point";
    const button = h(
      "button",
      { class: `site-row ${study ? "is-study" : ""}`, type: "button", "aria-label": T.flyTo(site.name) },
      h("span", { class: "site-mark", text: r.rank === null ? "–" : String(r.rank) }),
      h(
        "span",
        { class: "site-text" },
        h("b", null, label.title, study && h("em", { class: "tag tag-ice", text: T.studyTag }), r.nonDominated && h("em", { class: "tag tag-amber", title: T.nonDominatedHelp, text: "◆" })),
        h("small", { text: label.place || site.name }),
      ),
      h("span", { class: "site-value", text: formatCriterion(criterion, r.value) }),
    );
    button.addEventListener("click", () => actions.selectSite(site.id));
    button.addEventListener("pointerenter", () => actions.hover(site.id));
    button.addEventListener("pointerleave", () => actions.hover(null));
    button.addEventListener("focus", () => actions.hover(site.id));
    button.addEventListener("blur", () => actions.hover(null));
    rows.set(site.id, button);
    return button;
  };

  const panel = h(
    "section",
    { class: "panel sites", "aria-label": T.listTitle },
    h(
      "header",
      { class: "panel-head" },
      h("div", null, h("small", { class: "kicker", text: T.listKicker }), h("h2", { class: "panel-title panel-title-big", text: T.listTitle })),
    ),
    compare,
    createRegionSwitch(store, actions),
    h("label", { class: "field-label", for: "rank-by" }, T.rankBy, date),
    select,
    body,
    h("p", { class: "note rank-legend" }, h("em", { class: "tag tag-amber", text: "◆" }), ` ${T.nonDominated}`),
    note,
  );

  const mark = (): void => {
    const s = store.get();
    for (const [id, el] of rows) {
      el.classList.toggle("is-selected", id === s.siteId);
      el.classList.toggle("is-hover", id === s.hoverId);
      if (id === s.siteId) el.setAttribute("aria-current", "true");
      else el.removeAttribute("aria-current");
    }
  };

  store.subscribe((s, p) => {
    if (s.sites !== p.sites || s.date !== p.date || s.heightM !== p.heightM || s.rankBy !== p.rankBy || s.region !== p.region) {
      const criterion = criterionById(s.rankBy);
      select.value = criterion.id;
      date.textContent = s.date ? `${formatShortDate(s.date)} · ${s.heightM} m` : "";
      const shown = sitesIn(s.sites, s.region);
      note.textContent = T.rankNote(shown.length);
      rows.clear();
      body.replaceChildren(...rankSites(shown, derived, s.date, s.heightM, criterion).map((r) => row(r, criterion)));
      mark();
    } else if (s.siteId !== p.siteId || s.hoverId !== p.hoverId) mark();
  });
  return panel;
}
