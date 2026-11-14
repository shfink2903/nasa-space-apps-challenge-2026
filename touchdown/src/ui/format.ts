import type { Site } from "../data/dataset";
import { LOCALE, T } from "./strings";

const num = (digits: number) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const n1 = num(1);
const n2 = num(2);
const clock = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
const dayLong = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const stamp = new Intl.DateTimeFormat(LOCALE, {
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
const n0 = num(0);
/** Short percentage without decimals, for dense tables. */
export const formatPercent0 = (fraction: number): string => `${n0.format(fraction * 100)} %`;
export const formatDeg = (deg: number): string => `${n1.format(deg)}°`;

/** A duration in plain words: "42 min", "19 h 50", "16,7 j". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return T.durMin(minutes);
  if (minutes < 48 * 60) return T.durHour(Math.floor(minutes / 60), String(minutes % 60).padStart(2, "0"));
  return T.durDay(n1.format(minutes / 1440));
}
export const formatHours = (hours: number): string => formatDuration(hours * 3600000);
/** Exact hours with one decimal, for the scientist display. */
export const formatHoursExact = (hours: number): string => T.hoursUnit(n1.format(hours));

/**
 * A share of the 30 analysed days said in days: "13 j sur 30".
 * 0 and 30 are kept for exact values only; near them the text says "< 1" or "> 29".
 */
export function formatShareDays(fraction: number): string {
  const days = fraction * 30;
  if (fraction <= 0) return T.daysOf30("0");
  if (fraction >= 1) return T.daysOf30("30");
  if (days < 1) return T.daysOf30("< 1");
  if (days > 29) return T.daysOf30("> 29");
  return T.daysOf30(String(Math.round(days)));
}

const dayShort = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const monthShort = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", month: "short" });
const dateMs = (date: string): number => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)));
/** YYYYMMDD to a short date, e.g. "1 déc. 2026". */
export const formatShortDate = (date: string): string => dayShort.format(dateMs(date));
export const formatMonth = (date: string): string => monthShort.format(dateMs(date));

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
