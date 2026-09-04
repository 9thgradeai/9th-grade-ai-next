"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Play,
  Flag,
  Timer,
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Loader2,
  AlertTriangle,
  CircleDashed,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/services/api";
import {
  submitExamAttempt as canonicalSubmitExamAttempt,
  registerExam,
  ensureAttemptId,
  clearAttemptId,
} from "@/lib/services/exam-submission";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { DIFFICULTY_LABEL } from "@/lib/exam-ui";
import type { Server } from "@/lib/types";
import TopicTreePicker, {
  type Selection,
  buildExamSelectionRequest,
  availableForSubject,
} from "./TopicTreePicker";

type TestState = "setup" | "active" | "completed";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

// An active attempt survives tab switches/remounts: questions, answers and a
// wall-clock start time are persisted so navigation never destroys progress.
const STORAGE_KEY = "ninth-grade-ai:mock-test:active";

type PersistedMockTest = {
  /** Client-minted idempotency token. Reused for every submit retry so the
   * server can dedupe concurrent or repeated submissions. */
  attemptId: string;
  questions: Server.ExamQuestionDTO[];
  answers: Record<number, string>;
  currentQuestion: number;
  startsAt: number;
  durationSec: number;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function MockTestTab() {
  // ── Config state ──
  const [subjects, setSubjects] = useState<Server.ExamSubjectDTO[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({});
  const [durationMin, setDurationMin] = useState(30);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  // ── Test state ──
  const [testState, setTestState] = useState<TestState>("setup");
  const [questions, setQuestions] = useState<Server.ExamQuestionDTO[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [result, setResult] = useState<Server.ExamResultDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showUnansweredConfirm, setShowUnansweredConfirm] = useState(false);
  const submittingRef = useRef(false);
  const startedAtRef = useRef(0);
  const totalSecRef = useRef(0);
  const [lockedQuestions, setLockedQuestions] = useState<Set<number>>(new Set());

  const scrollDashboardTop = useCallback(() => {
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
  }, []);
  // Latest questions/answers for the timer's auto-submit without re-subscribing.
  const questionsRef = useRef<Server.ExamQuestionDTO[]>([]);
  const answersRef = useRef<Record<number, string>>({});
  const confirmDialogRef = useDialogA11y<HTMLDivElement>(
    showUnansweredConfirm,
    useCallback(() => setShowUnansweredConfirm(false), []),
  );

  const [configReloadKey, setConfigReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.examConfig();
        if (!cancelled) setSubjects(list.filter((s) => s.questionCount > 0));
      } catch {
        if (!cancelled) setConfigError("কনফিগারেশন লোড করা যায়নি। আবার চেষ্টা করুন।");
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configReloadKey]);

  const fetchConfig = useCallback(() => {
    // Retry path — reset UI state, then re-run the config effect.
    setConfigLoading(true);
    setConfigError(null);
    setConfigReloadKey((k) => k + 1);
  }, []);

  // Resume an in-progress attempt from localStorage so tab switches or a
  // refresh never destroy an active test. The wall-clock timer below
  // auto-submits if time ran out while away.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as PersistedMockTest;
        if (!saved?.questions?.length || !saved.startsAt || !saved.durationSec) return;
        const elapsedSec = Math.floor((Date.now() - saved.startsAt) / 1000);
        if (elapsedSec >= saved.durationSec + 5) {
          // Long expired — drop it rather than resurfacing a finished exam.
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        // Resume uses the persisted attemptId if present, otherwise mints a
        // fresh one and re-registers with the server (fire-and-forget).
        const attemptId = saved.attemptId ?? ensureAttemptId(STORAGE_KEY);
        if (!saved.attemptId) {
          try {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ ...saved, attemptId }),
            );
          } catch {
            /* ignore */
          }
        }
        startedAtRef.current = saved.startsAt;
        totalSecRef.current = saved.durationSec;
        setQuestions(saved.questions);
        setAnswers(saved.answers ?? {});
        setCurrentQuestion(Math.min(saved.currentQuestion ?? 0, saved.questions.length - 1));
        setTimeRemaining(Math.max(0, saved.durationSec - elapsedSec));
        setTestState("active");
        if (!saved.attemptId) {
          void registerExam({
            attemptId,
            questionIds: saved.questions.map((q) => q.id),
          }).catch(() => {
            /* non-fatal */
          });
        }
      } catch {
        /* corrupt storage — ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror the latest questions/answers into refs for the wall-clock timer.
  useEffect(() => {
    questionsRef.current = questions;
    answersRef.current = answers;
  }, [questions, answers]);

  // Keep the persisted snapshot in sync while a test is active.
  useEffect(() => {
    if (testState !== "active" || questions.length === 0 || startedAtRef.current === 0) return;
    const attemptId = ensureAttemptId(STORAGE_KEY);
    try {
      const snapshot: PersistedMockTest = {
        attemptId,
        questions,
        answers,
        currentQuestion,
        startsAt: startedAtRef.current,
        durationSec: totalSecRef.current,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      /* storage full/unavailable — resume just won't be available */
    }
  }, [testState, questions, answers, currentQuestion]);

  const selectedSubjects = useMemo(
    () => subjects.filter((s) => selection[s.id] !== undefined),
    [subjects, selection],
  );

  const availableTotal = useMemo(
    () =>
      selectedSubjects.reduce((acc, s) => acc + availableForSubject(s, selection), 0),
    [selectedSubjects, selection],
  );

  const totalCount = useMemo(
    () => selectedSubjects.reduce((acc, s) => acc + (selection[s.id].count ?? 0), 0),
    [selectedSubjects, selection],
  );

  const insufficient = totalCount > availableTotal;

  const adjustDuration = (delta: number) => {
    setDurationMin((d) => Math.max(1, Math.min(180, d + delta)));
  };

  const buildAndStart = async () => {
    setBuildLoading(true);
    setBuildError(null);
    try {
      const built = await api.buildExam(
        buildExamSelectionRequest(selectedSubjects, selection, totalCount, durationMin * 60),
      );
      if (built.questions.length === 0) {
        setBuildError("এই কনফিগারেশনে কোনো প্রশ্ন পাওয়া যায়নি।");
        return;
      }
      const attemptId = ensureAttemptId(STORAGE_KEY);
      setQuestions(built.questions);
      setAnswers({});
      setLockedQuestions(new Set());
      setCurrentQuestion(0);
      startedAtRef.current = Date.now();
      totalSecRef.current = built.durationSec;
      setTimeRemaining(built.durationSec);
      setTestState("active");
      requestAnimationFrame(() => scrollDashboardTop());
      // Best-effort server registration. The submit endpoint will upsert the
      // attempt row on its own if this call fails.
      void registerExam({
        attemptId,
        questionIds: built.questions.map((q) => q.id),
      }).catch(() => {
        /* non-fatal */
      });
    } catch {
      setBuildError("মক টেস্ট তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBuildLoading(false);
    }
  };

  const selectAnswer = (questionId: number, option: string) => {
    if (lockedQuestions.has(questionId)) return;
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
    setLockedQuestions((prev) => new Set(prev).add(questionId));
  };

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questions.length;

  const submit = useCallback(
    async (qs: Server.ExamQuestionDTO[], ans: Record<number, string>) => {
      if (qs.length === 0) return;
      const attemptId = ensureAttemptId(STORAGE_KEY);
      if (!attemptId) {
        setSubmitError("পরীক্ষার সেশন শনাক্ত করা যায়নি। পৃষ্ঠা রিফ্রেশ করে আবার চেষ্টা করুন।");
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        const elapsedSec = Math.max(
          0,
          Math.floor(
            (Date.now() - (startedAtRef.current || Date.now())) / 1000,
          ),
        );
        const { result } = await canonicalSubmitExamAttempt({
          attemptId,
          questionIds: qs.map((q) => q.id),
          durationSec: elapsedSec,
          answers: ans,
        });
        clearAttemptId(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY);
        setResult(result);
        setTestState("completed");
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "ফলাফল জমা দেওয়া যায়নি। আবার চেষ্টা করুন।";
        setSubmitError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  const handleSubmitRequest = () => {
    if (totalQuestions - answeredCount > 0) {
      setShowUnansweredConfirm(true);
    } else if (questions.length > 0) {
      void submit(questions, answers);
    }
  };

  const finalizeSubmit = () => {
    setShowUnansweredConfirm(false);
    void submit(questions, answers);
  };

  // Countdown — wall-clock based (survives remounts, no per-second interval
  // churn) and auto-submits when time runs out.
  useEffect(() => {
    if (testState !== "active") return;
    let autoSubmitted = false;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((startedAtRef.current + totalSecRef.current * 1000 - Date.now()) / 1000),
      );
      setTimeRemaining(remaining);
      if (remaining <= 0 && !autoSubmitted) {
        autoSubmitted = true;
        clearInterval(interval);
        void submit(questionsRef.current, answersRef.current);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testState]);

  // Always show the top of the test/result when state switches — fixes landing
  // in the middle of questions or in the middle of the review.
  useEffect(() => {
    if (testState === "active" || testState === "completed") {
      const id = requestAnimationFrame(() => scrollDashboardTop());
      return () => cancelAnimationFrame(id);
    }
  }, [testState, scrollDashboardTop]);

  const resetTest = () => {
    localStorage.removeItem(STORAGE_KEY);
    setTestState("setup");
    setSelection({});
    setDurationMin(30);
    setQuestions([]);
    setAnswers({});
    setLockedQuestions(new Set());
    setCurrentQuestion(0);
    setTimeRemaining(0);
    setResult(null);
    setSubmitError(null);
    setShowUnansweredConfirm(false);
  };

  // ═══════════════ SETUP ═══════════════
  if (testState === "setup") {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl border border-terminal-border overflow-hidden"
        >
          <div className="terminal-window-bar border-b border-terminal-border">
            <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
            <div className="flex-1 text-center text-xs text-[var(--dashboard-text-muted)] font-mono">{"// MOCK_TEST"}</div>
          </div>
          <div className="p-5 md:p-6">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="w-5 h-5 text-[var(--dashboard-primary)]" />
              <h2 className="text-lg font-bold text-[var(--text-primary)]">মক টেস্ট</h2>
            </div>
            <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
              বিষয়, টপিক ও সাবটপিক বেছে নিয়ে সময়সীমা সহ পূর্ণাঙ্গ মক পরীক্ষা দিন — নেগেটিভ মার্কিং সহ বিসিএস ধাঁচে।
            </p>
          </div>
        </motion.div>

        {configLoading && (
          <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
            <Loader2 className="w-10 h-10 mx-auto mb-3 text-[var(--accent)] animate-spin" aria-hidden="true" />
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">বিষয় লোড হচ্ছে...</p>
          </div>
        )}

        {configError && (
          <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-[var(--warning)]" aria-hidden="true" />
            <p className="text-sm text-[var(--dashboard-text-muted)]">{configError}</p>
            <button
              onClick={() => {
                setConfigLoading(true);
                setConfigError(null);
                void fetchConfig();
              }}
              className="mt-4 px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
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

            {/* Total questions + duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass-card rounded-xl border border-terminal-border p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-[var(--dashboard-text-secondary)] font-mono">মোট প্রশ্ন</p>
                  <p className="text-xs text-[var(--dashboard-text-muted)] mt-0.5">
                    উপলব্ধ:{" "}
                    <span className={`font-mono ${insufficient ? "text-[var(--dashboard-danger)]" : "text-[var(--dashboard-primary)]"}`}>
                      {availableTotal}টি
                    </span>
                  </p>
                </div>
                <span
                  className={`text-2xl font-bold font-mono ${
                    totalCount > 0 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-text-secondary)]"
                  }`}
                >
                  {totalCount}
                  <span className="text-xs text-[var(--dashboard-text-muted)] ml-1">প্র.</span>
                </span>
              </div>

              <div className="glass-card rounded-xl border border-terminal-border p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--dashboard-text-secondary)] font-mono">সময়সীমা</p>
                  <p className="text-xs text-[var(--dashboard-text-muted)] mt-0.5">{durationMin} মিনিট</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustDuration(-1)}
                    className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--primary)]/40"
                    aria-label="সময় কমান"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-2xl font-bold text-[var(--dashboard-primary)] font-mono w-8 text-center">{durationMin}</span>
                  <button
                    onClick={() => adjustDuration(1)}
                    className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--primary)]/40"
                    aria-label="সময় বাড়ান"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {insufficient && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--warning)]/30 bg-[var(--dashboard-warning-subtle)] p-3 text-xs text-[var(--dashboard-warning)]">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  নির্বাচিত টপিক থেকে শুধু <span className="font-mono">{availableTotal}টি</span> প্রশ্ন
                  পাওয়া যায় — মোট <span className="font-mono">{totalCount}টি</span> চাওয়া হয়েছে।
                </p>
              </div>
            )}

            {buildError && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--dashboard-danger-subtle)] p-3 text-xs text-[var(--dashboard-danger)]">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{buildError}</p>
              </div>
            )}

            <button
              onClick={() => void buildAndStart()}
              disabled={selectedSubjects.length === 0 || totalCount === 0 || buildLoading}
              className="mt-4 w-full py-3 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              {buildLoading ? "তৈরি হচ্ছে..." : "মক টেস্ট শুরু করুন"}
            </button>
          </>
        )}
      </div>
    );
  }

  // ═══════════════ ACTIVE ═══════════════
  if (testState === "active") {
    const timeLow = timeRemaining > 0 && timeRemaining <= 60;
    const progressPct = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    const q = questions[currentQuestion];

    return (
      <div className="space-y-4">
        {/* Sticky header: timer + progress + submit */}
          <div className="sticky top-0 z-50 -mx-1 px-1">
            <div className="glass-card rounded-2xl border border-[var(--primary)]/30 px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Timer className={`w-4 h-4 ${timeLow ? "text-[var(--dashboard-danger)] animate-pulse" : "text-[var(--dashboard-primary)]"}`} />
                  <span className={`font-mono text-lg font-bold ${timeLow ? "text-[var(--dashboard-danger)]" : "text-[var(--dashboard-primary)]"}`}>
                    {formatTime(timeRemaining)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">
                    উত্তর: <span className="text-[var(--dashboard-primary)]">{answeredCount}</span> / {totalQuestions}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSubmitRequest();
                    }}
                    disabled={submitting || totalQuestions === 0}
                    className="px-4 py-1.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs rounded-lg hover:bg-[var(--accent-hover)] transition-colors shadow-neon-glow flex items-center gap-1.5 disabled:opacity-40 z-50 relative"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {submitting ? "জমা হচ্ছে..." : "জমা দিন"}
                  </button>
                </div>
              </div>
              <div className="h-1.5 bg-[var(--surface-overlay)] rounded-full overflow-hidden mt-2">
                <div
                  className="h-full w-full origin-left bg-gradient-to-r from-[var(--success)] to-[var(--success)] rounded-full transition-transform duration-300"
                  style={{ transform: `scaleX(${progressPct / 100})` }}
                />
              </div>
            </div>
          </div>


        {q ? (
          <motion.div
            key={q.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-card rounded-2xl border border-terminal-border p-4 md:p-6"
          >
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-secondary)]">
                প্রশ্ন {currentQuestion + 1}/{totalQuestions}
              </span>
              <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-muted)]">
                {q.subject}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                q.difficulty === "EASY"
                  ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                  : q.difficulty === "MEDIUM"
                    ? "bg-[var(--dashboard-warning-subtle)] text-[var(--dashboard-warning)]"
                    : "bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]"
              }`}>
                {DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}
              </span>
              {q.topic && (
                <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-muted)]">
                  {q.topic}
                </span>
              )}
            </div>

            <div className="rounded-xl border p-4 mb-5" style={{ background: "var(--dashboard-surface-raised)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}>
              <h3 className="text-base md:text-[16px] font-semibold leading-relaxed" style={{ color: "var(--dashboard-text-primary)", lineHeight: "1.6" }}>{q.question}</h3>
            </div>

            <div className="space-y-2.5" role="radiogroup" aria-label={`প্রশ্ন ${currentQuestion + 1} — উত্তর নির্বাচন করুন`}>
              {q.options.map((option, i) => {
                const isSelected = answers[q.id] === option;
                const isLocked = lockedQuestions.has(q.id);
                return (
                  <button
                    key={i}
                    onClick={() => selectAnswer(q.id, option)}
                    disabled={isLocked}
                    role="radio"
                    aria-checked={isSelected}
                    className="w-full text-left p-3.5 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] disabled:cursor-not-allowed"
                    style={
                      isSelected
                        ? { background: "var(--dashboard-primary-subtle)", borderColor: "var(--dashboard-primary)", color: "var(--dashboard-primary)" }
                        : { background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-primary)" }
                    }
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-mono border" style={isSelected ? { background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)", borderColor: "var(--dashboard-primary)" } : { background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}>
                        {OPTION_LABELS[i] ?? i + 1}
                      </span>
                      <span className="text-sm font-medium">{option}</span>
                      {isSelected && <Check className="w-4 h-4 ml-auto" style={{ color: "var(--dashboard-primary)" }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <div className="rounded-2xl border p-10 text-center" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
            <p className="text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>কোনো প্রশ্ন পাওয়া যায়নি।</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setCurrentQuestion((i) => Math.max(0, i - 1))}
            disabled={currentQuestion === 0}
            className="px-4 py-2 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] font-mono text-sm rounded-lg hover:bg-[var(--surface-overlay)] transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> আগের
          </button>
          <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">
            {answeredCount}/{totalQuestions} উত্তর
          </span>
          {currentQuestion < totalQuestions - 1 ? (
            <button
              onClick={() => setCurrentQuestion((i) => Math.min(totalQuestions - 1, i + 1))}
              className="px-4 py-2 bg-[var(--surface-overlay)] text-[var(--dashboard-text-secondary)] font-mono text-sm rounded-lg hover:bg-[var(--surface-muted)] transition-colors flex items-center gap-1"
            >
              পরের <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleSubmitRequest();
              }}
              disabled={submitting}
              className="px-5 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-2 shadow-neon-glow disabled:opacity-40 z-50 relative"
            >
              <Flag className="w-4 h-4" />
              {submitting ? "জমা হচ্ছে..." : "জমা দিন"}
            </button>
          )}
        </div>

        {/* Question map */}
        <div className="glass-card rounded-2xl border border-terminal-border p-3">
          <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest mb-2">
            প্রশ্ন তালিকা
          </p>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((qq, i) => {
              const isAnswered = answers[qq.id] !== undefined;
              return (
                <button
                  key={qq.id}
                  onClick={() => setCurrentQuestion(i)}
                  className={`min-w-[44px] min-h-[44px] rounded-lg border text-xs font-mono transition-all ${
                    i === currentQuestion
                      ? "border-[var(--primary)]/40 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                      : isAnswered
                        ? "border-[var(--primary)]/20 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                        : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-[var(--border-strong)]"
                  }`}
                  aria-label={`প্রশ্ন ${i + 1}${isAnswered ? " — উত্তর দেওয়া হয়েছে" : ""}`}
                  aria-current={i === currentQuestion ? "true" : undefined}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {submitError && (
          <p className="text-xs text-[var(--dashboard-danger)] text-center">{submitError}</p>
        )}

        {/* Unanswered confirmation */}
        <AnimatePresence>
          {showUnansweredConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setShowUnansweredConfirm(false)}
            >
              <motion.div
                ref={confirmDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="unanswered-confirm-title"
                tabIndex={-1}
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card rounded-2xl border border-[var(--warning)]/30 p-6 w-full max-w-sm"
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-[var(--dashboard-warning)]" />
                  <h3 id="unanswered-confirm-title" className="text-base font-bold text-[var(--text-primary)]">উত্তর দেওয়া বাকি আছে</h3>
                </div>
                <p className="text-sm text-[var(--dashboard-text-muted)] mb-5">
                  <span className="text-[var(--dashboard-warning)] font-mono">{totalQuestions - answeredCount}টি</span> প্রশ্নে
                  উত্তর দেওয়া হয়নি। নিশ্চিতভাবে জমা দিতে চান? না দেওয়া প্রশ্নে ০ নম্বর পাবেন।
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowUnansweredConfirm(false)}
                    className="flex-1 py-2.5 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-secondary)] font-mono text-sm rounded-xl hover:bg-[var(--surface-overlay)] transition-colors"
                  >
                    ফিরে যান
                  </button>
                  <button
                    onClick={finalizeSubmit}
                    className="flex-1 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors shadow-neon-glow"
                  >
                    জমা দিন
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ═══════════════ RESULTS ═══════════════
  if (result) {
    const { summary } = result;
    const percentage = summary.percentage;

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-2xl border border-[var(--primary)]/30 overflow-hidden"
        >
          <div className="p-6 text-center border-b border-terminal-border">
            <Trophy className={`w-12 h-12 mx-auto mb-3 ${
              percentage >= 80 ? "text-[var(--dashboard-warning)]" : percentage >= 50 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-danger)]"
            }`} />
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">মক টেস্ট সম্পন্ন!</h3>
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono mb-4">{summary.percentage}% স্কোর</p>

            <div className="inline-flex flex-col items-center mb-4">
              <div className="text-5xl font-bold font-mono text-[var(--dashboard-primary)]">{summary.finalScore}</div>
              <div className="text-xs text-[var(--dashboard-text-muted)] font-mono mt-1">মোট নম্বর: {summary.total}</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-md mx-auto text-left">
              <div className="rounded-xl bg-[var(--dashboard-primary-subtle)] border border-[var(--primary)]/20 p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">সঠিক</p>
                <p className="text-lg font-bold text-[var(--dashboard-primary)] font-mono">+{summary.correct}</p>
              </div>
              <div className="rounded-xl bg-[var(--dashboard-danger-subtle)] border border-[var(--danger)]/20 p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">ভুল</p>
                <p className="text-lg font-bold text-[var(--dashboard-danger)] font-mono">−{summary.wrong}</p>
              </div>
              <div className="rounded-xl bg-subtle border border-[var(--border-strong)] p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">উত্তর দেওয়া হয়নি</p>
                <p className="text-lg font-bold text-[var(--dashboard-text-muted)] font-mono">{summary.unanswered}</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                onClick={resetTest}
                className="px-5 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-2 shadow-neon-glow"
              >
                <Play className="w-4 h-4" /> আবার মক টেস্ট
              </button>
            </div>
          </div>
        </motion.div>

        {/* Review */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          <h4 className="text-sm font-medium text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider px-1">
            উত্তর পর্যালোচনা
          </h4>
          {result.review.map((r, i) => {
            const isCorrect = r.status === "correct";
            return (
              <div key={r.questionId} className={`p-3.5 rounded-xl border ${
                isCorrect ? "border-[var(--primary)]/20" : r.status === "wrong" ? "border-[var(--danger)]/20" : "border-[var(--dashboard-border-muted)]"
              }`}>
                <div className="flex items-start gap-3">
                  {isCorrect ? (
                    <CheckCircle2 className="w-4 h-4 text-[var(--dashboard-primary)] flex-shrink-0 mt-0.5" />
                  ) : r.status === "wrong" ? (
                    <XCircle className="w-4 h-4 text-[var(--dashboard-danger)] flex-shrink-0 mt-0.5" />
                  ) : (
                    <CircleDashed className="w-4 h-4 text-[var(--dashboard-text-muted)] flex-shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--text-primary)] mb-1.5">{i + 1}. {r.question}</p>
                    <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
                      আপনার উত্তর:{" "}
                      <span className={isCorrect ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-danger)]"}>
                        {r.userAnswer || "উত্তর দেওয়া হয়নি"}
                      </span>
                    </p>
                    {!isCorrect && (
                      <p className="text-xs text-[var(--dashboard-primary)] font-mono mt-0.5">
                        সঠিক উত্তর: {r.correctAnswer}
                      </p>
                    )}
                    {r.explanation && (
                      <p className="text-xs text-[var(--dashboard-text-muted)] mt-1.5">{r.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}