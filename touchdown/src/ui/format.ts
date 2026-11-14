import type { Site } from "../data/dataset";
import { T } from "./strings";

const num = (digits: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const n1 = num(1);
const n2 = num(2);
const clock = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
const dayLong = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const stamp = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatClock = (ms: number): string => clock.format(ms);
export const formatDay = (ms: number): string => day.format(ms);
export const formatStamp = (iso: string): string => `${stamp.format(Date.parse(iso))} UTC`;

/** YYYYMMDD to a long date. */
export function formatStartDate(date: string): string {
  return dayLong.format(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))));
}

/** Signed elevation with one decimal, e.g. "+12,3°". */
export function formatElevation(deg: number): string {
  const text = n1.format(Math.abs(deg));
  return `${deg < 0 ? "−" : "+"}${text}°`;
}

export const formatPercent = (fraction: number): string => `${n1.format(fraction * 100)} %`;

export function formatCoords(site: Site): string {
  const lat = `${n2.format(Math.abs(site.latDeg))}° ${site.latDeg >= 0 ? T.north : T.south}`;
  const lon = `${n2.format(Math.abs(site.lonDeg))}° ${site.lonDeg >= 0 ? T.east : T.west}`;
  return `${lat} · ${lon}`;
}

/** "Apollo 11 – Tranquility Base" gives { title: "Apollo 11", place: "Tranquility Base" }. */
export function siteLabel(site: Site): { title: string; place: string } {
  const [title, ...rest] = site.name.split(" – ");
  return { title, place: rest.join(" – ") };
}
