"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDots,
  SpeakerSimpleHigh,
  CaretDown,
  CaretUp,
  Spinner,
  WarningCircle,
  BookOpen,
  Lightbulb,
} from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useToastSafe } from "@/lib/toast-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";
import type { Server } from "@/lib/types";

type WordOfDay = Server.WordOfDayDTO;

const DIFFICULTY_BADGE: Record<string, string> = {
  easy: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  medium: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  hard: "text-red-600 bg-red-500/10 border-red-500/20",
};

function speakWord(word: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

export default function WordOfDayCard() {
  const { lang } = useLanguage();
  const toast = useToastSafe();
  const [word, setWord] = useState<WordOfDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mnemonicOpen, setMnemonicOpen] = useState(false);

  const fetchWord = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const data = await api.vocabWordOfDay();
      setWord(data);
    } catch {
      setError(true);
      toast.error(t(lang, "শব্দ লোড করা যায়নি", "Failed to load word"));
    } finally {
      setLoading(false);
    }
  }, [lang, toast]);

  useEffect(() => {
    void fetchWord();
  }, [fetchWord]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-5 max-w-md w-full">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-4 rounded-full bg-[var(--surface-raised)] animate-pulse" />
          <div className="h-4 w-24 rounded bg-[var(--surface-raised)] animate-pulse" />
        </div>
        <div className="space-y-3">
          <div className="h-8 w-40 rounded bg-[var(--surface-raised)] animate-pulse" />
          <div className="h-4 w-56 rounded bg-[var(--surface-raised)] animate-pulse" />
          <div className="h-4 w-36 rounded bg-[var(--surface-raised)] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !word) {
    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-5 max-w-md w-full">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <WarningCircle className="text-[var(--dashboard-danger)]" size={28} />
          <p className="text-sm text-[var(--dashboard-text-muted)]">
            {t(lang, "শব্দ লোড করা যায়নি", "Could not load word of the day")}
          </p>
          <button
            onClick={() => void fetchWord()}
            className="text-xs font-mono px-3 py-1.5 rounded-lg bg-[var(--surface-raised)] border border-terminal-border text-[var(--dashboard-text)] hover:bg-[var(--surface-overlay)] transition-colors"
          >
            {t(lang, "আবার চেষ্টা করুন", "Retry")}
          </button>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString(lang === "bn" ? "bn-BD" : "en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="glass-card rounded-2xl border border-terminal-border p-5 max-w-md w-full">
      {/* Terminal bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDots size={16} className="text-[var(--dashboard-primary)]" />
          <span className="text-xs font-mono text-[var(--dashboard-text-muted)]">
            {t(lang, "আজকের শব্দ", "Word of the Day")}
          </span>
        </div>
        <span className="text-xs font-mono text-[var(--dashboard-text-muted)]">{today}</span>
      </div>

      {/* Word + POS badge */}
      <div className="flex items-center gap-3 mb-1">
        <h3 className="text-2xl font-bold text-[var(--dashboard-text)]">{word.word}</h3>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-terminal-border text-[var(--dashboard-text-muted)] uppercase tracking-wider">
          {word.partOfSpeech}
        </span>
      </div>

      {/* Bengali meaning */}
      <p className="text-sm text-[var(--dashboard-text-secondary)] mb-3">
        {word.bengaliMeaning}
      </p>

      {/* Pronunciation button */}
      <button
        onClick={() => speakWord(word.word)}
        className="flex items-center gap-1.5 text-xs text-[var(--dashboard-primary)] hover:underline mb-4"
      >
        <SpeakerSimpleHigh size={14} />
        <span className="font-mono">{t(lang, "উচ্চারণ", "Pronounce")}</span>
      </button>

      {/* Mnemonic collapsible */}
      <div className="mb-3">
        <button
          onClick={() => setMnemonicOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-mono text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-text)] transition-colors"
        >
          <Lightbulb size={12} />
          {t(lang, "মনে রাখার উপায়", "Mnemonic")}
          {mnemonicOpen ? <CaretUp size={10} /> : <CaretDown size={10} />}
        </button>
        <AnimatePresence>
          {mnemonicOpen && (
            <motion.p
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="text-xs text-[var(--dashboard-text-secondary)] mt-1.5 overflow-hidden leading-relaxed"
            >
              {word.mnemonic}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Example sentence */}
      <p className="text-xs italic text-[var(--dashboard-text-secondary)] mb-3 leading-relaxed">
        &ldquo;{word.exampleSentence}&rdquo;
      </p>

      {/* Difficulty badge + exam tags (always visible) */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${DIFFICULTY_BADGE[word.difficulty] ?? DIFFICULTY_BADGE.medium}`}
        >
          {word.difficulty}
        </span>
        {word.examRelevance.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-terminal-border text-[var(--dashboard-text-muted)]"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg bg-[var(--surface-raised)] border border-terminal-border text-[var(--dashboard-text)] hover:bg-[var(--surface-overlay)] transition-colors w-full justify-center"
      >
        <BookOpen size={12} />
        {expanded
          ? t(lang, "কম দেখান", "Show Less")
          : t(lang, "আরও দেখুন", "Learn More")}
        {expanded ? <CaretUp size={10} /> : <CaretDown size={10} />}
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-3 border-t border-terminal-border space-y-3">
              {/* Example in Bengali if available */}
              {word.exampleSentenceBn && (
                <div>
                  <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)] uppercase tracking-wider">
                    {t(lang, "বাংলা উদাহরণ", "Bengali Example")}
                  </span>
                  <p className="text-xs text-[var(--dashboard-text-secondary)] mt-0.5 italic">
                    &ldquo;{word.exampleSentenceBn}&rdquo;
                  </p>
                </div>
              )}

              {/* Synonyms */}
              {word.synonyms.length > 0 && (
                <div>
                  <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)] uppercase tracking-wider">
                    {t(lang, "সমার্থক", "Synonyms")}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {word.synonyms.slice(0, 4).map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Antonyms */}
              {word.antonyms.length > 0 && (
                <div>
                  <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)] uppercase tracking-wider">
                    {t(lang, "বিপরীতার্থক", "Antonyms")}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {word.antonyms.slice(0, 4).map((a) => (
                      <span
                        key={a}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-600"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
