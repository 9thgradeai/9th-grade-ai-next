"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  ChatCircleText,
  Brain,
  SpeakerSimpleHigh,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  Lightning,
  GameController,
} from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useToastSafe } from "@/lib/toast-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";
import { useSwipeGesture } from "@/lib/hooks/useSwipeGesture";
import QuizMode from "./vocab/QuizMode";
import WordOfDayCard from "./vocab/WordOfDayCard";
import IdiomsTab from "./vocab/IdiomsTab";
import AIMnemonicButton from "./vocab/AIMnemonicButton";
import type { Server } from "@/lib/types";

type ReviewRating = "again" | "hard" | "good" | "easy";
type StatusFilter = "all" | "new" | "learning" | "due" | "mastered";
type Section = "words" | "idioms";

const RATING_CONFIG: Record<ReviewRating, { label: string; color: string; keyHint: string }> = {
  again: { label: "Again", color: "text-[var(--dashboard-danger)] bg-[var(--dashboard-danger-subtle)] border-[var(--danger)]/30", keyHint: "1" },
  hard: { label: "Hard", color: "text-[var(--dashboard-warning)] bg-[var(--dashboard-warning-subtle)] border-[var(--warning)]/30", keyHint: "2" },
  good: { label: "Good", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30", keyHint: "3" },
  easy: { label: "Easy", color: "text-sky-600 bg-sky-500/10 border-sky-500/30", keyHint: "4" },
};

const STATUS_COLORS: Record<string, string> = {
  new: "text-[var(--dashboard-text-muted)] bg-[var(--surface-raised)] border-terminal-border",
  learning: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  review: "text-[var(--dashboard-primary)] bg-[var(--dashboard-primary-subtle)] border-[var(--primary)]/20",
  mastered: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
};

function speak(word: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  u.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export default function VocabTab() {
  const toast = useToastSafe();
  const { lang } = useLanguage();

  const [section, setSection] = useState<Section>("words");
  const [words, setWords] = useState<Server.VocabWordDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState<{ total: number; mastered: number; learning: number; due: number; reviewed: number } | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [dailyGoal] = useState(20);
  const [dailyProgress, setDailyProgress] = useState<{ wordsReviewed: number; streak: number } | null>(null);

  const [showQuiz, setShowQuiz] = useState(false);

  const buildParams = useCallback((): { limit: number; search?: string; status?: string; due?: string; kind: "words" } => {
    const params: { limit: number; search?: string; status?: string; due?: string; kind: "words" } = { limit: 50, kind: "words" };
    if (searchQuery.trim()) params.search = searchQuery.trim();
    if (statusFilter === "due") params.due = "true";
    else if (statusFilter !== "all") params.status = statusFilter;
    return params;
  }, [searchQuery, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ws, st] = await Promise.all([api.vocabWords(buildParams()), api.vocabStats().catch(() => null)]);
      setWords(ws);
      setIdx(0);
      setRevealed(false);
      if (st) setStats(st);
      api.vocabDaily().then((d) => setDailyProgress(d)).catch(() => {});
    } catch {
      toast.error(t(lang, "ভোকাব লোড করা যায়নি", "Failed to load vocabulary"));
    }
    setLoading(false);
  }, [buildParams, lang, toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return words;
    return words.filter((w) => w.word.toLowerCase().includes(q) || w.bengaliMeaning.toLowerCase().includes(q));
  }, [words, searchQuery]);

  const current = filtered[idx] ?? filtered[0];

  const review = useCallback(async (rating: ReviewRating) => {
    if (!current) return;
    const ratingNum = { again: 1, hard: 2, good: 3, easy: 4 }[rating];
    try {
      await api.reviewVocab(current.id, ratingNum);
    } catch {
      toast.error(t(lang, "রিভিউ সংরক্ষণ করা যায়নি", "Failed to save review"));
    }
    setRevealed(false);
    setSessionReviewed((p) => p + 1);
    if (rating !== "again") setSessionCorrect((p) => p + 1);
    setIdx((i) => (i + 1 < filtered.length ? i + 1 : 0));
    try {
      const [ws, s] = await Promise.all([api.vocabWords(buildParams()), api.vocabStats().catch(() => null)]);
      setWords(ws);
      if (s) setStats(s);
      api.vocabDaily().then((d) => setDailyProgress(d)).catch(() => {});
    } catch {
      // non-critical refresh failure
    }
  }, [current, filtered.length, buildParams, lang, toast]);

  const handleSwipe = useCallback((dir: "left" | "right" | "up" | "down") => {
    if (section !== "words" || showQuiz) return;
    if (dir === "left") void review("again");
    else if (dir === "right") void review("good");
    else if (dir === "up") setRevealed(true);
  }, [review, section, showQuiz]);

  const { swipeHandlers } = useSwipeGesture({ onSwipe: handleSwipe, enabled: section === "words" && !showQuiz });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        if (e.key === "Escape") (target as HTMLInputElement).blur();
        return;
      }
      if (e.key === "/" || (e.ctrlKey && e.key === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && showQuiz) {
        setShowQuiz(false);
        return;
      }
      if (section === "words" && current && !showQuiz) {
        if (e.key === "ArrowLeft") {
          setRevealed(false);
          setIdx((i) => Math.max(0, i - 1));
        } else if (e.key === "ArrowRight") {
          setRevealed(false);
          setIdx((i) => (i + 1 < filtered.length ? i + 1 : i));
        } else if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setRevealed((r) => !r);
        } else if (revealed) {
          if (e.key === "1") void review("again");
          else if (e.key === "2") void review("hard");
          else if (e.key === "3") void review("good");
          else if (e.key === "4") void review("easy");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [section, current, filtered.length, revealed, review, showQuiz]);

  return (
    <div className="space-y-4">
      {/* ─── Section tabs ─── */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSection("words")}
          className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all flex items-center gap-1.5 ${
            section === "words"
              ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)] shadow-neon-glow"
              : "bg-subtle border-[var(--accent)]/20 text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" /> {t(lang, "শব্দ", "Words")}
        </button>
        <button
          onClick={() => setSection("idioms")}
          className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all flex items-center gap-1.5 ${
            section === "idioms"
              ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)] shadow-neon-glow"
              : "bg-subtle border-[var(--accent)]/20 text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          }`}
        >
          <ChatCircleText className="w-3.5 h-3.5" /> {t(lang, "ইডিয়ম ও ফ্রেজ", "Idioms & Phrases")}
        </button>
      </div>

      {section === "idioms" ? (
        <IdiomsTab />
      ) : showQuiz ? (
        <QuizMode onExit={() => setShowQuiz(false)} />
      ) : (
        <>
          {/* ─── Compact stats ─── */}
          <div className="glass-card rounded-2xl border border-terminal-border p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center">
                  <BookOpen className="w-4.5 h-4.5 text-[var(--accent)]" />
                </div>
                <div className="flex gap-4">
                  <Stat value={stats?.total ?? words.length} label="TOTAL" accent="text-[var(--dashboard-primary)]" />
                  <Stat value={stats?.due ?? 0} label="DUE" accent="text-[var(--dashboard-warning)]" />
                  <Stat value={stats?.learning ?? 0} label="LEARNING" accent="text-amber-500" />
                  <Stat value={stats?.mastered ?? 0} label="MASTERED" accent="text-emerald-500" />
                </div>
              </div>
              {sessionReviewed > 0 && (
                <p className="text-xs font-mono text-emerald-600 ml-auto">
                  {t(lang, "সেশন:", "Session:")} {sessionCorrect}/{sessionReviewed} {t(lang, "সঠিক", "correct")}
                </p>
              )}
            </div>
            {dailyProgress && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-mono text-[var(--dashboard-text-muted)]">
                    {t(lang, "আজকের লক্ষ্য", "Daily goal")}: {dailyProgress.wordsReviewed}/{dailyGoal}
                  </span>
                  {dailyProgress.streak > 1 && (
                    <span className="flex items-center gap-1 text-amber-500 font-mono">
                      <Lightning className="w-3 h-3" /> {dailyProgress.streak}d
                    </span>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-[var(--surface-muted)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                    style={{ width: `${Math.min(100, (dailyProgress.wordsReviewed / dailyGoal) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <WordOfDayCard />

          {/* ─── Toolbar: search + status + quiz ─── */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--dashboard-text-muted)]" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setIdx(0); setRevealed(false); }}
                placeholder={t(lang, "শব্দ খুঁজুন... ( / )", "Search words... ( / )")}
                aria-label="Search words"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--surface-raised)] border border-terminal-border text-sm text-[var(--text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none focus:border-[var(--accent)]/50 font-mono"
              />
            </div>
            {(["all", "new", "learning", "due", "mastered"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-colors ${
                  statusFilter === s
                    ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
                    : "bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)] border-terminal-border hover:border-[var(--accent)]/40"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <button
              onClick={() => setShowQuiz(true)}
              className="px-3 py-1.5 rounded-full text-xs font-mono border border-[var(--accent)]/30 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] hover:bg-[var(--accent-hover)] transition-all flex items-center gap-1.5 shadow-neon-glow"
            >
              <GameController className="w-3.5 h-3.5" /> {t(lang, "কুইজ", "Quiz")}
            </button>
          </div>

          {/* ─── Flashcard ─── */}
          {loading ? (
            <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center" role="status">
              <span className="sr-only">লোড হচ্ছে…</span>
              <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">{t(lang, "ভোকাব লোড হচ্ছে...", "Loading vocabulary...")}</p>
            </div>
          ) : !current ? (
            <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
              <BookOpen className="w-10 h-10 mx-auto text-[var(--dashboard-text-muted)]" />
              <p className="text-sm text-[var(--dashboard-text-muted)] mt-2">
                {t(lang, "ফিল্টারের সাথে মিলে এমন কোনো শব্দ নেই।", "No words match the current filters.")}
              </p>
            </div>
          ) : (
            <div {...swipeHandlers}>
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-2xl border border-terminal-border p-6 space-y-4"
                style={{ touchAction: "pan-y" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-3xl font-bold text-[var(--dashboard-primary)] tracking-tight">{current.word}</h3>
                      <button
                        onClick={() => speak(current.word)}
                        className="p-1.5 rounded-lg hover:bg-[var(--surface-raised)] transition-colors text-[var(--dashboard-text-muted)] hover:text-[var(--accent)]"
                        aria-label={`Pronounce ${current.word}`}
                      >
                        <SpeakerSimpleHigh className="w-5 h-5" />
                      </button>
                      {current.progress && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${STATUS_COLORS[current.progress.status] ?? STATUS_COLORS.new}`}>
                          {(current.progress.status ?? "new").toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--dashboard-text-secondary)] mt-1.5">
                      <span className="px-2 py-0.5 rounded bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] text-xs font-mono">{current.partOfSpeech}</span>
                      <span className="ml-2">{current.bengaliMeaning}</span>
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {current.examRelevance?.map((e) => (
                      <span key={e} className="px-2 py-1 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[10px] font-mono text-[var(--accent)]">{e}</span>
                    ))}
                  </div>
                </div>

                {(current.synonyms?.length || current.antonyms?.length) ? (
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3">
                      <p className="text-[11px] font-bold text-emerald-600 mb-1 font-mono">SYNONYMS</p>
                      <p className="text-sm text-[var(--dashboard-text-secondary)]">{current.synonyms?.join(", ") || "—"}</p>
                    </div>
                    <div className="rounded-xl bg-rose-500/5 border border-rose-500/15 p-3">
                      <p className="text-[11px] font-bold text-rose-600 mb-1 font-mono">ANTONYMS</p>
                      <p className="text-sm text-[var(--dashboard-text-secondary)]">{current.antonyms?.join(", ") || "—"}</p>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl bg-[var(--surface-raised)] border border-terminal-border p-3.5">
                  <p className="text-sm leading-relaxed text-[var(--dashboard-text-primary)]">“{current.exampleSentence}”</p>
                  {current.exampleSentenceBn && <p className="text-xs text-[var(--dashboard-text-muted)] mt-1">{current.exampleSentenceBn}</p>}
                </div>

                {revealed ? (
                  <div className="space-y-3">
                    <AIMnemonicButton
                      word={current.word}
                      bengaliMeaning={current.bengaliMeaning}
                      context={current.context}
                      existingMnemonic={current.mnemonic}
                    />
                    <div className="flex gap-2 flex-wrap">
                      {(["again", "hard", "good", "easy"] as ReviewRating[]).map((r) => (
                        <button
                          key={r}
                          onClick={() => void review(r)}
                          className={`flex-1 min-w-[70px] py-2.5 rounded-xl border font-mono text-sm flex items-center justify-center gap-2 transition-all hover:scale-105 ${RATING_CONFIG[r].color}`}
                        >
                          <span className="text-[10px] opacity-60">{RATING_CONFIG[r].keyHint}</span>
                          {RATING_CONFIG[r].label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setRevealed(true)} className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm flex items-center justify-center gap-2">
                    <Brain className="w-4 h-4" /> {t(lang, "রিভিল ও মনে করুন", "Reveal & Memorize")}
                  </button>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">{idx + 1} / {filtered.length}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setRevealed(false); setIdx((i) => Math.max(0, i - 1)); }}
                      disabled={idx === 0}
                      className="px-3 py-1.5 rounded-lg border border-terminal-border text-xs text-[var(--dashboard-text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                      aria-label="Previous word"
                    >
                      <CaretLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setRevealed(false); setIdx((i) => (i + 1 < filtered.length ? i + 1 : i)); }}
                      disabled={idx >= filtered.length - 1}
                      className="px-3 py-1.5 rounded-lg border border-terminal-border text-xs text-[var(--dashboard-text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                      aria-label="Next word"
                    >
                      <CaretRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent: string }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold font-mono ${accent}`}>{value}</p>
      <p className="text-[9px] text-[var(--dashboard-text-muted)] font-mono tracking-wider">{label}</p>
    </div>
  );
}
