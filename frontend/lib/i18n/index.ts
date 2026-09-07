"use client";
import { useLanguage } from "@/lib/lang-ctx";
import { translate } from "./dictionary";

export function useT() {
  const { lang } = useLanguage();
  return (key: string) => translate(lang, key);
}

export { translate, getDict } from "./dictionary";
