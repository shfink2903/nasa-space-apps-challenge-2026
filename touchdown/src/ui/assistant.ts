import { sampleSeries } from "../data/dataset";
import { scopeSites } from "../planner/catalog";
import { nextEvent } from "../planner/clock";
import { METRIC_IDS } from "../planner/metrics";
import { checkRequirements, CRITERION_METRIC, verdict } from "../planner/ranking";
import { bundleFor, focusSite, metricsFor, rankingFor, scenarioIdFor } from "../planner/select";
import type { AppState } from "../state";
import type { Ui } from "./context";
import { h, icon } from "./dom";

/** What the local AI service answers (lunar_data/server.py). Evidence cards are shown as they are. */
interface AiAnswer {
  explanationStatus: "available" | "invalid" | "unavailable";
  message: string;
  questions?: string[];
  evidence?: AiEvidence[];
  limits?: string[];
  sessionId?: string;
}
interface AiEvidence {
  kind: string;
  siteId?: string;
  metric?: { metricId: string; value: number | null; unit: string };
  comparison?: { exploredCount: number; nonDominatedScenarioIds: string[] };
  range?: { metricId: string; min: number | null; max: number | null; unit: string };
}

/**
 * Right drawer. Top: a summary written by plain rules from the published
 * values, always there. Bottom: questions to the AI, when the local service
 * (python -m lunar_data.server) is running and has a model.
 */
export function createAssistant(ui: Ui): HTMLElement {
  const { t, fmt, store, actions, resources } = ui;
  const summary = h("ul", { class: "brief" });
  const status = h("p", { class: "note" });
  const log = h("div", { class: "ai-log" });
  const input = h("textarea", { class: "ai-input", rows: 2, placeholder: t.aiPlaceholder, "aria-label": t.aiLive });
  const send = h("button", { class: "button button-primary", type: "submit" }, icon("arrow"), t.aiSend);
  const chips = h(
    "div",
    { class: "ai-chips" },
    ...t.aiSuggestions.map((text) => {
      const b = h("button", { class: "chip-button", type: "button", text });
      b.addEventListener("click", () => ask(text));
      return b;
    }),
  );
  const form = h("form", { class: "ai-form", hidden: true }, chips, input, send);
  const close = h("button", { class: "icon-button", type: "button", "aria-label": t.close, title: t.close }, icon("cross"));
  close.addEventListener("click", () => actions.setAssistant(false));

  const drawer = h(
    "aside",
    { class: "panel assistant", "aria-label": t.aiTitle, hidden: true },
    h("header", { class: "panel-head" }, h("h2", { class: "panel-title panel-title-big" }, icon("chat"), t.aiTitle), close),
    h("h3", { class: "section-title", text: t.aiAuto }),
    summary,
    h("p", { class: "note", text: t.aiAutoNote }),
    h("h3", { class: "section-title", text: t.aiLive }),
    status,
    log,
    form,
  );

  let sessionId: string | undefined;
  let busy = false;
  let checked = false;

  /** Asks the local service whether a model is ready. Any failure means "offline". */
  async function check(): Promise<void> {
    checked = true;
    try {
      const res = await fetch("/api/health", { headers: { Accept: "application/json" } });
      const health = res.ok ? ((await res.json()) as { ai?: { configured?: boolean; model?: string } }) : null;
      if (!health?.ai) throw new Error("no service");
      form.hidden = !health.ai.configured;
      status.textContent = health.ai.configured ? (health.ai.model ?? "") : t.aiNotConfigured;
    } catch {
      form.hidden = true;
      status.textContent = t.aiOffline;
    }
  }

  function evidenceLine(e: AiEvidence): string {
    if (e.kind === "metric" && e.metric) {
      const value = e.metric.value === null ? "—" : e.metric.unit === "1" ? fmt.percent(e.metric.value) : `${fmt.number(e.metric.value)} ${e.metric.unit}`;
      return `${e.siteId ?? ""} · ${e.metric.metricId}: ${value}`;
    }
    if (e.kind === "comparison" && e.comparison) return `${t.pareto}: ${e.comparison.nonDominatedScenarioIds.length} / ${e.comparison.exploredCount}`;
    if (e.kind === "sensitivity" && e.range) return `${e.range.metricId}: ${e.range.min ?? "—"} → ${e.range.max ?? "—"} ${e.range.unit}`;
    return e.kind;
  }

  /** The metric cards the AI cites, as one row per site. These are the published values it read. */
  function evidenceTable(evidence: AiEvidence[]): HTMLElement | null {
    const columns: { id: string; label: string }[] = [
      { id: METRIC_IDS.bothShare, label: t.criteriaShort.balanced },
      { id: METRIC_IDS.sunShare, label: t.sun },
      { id: METRIC_IDS.earthShare, label: t.earth },
      { id: METRIC_IDS.sunGapH, label: t.colNight },
      { id: METRIC_IDS.earthGapH, label: t.colBlackout },
    ];
    const bySite = new Map<string, Map<string, AiEvidence["metric"]>>();
    for (const e of evidence) {
      if (e.kind !== "metric" || !e.metric || !e.siteId) continue;
      if (!bySite.has(e.siteId)) bySite.set(e.siteId, new Map());
      bySite.get(e.siteId)!.set(e.metric.metricId, e.metric);
    }
    const used = columns.filter((c) => [...bySite.values()].some((m) => m.has(c.id)));
    if (bySite.size === 0 || used.length === 0) return null;
    const cell = (m: AiEvidence["metric"]): string => (!m || m.value === null ? "—" : m.unit === "1" ? fmt.percent(m.value) : fmt.hours(m.value));
    return h(
      "table",
      { class: "ai-table" },
      h("thead", null, h("tr", null, h("th", { text: t.colSite }), ...used.map((c) => h("th", { text: c.label })))),
      h(
        "tbody",
        null,
        ...[...bySite].map(([siteId, metrics]) => {
          const site = store.get().sites.find((x) => x.id === siteId);
          return h("tr", null, h("td", { text: site ? fmt.site(site) : siteId }), ...used.map((c) => h("td", { text: cell(metrics.get(c.id)) })));
        }),
      ),
    );
  }

  async function ask(message: string): Promise<void> {
    const text = message.trim();
    if (!text || busy || form.hidden) return;
    busy = true;
    send.disabled = true;
    input.value = "";
    log.append(h("p", { class: "ai-question", text }));
    const pending = h("p", { class: "ai-answer is-pending", text: t.aiThinking });
    log.append(pending);
    pending.scrollIntoView({ block: "nearest" });
    const s = store.get();
    // The AI reads the scenarios on screen: the compared sites, or all sites of the scope.
    const ids = (s.compareIds.length >= 2 ? s.compareIds : scopeSites(s.sites, s.scope).map((x) => x.id))
      .map((id) => s.sites.find((x) => x.id === id)!)
      .map((site) => scenarioIdFor(s, site))
      .filter((id): id is string => id !== null);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, locale: s.locale, sessionId, context: { scenarioIds: ids, priority: [METRIC_IDS[CRITERION_METRIC[s.criterion]]] } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const answer = (await res.json()) as AiAnswer;
      sessionId = answer.sessionId ?? sessionId;
      pending.classList.remove("is-pending");
      pending.textContent = answer.message;
      for (const q of answer.questions ?? []) log.append(h("p", { class: "ai-answer", text: q }));
      const table = evidenceTable(answer.evidence ?? []);
      if (table) log.append(table);
      const other = (answer.evidence ?? []).filter((e) => e.kind !== "metric");
      if (other.length) {
        log.append(h("details", { class: "ai-evidence" }, h("summary", { text: `${t.aiEvidence} (${other.length})` }), h("ul", null, ...other.slice(0, 12).map((e) => h("li", { text: evidenceLine(e) })))));
      }
      if (answer.limits?.length) {
        log.append(h("details", { class: "ai-evidence" }, h("summary", { text: `${t.aiLimits} (${answer.limits.length})` }), h("ul", null, ...answer.limits.map((line) => h("li", { text: line })))));
      }
    } catch (error) {
      console.error(error);
      pending.classList.remove("is-pending");
      pending.classList.add("is-error");
      pending.textContent = t.aiError;
    } finally {
      busy = false;
      send.disabled = false;
      log.lastElementChild?.scrollIntoView({ block: "nearest" });
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void ask(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(input.value);
    }
  });

  ui.watch(
    (s) => [s.assistantOpen],
    (s) => {
      drawer.hidden = !s.assistantOpen;
      if (s.assistantOpen && !checked) void check();
    },
  );

  // The rule-based summary of the selected site, at the chosen time.
  ui.watch(
    (s) => [s.assistantOpen, s.focusId, s.date, s.heightM, s.scope, s.criterion, s.requirements, Math.round(s.index / 6), s.dataVersion],
    (s: AppState) => {
      if (!s.assistantOpen) return;
      const site = focusSite(s);
      const lines: string[] = [];
      const ranking = rankingFor(s, resources);
      const mine = ranking.rows.find((r) => r.metrics.siteId === site.id);
      lines.push(mine?.rank ? `${fmt.site(site)} · ${t.rankOf(mine.rank, ranking.rows.length)} · ${t.criteriaShort[s.criterion]}` : `${fmt.site(site)} · ${t.landed}`);
      const bundle = bundleFor(s, resources, site);
      if (bundle) {
        const sample = sampleSeries(bundle.series, s.index);
        for (const [name, state] of [
          ["sun", sample.sunState],
          ["earth", sample.earthState],
        ] as const) {
          const visible = (state ?? 0) > 0;
          const ev = nextEvent(bundle.scenario, name, sample.tMs);
          const left = ev ? fmt.duration(Date.parse(ev.tUtc) - sample.tMs) : "";
          const countdown = ev ? (ev.type === "set" ? t.setIn(left) : t.riseIn(left)) : visible ? t.noSetInPeriod : t.noRiseInPeriod;
          lines.push(`${name === "sun" ? (visible ? t.powerYes : t.powerNo) : visible ? t.linkYes : t.linkNo}. ${countdown}.`);
        }
      }
      const m = metricsFor(s, resources, site);
      if (m) {
        lines.push(`${t.over30}: ${t.sunShare.toLowerCase()} ${fmt.percent(m.sunShare)}, ${t.earthShare.toLowerCase()} ${fmt.percent(m.earthShare)}, ${t.bothShare.toLowerCase()} ${fmt.percent(m.bothShare)}.`);
        lines.push(`${t.longestNight}: ${fmt.gap(m.sunGapH)}. ${t.longestBlackout}: ${fmt.gap(m.earthGapH)}.`);
        lines.push(t.verdict[verdict(checkRequirements(m, s.requirements))]);
      }
      summary.replaceChildren(...lines.map((line) => h("li", { text: line })));
    },
  );
  return drawer;
}
