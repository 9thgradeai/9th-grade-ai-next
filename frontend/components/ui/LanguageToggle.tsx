"use client";

import { motion } from "framer-motion";
import { Languages } from "lucide-react";
import { useLanguage } from "@/lib/lang-ctx";

export default function LanguageToggle() {
  const { lang, toggleLang } = useLanguage();

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggleLang}
      className="relative min-h-[44px] px-2.5 flex items-center gap-1.5 text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-primary)] transition-colors rounded-lg hover:bg-emerald-500/5 font-mono text-xs uppercase tracking-wider"
      title={lang === "bn" ? "Switch to English" : "বাংলায় টগল করুন"}
      aria-label={lang === "bn" ? "Switch interface language to English" : "ইন্টারফেস ভাষা বাংলায় পরিবর্তন করুন"}
    >
      <Languages className="w-4 h-4" aria-hidden="true" />
      <span>{lang === "bn" ? "বাং" : "EN"}</span>
    </motion.button>
  );
}
