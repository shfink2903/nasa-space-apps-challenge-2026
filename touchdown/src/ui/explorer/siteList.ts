import { groupOf, scopeSites } from "../../planner/catalog";
import { checkRequirements, CRITERION_METRIC, verdict, type Criterion } from "../../planner/ranking";
import { rankedOrder, rankingFor, siteById } from "../../planner/select";
import type { Ui } from "../context";
import { h, icon } from "../dom";

/**
 * Right panel, bottom: the sites of the current scope, best first for the
 * chosen priority. A click shows the site. The "+" adds it to the comparison.
 */
export function createSiteList(ui: Ui): HTMLElement {
  const { t, fmt, actions, resources } = ui;
  const body = h("div", { class: "site-scroll" });
  const criterion = h(
    "select",
    { class: "select select-small", "aria-label": t.criterion },
    ...(Object.keys(t.criteria) as Criterion[]).map((c) => h("option", { value: c, text: t.criteria[c] })),
  );
  criterion.addEventListener("change", () => actions.setCriterion(criterion.value as Criterion));
  const scope = (["polar", "all"] as const).map((value) => {
    const b = h("button", { class: "segment", type: "button", text: value === "polar" ? t.scopePolar : t.scopeAll });
    b.addEventListener("click", () => actions.setScope(value));
    return { value, b };
  });

  const panel = h(
    "section",
    { class: "panel sites", "aria-label": t.ranking },
    h("header", { class: "panel-head" }, h("h2", { class: "panel-title panel-title-big", text: t.ranking }), criterion),
    h("div", { class: "segments segments-wide" }, ...scope.map((x) => x.b)),
    h("p", { class: "note list-note", text: t.groupCandidatesNote }),
    body,
  );

  ui.watch(
    (s) => [s.sites, s.scope, s.criterion, s.date, s.heightM, s.requirements, s.focusId, s.hoverId, s.compareIds, s.dataVersion],
    (s) => {
      criterion.value = s.criterion;
      for (const x of scope) x.b.classList.toggle("is-on", x.value === s.scope);
      const ranking = rankingFor(s, resources);
      const key = CRITERION_METRIC[s.criterion];
      const kind = s.criterion === "power" ? "sun" : s.criterion === "comms" ? "earth" : "both";
      // While the sweeps load, show the sites in catalogue order.
      const metrics = new Map(rankedOrder(ranking).map((m) => [m.siteId, m]));
      const order = ranking.complete ? [...metrics.keys()] : scopeSites(s.sites, s.scope).map((x) => x.id);
      const firstReference = ranking.complete ? ranking.references[0]?.siteId : undefined;
      body.replaceChildren(
        ...order.flatMap((id) => {
          const site = siteById(s, id)!;
          const row = ranking.rows.find((r) => r.metrics.siteId === id);
          const m = metrics.get(id);
          const value = m?.[key] ?? null;
          const v = m ? verdict(checkRequirements(m, s.requirements)) : "none";
          const inCompare = s.compareIds.includes(id);
          const add = h(
            "button",
            { class: `row-compare ${inCompare ? "is-on" : ""}`, type: "button", "aria-label": inCompare ? t.removeCompare : t.addCompare, title: inCompare ? t.removeCompare : t.addCompare, "aria-pressed": inCompare },
            icon(inCompare ? "check" : "plus"),
          );
          add.addEventListener("click", (event) => {
            event.stopPropagation();
            actions.toggleCompare(id);
          });
          const fill = h("i");
          fill.style.width = `${Math.round((value ?? 0) * 100)}%`;
          const main = h(
            "button",
            { class: "site-main", type: "button" },
            h("span", { class: `site-rank ${row?.rank === 1 ? "is-best" : ""}`, text: row?.rank ? String(row.rank) : "–" }),
            h(
              "span",
              { class: "site-text" },
              h("b", { text: fmt.site(site) }, m && ranking.pareto.has(m.scenarioId) ? h("em", { class: "pareto", title: t.paretoHelp, text: t.pareto }) : null),
              h("span", { class: `share-track share-${kind}` }, fill),
            ),
            h("span", { class: "site-value" }, fmt.percent(value), h("i", { class: "dot", "data-verdict": v, title: t.verdict[v] })),
          );
          main.addEventListener("click", () => actions.selectSite(id));
          const el = h("div", { class: `site-row group-${groupOf(site)} ${id === s.focusId ? "is-selected" : ""} ${id === s.hoverId ? "is-hover" : ""}` }, main, add);
          el.addEventListener("pointerenter", () => actions.hover(id));
          el.addEventListener("pointerleave", () => actions.hover(null));
          return id === firstReference ? [h("h3", { class: "group-title", text: t.references }), el] : [el];
        }),
      );
    },
  );
  return panel;
}
