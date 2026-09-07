"use client";
import { useContext } from "react";
import { LanguageContext } from "@/lib/lang-ctx";
import { translate } from "./dictionary";
import type { Language } from "@/lib/lang-ctx";

// Safe hook that falls back to English when rendered outside LanguageProvider (e.g. unit tests)
export function useT() {
  const ctx = useContext(LanguageContext);
  const lang: Language = ctx?.lang ?? "en";
  return (key: string) => translate(lang, key);
}

export { translate, getDict } from "./dictionary";
