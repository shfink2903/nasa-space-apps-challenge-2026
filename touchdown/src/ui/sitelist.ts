import type { Site } from "../data/dataset";
import type { Actions, Store } from "../state";
import { h, icon } from "./dom";
import { formatCoords, siteLabel } from "./format";
import { T } from "./strings";

/** Bottom-right: the real landing sites, then the study points in their own group. */
export function createSiteList(store: Store, actions: Actions): HTMLElement {
  const count = h("span", { class: "badge", text: "0" });
  const body = h("div", { class: "site-scroll" });
  const rows = new Map<string, HTMLButtonElement>();

  const row = (site: Site): HTMLButtonElement => {
    const label = siteLabel(site);
    const button = h(
      "button",
      { class: `site-row ${site.status === "study_point" ? "is-study" : ""}`, type: "button", "aria-label": T.flyTo(site.name) },
      h("span", { class: "site-mark" }, icon(site.status === "study_point" ? "target" : "pin")),
      h(
        "span",
        { class: "site-text" },
        h("b", { text: label.title }),
        h("small", { text: label.place ? `${label.place} · ${formatCoords(site)}` : formatCoords(site) }),
      ),
      h("span", { class: "site-go" }, icon("arrow")),
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
      count,
    ),
    body,
  );

  store.subscribe((s, p) => {
    if (s.sites !== p.sites) {
      rows.clear();
      const real = s.sites.filter((x) => x.status === "historical");
      const study = s.sites.filter((x) => x.status === "study_point");
      count.textContent = String(real.length);
      body.replaceChildren(
        h("h3", { class: "group-title", text: T.historical }),
        ...real.map(row),
        h("h3", { class: "group-title", text: T.study }, h("small", { text: T.studyNote })),
        ...study.map(row),
      );
    }
    if (s.siteId !== p.siteId || s.hoverId !== p.hoverId || s.sites !== p.sites) {
      for (const [id, el] of rows) {
        el.classList.toggle("is-selected", id === s.siteId);
        el.classList.toggle("is-hover", id === s.hoverId);
        if (id === s.siteId) el.setAttribute("aria-current", "true");
        else el.removeAttribute("aria-current");
      }
    }
  });
  return panel;
}
