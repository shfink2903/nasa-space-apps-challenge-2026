import type { Site } from "../data/dataset";
import type { Strings } from "../i18n";
import { splitDuration } from "../planner/clock";

/** Text formatting for one language. Built once per language. */
export interface Format {
  clock(ms: number): string;
  day(ms: number): string;
  stamp(ms: number): string;
  /** YYYYMMDD to "1 December 2026". */
  startDate(date: string): string;
  /** YYYYMMDD to "1 Dec 2026". */
  startDateShort(date: string): string;
  month(date: string): string;
  /** Signed, one decimal: "+12.3°". */
  elevation(deg: number | null): string;
  /** Fraction 0..1 to "23.1 %". */
  percent(fraction: number | null): string;
  /** Hours as "536 h (22.3 d)", or just hours under two days. */
  gap(hours: number | null): string;
  hours(hours: number | null): string;
  duration(ms: number): string;
  number(value: number, digits?: number): string;
  coords(latDeg: number, lonDeg: number): string;
  /** Short name of a site, in this language. */
  site(site: Site): string;
}

const utcOf = (date: string): number => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)));

export function createFormat(t: Strings): Format {
  const num = (digits: number) => new Intl.NumberFormat(t.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const n0 = num(0);
  const n1 = num(1);
  const n2 = num(2);
  const date = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(t.locale, { timeZone: "UTC", ...options });
  const clock = date({ hour: "2-digit", minute: "2-digit" });
  const day = date({ day: "2-digit", month: "short", year: "numeric" });
  const stamp = date({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const long = date({ day: "numeric", month: "long", year: "numeric" });
  const short = date({ day: "numeric", month: "short", year: "numeric" });
  const month = date({ month: "short" });
  const number = (value: number, digits = 1): string => (digits === 0 ? n0 : digits === 2 ? n2 : n1).format(value);

  return {
    clock: (ms) => clock.format(ms),
    day: (ms) => day.format(ms),
    stamp: (ms) => `${stamp.format(ms)} UTC`,
    startDate: (d) => long.format(utcOf(d)),
    startDateShort: (d) => short.format(utcOf(d)),
    month: (d) => month.format(utcOf(d)),
    elevation: (deg) => (deg === null ? "—" : `${deg < 0 ? "−" : "+"}${n1.format(Math.abs(deg))}°`),
    percent: (fraction) => (fraction === null ? "—" : `${n1.format(fraction * 100)} %`),
    hours: (hours) => (hours === null ? "—" : t.hours(n0.format(hours))),
    gap: (hours) => {
      if (hours === null) return "—";
      const h = t.hours(n0.format(hours));
      return hours >= 48 ? `${h} · ${t.days(n1.format(hours / 24))}` : h;
    },
    duration: (ms) => {
      const d = splitDuration(ms);
      return t.durDHM(d.days, d.hours, d.minutes);
    },
    number,
    coords: (latDeg, lonDeg) =>
      `${n2.format(Math.abs(latDeg))}° ${latDeg >= 0 ? t.north : t.south} · ${n2.format(Math.abs(lonDeg))}° ${lonDeg >= 0 ? t.east : t.west}`,
    site: (site) => (site.status === "study_point" ? `${t.studyPoint} ${n1.format(Math.abs(site.latDeg))}° ${t.south}` : site.name.split(" – ")[0]),
  };
}
