import { metric, nextSunEvent, parseScenarioId, sampleSeries, type DiskState } from "../data/dataset";
import type { Store } from "../state";
import { h, icon } from "./dom";
import { formatCoords, formatElevation, formatPercent, formatStamp, siteLabel } from "./format";
import { T } from "./strings";

const stateText = (state: DiskState): string => (state === null ? T.state.unknown : T.state[state]);

/**
 * Left, under the guide: Sun and Earth at the site, read from the dataset.
 * Shown from the final descent. Nothing here is computed by the interface.
 */
export function createConditions(store: Store): HTMLElement {
  const name = h("b", { class: "cond-site" });
  const coords = h("small", { class: "cond-coords" });
  const sunEl = h("span", { class: "cond-value" });
  const sunState = h("small");
  const earthEl = h("span", { class: "cond-value" });
  const earthState = h("small");
  const eventLabel = h("span");
  const eventValue = h("b");
  const share = h("b");
  const model = h("p", { class: "cond-model" });

  const body = (label: string, value: HTMLElement, state: HTMLElement, name_: string) =>
    h("div", { class: "cond-row" }, h("span", { class: `cond-icon cond-${name_}` }, icon(name_)), h("div", null, h("strong", { text: label }), state), value);

  const panel = h(
    "section",
    { class: "panel conditions", "aria-label": T.conditions, hidden: true },
    h("header", { class: "panel-head" }, h("h2", { class: "panel-title" }, icon("target"), T.conditions)),
    h("div", { class: "cond-head" }, name, coords),
    body(T.sun, sunEl, sunState, "sun"),
    body(T.earth, earthEl, earthState, "earth"),
    h("p", { class: "cond-note", text: T.elevation }),
    h("div", { class: "cond-line" }, eventLabel, eventValue),
    h("div", { class: "cond-line" }, h("span", { text: T.sunShare }), share),
    model,
  );

  store.subscribe((s, p) => {
    const wasHidden = panel.hidden;
    const site = s.sites.find((x) => x.id === s.siteId);
    const show = (s.phase === "final" || s.phase === "surface") && site !== undefined && s.lightSiteId === s.siteId && s.series !== null && s.scenario !== null;
    panel.hidden = !show;
    if (!show || !site || !s.series || !s.scenario) return;
    if (!wasHidden && s.index === p.index && s.series === p.series && s.scenario === p.scenario && s.phase === p.phase) return;

    const sample = sampleSeries(s.series, s.index);
    name.textContent = siteLabel(site).title;
    coords.textContent = formatCoords(site);
    sunEl.textContent = formatElevation(sample.sunElDeg);
    sunState.textContent = stateText(sample.sunState);
    earthEl.textContent = formatElevation(sample.earthElDeg);
    earthState.textContent = stateText(sample.earthState);

    const event = nextSunEvent(s.scenario, sample.tMs);
    eventLabel.textContent = event ? (event.type === "rise" ? T.nextRise : T.nextSet) : T.nextEvent;
    eventValue.textContent = event ? formatStamp(event.tUtc) : T.noEvent;
    const fraction = metric(s.scenario, "sun.anyDisk.fraction");
    share.textContent = fraction === null ? "—" : formatPercent(fraction);
    model.textContent = parseScenarioId(s.scenario.scenarioId)?.model === "lola" ? T.modelLola : T.modelGeometric;
  });
  return panel;
}
