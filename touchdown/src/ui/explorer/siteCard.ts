import { createHorizonPanorama } from "../../charts/horizonPanorama";
import type { DiskState } from "../../data/dataset";
import { groupOf } from "../../planner/catalog";
import { nextEvent, sampleScenario, type Body } from "../../planner/clock";
import { isLowerBound } from "../../planner/metrics";
import { CRITERION_METRIC } from "../../planner/ranking";
import { bundleFor, focusSite, metricsFor, modelFor, rankingFor } from "../../planner/select";
import type { Ui } from "../context";
import { h, icon } from "../dom";

/**
 * Left panel: everything about the selected site, at once.
 * Now: Sun and Earth, with the time left before each one sets or rises.
 * Over the 30 days: the published shares and gaps. Then the local sky.
 */
export function createSiteCard(ui: Ui): HTMLElement {
  const { t, fmt, store, actions, resources } = ui;

  const rank = h("span", { class: "chip" });
  const title = h("h2", { class: "card-title" });
  const coords = h("span", { class: "mono-small" });
  const group = h("span", { class: "tag" });
  const model = h("span", { class: "tag tag-quiet" });
  const unverified = h("span", { class: "tag tag-warn", text: t.unverified });

  const body = (name: Body) => {
    const value = h("span", { class: "now-value" });
    const state = h("small");
    const countdown = h("span", { class: "now-countdown" });
    const status = h("span", { class: "status" });
    const row = h(
      "div",
      { class: `now-row now-${name}` },
      h("span", { class: "now-icon" }, icon(name === "sun" ? "sun" : "earth")),
      h("div", { class: "now-text" }, h("strong", { text: name === "sun" ? t.sun : t.earth }), state, countdown),
      h("div", { class: "now-side" }, value, status),
    );
    return { row, value, state, countdown, status };
  };
  const sun = body("sun");
  const earth = body("earth");

  const bar = (label: string, kind: string) => {
    const fill = h("i");
    const value = h("b");
    const row = h("div", { class: `share share-${kind}` }, h("span", { text: label }), h("div", { class: "share-track" }, fill), value);
    return { row, fill, value };
  };
  const sunShare = bar(t.sunShare, "sun");
  const earthShare = bar(t.earthShare, "earth");
  const bothShare = bar(t.bothShare, "both");
  const night = h("b");
  const blackout = h("b");
  const verdictChip = h("span", { class: "verdict" });
  const verdictWhy = h("p", { class: "verdict-why" });

  const panorama = createHorizonPanorama();
  ui.onDispose(() => panorama.destroy());

  const land = h("button", { class: "button button-primary", type: "button" }, icon("rocket"), h("span", { text: t.land }));
  const landHelp = h("p", { class: "land-help" });
  const sunrise = h("button", { class: "button", type: "button" }, icon("sun"), t.jumpToSunrise);
  const compare = h("button", { class: "button", type: "button" });
  land.addEventListener("click", () => actions.land());
  sunrise.addEventListener("click", () => actions.jumpToSunrise());
  compare.addEventListener("click", () => actions.toggleCompare(store.get().focusId));

  const card = h(
    "section",
    { class: "panel site-card", "aria-label": t.selectedSite },
    h("header", { class: "panel-head" }, h("small", { class: "kicker", text: t.selectedSite }), rank),
    title,
    h("div", { class: "card-meta" }, coords, group, model, unverified),
    h("h3", { class: "section-title", text: t.now }),
    sun.row,
    earth.row,
    h("h3", { class: "section-title", text: t.over30 }),
    sunShare.row,
    earthShare.row,
    bothShare.row,
    h("div", { class: "fact" }, h("span", { text: t.longestNight }), night),
    h("div", { class: "fact" }, h("span", { text: t.longestBlackout }), blackout),
    h("div", { class: "fact fact-verdict" }, h("span", { text: t.requirements }), verdictChip),
    verdictWhy,
    h("h3", { class: "section-title", text: t.localSky }),
    panorama.el,
    h("div", { class: "card-actions" }, land, compare),
    landHelp,
    sunrise,
  );

  // Identity, 30-day numbers, rank and verdict: change with the site, the date, the mast or the rules.
  ui.watch(
    (s) => [s.focusId, s.date, s.heightM, s.scope, s.criterion, s.requirements, s.comparisons, s.dataVersion],
    (s) => {
      const site = focusSite(s);
      title.textContent = fmt.site(site);
      coords.textContent = fmt.coords(site.latDeg, site.lonDeg);
      const g = groupOf(site);
      group.textContent = g === "candidate" ? t.studyPoint : t.landed;
      group.className = `tag tag-${g}`;
      unverified.hidden = site.verification !== "unverified";
      const lola = modelFor(s, site) === "lola";
      model.textContent = lola ? t.modelLola : t.modelGeometric;
      model.title = lola ? t.modelLolaHelp : t.modelGeometricHelp;

      const ranking = rankingFor(s, resources);
      const mine = ranking.rows.find((r) => r.metrics.siteId === site.id);
      rank.textContent = mine?.rank ? `${t.rankOf(mine.rank, ranking.rows.length)} · ${t.criteriaShort[s.criterion]}` : g === "candidate" ? t.unranked : t.landed;
      rank.classList.toggle("chip-best", mine?.rank === 1);

      const m = metricsFor(s, resources, site);
      for (const [row, value] of [
        [sunShare, m?.sunShare],
        [earthShare, m?.earthShare],
        [bothShare, m?.bothShare],
      ] as const) {
        row.fill.style.width = `${Math.round((value ?? 0) * 100)}%`;
        row.value.textContent = fmt.percent(value ?? null);
      }
      bothShare.row.classList.toggle("is-key", CRITERION_METRIC[s.criterion] === "bothShare");
      sunShare.row.classList.toggle("is-key", CRITERION_METRIC[s.criterion] === "sunShare");
      earthShare.row.classList.toggle("is-key", CRITERION_METRIC[s.criterion] === "earthShare");
      night.textContent = `${m && isLowerBound(m, "sunGapH") ? "≥ " : ""}${fmt.gap(m?.sunGapH ?? null)}`;
      blackout.textContent = `${m && isLowerBound(m, "earthGapH") ? "≥ " : ""}${fmt.gap(m?.earthGapH ?? null)}`;

      const results = m ? ranking.checks[m.scenarioId] ?? [] : [];
      const v = m ? ranking.verdicts[m.scenarioId] ?? (Object.values(s.requirements).every((x) => x === null) ? "none" : "unknown") : "unknown";
      verdictChip.textContent = t.verdict[v];
      verdictChip.dataset.verdict = v;
      const failed = results.filter((r) => r.ok === false);
      verdictWhy.hidden = failed.length === 0;
      verdictWhy.textContent = failed.length
        ? `${t.failBecause} ${failed
            .map((r) =>
              r.key === "maxDarkH"
                ? `${t.longestNight.toLowerCase()} ${fmt.hours(r.value)} > ${fmt.hours(r.limit)}`
                : `${(r.key === "minSunShare" ? t.sunShare : t.earthShare).toLowerCase()} ${fmt.percent(r.value)} < ${fmt.percent(r.limit)}`,
            )
            .join(" · ")}`
        : "";

      const inCompare = s.comparisons.some((item) => item.siteId === site.id && item.date === s.date);
      compare.replaceChildren(icon(inCompare ? "check" : "plus"), t.addCompare);
      compare.title = inCompare ? t.removeCompare : t.addCompare;
      compare.classList.toggle("is-on", inCompare);
    },
  );

  // Live values: change with the time slider.
  ui.watch(
    (s) => [s.focusId, s.date, s.heightM, s.scope, s.index, s.phase, s.sceneStatus, s.dataVersion],
    (s) => {
      const site = focusSite(s);
      const bundle = bundleFor(s, resources, site);
      card.classList.toggle("is-loading", !bundle);
      if (!bundle) {
        land.disabled = true;
        sunrise.hidden = true;
        landHelp.hidden = false;
        landHelp.textContent = t.loadingSite;
        for (const body of [sun, earth]) {
          body.value.textContent = fmt.elevation(null);
          body.state.textContent = t.state.unknown;
          body.countdown.textContent = t.loadingSite;
          body.status.replaceChildren(icon("help"), t.state.unknown);
          body.row.classList.remove("is-off");
        }
        return;
      }
      const sample = sampleScenario(bundle.series, bundle.scenario, s.index);
      const stateText = (state: DiskState): string => (state === null ? t.state.unknown : t.state[state]);

      for (const [name, ui_, el, state] of [
        ["sun", sun, sample.sunElDeg, sample.sunState],
        ["earth", earth, sample.earthElDeg, sample.earthState],
      ] as const) {
        const visible = state !== null && state > 0;
        ui_.value.textContent = fmt.elevation(el);
        ui_.state.textContent = stateText(state);
        ui_.row.classList.toggle("is-off", state === 0);
        ui_.row.dataset.visibility = state === null ? "unknown" : String(state);
        const ev = state === null ? null : nextEvent(bundle.scenario, name, sample.tMs);
        const left = ev ? fmt.duration(Date.parse(ev.tUtc) - sample.tMs) : "";
        ui_.countdown.textContent = state === null ? t.visibilityUnknown : ev ? (ev.type === "set" ? t.setIn(left) : t.riseIn(left)) : visible ? t.noSetInPeriod : t.noRiseInPeriod;
        ui_.status.replaceChildren(
          icon(state === null ? "help" : visible ? "check" : "cross"),
          state === null ? t.state.unknown : name === "sun" ? (visible ? t.powerYes : t.powerNo) : visible ? t.linkYes : t.linkNo,
        );
        ui_.status.title = name === "sun" ? t.power : t.link;
      }

      const dark = sample.sunState === 0;
      const unknown = sample.sunState === null;
      const sceneReady = s.sceneStatus === "ready";
      const flying = s.phase !== "cruise" && s.phase !== "focus";
      land.disabled = !sceneReady || dark || unknown || flying;
      land.querySelector("span")!.textContent = unknown ? t.landUnknown : dark ? t.landBlocked : t.land;
      land.classList.toggle("is-blocked", dark || unknown || !sceneReady);
      const sunriseEvent = dark ? nextEvent(bundle.scenario, "sun", sample.tMs) : null;
      landHelp.hidden = (sceneReady && !dark && !unknown) || flying;
      landHelp.textContent = !sceneReady ? (s.sceneStatus === "loading" ? t.sceneLoading : t.sceneUnavailable) : unknown ? t.visibilityUnknown : sunriseEvent ? t.landBlockedHelp : t.noSunInPeriod;
      sunrise.hidden = sunriseEvent?.type !== "rise" || flying;

      panorama.update({
        profileDeg: bundle.horizon?.horizonElevationDeg ?? null,
        sunAzDeg: bundle.series.sunAzDeg,
        sunElDeg: bundle.series.sunElDeg,
        sunState: bundle.series.sunState,
        earthAzDeg: bundle.series.earthAzDeg,
        earthElDeg: bundle.series.earthElDeg,
        earthState: bundle.series.earthState,
        cursorIndex: s.index,
        centerAzDeg: 0,
        compass: t.compass,
        labels: { sun: t.sun, earth: t.earth, horizon: t.horizon },
        formatDeg: (deg) => fmt.elevation(deg),
      });
    },
  );
  return card;
}
