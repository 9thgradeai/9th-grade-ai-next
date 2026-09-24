"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  X,
  Lightbulb,
  Target,
  Clock,
  TrendUp,
  Spinner,
  Brain,
  SpeakerSimpleHigh,
  Star,
  List,
  GridFour,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  Trophy,
  Lightning,
  GameController,
} from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useToastSafe } from "@/lib/toast-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";
import { useSwipeGesture } from "@/lib/hooks/useSwipeGesture";
import QuizMode from "./vocab/QuizMode";
import SessionSummary from "./vocab/SessionSummary";
import WordOfDayCard from "./vocab/WordOfDayCard";
import AIMnemonicButton from "./vocab/AIMnemonicButton";
import type { Server } from "@/lib/types";

type ReviewRating = "again" | "hard" | "good" | "easy";
type ViewMode = "card" | "list";
type StatusFilter = "all" | "new" | "learning" | "due" | "mastered";
type DifficultyFilter = "all" | "easy" | "medium" | "hard";

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

  const [words, setWords] = useState<Server.VocabWordDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState<{ total: number; mastered: number; learning: number; due: number; reviewed: number } | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [dailyGoal] = useState(20);
  const [dailyProgress, setDailyProgress] = useState<{ wordsReviewed: number; streak: number } | null>(null);

  // Phase 2: modes and session tracking
  const [activeMode, setActiveMode] = useState<"flashcard" | "quiz">("flashcard");
  const [showQuiz, setShowQuiz] = useState(false);
  const [sessionStartTime] = useState<number>(() => Date.now());
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [sessionTimeSpent, setSessionTimeSpent] = useState(0);
  const [sessionRatings, setSessionRatings] = useState<{ again: number; hard: number; good: number; easy: number }>({ again: 0, hard: 0, good: 0, easy: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { limit: number; difficulty?: string; search?: string; status?: string; due?: string } = { limit: 50 };
      if (difficultyFilter !== "all") params.difficulty = difficultyFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (statusFilter === "due") params.due = "true";
      else if (statusFilter !== "all") params.status = statusFilter;
      const [ws, st] = await Promise.all([api.vocabWords(params), api.vocabStats().catch(() => null)]);
      setWords(ws);
      if (st) setStats(st);
      api.vocabDaily().then((d) => setDailyProgress(d)).catch(() => {});
    } catch {
      toast.error(t(lang, "ভোকাব লোড করা যায়নি", "Failed to load vocabulary"));
    }
    setLoading(false);
  }, [difficultyFilter, searchQuery, statusFilter, lang, toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let result = words;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((w) => w.word.toLowerCase().includes(q) || w.bengaliMeaning.toLowerCase().includes(q));
    }
    return result;
  }, [words, searchQuery]);

  const showDueOnly = useCallback(() => {
    setStatusFilter("due");
    setDifficultyFilter("all");
    setSearchQuery("");
  }, []);

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
    setSessionRatings((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
    setIdx((i) => (i + 1 < filtered.length ? i + 1 : 0));

    // Show session summary every 10 reviews
    if (sessionReviewed + 1 >= 10 && (sessionReviewed + 1) % 10 === 0) {
      setSessionTimeSpent(Math.round((Date.now() - sessionStartTime) / 1000));
      setShowSessionSummary(true);
    }

    try {
      const params: { limit: number; difficulty?: string; search?: string; status?: string; due?: string } = { limit: 50 };
      if (difficultyFilter !== "all") params.difficulty = difficultyFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (statusFilter === "due") params.due = "true";
      else if (statusFilter !== "all") params.status = statusFilter;
      const ws = await api.vocabWords(params);
      setWords(ws);
    } catch {
      // non-critical refresh failure
    }
    try {
      const s = await api.vocabStats();
      setStats(s);
      api.vocabDaily().then((d) => setDailyProgress(d)).catch(() => {});
    } catch {
      // non-critical refresh failure
    }
  }, [current, filtered.length, difficultyFilter, searchQuery, statusFilter, sessionReviewed, lang, toast]);

  const handleSwipe = useCallback((dir: "left" | "right" | "up" | "down") => {
    if (dir === "left") void review("again");
    else if (dir === "right") void review("good");
    else if (dir === "up") setRevealed(true);
  }, [review]);

  const { swipeHandlers, swipeOffset, isSwiping, swipeIndicator } = useSwipeGesture({
    onSwipe: handleSwipe,
    enabled: viewMode === "card" && activeMode === "flashcard" && !showQuiz,
  });

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
      if (e.key === "s" || e.key === "S") {
        setViewMode((v) => (v === "card" ? "list" : "card"));
        return;
      }
      if (e.key === "Escape" && showQuiz) {
        setShowQuiz(false);
        return;
      }
      if (viewMode === "card" && current && !showQuiz) {
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
  }, [viewMode, current, filtered.length, revealed, review, showQuiz]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
        <Spinner className="w-8 h-8 mx-auto animate-spin text-[var(--accent)]" />
        <p className="text-sm text-[var(--dashboard-text-muted)] mt-2">
          {t(lang, "ভোকাব লোড হচ্ছে...", "Loading vocabulary...")}
        </p>
      </div>
    );
  }

  if (!current && words.length === 0) {
    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
        <BookOpen className="w-10 h-10 mx-auto text-[var(--dashboard-text-muted)]" />
        <p className="text-sm text-[var(--dashboard-text-muted)] mt-2">
          {t(lang, "কোনো শব্দ পাওয়া যায়নি।", "No words found.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ─── Terminal Header + Stats ─── */}
      <div className="glass-card rounded-2xl border border-terminal-border overflow-hidden">
        <div className="terminal-window-bar border-b border-terminal-border">
          <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
          <div className="flex-1 text-center text-xs text-[var(--dashboard-text-muted)] font-mono">{"// VOCAB_MASTERY — AI POWERED"}</div>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Vocab — AI-Powered Mastery</h2>
                <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">BCS / Bank / 9th Grade — frequency + difficulty + your weaknesses</p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 text-center flex-wrap">
            <div className="px-3 py-2 rounded-xl bg-[var(--surface-raised)] border border-terminal-border">
              <p className="text-lg font-bold text-[var(--dashboard-primary)]">{stats?.total ?? words.length}</p>
              <p className="text-[10px] text-[var(--dashboard-text-muted)]">TOTAL</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-[var(--surface-raised)] border border-terminal-border">
              <p className="text-lg font-bold text-amber-500">{stats?.learning ?? 0}</p>
              <p className="text-[10px] text-[var(--dashboard-text-muted)]">LEARNING</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-lg font-bold text-emerald-500">{stats?.mastered ?? 0}</p>
              <p className="text-[10px] text-[var(--dashboard-text-muted)]">MASTERED</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-[var(--dashboard-warning-subtle)] border border-[var(--warning)]/20">
              <p className="text-lg font-bold text-[var(--dashboard-warning)]">{stats?.due ?? 0}</p>
              <p className="text-[10px] text-[var(--dashboard-text-muted)]">DUE</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <p className="text-lg font-bold text-sky-500">{stats?.reviewed ?? 0}</p>
              <p className="text-[10px] text-[var(--dashboard-text-muted)]">REVIEWED</p>
            </div>
          </div>

          {/* Daily Goal + Streak */}
          {dailyProgress && (
            <div className="mt-3 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-mono text-[var(--dashboard-text-muted)]">
                    {t(lang, "আজকের লক্ষ্য", "Daily Goal")}: {dailyProgress.wordsReviewed}/{dailyGoal}
                  </span>
                  {dailyProgress.streak > 1 && (
                    <span className="flex items-center gap-1 text-amber-500 font-mono">
                      <Lightning className="w-3 h-3" /> {dailyProgress.streak} {t(lang, "দিন স্ট্রিক", "day streak")}
                    </span>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-[var(--surface-muted)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, (dailyProgress.wordsReviewed / dailyGoal) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Word of the Day ─── */}
      <WordOfDayCard />

      {/* ─── Filter Bar ─── */}
      <div className="glass-card rounded-2xl border border-terminal-border p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Mode switcher */}
          <div className="flex rounded-lg border border-terminal-border overflow-hidden">
            <button
              onClick={() => { setActiveMode("flashcard"); setShowQuiz(false); }}
              className={`px-3 py-2 text-xs font-mono flex items-center gap-1.5 transition-colors ${activeMode === "flashcard" ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)]" : "bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)]"}`}
            >
              <BookOpen className="w-3.5 h-3.5" /> {t(lang, "ফ্ল্যাশকার্ড", "Flashcard")}
            </button>
            <button
              onClick={() => { setActiveMode("flashcard"); setShowQuiz(true); }}
              className={`px-3 py-2 text-xs font-mono flex items-center gap-1.5 transition-colors ${showQuiz ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)]" : "bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)]"}`}
            >
              <GameController className="w-3.5 h-3.5" /> {t(lang, "কুইজ", "Quiz")}
            </button>
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-terminal-border overflow-hidden">
            <button
              onClick={() => setViewMode("card")}
              className={`p-2 transition-colors ${viewMode === "card" ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)]" : "bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)]"}`}
              aria-label="Card view"
            >
              <GridFour className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 transition-colors ${viewMode === "list" ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)]" : "bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)]"}`}
              aria-label="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Status filter pills */}
          <div className="flex gap-1 flex-wrap">
            {(["all", "new", "learning", "due", "mastered"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-mono border transition-colors ${
                  statusFilter === s
                    ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
                    : "bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)] border-terminal-border hover:border-[var(--accent)]/40"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Difficulty filter pills */}
          <div className="flex gap-1 flex-wrap">
            {(["all", "easy", "medium", "hard"] as DifficultyFilter[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficultyFilter(d)}
                className={`px-3 py-1 rounded-full text-xs font-mono border transition-colors ${
                  difficultyFilter === d
                    ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
                    : "bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)] border-terminal-border hover:border-[var(--accent)]/40"
                }`}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--dashboard-text-muted)]" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setIdx(0); setRevealed(false); }}
              placeholder={t(lang, "শব্দ খুঁজুন...", "Search words...")}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--surface-raised)] border border-terminal-border text-sm text-[var(--text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none focus:border-[var(--accent)]/50 font-mono"
            />
          </div>

          {/* Review Due shortcut */}
          <button
            onClick={showDueOnly}
            className="px-3 py-2 rounded-lg bg-[var(--dashboard-warning-subtle)] border border-[var(--warning)]/30 text-[var(--dashboard-warning)] font-mono text-xs hover:border-[var(--warning)]/50 transition-colors flex items-center gap-1"
          >
            <Clock className="w-3 h-3" />
            {t(lang, "শুধু ডিউ", "Review Due")}
          </button>
        </div>
      </div>

      {/* ─── Session Summary Banner ─── */}
      <AnimatePresence>
        {sessionReviewed >= 10 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4"
          >
            <p className="text-sm font-mono text-emerald-600 text-center">
              {t(lang, "সেশন:", "Session:")} {sessionReviewed} {t(lang, "রিভিউ করা হয়েছে,", "reviewed,")} {sessionCorrect} {t(lang, "সঠিক", "correct")} ({sessionReviewed > 0 ? Math.round((sessionCorrect / sessionReviewed) * 100) : 0}%)
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Main Content ─── */}
      {showQuiz ? (
        <QuizMode onExit={() => setShowQuiz(false)} difficulty={difficultyFilter !== "all" ? difficultyFilter : undefined} />
      ) : !current ? (
        <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
          <BookOpen className="w-10 h-10 mx-auto text-[var(--dashboard-text-muted)]" />
          <p className="text-sm text-[var(--dashboard-text-muted)] mt-2">
            {t(lang, "ফিল্টারের সাথে মিলে এমন কোনো শব্দ নেই।", "No words match the current filters.")}
          </p>
        </div>
      ) : viewMode === "card" ? (
        /* ─── Card View ─── */
        <div className="relative" {...swipeHandlers}>
          {/* Swipe indicators */}
          {isSwiping && swipeIndicator && (
            <div
              className="absolute inset-0 z-20 rounded-2xl flex items-center justify-center pointer-events-none transition-opacity"
              style={{ backgroundColor: swipeIndicator.color + "15", borderColor: swipeIndicator.color + "40" }}
            >
              <span className="text-lg font-bold font-mono" style={{ color: swipeIndicator.color }}>
                {swipeIndicator.action === "again" && `← ${t(lang, "আবার", "Again")}`}
                {swipeIndicator.action === "good" && `${t(lang, "ভালো", "Good")} →`}
                {swipeIndicator.action === "reveal" && `↑ ${t(lang, "রিভিল", "Reveal")}`}
              </span>
            </div>
          )}
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, x: isSwiping ? swipeOffset.x * 0.3 : 0, rotate: isSwiping ? swipeOffset.x * 0.03 : 0 }}
            className="glass-card rounded-2xl border border-terminal-border p-6 md:p-8 space-y-5"
            style={{ touchAction: "pan-y" }}
          >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
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
              <p className="text-sm text-[var(--dashboard-text-secondary)] mt-1">
                <span className="px-2 py-0.5 rounded bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] text-xs font-mono">{current.partOfSpeech}</span>
                <span className="ml-2">{current.bengaliMeaning}</span>
              </p>
              {current.progress && current.progress.totalReviews > 0 && (
                <p className="text-xs text-[var(--dashboard-text-muted)] font-mono mt-1">
                  {t(lang, "রিভিউ করা হয়েছে", "Reviewed")} {current.progress.totalReviews}x · {t(lang, "সঠিকতা", "Accuracy")} {Math.round((current.progress.correctCount / current.progress.totalReviews) * 100)}%
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {current.examRelevance?.map((e) => (
                <span key={e} className="px-2 py-1 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[10px] font-mono text-[var(--accent)]">{e}</span>
              ))}
            </div>
          </div>

          {current.verbForms && current.verbForms.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-[var(--dashboard-text-muted)]">Verb forms:</span>
              {current.verbForms.map((f) => (
                <span key={f} className="px-2 py-1 rounded bg-[var(--surface-muted)] border border-terminal-border text-xs">{f}</span>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3">
              <p className="text-xs font-bold text-emerald-600 mb-1 flex items-center gap-1"><Target className="w-3 h-3" /> Synonyms</p>
              <p className="text-sm text-[var(--dashboard-text-secondary)]">{current.synonyms?.join(", ") || "—"}</p>
            </div>
            <div className="rounded-xl bg-rose-500/5 border border-rose-500/15 p-3">
              <p className="text-xs font-bold text-rose-600 mb-1 flex items-center gap-1"><X className="w-3 h-3" /> Antonyms</p>
              <p className="text-sm text-[var(--dashboard-text-secondary)]">{current.antonyms?.join(", ") || "—"}</p>
            </div>
          </div>

          <div className="rounded-xl bg-[var(--surface-raised)] border border-terminal-border p-4">
            <p className="text-xs font-bold text-[var(--dashboard-text-muted)] uppercase tracking-widest mb-2">Example — exam relevant</p>
            <p className="text-sm leading-relaxed text-[var(--dashboard-text-primary)]">{"\u201C" + current.exampleSentence + "\u201D"}</p>
            {current.exampleSentenceBn && <p className="text-xs text-[var(--dashboard-text-muted)] mt-1">{current.exampleSentenceBn}</p>}
          </div>

          <div className="rounded-xl bg-sky-500/5 border border-sky-500/15 p-4">
            <p className="text-xs font-bold text-sky-600 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Context / Use case</p>
            <p className="text-sm text-[var(--dashboard-text-secondary)]">{current.context}</p>
          </div>

          <AnimatePresence>
            {revealed ? (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3">
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
              </motion.div>
            ) : (
              <button onClick={() => setRevealed(true)} className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm flex items-center justify-center gap-2">
                <Brain className="w-4 h-4" /> {t(lang, "রিভিল ও মনে করুন", "Reveal & Memorize")}
              </button>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between text-xs text-[var(--dashboard-text-muted)] font-mono">
            <span>{idx + 1} / {filtered.length}</span>
            <span className="flex items-center gap-1"><TrendUp className="w-3 h-3" /> Priority: frequency {current.frequency} · {current.difficulty}</span>
          </div>

          <div className="flex items-center justify-center gap-3 text-[10px] text-[var(--dashboard-text-muted)] font-mono">
            <span>← → {t(lang, "নেভিগেট", "navigate")}</span>
            <span>Space {t(lang, "রিভিল", "reveal")}</span>
            <span>1-4 {t(lang, "রেটিং", "rate")}</span>
            <span>S {t(lang, "ভিউ টগল", "toggle view")}</span>
            <span>/ {t(lang, "সার্চ", "search")}</span>
          </div>
          <p className="text-center text-[10px] text-[var(--dashboard-text-muted)] font-mono md:hidden">
            {t(lang, "সোয়াইপ করুন: বাম = আবার, ডান = ভালো, উপরে = রিভিল", "Swipe: Left = Again, Right = Good, Up = Reveal")}
          </p>
        </motion.div>
        </div>
      ) : (
        /* ─── List View ─── */
        <div className="glass-card rounded-2xl border border-terminal-border overflow-hidden">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface-raised)] z-10">
                <tr className="border-b border-terminal-border text-left">
                  <th className="px-4 py-3 font-mono text-xs text-[var(--dashboard-text-muted)]">Word</th>
                  <th className="px-4 py-3 font-mono text-xs text-[var(--dashboard-text-muted)]">POS</th>
                  <th className="px-4 py-3 font-mono text-xs text-[var(--dashboard-text-muted)]">Bengali</th>
                  <th className="px-4 py-3 font-mono text-xs text-[var(--dashboard-text-muted)]">Status</th>
                  <th className="px-4 py-3 font-mono text-xs text-[var(--dashboard-text-muted)]">Accuracy</th>
                  <th className="px-4 py-3 font-mono text-xs text-[var(--dashboard-text-muted)]">Next Review</th>
                  <th className="px-4 py-3 font-mono text-xs text-[var(--dashboard-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w, i) => {
                  const p = w.progress;
                  const acc = p && p.totalReviews > 0 ? Math.round((p.correctCount / p.totalReviews) * 100) : null;
                  const nextRev = p?.nextReview ? new Date(p.nextReview) : null;
                  const statusKey = p?.status ?? "new";
                  return (
                    <motion.tr
                      key={w.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.02, 0.4) }}
                      className="border-b border-terminal-border/50 hover:bg-[var(--surface-overlay)] transition-colors"
                    >
                      <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{w.word}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] text-xs font-mono">{w.partOfSpeech}</span>
                      </td>
                      <td className="px-4 py-3 text-[var(--dashboard-text-secondary)]">{w.bengaliMeaning}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${STATUS_COLORS[statusKey] ?? STATUS_COLORS.new}`}>
                          {statusKey.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--dashboard-text-muted)]">
                        {acc !== null ? `${acc}%` : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--dashboard-text-muted)]">
                        {nextRev ? nextRev.toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => speak(w.word)}
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-raised)] transition-colors text-[var(--dashboard-text-muted)] hover:text-[var(--accent)]"
                            aria-label={`Pronounce ${w.word}`}
                          >
                            <SpeakerSimpleHigh className="w-4 h-4" />
                          </button>
                          <button
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-raised)] transition-colors text-[var(--dashboard-text-muted)] hover:text-amber-500"
                            aria-label="Bookmark"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Card View Navigation ─── */}
      {viewMode === "card" && current && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => { setRevealed(false); setIdx((i) => Math.max(0, i - 1)); }}
            disabled={idx === 0}
            className="px-4 py-2 rounded-lg border border-terminal-border text-sm text-[var(--dashboard-text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <CaretLeft className="w-4 h-4" /> {t(lang, "আগের", "Previous")}
          </button>
          <button
            onClick={() => { setRevealed(false); setIdx((i) => (i + 1 < filtered.length ? i + 1 : i)); }}
            disabled={idx >= filtered.length - 1}
            className="px-4 py-2 rounded-lg bg-[var(--surface-muted)] border border-terminal-border text-sm text-[var(--dashboard-text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {t(lang, "পরবর্তী", "Next")} <CaretRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Session Summary Overlay ─── */}
      <AnimatePresence>
        {showSessionSummary && (
          <SessionSummary
            reviewed={sessionReviewed}
            correct={sessionCorrect}
            timeSpent={sessionTimeSpent}
            onClose={() => setShowSessionSummary(false)}
            onReviewWeak={() => {
              setShowSessionSummary(false);
              setStatusFilter("learning");
              setSearchQuery("");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
