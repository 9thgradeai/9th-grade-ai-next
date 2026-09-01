"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Play,
  BookOpen,
  Timer,
  Zap,
  ChevronLeft,
  ChevronRight,
  Trophy,
  RotateCcw,
  Target,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { api } from "@/lib/services/api";
import { DIFFICULTY_LABEL } from "@/lib/exam-ui";
import type { Server } from "@/lib/types";
import MockTestTab from "./MockTestTab";
import CustomExamTab from "./CustomExamTab";
import TopicTreePicker, {
  type Selection,
  availableForSubject,
} from "./TopicTreePicker";

type PracticeMode = "custom" | "mock" | "quick";

// Quick-practice sessions survive tab switches/remounts via localStorage.
const QUICK_STORAGE_KEY = "ninth-grade-ai:practice:quick";

type PersistedQuickSession = {
  questions: Server.QuestionDTO[];
  answers: Record<number, string>;
  currentIndex: number;
};

/** Unbiased Fisher-Yates shuffle (sort-compare is biased). */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const MODES: { id: PracticeMode; label: string; hint: string }[] = [
  { id: "custom", label: "CUSTOM EXAM", hint: "বিষয়, টপিক, সাবটপিক মিশিয়ে নিজের বিসিএস পরীক্ষা তৈরি করুন" },
  { id: "mock", label: "MOCK_TEST", hint: "বিষয়, টপিক, সাবটপিক থেকে সময়সীমা সহ মক পরীক্ষা" },
  { id: "quick", label: "QUICK_PRACTICE", hint: "বিষয়, টপিক, সাবটপিক থেকে দ্রুত প্র্যাকটিস" },
];

export default function PracticeTab() {
  const [mode, setMode] = useState<PracticeMode>("custom");

  // ── Config state (quick practice selection tree) ──
  const [subjects, setSubjects] = useState<Server.ExamSubjectDTO[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({});

  // ── Session state ──
  const [questions, setQuestions] = useState<Server.QuestionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ correct: number; total: number; score: number; pointsEarned: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showUnansweredConfirm, setShowUnansweredConfirm] = useState(false);

  const scrollDashboardTop = () => {
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = prefersReduced ? "instant" as ScrollBehavior : "smooth";
    const el = typeof document !== "undefined" ? document.getElementById("dashboard-content") : null;
    if (el) {
      if (typeof el.scrollTo === "function") { try { el.scrollTo({ top: 0, behavior }); return; } catch {} }
      el.scrollTop = 0;
      return;
    }
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      try { window.scrollTo({ top: 0, behavior }); } catch { window.scrollTo(0, 0); }
    }
  };

  // Load the selection tree once (drives quick practice).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.examConfig();
        if (!cancelled) {
          setSubjects(list.filter((s) => s.questionCount > 0));
        }
      } catch {
        if (!cancelled) setConfigError("কনফিগারেশন লোড করা যায়নি। আবার চেষ্টা করুন।");
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSubjects = useMemo(
    () => subjects.filter((s) => selection[s.id] !== undefined),
    [subjects, selection],
  );

  const availableTotal = useMemo(
    () => selectedSubjects.reduce((acc, s) => acc + availableForSubject(s, selection), 0),
    [selectedSubjects, selection],
  );

  const totalCount = useMemo(
    () => selectedSubjects.reduce((acc, s) => acc + (selection[s.id].count ?? 0), 0),
    [selectedSubjects, selection],
  );

  const insufficient = totalCount > availableTotal;
  const sessionTitle = selectedSubjects.map((s) => s.nameBn).join(", ");

  const sessionQuestions = questions;

  const answeredCount = Object.keys(answers).length;
  const currentQuestion = sessionQuestions[currentIndex];
  const totalQuestions = sessionQuestions.length;
  const allAnswered = totalQuestions > 0 && answeredCount === totalQuestions;

  const resetSession = () => {
    try {
      localStorage.removeItem(QUICK_STORAGE_KEY);
    } catch { /* ignore */ }
    setSelection({});
    setQuestions([]);
    setSessionActive(false);
    setCurrentIndex(0);
    setAnswers({});
    setResult(null);
    setLoadError(null);
    setSubmitError(null);
  };

  // Resume an interrupted quick-practice session so tab switches never
  // destroy progress.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(QUICK_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as PersistedQuickSession;
        if (!saved?.questions?.length) return;
        setQuestions(saved.questions);
        setAnswers(saved.answers ?? {});
        setCurrentIndex(Math.min(saved.currentIndex ?? 0, saved.questions.length - 1));
        setSessionActive(true);
      } catch {
        /* corrupt storage — ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the persisted snapshot in sync while a session is running.
  useEffect(() => {
    if (!sessionActive || result || questions.length === 0) return;
    try {
      const snapshot: PersistedQuickSession = { questions, answers, currentIndex };
      localStorage.setItem(QUICK_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      /* storage full/unavailable — resume just won't be available */
    }
  }, [sessionActive, result, questions, answers, currentIndex]);

  // When a quick-practice session starts or its result appears, always show the
  // top (question 1 / score summary) — fix: previously kept previous scroll.
  useEffect(() => {
    if (sessionActive && questions.length > 0) {
      const id = requestAnimationFrame(() => scrollDashboardTop());
      return () => cancelAnimationFrame(id);
    }
  }, [sessionActive, questions.length]);
  useEffect(() => {
    if (result) {
      const id = requestAnimationFrame(() => scrollDashboardTop());
      return () => cancelAnimationFrame(id);
    }
  }, [result]);

  // Fetch full question DTOs (with correct answers for the review panel) for
  // every selected subject/topic/subtopic, then serve the requested count.
  const startSession = async () => {
    setLoading(true);
    setLoadError(null);
    setResult(null);
    setSubmitError(null);
    setAnswers({});
    setCurrentIndex(0);
    try {
      const pools = await Promise.all(
        selectedSubjects.map(async (s) => {
          const sel = selection[s.id];
          return api.questions({
            subject: s.nameBn,
            paths: sel.paths.length > 0 ? sel.paths : undefined,
            limit: 200,
          });
        }),
      );
      const merged = pools.flat().filter(Boolean);
      if (merged.length === 0) {
        setLoadError("নির্বাচিত টপিক থেকে কোনো প্রশ্ন পাওয়া যায়নি।");
        setQuestions([]);
      } else {
        const requested = totalCount > 0 ? totalCount : merged.length;
        const picked = shuffled(merged).slice(0, Math.min(requested, merged.length));
        setQuestions(picked);
        setSessionActive(true);
        // Ensure the new session renders from question 1 at the top.
        requestAnimationFrame(() => scrollDashboardTop());
      }
    } catch {
      setLoadError("প্রশ্ন লোড করা যায়নি। আবার চেষ্টা করুন।");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const selectAnswer = (questionId: number, option: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const submitAnswers = async () => {
    if (totalQuestions === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const summary = await api.submitPractice(
        sessionQuestions.map((q) => ({ questionId: q.id, selected: answers[q.id] ?? "" })),
      );
      try {
        localStorage.removeItem(QUICK_STORAGE_KEY);
      } catch { /* ignore */ }
      setResult(summary);
      requestAnimationFrame(() => scrollDashboardTop());
    } catch {
      setSubmitError("ফলাফল জমা দেওয়া যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRequest = () => {
    if (!allAnswered) {
      setShowUnansweredConfirm(true);
    } else {
      void submitAnswers();
    }
  };

  const finalizeSubmit = () => {
    setShowUnansweredConfirm(false);
    void submitAnswers();
  };

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
      >
        <div className="flex gap-2 bg-subtle border border-emerald-500/20 rounded-xl p-1 w-fit">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-mono rounded-lg transition-all ${
                mode === m.id
                  ? "bg-emerald-500 text-zinc-950 shadow-neon-glow"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {m.id === "mock" ? <Timer className="w-4 h-4" /> : m.id === "custom" ? <BookOpen className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              [ {m.label} ]
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          {MODES.find((m) => m.id === mode)?.hint}
        </p>
      </motion.div>

      {mode === "custom" ? (
        <CustomExamTab />
      ) : mode === "mock" ? (
        <MockTestTab />
      ) : (
        <>
          {/* ── CONFIG: subject → topic → subtopic picker ── */}
          {!sessionActive && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-2xl border border-terminal-border overflow-hidden"
              >
                <div className="terminal-window-bar border-b border-terminal-border">
                  <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
                  <div className="flex-1 text-center text-xs text-zinc-400 font-mono">{"// QUICK_PRACTICE"}</div>
                </div>
                <div className="p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-lg font-bold" style={{ color: "var(--dashboard-text-primary)" }}>কুইক প্র্যাকটিস</h2>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono">
                    যেকোনো বিষয়ের নির্দিষ্ট টপিক ও সাবটপিক বেছে নিয়ে তৎক্ষণাৎ প্রশ্ন অনুশীলন করুন।
                  </p>
                </div>
              </motion.div>

              {configLoading && (
                <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
                  <Loader2 className="w-10 h-10 mx-auto mb-3 text-emerald-500 animate-spin" aria-hidden="true" />
                  <p className="text-sm text-zinc-400 font-mono">বিষয় লোড হচ্ছে...</p>
                </div>
              )}

              {configError && (
                <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
                  <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" aria-hidden="true" />
                  <p className="text-sm text-zinc-400">{configError}</p>
                  <button
                    onClick={() => {
                      setConfigLoading(true);
                      setConfigError(null);
                      void (async () => {
                        try {
                          const list = await api.examConfig();
                          setSubjects(list.filter((s) => s.questionCount > 0));
                        } catch {
                          setConfigError("কনফিগারেশন লোড করা যায়নি। আবার চেষ্টা করুন।");
                        } finally {
                          setConfigLoading(false);
                        }
                      })();
                    }}
                    className="mt-4 px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors"
                  >
                    আবার চেষ্টা করুন
                  </button>
                </div>
              )}

              {!configLoading && !configError && (
                <>
                  <TopicTreePicker
                    subjects={subjects}
                    selection={selection}
                    onSelectionChange={setSelection}
                  />

                  {/* Total questions */}
                  <div className="glass-card rounded-xl border border-terminal-border p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-300 font-mono">মোট প্রশ্ন</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        উপলব্ধ:{" "}
                        <span className={`font-mono ${insufficient ? "text-red-400" : "text-emerald-400"}`}>
                          {availableTotal}টি
                        </span>
                      </p>
                    </div>
                    <span
                      className={`text-2xl font-bold font-mono ${
                        totalCount > 0 ? "text-emerald-400" : "text-zinc-600"
                      }`}
                    >
                      {totalCount}
                      <span className="text-xs text-zinc-500 ml-1">প্র.</span>
                    </span>
                  </div>

                  {insufficient && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p>
                        নির্বাচিত টপিক থেকে শুধু <span className="font-mono">{availableTotal}টি</span> প্রশ্ন
                        পাওয়া যায় — মোট <span className="font-mono">{totalCount}টি</span> চাওয়া হয়েছে।
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => void startSession()}
                    disabled={selectedSubjects.length === 0 || totalCount === 0 || loading}
                    className="mt-4 w-full py-3 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Play className="w-4 h-4" />
                    প্র্যাকটিস শুরু করুন
                  </button>
                </>
              )}
            </motion.div>
          )}

          {/* Loading state */}
          {sessionActive && loading && (
            <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
              <Loader2 className="w-10 h-10 mx-auto mb-3 text-emerald-500 animate-spin" aria-hidden="true" />
              <p className="text-sm text-zinc-400 font-mono">প্রশ্ন লোড হচ্ছে...</p>
            </div>
          )}

          {/* Error state */}
          {sessionActive && !loading && loadError && (
            <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" aria-hidden="true" />
              <p className="text-sm text-zinc-400">{loadError}</p>
              <button
                onClick={() => void startSession()}
                className="mt-4 px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors"
              >
                আবার চেষ্টা করুন
              </button>
              <button
                onClick={resetSession}
                className="mt-4 ml-2 px-4 py-2 bg-zinc-800 text-zinc-300 font-mono text-sm rounded-lg hover:bg-zinc-700 transition-colors"
              >
                ফিরে যান
              </button>
            </div>
          )}

          {/* Empty state */}
          {sessionActive && !loading && !loadError && questions.length === 0 && !result && (
            <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
              <Inbox className="w-10 h-10 mx-auto mb-3 text-zinc-600" aria-hidden="true" />
              <p className="text-sm text-zinc-400">কোনো প্রশ্ন পাওয়া যায়নি।</p>
              <button
                onClick={resetSession}
                className="mt-4 px-4 py-2 bg-zinc-800 text-zinc-300 font-mono text-sm rounded-lg hover:bg-zinc-700 transition-colors"
              >
                ফিরে যান
              </button>
            </div>
          )}

          {/* Active quiz session */}
          {sessionActive && !loading && !loadError && !result && totalQuestions > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border overflow-hidden"
              style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b flex items-center justify-between gap-2" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: "var(--dashboard-primary)" }} />
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--dashboard-text-primary)" }}>{sessionTitle}</span>
                </div>
                <span className="text-xs font-mono flex-shrink-0" style={{ color: "var(--dashboard-text-muted)" }}>
                  প্রশ্ন {currentIndex + 1}/{totalQuestions}
                </span>
              </div>

              <div className="p-5">
                {/* Progress bar */}
                <div className="h-1.5 rounded-full overflow-hidden mb-6" style={{ background: "var(--dashboard-surface-muted)" }}>
                  <div
                    className="h-full w-full origin-left rounded-full transition-transform duration-300"
                    style={{ transform: `scaleX(${totalQuestions > 0 ? answeredCount / totalQuestions : 0})`, background: "var(--dashboard-primary)" }}
                  />
                </div>

                {currentQuestion && (
                  <div key={currentQuestion.id}>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        currentQuestion.difficulty === "EASY"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : currentQuestion.difficulty === "MEDIUM"
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-red-500/10 text-red-400"
                      }`}>
                        {DIFFICULTY_LABEL[currentQuestion.difficulty] ?? currentQuestion.difficulty}
                      </span>
                      {currentQuestion.topic && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono" style={{ background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-secondary)", border: "1px solid var(--dashboard-border-muted)" }}>
                          {currentQuestion.topic}
                        </span>
                      )}
                      {currentQuestion.subtopic && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono" style={{ background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-muted)", border: "1px solid var(--dashboard-border-muted)" }}>
                          {currentQuestion.subtopic}
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-500 font-mono ml-auto">
                        {answeredCount}/{totalQuestions} উত্তর
                      </span>
                    </div>

                    <div className="rounded-xl border p-4 mb-5" style={{ background: "var(--dashboard-surface-raised)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}>
                      <h3 className="text-[16px] font-semibold leading-relaxed" style={{ color: "#0f172a", lineHeight: "1.6" }}>{currentQuestion.question}</h3>
                    </div>

                    <div className="space-y-2.5 mb-6" role="radiogroup" aria-label="উত্তর নির্বাচন করুন">
                      {currentQuestion.options.map((option, i) => {
                        const isSelected = answers[currentQuestion.id] === option;
                        return (
                          <button
                            key={i}
                            onClick={() => selectAnswer(currentQuestion.id, option)}
                            role="radio"
                            aria-checked={isSelected}
                            className="w-full text-left p-3.5 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                            style={
                              isSelected
                                ? { background: "var(--dashboard-primary-subtle)", borderColor: "var(--dashboard-primary)", color: "var(--dashboard-primary)" }
                                : { background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-primary)" }
                            }
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full border flex items-center justify-center text-xs font-mono flex-shrink-0" style={isSelected ? { background: "var(--dashboard-primary)", color: "white", borderColor: "var(--dashboard-primary)" } : { background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}>
                                {String.fromCharCode(65 + i)}
                              </span>
                              <span className="text-sm font-medium">{option}</span>
                              {isSelected && <Check className="w-4 h-4 ml-auto" style={{ color: "var(--dashboard-primary)" }} />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                        disabled={currentIndex === 0}
                        className="px-4 py-2 border font-mono text-sm rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1"
                        style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}
                      >
                        <ChevronLeft className="w-4 h-4" /> আগের
                      </button>
                      <span className="text-xs font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                        {currentIndex + 1} / {totalQuestions}
                      </span>
                      {currentIndex < totalQuestions - 1 ? (
                        <button
                          onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
                          className="px-4 py-2 border font-mono text-sm rounded-lg transition-colors flex items-center gap-1"
                          style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-primary)" }}
                        >
                          পরের <ChevronRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={handleSubmitRequest}
                          disabled={submitting}
                          className="px-5 py-2 font-mono text-sm rounded-lg transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: "var(--dashboard-primary)", color: "white" }}
                        >
                          {submitting ? "জমা হচ্ছে..." : "ফলাফল জমা দিন"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Unanswered confirm for quick practice */}
          {showUnansweredConfirm && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowUnansweredConfirm(false)}>
              <div onClick={(e) => e.stopPropagation()} className="rounded-2xl border p-6 w-full max-w-sm" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-lg)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5" style={{ color: "var(--dashboard-warning)" }} />
                  <h3 className="text-base font-bold" style={{ color: "var(--dashboard-text-primary)" }}>উত্তর দেওয়া বাকি আছে</h3>
                </div>
                <p className="text-sm mb-5" style={{ color: "var(--dashboard-text-secondary)" }}>
                  <span className="font-mono" style={{ color: "var(--dashboard-warning)" }}>{totalQuestions - answeredCount}টি</span> প্রশ্নে উত্তর দেওয়া হয়নি। নিশ্চিতভাবে জমা দিতে চান?
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setShowUnansweredConfirm(false)} className="flex-1 py-2.5 border rounded-xl text-sm" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}>ফিরে যান</button>
                  <button onClick={finalizeSubmit} className="flex-1 py-2.5 rounded-xl text-sm" style={{ background: "var(--dashboard-primary)", color: "white" }}>জমা দিন</button>
                </div>
              </div>
            </div>
          )}

          {/* Result panel */}
          {result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border overflow-hidden"
              style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
            >
              <div className="p-6 text-center border-b" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
                <Trophy className={`w-12 h-12 mx-auto mb-3 ${
                  result.score >= 80 ? "text-amber-400" : result.score >= 50 ? "text-emerald-400" : "text-red-400"
                }`} />
                <h3 className="text-xl font-bold mb-2" style={{ color: "var(--dashboard-text-primary)" }}>প্র্যাকটিস সম্পন্ন!</h3>
                <div className="text-5xl font-bold font-mono text-emerald-400 mb-2">{result.score}%</div>
                <p className="text-sm text-zinc-400 font-mono mb-1">
                  {result.correct} / {result.total} সঠিক
                </p>
                <p className="text-xs text-zinc-500 font-mono">
                  +{result.pointsEarned} পয়েন্ট অর্জিত
                </p>
                {submitError && (
                  <p className="mt-3 text-xs text-red-400">{submitError}</p>
                )}
                <div className="flex items-center justify-center gap-3 mt-5">
                  <button
                    onClick={() => {
                      try {
                        localStorage.removeItem(QUICK_STORAGE_KEY);
                      } catch { /* ignore */ }
                      setSessionActive(false);
                      setResult(null);
                      setAnswers({});
                      setCurrentIndex(0);
                      setQuestions([]);
                    }}
                    className="px-5 py-2.5 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors flex items-center gap-2 shadow-neon-glow"
                  >
                    <RotateCcw className="w-4 h-4" /> আবার প্র্যাকটিস
                  </button>
                  <button
                    onClick={resetSession}
                    className="px-5 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-sm rounded-xl hover:bg-zinc-800 transition-colors flex items-center gap-2"
                  >
                    <Target className="w-4 h-4" /> নতুন নির্বাচন
                  </button>
                </div>
              </div>

              {/* Review */}
              <div className="p-5 max-h-96 overflow-y-auto space-y-2">
                {sessionQuestions.map((q, i) => {
                  const userAnswer = answers[q.id];
                  const isCorrect = userAnswer === q.correctAnswer;
                  return (
                    <div key={q.id} className={`p-3.5 rounded-xl border ${
                      isCorrect ? "border-emerald-500/20" : "border-red-500/20"
                    }`}>
                      <div className="flex items-start gap-3">
                        {isCorrect ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm mb-1.5" style={{ color: "var(--dashboard-text-primary)" }}>{i + 1}. {q.question}</p>
                          <p className="text-xs text-zinc-500 font-mono">
                            আপনার উত্তর:{" "}
                            <span className={isCorrect ? "text-emerald-400" : "text-red-400"}>
                              {userAnswer || "উত্তর দেওয়া হয়নি"}
                            </span>
                          </p>
                          {!isCorrect && (
                            <p className="text-xs text-emerald-400 font-mono mt-0.5">
                              সঠিক উত্তর: {q.correctAnswer}
                            </p>
                          )}
                          {q.explanation && (
                            <p className="text-xs text-zinc-400 mt-1.5">{q.explanation}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}