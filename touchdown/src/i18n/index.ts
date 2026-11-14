import { en } from "./en";
import { fr, type Strings } from "./fr";

export type Locale = "fr" | "en";
export type { Strings };

const TABLE: Record<Locale, Strings> = { fr, en };

export const strings = (locale: Locale): Strings => TABLE[locale];

/** French for French browsers, English for everyone else. A saved choice wins. */
export function initialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem("touchdown.locale");
    if (saved === "fr" || saved === "en") return saved;
  } catch {
    // Storage can be blocked. The browser language is enough.
  }
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function saveLocale(locale: Locale): void {
  try {
    window.localStorage.setItem("touchdown.locale", locale);
  } catch {
    // Not saved: the choice still applies to this visit.
  }
}
