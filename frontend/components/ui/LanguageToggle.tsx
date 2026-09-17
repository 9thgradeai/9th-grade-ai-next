"use client";

import { useContext } from "react";
import { motion } from "framer-motion";
import { Languages } from "lucide-react";
import { LanguageContext, type Language } from "@/lib/lang-ctx";
import { LANGUAGE_KEY } from "@/lib/lang-key";

export default function LanguageToggle({ className }: { className?: string }) {
  const ctx = useContext(LanguageContext);
  // Safe fallback for tests / SSR without provider — defaults to en and no-ops toggle gracefully
  const lang: Language = ctx?.lang ?? "en";
  const toggleLang = ctx?.toggleLang ?? (() => {
    try {
      const cur = (typeof window !== "undefined" ? localStorage.getItem(LANGUAGE_KEY) : null) === "bn" ? "bn" : "en";
      const next = cur === "bn" ? "en" : "bn";
      localStorage.setItem(LANGUAGE_KEY, next);
      document.documentElement.lang = next;
      window.dispatchEvent(new Event("storage"));
    } catch { /* ignore */ }
  });

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggleLang}
      className={
        className ??
        "relative min-h-[44px] px-2.5 flex items-center gap-1.5 text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-primary)] transition-colors rounded-lg hover:bg-emerald-500/5 font-mono text-xs uppercase tracking-wider"
      }
      title={lang === "bn" ? "Switch to English" : "বাংলায় টগল করুন"}
      aria-label={lang === "bn" ? "Switch interface language to English" : "ইন্টারফেস ভাষা বাংলায় পরিবর্তন করুন"}
      aria-pressed={lang === "bn"}
      type="button"
    >
      <Languages className="w-4 h-4" aria-hidden="true" />
      <span aria-hidden="true">{lang === "bn" ? "বাং" : "EN"}</span>
    </motion.button>
  );
}
