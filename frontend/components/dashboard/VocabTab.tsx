"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Pause,
  Play,
  SkipForward,
} from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { blankWordInSentence } from "@/lib/vocab-exercise";
import { exportVocabNotesDocx, vocabNotesToHtml, vocabNotesToText } from "@/lib/vocab-export";
import { useToastSafe } from "@/lib/toast-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";
import { useSwipeGesture } from "@/lib/hooks/useSwipeGesture";
import QuizMode from "./vocab/QuizMode";
import VocabSessionRunner from "./vocab/VocabSessionRunner";
import WordOfDayCard from "./vocab/WordOfDayCard";
import IdiomsTab from "./vocab/IdiomsTab";
import AIMnemonicButton from "./vocab/AIMnemonicButton";
import type { Server } from "@/lib/types";
import { SkeletonCard } from "@/components/ui/Skeleton";

type ReviewRating = "again" | "hard" | "good" | "easy";
type StatusFilter = "all" | "new" | "learning" | "due" | "mastered";
type Section = "words" | "idioms";
type ExerciseMode = "none" | "production" | "listening" | "context";

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

/** Auto-rotation period: hands-free word tour, one step every 2 minutes. */
export const WORD_ROTATE_MS = 2 * 60 * 1000;

/** Page size for the default stream so every imported word circulates. */
const VOCAB_STREAM_LIMIT = 5000;

/** "09:42" countdown text for the rotation chip. Clamped, never negative. */
export function formatRotationCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
  const [analytics, setAnalytics] = useState<Server.VocabAnalyticsDTO | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [examFilter, setExamFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  // "Show all words" switches the data source to an exhaustive `all=true`
  // fetch. Keeping it in state (rather than firing a second fetch in the
  // button handler) makes it the single source of truth so `load()` cannot
  // race it and overwrite the full list with a stream/page response.
  const [fetchAll, setFetchAll] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [dailyGoal, setDailyGoal] = useState<number>(() => {
    if (typeof window === "undefined") return 20;
    const v = Number(window.localStorage.getItem("vocab:dailyGoal"));
    return Number.isFinite(v) && v > 0 && v <= 200 ? v : 20;
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("vocab:dailyGoal", String(dailyGoal));
  }, [dailyGoal]);
  const [dailyProgress, setDailyProgress] = useState<{ wordsReviewed: number; streak: number } | null>(null);

  const [showQuiz, setShowQuiz] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [noteWords, setNoteWords] = useState<Server.VocabWordDTO[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("vocab:notes") || "[]"); } catch { return []; }
  });
  const [noteTexts, setNoteTexts] = useState<Record<number, string>>({});
  const [newWord, setNewWord] = useState("");
  const [newMeaning, setNewMeaning] = useState("");
  const [addMsg, setAddMsg] = useState("");
  // A single mode (not three independent toggles) so prompts never overlap.
  const [exerciseMode, setExerciseMode] = useState<ExerciseMode>("none");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [productionResult, setProductionResult] = useState<"correct" | "wrong" | null>(null);

  // ── Hands-free rotation: advance one word every WORD_ROTATE_MS without
  // any tap. The clock restarts on every word change (manual nav, rating,
  // filter reload), pauses while the tab is hidden / quiz open / idioms
  // section / paused by the user, and single-word lists never spin.
  // A toggle satisfies WCAG 2.2.2 (pause) and a polite live region
  // announces auto-advances to screen readers.
  const [autoRotate, setAutoRotate] = useState(true);
  const [remainingMs, setRemainingMs] = useState(WORD_ROTATE_MS);
  const [autoAnnounce, setAutoAnnounce] = useState("");
  const rotationStartRef = useRef<number>(0);
  const pokeRotationClock = useCallback(() => {
    rotationStartRef.current = Date.now();
    setRemainingMs(WORD_ROTATE_MS);
  }, []);

  const buildParams = useCallback((): { limit: number; search?: string; status?: string; due?: string; kind: "words"; exam?: string } => {
    const params: { limit: number; search?: string; status?: string; due?: string; kind: "words"; exam?: string } = { limit: 50, kind: "words" };
    if (searchQuery.trim()) params.search = searchQuery.trim();
    if (statusFilter === "due") params.due = "true";
    else if (statusFilter !== "all") params.status = statusFilter;
    if (examFilter !== "ALL") params.exam = examFilter;
    return params;
  }, [searchQuery, statusFilter, examFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const st = await api.vocabStats().catch(() => null);
      // The stream endpoint is exam-agnostic. When a specific exam is selected
      // (or a search is active) use the paginated words endpoint, which applies
      // both filters server-side over the full corpus.
      const exam = examFilter === "ALL" ? undefined : examFilter;
      const useStream = !fetchAll && statusFilter === "all" && !searchQuery.trim() && !exam;
      const ws = fetchAll
        ? (await api.vocabWords({ all: true, kind: "words", exam })).map((w) => ({ ...w, source: "FRESH" as const, status: w.progress?.status ?? "NEW" }))
        : useStream
          ? (await api.vocabStream({ mode: "mixed", limit: VOCAB_STREAM_LIMIT })).words
          : (await api.vocabWords(buildParams())).map((w) => ({ ...w, source: "FRESH" as const, status: w.progress?.status ?? "NEW" }));
      setWords(ws);
      setIdx(0);
      setRevealed(false);
      if (st) setStats(st);
      api.vocabDaily().then((d) => setDailyProgress(d)).catch(() => {});
      api.vocabAnalytics().then((a) => setAnalytics(a)).catch(() => {});
    } catch {
      toast.error(t(lang, "ভোকাব লোড করা যায়নি", "Failed to load vocabulary"));
    }
    setLoading(false);
  }, [buildParams, examFilter, fetchAll, lang, toast, statusFilter, searchQuery]);

  useEffect(() => { load(); }, [load]);

  // The server note is authoritative for signed-in users; localStorage remains
  // a cache/offline fallback when the API is unavailable.
  useEffect(() => {
    let cancelled = false;
    api.vocabNotes().then((notes) => {
      if (cancelled || !Array.isArray(notes)) return;
      setNoteWords(notes.map((n) => n.word));
      setNoteTexts(Object.fromEntries(notes.map((n) => [n.wordId, n.note])));
    }).catch(() => { /* anonymous or offline — keep the local cache */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("vocab:notes", JSON.stringify(noteWords)); } catch { /* ignore */ }
  }, [noteWords]);

  // Flush queued offline reviews when connectivity returns.
  useEffect(() => {
    const flush = async () => {
      try {
        const key = "vocab:pendingReviews";
        const raw = JSON.parse(window.localStorage.getItem(key) || "[]");
        if (!Array.isArray(raw) || raw.length === 0) return;
        // Old builds queued the Word of the Day under the pseudo-id -1, which
        // can never be reviewed server-side. Drop those so the queue drains.
        const q = (raw as { wordId: number; rating: number }[]).filter(
          (item) => item && Number.isFinite(item.wordId) && item.wordId > 0,
        );
        if (q.length !== raw.length) window.localStorage.setItem(key, JSON.stringify(q));
        if (q.length === 0) return;
        const remaining: unknown[] = [];
        for (const item of q) {
          try {
            await api.reviewVocab(item.wordId, item.rating);
          } catch {
            remaining.push(item);
          }
        }
        window.localStorage.setItem(key, JSON.stringify(remaining));
        if (remaining.length === 0) void load();
      } catch { /* ignore */ }
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [load]);

  // Reset per-session counters whenever the working set changes (filter/search),
  // so "Session: x/y correct" stays meaningful.
  useEffect(() => {
    setSessionReviewed(0);
    setSessionCorrect(0);
  }, [statusFilter, searchQuery, examFilter]);

  // Search/exam/status filtering happens server-side in `load()`. This is kept
  // as an alias (rather than re-filtering the loaded page) so the cursor and
  // the auto-rotation always index the exact list the server returned.
  const filtered = words;

  // Clamp the cursor whenever the filtered list shrinks (search/filter/re-fetch).
  useEffect(() => {
    setIdx((i) => (filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1)));
  }, [filtered.length]);

  const current = filtered[idx] ?? filtered[0];

  const filteredRef = useRef(filtered);
  useEffect(() => {
    filteredRef.current = filtered;
  }, [filtered]);
  const idxRef = useRef(idx);
  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);

  // Restart the 2-minute clock whenever the visible word changes for any
  // reason, when rotation is (un)paused, or when leaving quiz/idioms.
  useEffect(() => {
    pokeRotationClock();
  }, [current?.id, autoRotate, section, showQuiz, pokeRotationClock]);

  useEffect(() => {
    setTypedAnswer("");
    setProductionResult(null);
    if (exerciseMode === "listening") speak(current?.word ?? "");
  }, [current?.id, exerciseMode]);

  // 1s ticker: drives the countdown chip and advances one word when the
  // full period elapses under eligible conditions. Hidden tabs never
  // accumulate time, becoming visible restarts the clock instead.
  // Only refs + stable setters are read, so the subscription is created
  // once per config change (never per tick).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") pokeRotationClock();
    };
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(() => {
      const remaining = Math.max(0, WORD_ROTATE_MS - (Date.now() - rotationStartRef.current));
      setRemainingMs(remaining);
      if (!autoRotate || section !== "words" || showQuiz) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const list = filteredRef.current;
      if (list.length <= 1) return;
      if (remaining > 0) return;
      const nextIdx = (idxRef.current + 1) % list.length;
      const next = list[nextIdx] ?? list[0];
      if (!next) return;
      setRevealed(false);
      setIdx(nextIdx);
      setAutoAnnounce(`পরের শব্দ: ${next.word}, ${next.bengaliMeaning}`);
      rotationStartRef.current = Date.now();
    }, 1000);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRotate, section, showQuiz]);

  const review = useCallback(async (rating: ReviewRating) => {
    if (!current) return;
    const ratingNum = { again: 1, hard: 2, good: 3, easy: 4 }[rating];
    // Optimistic: remember where we are so we can roll back on failure.
    const prevIdx = idx;
    try {
      await api.reviewVocab(current.id, ratingNum);
    } catch {
      toast.error(t(lang, "রিভিউ সংরক্ষণ করা যায়নি", "Failed to save review"));
      // Offline queue: persist for retry when connectivity returns.
      try {
        const key = "vocab:pendingReviews";
        const q = JSON.parse(window.localStorage.getItem(key) || "[]");
        q.push({ wordId: current.id, rating: ratingNum, at: Date.now() });
        window.localStorage.setItem(key, JSON.stringify(q));
      } catch { /* ignore */ }
      // Roll back: do not advance, do not count.
      setRevealed(false);
      return;
    }
    setRevealed(false);
    setSessionReviewed((p) => p + 1);
    if (rating !== "again") setSessionCorrect((p) => p + 1);
    setIdx((i) => (i + 1 < filtered.length ? i + 1 : 0));
    try {
      // In "show all" mode the full list is authoritative; refreshing it with
      // the 50-word page endpoint would silently shrink the corpus again.
      const [ws, s] = await Promise.all([
        fetchAll ? Promise.resolve(null) : api.vocabWords(buildParams()),
        api.vocabStats().catch(() => null),
      ]);
      if (ws) setWords(ws);
      if (s) setStats(s);
      api.vocabDaily().then((d) => setDailyProgress(d)).catch(() => {});
    } catch {
      // non-critical refresh failure; keep the optimistic advance
    }
    void prevIdx;
  }, [current, idx, filtered.length, fetchAll, buildParams, lang, toast]);

  const checkExercise = useCallback(() => {
    if (!current || !typedAnswer.trim()) return;
    const ok = typedAnswer.trim().toLowerCase() === current.word.trim().toLowerCase();
    setProductionResult(ok ? "correct" : "wrong");
  }, [current, typedAnswer]);

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
          className={`px-3 py-1.5 rounded-full min-h-11 min-w-11 text-xs font-mono border transition-all flex items-center gap-1.5 ${
            section === "words"
              ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
              : "bg-subtle border-[var(--accent)]/20 text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" /> {t(lang, "শব্দ", "Words")}
        </button>
        <button
          onClick={() => setSection("idioms")}
          className={`px-3 py-1.5 rounded-full min-h-11 min-w-11 text-xs font-mono border transition-all flex items-center gap-1.5 ${
            section === "idioms"
              ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
              : "bg-subtle border-[var(--accent)]/20 text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          }`}
        >
          <ChatCircleText className="w-3.5 h-3.5" /> {t(lang, "ইডিয়ম ও ফ্রেজ", "Idioms & Phrases")}
        </button>
      </div>

      {section === "idioms" ? (
        <IdiomsTab />
      ) : showSession ? (
        <VocabSessionRunner
          words={words}
          onExit={() => setShowSession(false)}
          onReviewed={(_wordId, correct) => {
            setSessionReviewed((p) => p + 1);
            if (correct) setSessionCorrect((p) => p + 1);
            void api.vocabStats().then((s) => setStats(s)).catch(() => {});
            void api.vocabDaily().then((d) => setDailyProgress(d)).catch(() => {});
          }}
        />
      ) : showQuiz ? (
        <QuizMode onExit={() => { setShowQuiz(false); void load(); }} />
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
                  <input
                    type="number"
                    min={5}
                    max={200}
                    value={dailyGoal}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v > 0) setDailyGoal(Math.min(200, Math.max(5, Math.round(v))));
                    }}
                    className="w-14 h-7 px-1 rounded border border-terminal-border bg-[var(--surface-raised)] text-xs font-mono text-center"
                    aria-label="Daily goal"
                  />
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

          {analytics?.topWeakWords && analytics.topWeakWords.length > 0 && (
            <div className="rounded-2xl border border-terminal-border bg-[var(--surface-raised)] p-4">
              <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--dashboard-text-muted)] mb-2">Weakest words (focus next)</p>
              <div className="flex flex-wrap gap-2">
                {analytics.topWeakWords.map((w) => (
                  <span key={w.word} className="px-2 py-1 rounded-full bg-[var(--dashboard-danger-subtle)] border border-[var(--danger)]/20 text-xs font-mono text-[var(--dashboard-danger)]">
                    {w.word} · {w.accuracy}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {showNotes && (
            <div className="rounded-2xl border border-terminal-border bg-[var(--surface-raised)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">My Vocab Notes ({noteWords.length})</h3>
                <button onClick={() => setShowNotes(false)} className="text-xs font-mono text-[var(--dashboard-text-muted)]">Close</button>
              </div>

              {/* Add new word */}
              <div className="flex gap-2 flex-wrap">
                <input value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="New word" className="flex-1 min-w-[120px] min-h-9 px-3 rounded-lg bg-[var(--surface)] border border-terminal-border text-sm font-mono" />
                <input value={newMeaning} onChange={(e) => setNewMeaning(e.target.value)} placeholder="Meaning (Bengali)" className="flex-1 min-w-[120px] min-h-9 px-3 rounded-lg bg-[var(--surface)] border border-terminal-border text-sm font-mono" />
                <button
                  onClick={async () => {
                    if (!newWord.trim() || !newMeaning.trim()) { setAddMsg("Word and meaning required"); return; }
                    try {
                      const res = await api.vocabAdd({ word: newWord.trim(), bengaliMeaning: newMeaning.trim() });
                      setAddMsg(res.created ? "Added to DB" : "Already exists — linked to your note");
                      if (res.word) {
                        setNoteWords((p) => (p.some((w) => w.id === res.word.id) ? p : [...p, res.word]));
                        void api.vocabNoteSave(res.word.id, noteTexts[res.word.id] ?? "").catch(() => {});
                      }
                      setNewWord(""); setNewMeaning("");
                    } catch {
                      setAddMsg("Failed to add");
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs"
                >
                  Add
                </button>
              </div>
              {addMsg && <p className="text-[11px] font-mono text-[var(--dashboard-text-muted)]">{addMsg}</p>}

              {/* Notes list */}
              <div className="max-h-60 overflow-y-auto space-y-2">
                {noteWords.length === 0 && <p className="text-xs font-mono text-[var(--dashboard-text-muted)]">No saved words yet.</p>}
                {noteWords.map((w) => (
                  <div key={w.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--surface)] border border-terminal-border">
                    <div className="min-w-0 flex-1">
                      <div>
                        <span className="font-bold text-sm">{w.word}</span>
                        <span className="ml-2 text-xs text-[var(--dashboard-text-muted)]">{w.bengaliMeaning}</span>
                      </div>
                      <input
                        value={noteTexts[w.id] ?? ""}
                        onChange={(e) => setNoteTexts((p) => ({ ...p, [w.id]: e.target.value }))}
                        onBlur={(e) => void api.vocabNoteSave(w.id, e.target.value).catch(() => {})}
                        placeholder="Your note for this word…"
                        className="w-full mt-1 px-2 py-1 rounded bg-[var(--surface-raised)] border border-terminal-border text-xs"
                        aria-label={`Note for ${w.word}`}
                      />
                    </div>
                    <button
                      onClick={() => {
                        setNoteWords((p) => p.filter((x) => x.id !== w.id));
                        void api.vocabNoteDelete(w.id).catch(() => {});
                      }}
                      className="text-xs text-[var(--danger)]"
                      aria-label={`Remove ${w.word} from note`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Export — every format uses the same complete note data */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    const blob = new Blob([vocabNotesToText(noteWords, noteTexts)], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = "vocab-notes.txt"; a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-terminal-border font-mono text-xs"
                >
                  Export TXT
                </button>
                <button
                  onClick={() => {
                    void exportVocabNotesDocx(noteWords, noteTexts).catch(() =>
                      toast.error("Could not create the DOCX file"),
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg border border-terminal-border font-mono text-xs"
                >
                  Export DOCX
                </button>
                <button
                  onClick={() => {
                    const w = window.open("", "_blank");
                    if (!w) {
                      toast.error("Popup blocked — allow popups to print the note");
                      return;
                    }
                    w.document.write(vocabNotesToHtml(noteWords, noteTexts));
                    w.document.close();
                    w.focus();
                    w.setTimeout(() => w.print(), 100);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-terminal-border font-mono text-xs"
                >
                  Print / Save as PDF
                </button>
              </div>
            </div>
          )}

          <WordOfDayCard />

          {/* ─── Toolbar: search + status + quiz ─── */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--dashboard-text-muted)]" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => { setFetchAll(false); setSearchQuery(e.target.value); setIdx(0); setRevealed(false); }}
                placeholder={t(lang, "শব্দ খুঁজুন... ( / )", "Search words... ( / )")}
                aria-label="Search words"
                className="w-full pl-9 pr-3 py-2 min-h-11 rounded-xl bg-[var(--surface-raised)] border border-terminal-border text-sm text-[var(--text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none focus:border-[var(--accent)]/50 font-mono"
              />
            </div>
            {(["all", "new", "learning", "due", "mastered"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => { setFetchAll(false); setStatusFilter(s); }}
                className={`px-3 py-1.5 rounded-full min-h-11 min-w-11 text-xs font-mono border transition-colors ${
                  statusFilter === s
                    ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
                    : "bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)] border-terminal-border hover:border-[var(--accent)]/40"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <select
              value={examFilter}
              onChange={(e) => { setFetchAll(false); setExamFilter(e.target.value); setIdx(0); setRevealed(false); }}
              className="px-3 py-1.5 rounded-full min-h-11 text-xs font-mono border border-terminal-border bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)]"
              aria-label="Exam target"
            >
              <option value="ALL">All exams</option>
              <option value="BCS">BCS</option>
              <option value="Bank">Bank</option>
              <option value="9th Grade">9th Grade</option>
            </select>
            <button
              onClick={() => {
                if (!current) return;
                setNoteWords((p) => (p.some((w) => w.id === current.id) ? p : [...p, current]));
                void api.vocabNoteSave(current.id, noteTexts[current.id] ?? "").catch(() => {});
              }}
              className="px-3 py-1.5 rounded-full min-h-11 min-w-11 text-xs font-mono border border-[var(--accent)]/30 bg-[var(--surface-raised)] text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all flex items-center gap-1.5"
            >
              Save note
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="px-3 py-1.5 rounded-full min-h-11 min-w-11 text-xs font-mono border border-terminal-border bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 transition-all flex items-center gap-1.5"
            >
              Notes ({noteWords.length})
            </button>
            <button
              onClick={() => setShowSession(true)}
              className="px-3 py-1.5 rounded-full min-h-11 min-w-11 text-xs font-mono border border-[var(--accent)]/30 bg-[var(--surface-raised)] text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all flex items-center gap-1.5"
            >
              Session
            </button>
            <button
              onClick={() => setShowQuiz(true)}
              className="px-3 py-1.5 rounded-full min-h-11 min-w-11 text-xs font-mono border border-[var(--accent)]/30 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] hover:bg-[var(--accent-hover)] transition-all flex items-center gap-1.5"
            >
              <GameController className="w-3.5 h-3.5" /> {t(lang, "কুইজ", "Quiz")}
            </button>
            <button
              onClick={() => {
                // One state-driven fetch: `load()` is the only place that
                // sets `words`, so the stream/page response cannot overwrite it.
                setFetchAll(true);
                setStatusFilter("all");
                setSearchQuery("");
                setIdx(0);
                setRevealed(false);
              }}
              className="px-3 py-1.5 rounded-full min-h-11 min-w-11 text-xs font-mono border transition-all flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" /> {t(lang, "শব্দ সব প্রদর্শন", "Show all words")}
            </button>
          </div>

          {/* ─── Flashcard ─── */}
          {loading ? (
            <SkeletonCard>
              <span className="sr-only">{t(lang, "ভোকাব লোড হচ্ছে...", "Loading vocabulary...")}</span>
              <div aria-hidden="true" className="space-y-4">
                <div className="skeleton-shimmer h-8 w-1/2 rounded-lg" />
                <div className="skeleton-shimmer h-4 w-full rounded-lg" />
                <div className="skeleton-shimmer h-4 w-5/6 rounded-lg" />
                <div className="skeleton-shimmer h-24 w-full rounded-xl" />
              </div>
            </SkeletonCard>
          ) : !current ? (
            <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
              <BookOpen className="w-10 h-10 mx-auto text-[var(--dashboard-text-muted)]" />
              <p className="text-sm text-[var(--dashboard-text-muted)] mt-2">
                {t(lang, "ফিল্টারের সাথে মিলে এমন কোনো শব্দ নেই।", "No words match the current filters.")}
              </p>
            </div>
          ) : (
            <div {...swipeHandlers}>
              {/* Polite announcements of automatic advances only, manual
                  navigation already has full button context. */}
              <span className="sr-only" role="status" aria-live="polite">{autoAnnounce}</span>
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-2xl border border-terminal-border p-4 sm:p-6 space-y-4"
                style={{ touchAction: "pan-y" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-2xl sm:text-3xl font-bold text-[var(--dashboard-primary)] tracking-tight break-words">{current.word}</h3>
                      <button
                        onClick={() => speak(current.word)}
                        className="min-w-11 min-h-11 flex items-center justify-center p-1.5 rounded-lg hover:bg-[var(--surface-raised)] transition-colors text-[var(--dashboard-text-muted)] hover:text-[var(--accent)]"
                        aria-label={`Pronounce ${current.word}`}
                      >
                        <SpeakerSimpleHigh className="w-5 h-5" />
                      </button>
                      {current.progress && (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono border ${STATUS_COLORS[(current.progress.status ?? "new").toLowerCase()] ?? STATUS_COLORS.new}`}>
                          {(current.progress.status ?? "new").toUpperCase()}
                        </span>
                      )}
                      {current.progress?.nextReview && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono border border-terminal-border text-[var(--dashboard-text-muted)]" title="Next review">
                          next {new Date(current.progress.nextReview).toLocaleDateString()}
                          {typeof current.progress.interval === "number" ? ` · ${current.progress.interval}d` : ""}
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
                      <span key={e} className="px-2 py-1 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[11px] font-mono text-[var(--accent)]">{e}</span>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      {(["production", "listening", "context"] as ExerciseMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setExerciseMode((prev) => (prev === m ? "none" : m));
                            setTypedAnswer("");
                            setProductionResult(null);
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-colors ${exerciseMode === m ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]" : "bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)] border-terminal-border"}`}
                        >
                          {m.charAt(0).toUpperCase() + m.slice(1)}: {exerciseMode === m ? "ON" : "OFF"}
                        </button>
                      ))}
                    </div>
                    {exerciseMode !== "none" && (
                      <div className="space-y-2">
                        {exerciseMode === "context" && (
                          <p className="text-sm leading-relaxed text-[var(--dashboard-text-secondary)]">
                            {blankWordInSentence(current.exampleSentence ?? "", current.word) ?? (
                              <span className="italic">No example sentence — recall the meaning instead: {current.bengaliMeaning}</span>
                            )}
                          </p>
                        )}
                        {exerciseMode === "listening" && (
                          <button type="button" onClick={() => speak(current.word)} className="px-3 py-1.5 rounded-full text-xs font-mono border border-terminal-border bg-[var(--surface-raised)]">
                            🔊 Play word
                          </button>
                        )}
                        <div className="flex gap-2 items-center flex-wrap">
                          <input
                            value={typedAnswer}
                            onChange={(e) => { setTypedAnswer(e.target.value); setProductionResult(null); }}
                            onKeyDown={(e) => { if (e.key === "Enter") checkExercise(); }}
                            placeholder={exerciseMode === "listening" ? "What did you hear?" : exerciseMode === "context" ? "Fill the blank…" : "Type the word…"}
                            className="flex-1 min-h-11 px-3 rounded-xl bg-[var(--surface-raised)] border border-terminal-border text-sm font-mono"
                            aria-label="Type the word"
                          />
                          <button type="button" onClick={checkExercise} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs">Check</button>
                          {productionResult === "correct" && <span className="text-emerald-600 text-sm font-mono">✓</span>}
                          {productionResult === "wrong" && <span className="text-[var(--danger)] text-sm font-mono">✗ try again</span>}
                        </div>
                        {productionResult === "correct" && (
                          <button type="button" onClick={() => void review("good")} className="px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-600 font-mono text-xs">Next word</button>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {(["again", "hard", "good", "easy"] as ReviewRating[]).map((r) => (
                        <button
                          key={r}
                          onClick={() => void review(r)}
                          className={`flex-1 min-w-[70px] min-h-[48px] py-2.5 rounded-xl border font-mono text-sm flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95 ${RATING_CONFIG[r].color}`}
                        >
                          <span className="text-[11px] opacity-60">{RATING_CONFIG[r].keyHint}</span>
                          {RATING_CONFIG[r].label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setRevealed(true)} className="w-full py-3 min-h-[48px] rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm flex items-center justify-center gap-2 active:opacity-90">
                    <Brain className="w-4 h-4" /> {t(lang, "রিভিল ও মনে করুন", "Reveal & Memorize")}
                  </button>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-[var(--dashboard-text-muted)] font-mono tabular-nums">{idx + 1} / {filtered.length}</span>
                  {/* Hands-free rotation controls: countdown, pause/resume
                      (WCAG 2.2.2), and skip-ahead. The clock restarts on any
                      manual navigation or rating. */}
                  <div
                    className="flex items-center gap-1.5 rounded-full border border-terminal-border bg-[var(--surface-raised)] pl-1 pr-2 py-1"
                    role="group"
                    aria-label={t(lang, "স্বয়ংক্রিয় ঘূর্ণন", "Auto-rotation")}
                  >
                    <button
                      type="button"
                      onClick={() => setAutoRotate((v) => !v)}
                      aria-pressed={autoRotate}
                      aria-label={autoRotate ? t(lang, "স্বয়ংক্রিয় ঘূর্ণন বিরতি দিন", "Pause auto-rotation") : t(lang, "স্বয়ংক্রিয় ঘূর্ণন চালু করুন", "Resume auto-rotation")}
                      className="w-11 h-11 min-w-11 rounded-full flex items-center justify-center text-[var(--dashboard-text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--surface-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    >
                      {autoRotate ? <Pause className="w-4 h-4" weight="fill" /> : <Play className="w-4 h-4" weight="fill" />}
                    </button>
                    <span className="text-[11px] font-mono tabular-nums text-[var(--dashboard-text-secondary)]" role="timer" aria-label={t(lang, "পরের শব্দ আসতে বাকি", "Next word in")}>
                      {autoRotate ? formatRotationCountdown(remainingMs) : t(lang, "বিরতি", "Paused")}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setRevealed(false); setIdx((i) => (filteredRef.current.length > 0 ? (i + 1) % filteredRef.current.length : i)); }}
                      disabled={filtered.length <= 1}
                      aria-label={t(lang, "এখনই পরের শব্দ", "Next word now")}
                      className="w-11 h-11 min-w-11 rounded-full flex items-center justify-center text-[var(--dashboard-text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--surface-muted)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    >
                      <SkipForward className="w-4 h-4" weight="fill" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setRevealed(false); setIdx((i) => Math.max(0, i - 1)); }}
                      disabled={idx === 0}
                      className="px-3 py-1.5 min-h-[44px] min-w-[44px] rounded-lg border border-terminal-border text-xs text-[var(--dashboard-text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                      aria-label="Previous word"
                    >
                      <CaretLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setRevealed(false); setIdx((i) => (i + 1 < filtered.length ? i + 1 : i)); }}
                      disabled={idx >= filtered.length - 1}
                      className="px-3 py-1.5 min-h-[44px] min-w-[44px] rounded-lg border border-terminal-border text-xs text-[var(--dashboard-text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
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
      <p className="text-[11px] text-[var(--dashboard-text-muted)] font-mono tracking-wider">{label}</p>
    </div>
  );
}
