"use client";
import { useContext } from "react";
import { LanguageContext } from "@/lib/lang-ctx";
import { translate } from "./dictionary";
import type { Language } from "@/lib/lang-ctx";

// Safe hook that falls back to English when rendered outside LanguageProvider (e.g. unit tests)
export function useT() {
  const ctx = useContext(LanguageContext);
  const lang: Language = ctx?.lang ?? "en";
  const fn = (key: string, vars?: Record<string, string | number>) => {
    let s = translate(lang, key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    }
    return s;
  };
  return fn;
}

/** Locale-aware number/date formatting (bn uses Bengali digits). */
export function useLocale() {
  const ctx = useContext(LanguageContext);
  const lang: Language = ctx?.lang ?? "en";
  const locale = lang === "bn" ? "bn-BD" : "en-US";
  return {
    lang,
    locale,
    formatNumber: (n: number, opts?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, opts).format(n),
    formatDate: (d: Date | number | string, opts?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, opts).format(new Date(d)),
  };
}

export { translate, getDict } from "./dictionary";
