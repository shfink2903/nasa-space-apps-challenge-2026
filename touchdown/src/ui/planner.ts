import type { Derived, Site } from "../data/dataset";
import { EARTH, shiftDate, soonestOptions, SUN, valuesAt, verdictAt, type Verdict } from "../data/mission";
import { sitesIn } from "../data/ranking";
import type { Actions, AppState, Store } from "../state";
import { monthGroups } from "./bits";
import { h, icon } from "./dom";
import { dateMs, formatDayMonth, formatDays, formatShortDate, formatStartDate, siteLabel } from "./format";
import { T } from "./strings";
import { failureLines, verdictPill } from "./verdict";

const MAX_DELAY_WEEKS = 26;

/**
 * "Delay": the planner's question in the challenge. A site and a date were
 * chosen; the launch slips by some weeks. Does the site still meet the mission
 * criteria on the new date? If not, when does it again, and which other sites
 * are possible soonest? Every answer is read from the published weekly values;
 * the thresholds are the user's.
 */
export function createPlanner(store: Store, actions: Actions, derived: Derived): { el: HTMLElement; render(): void; reset(): void } {
  let siteId: string | null = null;
  let planned: string | null = null;
  let delay = 4;

  const siteSelect = h("select", { class: "select select-big", "aria-label": T.planSite });
  const dateSelect = h("select", { class: "select select-big", "aria-label": T.planDate });
  const datePrev = h("button", { class: "button button-icon", type: "button", "aria-label": T.datePrev, title: T.datePrev }, icon("left"));
  const dateNext = h("button", { class: "button button-icon", type: "button", "aria-label": T.dateNext, title: T.dateNext }, icon("right"));
  const delayRange = h("input", { class: "cmp-slider", type: "range", min: 0, max: MAX_DELAY_WEEKS, step: 1, "aria-label": T.planDelay });
  const delayText = h("b", { class: "plan-delay-text" });
  const delayDate = h("small", { class: "plan-delay-date" });
  const cards = h("div", { class: "plan-cards" });
  const othersTitle = h("h3", { class: "year-title", text: T.planOthers });
  const others = h("div", { class: "plan-list" });
  const el = h(
    "div",
    { class: "planner" },
    h(
      "div",
      { class: "plan-inputs" },
      h("label", { class: "plan-field" }, h("span", { text: T.planSite }), siteSelect),
      h("div", { class: "plan-field" }, h("span", { text: T.planDate }), h("div", { class: "plan-date" }, datePrev, dateSelect, dateNext)),
      h("label", { class: "plan-field" }, h("span", null, T.planDelay), h("div", { class: "plan-delay" }, delayText, delayDate), delayRange),
    ),
    cards,
    othersTitle,
    others,
  );

  const open = (id: string, date: string): void => {
    actions.setDate(date);
    actions.selectSite(id);
    actions.setCompare(false);
  };
  const days = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : formatDays(v));
  const period = (date: string): string => {
    const t0 = dateMs(date);
    return T.periodOf(formatDayMonth(t0), formatDayMonth(t0 + 29 * 86_400_000));
  };

  function card(title: string, site: Site, date: string, s: AppState, verdict: Verdict, extra: (HTMLElement | null)[] = []): HTMLElement {
    const values = valuesAt(derived, site, s.heightM, date);
    return h(
      "article",
      { class: `plan-card is-${verdict.status}` },
      h("small", { class: "kicker", text: title }),
      h("b", { class: "plan-card-title", text: `${siteLabel(site).title}, ${formatStartDate(date)}` }),
      verdictPill(verdict),
      h("p", { class: "plan-values", text: T.sunValue(days(values[SUN])) }),
      h("p", { class: "plan-values", text: T.earthValue(days(values[EARTH])) }),
      ...failureLines(verdict, values, s.criteria).map((text) => h("p", { class: "plan-fail", text })),
      h("p", { class: "note", text: period(date) }),
      ...extra,
    );
  }

  function render(): void {
    const s = store.get();
    if (s.sites.length === 0 || s.dates.length === 0) return;
    const shown = sitesIn(s.sites, s.region);
    // The planned site stays listed even when the region filter would hide it.
    const selected = s.sites.find((x) => x.id === (siteId ?? s.siteId)) ?? shown[0] ?? s.sites[0];
    const list = shown.includes(selected) ? shown : [selected, ...shown];
    siteId = selected.id;
    planned = planned && s.dates.includes(planned) ? planned : s.date;

    siteSelect.replaceChildren(...list.map((x) => h("option", { value: x.id, text: x.status === "custom" ? `${siteLabel(x).title} (${T.estimateShort})` : siteLabel(x).title })));
    siteSelect.value = selected.id;
    dateSelect.replaceChildren(
      ...monthGroups(s.dates).map((g) => h("optgroup", { label: formatStartDate(g.dates[0]).replace(/^\d+\s/, "") }, ...g.dates.map((d) => h("option", { value: d, text: formatShortDate(d) })))),
    );
    dateSelect.value = planned;
    const at = s.dates.indexOf(planned);
    datePrev.disabled = at <= 0;
    dateNext.disabled = at >= s.dates.length - 1;
    delayRange.value = String(delay);
    delayRange.style.setProperty("--p", `${(delay / MAX_DELAY_WEEKS) * 100}%`);

    const after = shiftDate(s.dates, planned, delay);
    delayText.textContent = T.weeks(delay);
    delayDate.textContent = after && delay > 0 ? T.planNewDate(formatShortDate(after)) : "";
    const before = card(T.planBefore, selected, planned, s, verdictAt(derived, selected, s.heightM, planned, s.criteria));
    if (!after) {
      cards.replaceChildren(before, h("article", { class: "plan-card is-unknown" }, h("small", { class: "kicker", text: T.planAfter }), h("p", { text: T.planBeyond })));
      othersTitle.hidden = true;
      others.replaceChildren();
      return;
    }

    const verdict = verdictAt(derived, selected, s.heightM, after, s.criteria);
    const options = soonestOptions(derived, list, s.heightM, after, s.criteria);
    const same = options.find((o) => o.site.id === selected.id);
    const extra: (HTMLElement | null)[] = [];
    if (verdict.status === "nogo") {
      if (same) {
        const go = h("button", { class: "button button-primary", type: "button", text: T.planOpen });
        go.addEventListener("click", () => open(selected.id, same.date));
        extra.push(h("p", { class: "plan-next", text: T.nextGo(formatShortDate(same.date), same.waitWeeks) }), go);
      } else extra.push(h("p", { class: "plan-next", text: T.nextGoNone }));
    } else if (verdict.status === "go") {
      const go = h("button", { class: "button button-primary", type: "button", text: T.planOpen });
      go.addEventListener("click", () => open(selected.id, after));
      extra.push(go);
    }
    cards.replaceChildren(before, card(T.planAfter, selected, after, s, verdict, extra));

    const rows = options
      .filter((o) => o.site.id !== selected.id)
      .map((o) => {
        const row = h(
          "button",
          { class: "plan-row", type: "button" },
          h("b", null, siteLabel(o.site).title, o.site.computed && h("em", { class: "tag tag-warn", title: T.customWarning, text: T.estimateShort })),
          h("span", { class: `plan-wait ${o.waitWeeks === 0 ? "is-now" : ""}`, text: o.waitWeeks === 0 ? T.planReady : T.planWait(formatShortDate(o.date), o.waitWeeks) }),
          h("span", { class: "plan-values", text: T.sunValue(days(o.values[SUN])) }),
          h("span", { class: "plan-values", text: T.earthValue(days(o.values[EARTH])) }),
          h("span", { class: "plan-open", text: T.planOpen }),
        );
        row.addEventListener("click", () => open(o.site.id, o.date));
        return row;
      });
    othersTitle.hidden = false;
    others.replaceChildren(...(rows.length > 0 ? rows : [h("p", { class: "note", text: T.planOthersNone })]));
  }

  siteSelect.addEventListener("change", () => {
    siteId = siteSelect.value;
    render();
  });
  dateSelect.addEventListener("change", () => {
    planned = dateSelect.value;
    render();
  });
  const stepDate = (delta: number): void => {
    const { dates } = store.get();
    const next = dates[dates.indexOf(planned ?? "") + delta];
    if (!next) return;
    planned = next;
    render();
  };
  datePrev.addEventListener("click", () => stepDate(-1));
  dateNext.addEventListener("click", () => stepDate(1));
  delayRange.addEventListener("input", () => {
    delay = Number(delayRange.value);
    render();
  });
  // On opening, start again from the site and the date the user is looking at.
  const reset = (): void => {
    siteId = null;
    planned = null;
  };
  return { el, render, reset };
}
