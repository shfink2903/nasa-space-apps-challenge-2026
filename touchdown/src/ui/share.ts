/**
 * The view as a link: tab, site, date, mast, scope, priority, compared sites,
 * limits and the time in the period. A planner can send the exact scenario to
 * the team, and the link opens on it.
 */
import type { Criterion, Requirements } from "../planner/ranking";
import type { AppState, Scope, Tab } from "../state";

export type SharedState = Partial<Pick<AppState, "tab" | "focusId" | "date" | "heightM" | "scope" | "criterion" | "compareIds" | "index" | "requirements">>;

const CRITERIA: Criterion[] = ["balanced", "power", "comms"];

/** State to a URL hash. Only what changes the numbers on screen. */
export function encodeState(s: AppState): string {
  const p = new URLSearchParams();
  p.set("tab", s.tab);
  p.set("site", s.focusId);
  p.set("date", s.date);
  p.set("h", String(s.heightM));
  p.set("scope", s.scope);
  p.set("crit", s.criterion);
  if (s.compareIds.length) p.set("cmp", s.compareIds.join(","));
  p.set("t", String(Math.round(s.index)));
  const r = s.requirements;
  p.set("req", [r.minSunShare, r.minEarthShare, r.maxDarkH].map((v) => (v === null ? "-" : String(v))).join(","));
  return `#${p.toString()}`;
}

/** URL hash to a state patch. Anything unknown or out of range is dropped, never guessed. */
export function decodeState(hash: string, sites: { id: string }[], dates: string[], maxIndex: number): SharedState {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const ids = new Set(sites.map((s) => s.id));
  const out: SharedState = {};
  const tab = p.get("tab");
  if (tab === "explorer" || tab === "data") out.tab = tab as Tab;
  const site = p.get("site");
  if (site && ids.has(site)) out.focusId = site;
  const date = p.get("date");
  if (date && dates.includes(date)) out.date = date;
  const height = Number(p.get("h"));
  if (height === 2 || height === 10) out.heightM = height;
  const scope = p.get("scope");
  if (scope === "polar" || scope === "all") out.scope = scope as Scope;
  const crit = p.get("crit");
  if (crit && (CRITERIA as string[]).includes(crit)) out.criterion = crit as Criterion;
  const cmp = p.get("cmp");
  if (cmp) out.compareIds = [...new Set(cmp.split(",").filter((id) => ids.has(id)))].slice(0, 3);
  const t = p.get("t");
  if (t !== null && Number.isFinite(Number(t))) out.index = Math.min(maxIndex, Math.max(0, Math.round(Number(t))));
  const req = p.get("req");
  if (req) {
    const parts = req.split(",");
    if (parts.length === 3) {
      const num = (x: string, lo: number, hi: number): number | null | undefined => {
        if (x === "-") return null;
        const v = Number(x);
        return Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
      };
      const [a, b, c] = [num(parts[0], 0, 1), num(parts[1], 0, 1), num(parts[2], 0, 720)];
      if (a !== undefined && b !== undefined && c !== undefined) out.requirements = { minSunShare: a, minEarthShare: b, maxDarkH: c } as Requirements;
    }
  }
  return out;
}
