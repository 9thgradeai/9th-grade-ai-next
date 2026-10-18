"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion, useDragControls } from "framer-motion";
import { Trophy, Play, Flag, Timer, Check, CaretLeft, CaretRight, Minus, Plus, Spinner, Warning, CircleDashed, CheckCircle, XCircle, ArrowCounterClockwise, } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useEcosystem } from "@/lib/ecosystem-ctx";
import { autoDurationMin, autoDurationSec, formatDurationShort, negativeLabelForEcosystem } from "@/lib/exam-scoring";
import {
  submitExamAttempt as canonicalSubmitExamAttempt,
  registerExam,
  ensureAttemptId,
  clearAttemptId,
  recoverPendingSubmission,
} from "@/lib/services/exam-submission";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { useScrollLock } from "@/lib/use-scroll-lock";
import {
  MOCK_EXAM_KEY,
  loadExamSnapshot,
  saveExamSnapshot,
  dropExamSnapshot,
  clearOtherExams,
} from "@/lib/exam-persist";
import { DIFFICULTY_LABEL } from "@/lib/exam-ui";
import type { Server } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { shuffleSessionOptions } from "@/lib/shuffle-options";
import SubjectTopicSelect from "./SubjectTopicSelect";
import ModalPortal from "@/components/ui/ModalPortal";
import MetaChip from "./practice/MetaChip";
import ScoreRing from "./practice/ScoreRing";
import SmartMixButton from "./practice/SmartMixButton";
import TopicBars from "./practice/TopicBars";
import AIExplanationButton from "./AIExplanationButton";
import RichText from "@/components/ui/RichText";
import Button from "@/components/ui/Button";
import {
  type Selection,
  buildExamSelectionRequest,
  availableForSubject,
} from "./TopicTreePicker";

type TestState = "setup" | "active" | "completed";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

// An active attempt survives tab switches/remounts: questions, answers and a
// wall-clock start time are persisted so navigation never destroys progress.
// Key + validation live in @/lib/exam-persist (single seam for all exam modes).
const STORAGE_KEY = MOCK_EXAM_KEY;

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
  const t = useT();
  const { ecosystem } = useEcosystem();

  // ── Config state ──
  const [subjects, setSubjects] = useState<Server.ExamSubjectDTO[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({});
  const [durationMin, setDurationMin] = useState(30);
  const [durationTouched, setDurationTouched] = useState(false);
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
  const [highlightedReview, setHighlightedReview] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  // Mobile-app chrome: reduced-motion gates, handle-only sheet drag,
  // swipe ref (no re-render), 4s mis-tap undo for hard-locked answers.
  const reduceMotion = useReducedMotion();
  const unansweredSheetControls = useDragControls();
  const touchX = useRef<number | null>(null);
  const [undoPick, setUndoPick] = useState<number | null>(null);
  const undoTimer = useRef<number | null>(null);
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const toggleFlag = useCallback((questionId: number) => {
    setFlagged((prev) => {
      const next = { ...prev };
      if (next[questionId]) delete next[questionId];
      else next[questionId] = true;
      return next;
    });
  }, []);
  useEffect(() => () => {
    if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
  }, []);

  // Jump from the result summary tiles to the first review item in a state
  // (correct/wrong/unanswered). The review container scrolls to the row and a
  // temporary ring highlights it so the jump is visible.
  const jumpToReview = (status: "correct" | "wrong" | "unanswered") => {
    setHighlightedReview(status);
    const first = result?.review.find((r) => r.status === status);
    if (first) {
      setReviewToggles((prev) => ({ ...prev, [first.questionId]: true }));
    }
    if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedReview((h) => (h === status ? null : h));
    }, 2000);
    const el = document.querySelector(`[data-review-status="${status}"]`);
    if (el && typeof (el as HTMLElement).scrollIntoView === "function") {
      const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      (el as HTMLElement).scrollIntoView({ behavior: prefersReduced ? "instant" as ScrollBehavior : "smooth", block: "start", inline: "nearest" });
    }
  };

  // Lazy review disclosures: wrong/unanswered auto-expand (AI mounts on open).
  // Derived defaults (open unless correct) + explicit user toggles, plain
  // helpers so the React compiler keeps its memoization (see CustomExamTab).
  const [reviewToggles, setReviewToggles] = useState<Record<number, boolean>>({});
  const isReviewOpen = (questionId: number, status: string) => {
    const toggled = reviewToggles[questionId];
    return toggled !== undefined ? toggled : status !== "correct";
  };

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

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
  useScrollLock(showUnansweredConfirm);

  const [configReloadKey, setConfigReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    setConfigError(null);
    setSelection({});
    setSubjects([]);
    void (async () => {
      try {
        const list = await api.examConfig(ecosystem);
        if (!cancelled) setSubjects(list);
      } catch {
        if (!cancelled) setConfigError("কনফিগারেশন লোড করা যায়নি। আবার চেষ্টা করুন।");
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configReloadKey, ecosystem]);

  const fetchConfig = useCallback(() => {
    // Retry path, reset UI state, then re-run the config effect.
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
      // 1) Finish an interrupted submission FIRST: if a previous submit reached
      //    the server (or is recoverable), show its result rather than reviving
      //    the attempted exam. Idempotent, the server dedupes by attemptId.
      try {
        const recovered = await recoverPendingSubmission(STORAGE_KEY);
        if (cancelled) return;
        if (recovered) {
          clearAttemptId(STORAGE_KEY);
          dropExamSnapshot(STORAGE_KEY);
          setResult(recovered.result);
          setTestState("completed");
          return;
        }
      } catch {
        /* network still unusable, fall through to resume; submit will retry */
      }
      if (cancelled) return;
      // 2) Resume an in-progress attempt from localStorage so tab switches or a
      //    refresh never destroy an active test. Validated via exam-persist.
      const saved = loadExamSnapshot<PersistedMockTest>(STORAGE_KEY);
      if (!saved) return;
      {
        const elapsedSec = Math.floor((Date.now() - saved.startsAt) / 1000);
        if (elapsedSec >= saved.durationSec + 5) {
          // Long expired, drop it rather than resurfacing a finished exam.
          dropExamSnapshot(STORAGE_KEY);
          return;
        }
        // Resume uses the persisted attemptId if present, otherwise mints a
        // fresh one and re-registers with the server (fire-and-forget).
        const attemptId = saved.attemptId ?? ensureAttemptId(STORAGE_KEY);
        if (!saved.attemptId) {
          saveExamSnapshot(STORAGE_KEY, { ...saved, attemptId });
        }
        startedAtRef.current = saved.startsAt;
        totalSecRef.current = saved.durationSec;
        setQuestions(saved.questions);
        setAnswers(saved.answers ?? {});
        setCurrentQuestion(Math.min(saved.currentQuestion ?? 0, saved.questions.length - 1));
        setTimeRemaining(Math.max(0, saved.durationSec - elapsedSec));
        setTestState("active");
        // Always re-register on resume: idempotent, and with server-side
        // IN_PROGRESS hash adoption it heals a token whose row still holds an
        // older question-set hash so the submit can't 409.
        void registerExam({
          attemptId,
          questionIds: saved.questions.map((q) => q.id),
          durationSec: saved.durationSec,
        }).catch(() => {
          /* non-fatal */
        });
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
    const snapshot: PersistedMockTest = {
      attemptId,
      questions,
      answers,
      currentQuestion,
      startsAt: startedAtRef.current,
        durationSec: totalSecRef.current,
      };
      saveExamSnapshot(STORAGE_KEY, snapshot);
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
  const negativeLabel = negativeLabelForEcosystem(ecosystem);

  // Auto time = 30s per selected MCQ; manual +/− opts out of auto-sync.
  useEffect(() => {
    if (!durationTouched && totalCount > 0) setDurationMin(autoDurationMin(totalCount));
  }, [totalCount, durationTouched]);

  const adjustDuration = (delta: number) => {
    setDurationTouched(true);
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
      // A fresh build must bind to a brand-new attempt token, never reuse a
      // stale one or the server keeps the old question-set hash and the new
      // exam's submit 409s with ATTEMPT_HASH_MISMATCH.
      clearAttemptId(STORAGE_KEY);
      const attemptId = ensureAttemptId(STORAGE_KEY);
      // Serve-time option shuffle, seeded by the attempt (see CustomExamTab).
      setQuestions(shuffleSessionOptions(built.questions, `exam-${attemptId}`));
      setAnswers({});
      setCurrentQuestion(0);
      clearOtherExams(STORAGE_KEY);
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
        durationSec: built.durationSec,
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
    // One answer per question: locked once answered (lock derives from
    // answers presence, so it survives resume). A 4s undo window covers
    // mobile mis-taps.
    if (answers[questionId] !== undefined) return;
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
    setUndoPick(questionId);
    if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndoPick(null), 4000);
  };

  const undoSinglePick = (questionId: number) => {
    setAnswers((prev) => {
      if (prev[questionId] === undefined) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    setUndoPick(null);
    if (undoTimer.current != null) {
      window.clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  };

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questions.length;

  // Safe navigation: block route/tab close while submission is in flight so a
  // mobile browser kill/suspend can't abandon a submission before it commits.
  useEffect(() => {
    if (!submitting) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [submitting]);

  const submit = useCallback(
    async (qs: Server.ExamQuestionDTO[], ans: Record<number, string>) => {
      // Never a silent no-op: every click path ends in a visible outcome.
      if (qs.length === 0) {
        setSubmitError("পরীক্ষার প্রশ্ন পাওয়া যায়নি। মক টেস্ট আবার শুরু করুন।");
        return;
      }
      const attemptId = ensureAttemptId(STORAGE_KEY);
      if (!attemptId) {
        setSubmitError("পরীক্ষার সেশন শনাক্ত করা যায়নি। পৃষ্ঠা রিফ্রেশ করে আবার চেষ্টা করুন।");
        return;
      }
      // Immediate ref guard, state `submitting` updates async, so without this a
      // mobile double-tap could double-trigger. Duplicate hits are safe anyway
      // (the canonical layer joins in-flight same-attempt submissions).
      if (submittingRef.current) {
        setSubmitting(true);
        return;
      }
      submittingRef.current = true;
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
          storageKey: STORAGE_KEY,
        });
        clearAttemptId(STORAGE_KEY);
        dropExamSnapshot(STORAGE_KEY);
        setResult(result);
        setTestState("completed");
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "ফলাফল জমা দেওয়া যায়নি। আবার চেষ্টা করুন।";
        setSubmitError(message);
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [],
  );

  const handleSubmitRequest = () => {
    if (totalQuestions - answeredCount > 0) {
      setShowUnansweredConfirm(true);
    } else {
      void submit(questions, answers);
    }
  };

  const finalizeSubmit = () => {
    setShowUnansweredConfirm(false);
    void submit(questions, answers);
  };

  // Countdown, wall-clock based (survives remounts, no per-second interval
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

  // Always show the top of the test/result when state switches, fixes landing
  // in the middle of questions or in the middle of the review.
  useEffect(() => {
    if (testState === "active" || testState === "completed") {
      const id = requestAnimationFrame(() => scrollDashboardTop());
      return () => cancelAnimationFrame(id);
    }
  }, [testState, scrollDashboardTop]);

  const resetTest = () => {
    dropExamSnapshot(STORAGE_KEY);
    setTestState("setup");
    setSelection({});
    setFlagged({});
    setDurationMin(30);
    setDurationTouched(false);
    setQuestions([]);
    setAnswers({});
    setUndoPick(null);
    setReviewToggles({});
    setHighlightedReview(null);
    setCurrentQuestion(0);
    setTimeRemaining(0);
    setResult(null);
    setSubmitError(null);
    setShowUnansweredConfirm(false);
  };

  // Keyboard navigation (desktop): ←/→ move, A-D/1-4 pick, F flag.
  // Single stable subscription (see PracticeTab): ref-only reads + stable
  // setters, so the empty dep array is correct and compiler-safe.
  const currentQuestionRef = useRef(currentQuestion);
  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
  }, [currentQuestion]);
  const mockStateRef = useRef(testState);
  useEffect(() => {
    mockStateRef.current = testState;
  }, [testState]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (mockStateRef.current !== "active") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const qs = questionsRef.current;
      if (qs.length === 0) return;
      const i = Math.max(0, Math.min(qs.length - 1, currentQuestionRef.current));
      if (e.key === "ArrowRight") {
        setCurrentQuestion(Math.min(qs.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowLeft") {
        setCurrentQuestion(Math.max(0, i - 1));
        return;
      }
      const qq = qs[i];
      if (!qq) return;
      if (e.key === "f" || e.key === "F") {
        toggleFlag(qq.id);
        return;
      }
      if (answersRef.current[qq.id] !== undefined) return;
      const idx =
        ["1", "2", "3", "4", "5", "6"].indexOf(e.key) >= 0
          ? ["1", "2", "3", "4", "5", "6"].indexOf(e.key)
          : ["a", "b", "c", "d", "e", "f"].indexOf(e.key.toLowerCase());
      if (idx < 0 || qq.options[idx] === undefined) return;
      const opt = qq.options[idx];
      setAnswers((prev) => {
        if (prev[qq.id] !== undefined) return prev;
        return { ...prev, [qq.id]: opt };
      });
      setUndoPick(qq.id);
      if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndoPick(null), 4000);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // Empty deps are correct: refs + stable setters only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════ SETUP ═══════════════
  if (testState === "setup") {
    return (
      <div className="space-y-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl border border-terminal-border"
        >
          <div className="p-5 md:p-6">
            <p className="command-eyebrow mb-2">{t("mock.eyebrow")}</p>
            <div className="flex items-center gap-2 mb-1">
              <Timer className="w-5 h-5 text-[var(--dashboard-primary)]" />
              <h2 className="text-lg font-bold text-[var(--text-primary)]">মক টেস্ট</h2>
            </div>
            <p className="text-xs text-[var(--dashboard-text-muted)]">
              বিষয়, টপিক ও সাবটপিক বেছে নিয়ে সময়সীমা সহ পূর্ণাঙ্গ মক পরীক্ষা দিন, নেগেটিভ মার্কিং সহ {ecosystem === "BCS" ? "বিসিএস" : "ব্যাংক"} ধাঁচে (ভুল {negativeLabel})।
            </p>
          </div>
        </motion.div>

        {configLoading && (
          <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
            <Spinner className="w-10 h-10 mx-auto mb-3 text-[var(--accent)] animate-spin" aria-hidden="true" />
            <p className="text-sm text-[var(--dashboard-text-muted)]">বিষয় লোড হচ্ছে...</p>
          </div>
        )}

        {configError && (
          <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
            <Warning className="w-10 h-10 mx-auto mb-3 text-[var(--warning)]" aria-hidden="true" />
            <p className="text-sm text-[var(--dashboard-text-muted)]">{configError}</p>
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={() => {
                setConfigLoading(true);
                setConfigError(null);
                void fetchConfig();
              }}
            >
              আবার চেষ্টা করুন
            </Button>
          </div>
        )}

        {!configLoading && !configError && (
          <>
            <SmartMixButton subjects={subjects} totalQuestions={Math.max(totalCount || 20, 20)} onApply={setSelection} />
            <SubjectTopicSelect
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
                    <span className={`font-mono tabular-nums ${insufficient ? "text-[var(--dashboard-warning)] font-bold" : "text-[var(--dashboard-primary)]"}`}>
                      {availableTotal}টি{insufficient ? ", কম আছে" : ""}
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
                  <p className="text-xs text-[var(--dashboard-text-muted)] mt-0.5">{durationMin} মিনিট{durationTouched ? " (নিজে নির্ধারিত)" : totalCount > 0 ? ` (অটো: ${totalCount}×৩০সে = ${formatDurationShort(autoDurationSec(totalCount))})` : " (অটো: ৩০সে/প্রশ্ন)"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustDuration(-1)}
                    className="w-11 h-11 min-w-[44px] rounded-lg bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--dashboard-primary)]/40 active:opacity-70 cursor-pointer transition-[border-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    aria-label="সময় কমান"
                  >
                    <Minus className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <span className="text-2xl font-bold text-[var(--dashboard-primary)] font-mono tabular-nums w-8 text-center">{durationMin}</span>
                  <button
                    onClick={() => adjustDuration(1)}
                    className="w-11 h-11 min-w-[44px] rounded-lg bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--dashboard-primary)]/40 active:opacity-70 cursor-pointer transition-[border-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    aria-label="সময় বাড়ান"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            {insufficient && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--warning)]/30 bg-[var(--dashboard-warning-subtle)] p-3 text-xs text-[var(--dashboard-warning)]">
                <Warning className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  নির্বাচিত টপিক থেকে শুধু <span className="font-mono">{availableTotal}টি</span> প্রশ্ন
                  পাওয়া যায়, মোট <span className="font-mono">{totalCount}টি</span> চাওয়া হয়েছে।
                </p>
              </div>
            )}

            {buildError && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--dashboard-danger-subtle)] p-3 text-xs text-[var(--dashboard-danger)]">
                <Warning className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{buildError}</p>
              </div>
            )}

            {/* Sticky start dock, thumb-reachable above the bottom nav */}
            <div className="sticky z-[var(--z-sticky)] bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom,0px)+8px)] lg:bottom-2 mt-4">
              <button
                onClick={() => void buildAndStart()}
                disabled={selectedSubjects.length === 0 || totalCount === 0 || buildLoading}
                className="w-full py-3 min-h-[52px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-2xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ boxShadow: "var(--dashboard-shadow-md)" }}
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                {buildLoading ? "তৈরি হচ্ছে..." : `মক টেস্ট শুরু করুন${totalCount > 0 ? ` · ${totalCount}টি` : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ═══════════════ ACTIVE ═══════════════
  // Live exam workspace, the root carries data-exam-session (see
  // PracticeTab note) so shell digit→tab shortcuts stay inert here.
  if (testState === "active") {
    const timeLow = timeRemaining > 0 && timeRemaining <= 60;
    const progressPct = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    const q = questions[currentQuestion];

    return (
      <div className="space-y-4 lg:max-w-4xl lg:mx-auto" data-exam-session="mock-test">
        {/* Sticky header: timer + progress + submit */}
          <div className="sticky top-0 z-[var(--z-sticky)] -mx-1 px-1 pt-1">
            <div className="glass-card rounded-2xl border border-[var(--dashboard-primary)]/25 px-4 py-3 backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--dashboard-surface) 88%, transparent)" }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Timer className={`w-4 h-4 ${timeLow ? "text-[var(--dashboard-danger)] animate-pulse motion-reduce:animate-none" : "text-[var(--dashboard-primary)]"}`} aria-hidden="true" />
                  <span className={`font-mono text-lg font-bold tabular-nums ${timeLow ? "text-[var(--dashboard-danger)]" : "text-[var(--dashboard-primary)]"}`} aria-live="polite">
                    {formatTime(timeRemaining)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--dashboard-text-muted)] font-mono tabular-nums">
                    উত্তর: <span className="text-[var(--dashboard-primary)]">{answeredCount}</span> / {totalQuestions}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSubmitRequest();
                    }}
                    disabled={submitting || totalQuestions === 0}
                    aria-busy={submitting}
                    aria-label="মক টেস্ট জমা দিন"
                    className="px-4 py-2 min-h-[48px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs font-bold rounded-xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed z-[var(--z-sticky)] relative"
                  >
                    <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                    {submitting ? "জমা হচ্ছে..." : "জমা দিন"}
                  </button>
                </div>
              </div>
              <div className="h-1.5 bg-[var(--surface-overlay)] rounded-full overflow-hidden mt-2" role="progressbar" aria-label={t("mock.progressLabel")} aria-valuemin={0} aria-valuemax={totalQuestions} aria-valuenow={answeredCount}>
                <div
                  className="h-full w-full origin-left bg-[var(--dashboard-primary)] rounded-full transition-transform duration-200"
                  style={{ transform: `scaleX(${progressPct / 100})` }}
                />
              </div>
            </div>
          </div>


        {q ? (
          <motion.div
            key={q.id}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
            onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
            onTouchEnd={(e) => {
              if (touchX.current == null) return;
              const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) < 60) return;
              if (dx < 0) setCurrentQuestion((i) => Math.min(totalQuestions - 1, i + 1));
              else setCurrentQuestion((i) => Math.max(0, i - 1));
            }}
            className="glass-card rounded-2xl border border-terminal-border p-4 md:p-6 overscroll-contain scroll-mt-28"
          >
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-secondary)]">
                প্রশ্ন {currentQuestion + 1}/{totalQuestions}
              </span>
              <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-muted)]">
                {q.subject}
              </span>
              <MetaChip
                tone={q.difficulty === "EASY" ? "primary" : q.difficulty === "MEDIUM" ? "warning" : "danger"}
                label={`কাঠিন্য: ${DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}`}
              >
                {DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}
              </MetaChip>
              {q.topic && (
                <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-muted)]">
                  {q.topic}
                </span>
              )}
              <button
                type="button"
                onClick={() => toggleFlag(q.id)}
                aria-pressed={flagged[q.id] === true}
                aria-label="পরে দেখার জন্য ফ্ল্যাগ করুন"
                className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-full border font-mono text-[10px] cursor-pointer transition-all active:scale-95 [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                style={
                  flagged[q.id]
                    ? { color: "var(--dashboard-warning)", borderColor: "var(--dashboard-warning)", background: "var(--dashboard-warning-subtle)" }
                    : { color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)", background: "transparent" }
                }
              >
                <Flag className="w-3 h-3" weight={flagged[q.id] ? "fill" : "regular"} aria-hidden="true" />
                ফ্ল্যাগ
              </button>
            </div>

            <div className="rounded-xl border p-4 mb-5" style={{ background: "var(--dashboard-surface-raised)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}>
              <h3 className="text-base md:text-[16px] font-semibold leading-relaxed" style={{ color: "var(--dashboard-text-primary)", lineHeight: "1.6" }}><RichText text={q.question} /></h3>
            </div>

            <div className="space-y-2.5" role="radiogroup" aria-label={`প্রশ্ন ${currentQuestion + 1}, উত্তর নির্বাচন করুন`}>
              {q.options.map((option, i) => {
                const isSelected = answers[q.id] === option;
                const isLocked = answers[q.id] !== undefined;
                return (
                  <button
                    key={i}
                    onClick={() => selectAnswer(q.id, option)}
                    disabled={isLocked}
                    role="radio"
                    aria-checked={isSelected}
                    className="w-full text-left p-3.5 min-h-[52px] rounded-xl border cursor-pointer transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] disabled:cursor-not-allowed"
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
                      <span className="text-sm font-medium"><RichText text={option} /></span>
                      {isSelected && <Check className="w-4 h-4 ml-auto" style={{ color: "var(--dashboard-primary)" }} />}
                    </div>
                  </button>
                );
              })}
            </div>
            {answers[q.id] !== undefined && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <p role="status" className="inline-flex items-center gap-1.5 text-xs font-mono rounded-full border px-3 py-1.5" style={{ color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" /> উত্তর লক হয়েছে
                </p>
                {undoPick === q.id && (
                  <button
                    type="button"
                    onClick={() => undoSinglePick(q.id)}
                    aria-label="ভুলে চাপ দেওয়া উত্তর ফিরিয়ে নিন"
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border font-mono text-xs font-bold cursor-pointer transition-[background-color,color,border-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    style={{ color: "var(--dashboard-primary)", borderColor: "color-mix(in srgb, var(--dashboard-primary) 40%, transparent)", background: "var(--dashboard-primary-subtle)" }}
                  >
                    <ArrowCounterClockwise className="w-3.5 h-3.5" aria-hidden="true" /> ভুলে চাপ? ফিরিয়ে নিন
                  </button>
                )}
              </div>
            )}
          </motion.div>
        ) : (
          <div className="rounded-2xl border p-10 text-center" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
            <p className="text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>কোনো প্রশ্ন পাওয়া যায়নি।</p>
          </div>
        )}

        {/* Sticky thumb nav, always in reach above the bottom nav */}
        <div className="sticky z-[var(--z-sticky)] bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom,0px)+8px)] lg:bottom-2 pt-2 pb-1" style={{ background: "linear-gradient(to top, var(--dashboard-surface) 70%, transparent)" }}>
          <div className="flex items-center gap-2 rounded-2xl border p-2 backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--dashboard-surface-muted) 92%, transparent)", borderColor: "var(--dashboard-border-muted)" }}>
            <button
              onClick={() => setCurrentQuestion((i) => Math.max(0, i - 1))}
              disabled={currentQuestion === 0}
              aria-label="আগের প্রশ্ন"
              className="flex-1 min-h-[48px] px-4 py-2.5 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] font-mono text-sm rounded-xl hover:bg-[var(--surface-overlay)] active:opacity-80 cursor-pointer transition-[background-color,opacity] duration-150 [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
            >
              <CaretLeft className="w-4 h-4" aria-hidden="true" /> আগের
            </button>
            <span className="text-xs text-[var(--dashboard-text-muted)] font-mono tabular-nums flex-shrink-0 px-1" aria-live="polite">
              {currentQuestion + 1}/{totalQuestions}
            </span>
            {currentQuestion < totalQuestions - 1 ? (
              <button
                onClick={() => setCurrentQuestion((i) => Math.min(totalQuestions - 1, i + 1))}
                aria-label="পরের প্রশ্ন"
                className="flex-1 min-h-[48px] px-4 py-2.5 font-mono text-sm rounded-xl cursor-pointer transition-[background-color,opacity] duration-150 [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center justify-center gap-1"
                style={{ background: "var(--dashboard-primary)", border: "1px solid var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}
              >
                পরের <CaretRight className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleSubmitRequest();
                }}
                disabled={submitting}
                aria-busy={submitting}
                aria-label="মক টেস্ট জমা দিন"
                className="flex-1 px-5 py-2.5 min-h-[48px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed z-[var(--z-sticky)] relative"
              >
                <Flag className="w-4 h-4" aria-hidden="true" />
                {submitting ? "জমা হচ্ছে..." : "জমা দিন"}
              </button>
            )}
          </div>
        </div>

        {/* Question map, horizontal scroll on mobile, sticky grid sidebar on desktop */}
        <div className="glass-card rounded-2xl border border-terminal-border p-3 lg:sticky lg:top-24">
          <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest mb-2">
            প্রশ্ন তালিকা
          </p>
          <div className="flex flex-wrap gap-1.5 md:grid md:grid-cols-8 lg:grid-cols-5" role="group" aria-label="প্রশ্ন তালিকা">
            {questions.map((qq, i) => {
              const isAnswered = answers[qq.id] !== undefined;
              const isCurrent = i === currentQuestion;
              const isFlagged = flagged[qq.id] === true;
              return (
                <button
                  key={qq.id}
                  onClick={() => setCurrentQuestion(i)}
                  className={`min-w-[44px] min-h-[44px] rounded-lg border text-xs font-mono tabular-nums cursor-pointer transition-[background-color,color,border-color] duration-150 [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] ${
                    isCurrent
                      ? "bg-[var(--dashboard-primary)] border-[var(--dashboard-primary)] text-[var(--dashboard-text-inverse)] font-bold"
                      : isFlagged
                        ? "border-[var(--dashboard-warning)] bg-[var(--dashboard-warning-subtle)] text-[var(--dashboard-warning)] font-bold hover:border-[var(--dashboard-warning)]"
                        : isAnswered
                        ? "border-[var(--dashboard-primary)]/30 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] hover:border-[var(--dashboard-primary)]/50"
                        : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-[var(--dashboard-primary)]/40"
                  }`}
                  aria-label={`প্রশ্ন ${i + 1}${isAnswered ? ", উত্তর দেওয়া হয়েছে" : ""}${isCurrent ? ", বর্তমান" : ""}${isFlagged ? ", ফ্ল্যাগ করা" : ""}`}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono" style={{ color: "var(--dashboard-text-muted)" }} aria-label="প্রশ্ন অবস্থার নির্দেশিকা">
            <li className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "var(--dashboard-primary)" }} aria-hidden="true" /> বর্তমান</li>
            <li className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full border" style={{ borderColor: "var(--dashboard-primary)", background: "var(--dashboard-primary-subtle)" }} aria-hidden="true" /> ✓ উত্তর দেওয়া</li>
            <li className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "var(--dashboard-warning)" }} aria-hidden="true" /> ⚑ ফ্ল্যাগ</li>
            <li className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full border" style={{ borderColor: "var(--dashboard-border-muted)" }} aria-hidden="true" /> ○ বাকি</li>
          </ul>
        </div>

        {submitError && (
          <p className="text-xs text-[var(--dashboard-danger)] text-center">{submitError}</p>
        )}

        {/* Unanswered confirmation sheet (portaled: see ModalPortal) */}
        <ModalPortal>
        <AnimatePresence>
          {showUnansweredConfirm && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : undefined}
              className="fixed inset-0 z-[var(--z-modal)] bg-[var(--overlay)] backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
              onClick={() => setShowUnansweredConfirm(false)}
            >
              <motion.div
                ref={confirmDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="unanswered-confirm-title"
                tabIndex={-1}
                initial={reduceMotion ? false : { y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
                drag={reduceMotion ? false : "y"}
                dragListener={false}
                dragControls={unansweredSheetControls}
                dragConstraints={{ top: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 100) setShowUnansweredConfirm(false);
                }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card rounded-t-2xl sm:rounded-2xl border border-[var(--dashboard-warning)]/30 p-5 sm:p-6 w-full sm:max-w-sm max-h-[88vh] overflow-y-auto overscroll-contain"
              >
                <div
                  className="flex items-center justify-center pb-2 sm:hidden cursor-grab active:cursor-grabbing touch-none"
                  aria-hidden="true"
                  onPointerDown={(e) => unansweredSheetControls.start(e)}
                >
                  <span className="w-9 h-1 rounded-full" style={{ background: "var(--dashboard-border-muted)" }} />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Warning className="w-5 h-5 text-[var(--dashboard-warning)]" />
                  <h3 id="unanswered-confirm-title" className="text-base font-bold text-[var(--text-primary)]">উত্তর দেওয়া বাকি আছে</h3>
                </div>
                <p className="text-sm text-[var(--dashboard-text-muted)] mb-5">
                  <span className="text-[var(--dashboard-warning)] font-mono">{totalQuestions - answeredCount}টি</span> প্রশ্নে
                  উত্তর দেওয়া হয়নি। নিশ্চিতভাবে জমা দিতে চান? না দেওয়া প্রশ্নে ০ নম্বর পাবেন।
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowUnansweredConfirm(false)}
                    className="flex-1 py-2.5 min-h-[48px] bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-secondary)] font-mono text-sm rounded-xl hover:bg-[var(--surface-overlay)] active:opacity-80 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                  >
                    ফিরে যান
                  </button>
                  <button
                    onClick={finalizeSubmit}
                    disabled={submitting}
                    aria-busy={submitting}
                    className="flex-1 py-2.5 min-h-[48px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? "জমা হচ্ছে..." : "জমা দিন"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        </ModalPortal>
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
          initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduceMotion ? { duration: 0 } : undefined}
          className="glass-card rounded-2xl border border-[var(--dashboard-primary)]/25 overflow-hidden"
        >
          <div className="p-6 text-center border-b border-terminal-border">
            <Trophy className={`w-12 h-12 mx-auto mb-3 ${
              percentage >= 80 ? "text-[var(--dashboard-warning)]" : percentage >= 50 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-danger)]"
            }`} />
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">মক টেস্ট সম্পন্ন!</h3>
            <ScoreRing percentage={summary.percentage} label="Mock test score" />
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono mb-4">{summary.percentage}% স্কোর</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-md mx-auto text-left">
              <button
                type="button"
                onClick={() => jumpToReview("correct")}
                disabled={summary.correct === 0}
                aria-label={`সঠিক ${summary.correct}টি প্রশ্ন`}
                className="rounded-xl bg-[var(--dashboard-success-subtle)] border border-[var(--dashboard-success)]/25 p-3 min-h-[64px] text-left cursor-pointer transition-[border-color,opacity] duration-150 hover:border-[var(--dashboard-success)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-success)] disabled:opacity-50 disabled:cursor-default"
              >
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">সঠিক</p>
                <p className="text-lg font-bold text-[var(--dashboard-success)] font-mono">+{summary.correct}</p>
              </button>
              <button
                type="button"
                onClick={() => jumpToReview("wrong")}
                disabled={summary.wrong === 0}
                aria-label={`ভুল ${summary.wrong}টি প্রশ্ন`}
                className="rounded-xl bg-[var(--dashboard-danger-subtle)] border border-[var(--dashboard-danger)]/25 p-3 min-h-[64px] text-left cursor-pointer transition-[border-color,opacity] duration-150 hover:border-[var(--dashboard-danger)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-danger)] disabled:opacity-50 disabled:cursor-default"
              >
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">ভুল</p>
                <p className="text-lg font-bold text-[var(--dashboard-danger)] font-mono">−{summary.wrong}</p>
              </button>
              <button
                type="button"
                onClick={() => jumpToReview("unanswered")}
                disabled={summary.unanswered === 0}
                aria-label={`উত্তর দেওয়া হয়নি ${summary.unanswered}টি প্রশ্ন`}
                className="rounded-xl bg-[var(--dashboard-teal-subtle)] border border-[var(--dashboard-teal)]/30 p-3 min-h-[64px] text-left cursor-pointer transition-[border-color,opacity] duration-150 hover:border-[var(--dashboard-teal)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-teal)] disabled:opacity-50 disabled:cursor-default"
              >
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">উত্তর দেওয়া হয়নি</p>
                <p className="text-lg font-bold text-[var(--dashboard-teal)] font-mono">{summary.unanswered}</p>
              </button>
            </div>

            <div className="max-w-md mx-auto text-left mt-4">
              <TopicBars items={result.review.map((r) => ({ subject: r.subject, topic: r.topic, status: r.status }))} />
            </div>

            <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
              <button
                onClick={resetTest}
                className="px-5 py-2.5 min-h-[48px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center gap-2"
              >
                <Play className="w-4 h-4" aria-hidden="true" /> আবার মক টেস্ট
              </button>
              {(summary.wrong + summary.unanswered) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const retryQs = questions.filter((qq) => {
                      const rv = result.review.find((r) => r.questionId === qq.id);
                      return !rv || rv.status !== "correct";
                    });
                    if (retryQs.length === 0) return;
                    clearAttemptId(STORAGE_KEY);
                    const attemptId = ensureAttemptId(STORAGE_KEY);
                    const durationSec = Math.max(60, retryQs.length * 30);
                    startedAtRef.current = Date.now();
                    totalSecRef.current = durationSec;
                    setQuestions(retryQs);
                    setAnswers({});
                    setCurrentQuestion(0);
                    setTimeRemaining(durationSec);
                    setFlagged({});
                    setUndoPick(null);
                    setReviewToggles({});
                    setHighlightedReview(null);
                    setResult(null);
                    setTestState("active");
                    requestAnimationFrame(() => scrollDashboardTop());
                    void registerExam({
                      attemptId,
                      questionIds: retryQs.map((qq) => qq.id),
                      durationSec,
                    }).catch(() => {
                      /* non-fatal, submit upserts */
                    });
                  }}
                  className="px-5 py-2.5 min-h-[48px] bg-[var(--dashboard-primary)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:brightness-110 active:opacity-90 cursor-pointer transition-all flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                >
                  <ArrowCounterClockwise className="w-4 h-4" aria-hidden="true" /> ভুলগুলো আবার ({summary.wrong + summary.unanswered})
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Review, lazy disclosures (AI mounts on open) */}
        <div className="space-y-2 max-h-96 overflow-y-auto overscroll-contain">
          <h4 className="text-sm font-medium text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider px-1">
            উত্তর পর্যালোচনা
          </h4>
          {result.review.map((r, i) => {
            const isCorrect = r.status === "correct";
            const isUnanswered = r.status === "unanswered";
            // Session-order options (see CustomExamTab): letters + AI
            // explanations derive from the arrangement the student saw.
            const displayOptions =
              questions.find((q) => q.id === r.questionId)?.options ?? r.options;
            const ringColor = isCorrect
              ? "ring-[var(--dashboard-success)]"
              : isUnanswered
                ? "ring-[var(--dashboard-teal)]"
                : "ring-[var(--dashboard-danger)]";
            const open = isReviewOpen(r.questionId, r.status);
            const verdictLabel = isCorrect ? "সঠিক" : isUnanswered ? "উত্তর বাকি" : "ভুল";
            return (
              <div
                key={r.questionId}
                id={`mock-review-${r.status}-${r.questionId}`}
                data-review-status={r.status}
                className={`rounded-xl border overflow-hidden transition-[border-color] duration-150 ${
                  isCorrect
                    ? "border-[var(--dashboard-success)]/25"
                    : r.status === "wrong"
                      ? "border-[var(--dashboard-danger)]/25"
                      : "border-[var(--dashboard-teal)]/30"
                } ${highlightedReview === r.status ? `ring-2 ${ringColor}` : ""}`}
                style={{ background: "var(--dashboard-surface)" }}
              >
                <button
                  type="button"
                  onClick={() => setReviewToggles((prev) => ({ ...prev, [r.questionId]: !isReviewOpen(r.questionId, r.status) }))}
                  aria-expanded={open}
                  aria-label={`প্রশ্ন ${i + 1}, ${verdictLabel}, ${open ? "সংকুচিত করুন" : "বিস্তারিত দেখুন"}`}
                  className="w-full flex items-center gap-3 p-3.5 min-h-[60px] text-left cursor-pointer transition-[background-color] duration-150 hover:bg-[var(--dashboard-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--dashboard-focus-ring)]"
                >
                  {isCorrect ? (
                    <CheckCircle className="w-4 h-4 text-[var(--dashboard-success)] flex-shrink-0" aria-hidden="true" />
                  ) : r.status === "wrong" ? (
                    <XCircle className="w-4 h-4 text-[var(--dashboard-danger)] flex-shrink-0" aria-hidden="true" />
                  ) : (
                    <CircleDashed className="w-4 h-4 text-[var(--dashboard-teal)] flex-shrink-0" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                      {i + 1}. <RichText text={r.question} />
                    </span>
                    <span className="block mt-1">
                      <MetaChip tone={isCorrect ? "success" : isUnanswered ? "teal" : "danger"}>
                        {verdictLabel}
                      </MetaChip>
                    </span>
                  </span>
                  <CaretRight className={`w-4 h-4 flex-shrink-0 transition-transform duration-150 ${open ? "rotate-[270deg]" : "rotate-90"}`} style={{ color: "var(--dashboard-text-muted)" }} aria-hidden="true" />
                </button>
                {open && (
                <div className="px-3.5 pb-3.5 pt-1 border-t" style={{ borderColor: "var(--dashboard-border-muted)" }}>
                  <div className="min-w-0 flex-1 pt-2">
                    <p className="text-xs font-mono" style={{ color: "var(--dashboard-text-secondary)" }}>
                      আপনার উত্তর:{" "}
                      <span style={{ color: `color-mix(in srgb, var(${isCorrect ? "--dashboard-success" : isUnanswered ? "--dashboard-teal" : "--dashboard-danger"}) 60%, var(--dashboard-text-primary))`, fontWeight: 700 }}>
                        {r.userAnswer ? <RichText text={r.userAnswer} /> : "উত্তর দেওয়া হয়নি"}
                      </span>
                    </p>
                    {!isCorrect && (
                      <p className="text-xs font-mono mt-0.5" style={{ color: "color-mix(in srgb, var(--dashboard-success) 60%, var(--dashboard-text-primary))", fontWeight: 700 }}>
                        সঠিক উত্তর: <RichText text={r.correctAnswer} />
                      </p>
                    )}
                    {r.explanation && (
                      <p className="text-xs mt-1.5" style={{ color: "var(--dashboard-text-secondary)" }}><RichText text={r.explanation} /></p>
                    )}

                    <AIExplanationButton
                      questionId={r.questionId}
                      question={r.question}
                      options={displayOptions}
                      correctAnswer={r.correctAnswer}
                      userAnswer={r.userAnswer}
                      subject={r.subject}
                      topic={r.topic}
                    />
                  </div>
                </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}