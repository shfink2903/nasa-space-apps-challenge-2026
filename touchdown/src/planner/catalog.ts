/** How the sites of the dataset are grouped for a south-pole planner. */
import { hasModel, type Model, type Site } from "../data/dataset";

export type SiteGroup = "candidate" | "polarRef" | "historical";

/** South of this latitude a landed mission is shown as a polar reference. */
const POLAR_LAT_DEG = -60;

export function groupOf(site: Site): SiteGroup {
  if (site.status === "study_point") return "candidate";
  return site.latDeg <= POLAR_LAT_DEG ? "polarRef" : "historical";
}

export const isPolar = (site: Site): boolean => groupOf(site) !== "historical";

/** Candidates first, then polar references, then the rest. The dataset order is kept inside a group. */
export function orderedSites(sites: Site[]): Site[] {
  const order: SiteGroup[] = ["candidate", "polarRef", "historical"];
  return [...sites].sort((a, b) => order.indexOf(groupOf(a)) - order.indexOf(groupOf(b)));
}

/** Sites compared in a scope. "polar" keeps the sites that have the terrain model. */
export function scopeSites(sites: Site[], scope: "polar" | "all"): Site[] {
  return scope === "polar" ? sites.filter((s) => isPolar(s) && hasModel(s, "lola")) : sites;
}

/** One model for a whole comparison, so numbers are comparable. */
export const scopeModel = (scope: "polar" | "all"): Model => (scope === "polar" ? "lola" : "geometric");
