"use client";

import { useState, useMemo, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { motion, AnimatePresence, useReducedMotion, useDragControls } from "framer-motion";
import { X, Check, Play, Timer, BookOpen, Trophy, ArrowCounterClockwise, Warning, CheckCircle, XCircle, Minus, Plus, GridFour, List, Clock, Flag, CircleDashed, Spinner, CaretRight, } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { useScrollLock } from "@/lib/use-scroll-lock";
import {
  CUSTOM_EXAM_KEY,
  loadExamSnapshot,
  saveExamSnapshot,
  dropExamSnapshot,
  clearOtherExams,
} from "@/lib/exam-persist";
import { useEcosystem } from "@/lib/ecosystem-ctx";
import { autoDurationMin, autoDurationSec, formatDurationShort, negativeLabelForEcosystem } from "@/lib/exam-scoring";
import {
  submitExamAttempt as canonicalSubmitExamAttempt,
  registerExam,
  ensureAttemptId,
  clearAttemptId,
  recoverPendingSubmission,
} from "@/lib/services/exam-submission";
import type { Server } from "@/lib/types";
import { shuffleSessionOptions } from "@/lib/shuffle-options";
import SubjectTopicSelect from "./SubjectTopicSelect";
import ModalPortal from "@/components/ui/ModalPortal";
import MetaChip from "./practice/MetaChip";
import SessionTimer from "./practice/SessionTimer";
import ScoreRing from "./practice/ScoreRing";
import SmartMixButton from "./practice/SmartMixButton";
import TopicBars from "./practice/TopicBars";
import AIExplanationButton from "./AIExplanationButton";
import RichText from "@/components/ui/RichText";
import Button from "@/components/ui/Button";
import {
  type Selection,
  flattenNodes,
  findNodeByPath,
  availableForSubject,
  buildExamSelectionRequest,
} from "./TopicTreePicker";

type ExamPhase = "config" | "exam" | "result";

const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: "সহজ",
  MEDIUM: "মাঝারি",
  HARD: "কঠিন",
};

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

const STORAGE_KEY = CUSTOM_EXAM_KEY;

type PersistedExam = {
  examId: string;
  /** Client-minted idempotency token. Persisted alongside the exam so the
   * submit retry uses the same token and the server can dedupe. */
  attemptId: string;
  questions: Server.ExamQuestionDTO[];
  answers: Record<number, string>;
  startsAt: number;
  durationSec: number;
  requested: number;
  available: number;
  shortfall: number;
  /** Paginated position — persisted so refresh resumes on the same question. */
  currentIndex: number;
};

// Shared wall-clock session countdown (single seam for all exam modes).
// The deadline derives from startsAt + durationSec — the 1s interval only
// re-renders this leaf, so answering never resets the clock.
function ExamTimer({
  startsAt,
  durationSec,
  onExpire,
}: {
  startsAt: number;
  durationSec: number;
  onExpire: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Timer className="w-4 h-4 text-[var(--dashboard-primary)]" aria-hidden="true" />
      <SessionTimer startsAt={startsAt} durationSec={durationSec} onExpire={onExpire} />
    </span>
  );
}

function performanceLabel(percentage: number): { label: string; tone: string } {
  if (percentage >= 80) return { label: "চমৎকার", tone: "text-[var(--dashboard-warning)]" };
  if (percentage >= 60) return { label: "ভালো", tone: "text-[var(--dashboard-primary)]" };
  if (percentage >= 40) return { label: "গড়", tone: "text-[var(--warning)]" };
  return { label: "উন্নতি প্রয়োজন", tone: "text-[var(--dashboard-danger)]" };
}

export default function CustomExamTab() {
  const { ecosystem } = useEcosystem();

  // ── Config state ──
  const [subjects, setSubjects] = useState<Server.ExamSubjectDTO[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({});
  const [durationMin, setDurationMin] = useState(15);
  const [durationTouched, setDurationTouched] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  // ── Exam state ──
  const [exam, setExam] = useState<PersistedExam | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  // Paginated workspace: one question at a time (default — only the active
  // card mounts, so 100+ question exams stay fast) with an "all" fallback
  // that keeps the legacy scroll-everything layout.
  const [examView, setExamView] = useState<"one" | "all">("one");
  const [examIndex, setExamIndex] = useState(0);

  const [phase, setPhase] = useState<ExamPhase>("config");
  const [showUnansweredConfirm, setShowUnansweredConfirm] = useState(false);
  const closeUnansweredConfirm = useCallback(() => setShowUnansweredConfirm(false), []);
  const unansweredDialogRef = useDialogA11y<HTMLDivElement>(showUnansweredConfirm, closeUnansweredConfirm);
  const closeBuildConfirm = useCallback(() => {
    if (!buildLoading) setShowConfirm(false);
  }, [buildLoading]);
  const buildConfirmDialogRef = useDialogA11y<HTMLDivElement>(showConfirm, closeBuildConfirm);
  useScrollLock(showConfirm || showUnansweredConfirm);
  // Mobile-app chrome: reduced-motion gates all sheet/modal entrances;
  // drag controls power handle-only sheet dismissal (list keeps scrolling).
  const reduceMotion = useReducedMotion();
  const buildSheetControls = useDragControls();
  const unansweredSheetControls = useDragControls();
  const [submitting, setSubmitting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const submittingRef = useRef(false);

  // ── Result state ──
  const [result, setResult] = useState<Server.ExamResultDTO | null>(null);
  const [highlightedReview, setHighlightedReview] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  // Lazy review disclosures: wrong/unanswered auto-expand (AI mounts on open).
  // Derived defaults (open unless correct) + explicit user toggles — no
  // setState-in-effect, so the React compiler stays happy.
  const [reviewToggles, setReviewToggles] = useState<Record<number, boolean>>({});
  const isReviewOpen = useCallback((questionId: number, status: string) => {
    const toggled = reviewToggles[questionId];
    return toggled !== undefined ? toggled : status !== "correct";
  }, [reviewToggles]);

  // Jump from the result summary tiles to the first review item in a state
  // (correct/wrong/unanswered). Opens the item, scrolls it into view, flashes a ring.
  // Plain function (no manual useCallback): the React compiler memoizes it;
  // a manual dep list here trips preserve-manual-memoization.
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
    const el = document.getElementById(`exam-review-${status}`);
    if (el && typeof el.scrollIntoView === "function") {
      const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: prefersReduced ? "instant" as ScrollBehavior : "smooth", block: "start", inline: "nearest" });
    }
  };

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  // Always start at the top when entering exam or showing results — otherwise
  // the dashboard's scrollable container (#dashboard-content) keeps its previous
  // offset and the user lands in the middle of the questions or review.
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

  useEffect(() => {
    if (phase === "exam" || phase === "result") {
      // Wait for the phase's DOM to mount before scrolling.
      const id = requestAnimationFrame(() => scrollDashboardTop());
      return () => cancelAnimationFrame(id);
    }
  }, [phase, scrollDashboardTop]);

  // Load the exam configuration tree. State changes happen after `await`, so
  // no render-phase impurity or effect-driven cascade is introduced.
  const fetchConfig = useCallback(async () => {
    try {
      const list = await api.examConfig(ecosystem);
      setSubjects(list);
    } catch {
      setConfigError("কনফিগারেশন লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setConfigLoading(false);
    }
  }, [ecosystem]);

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
    return () => { cancelled = true; };
  }, [ecosystem]);

  const handleRetryConfig = () => {
    setConfigLoading(true);
    setConfigError(null);
    void fetchConfig();
  };

  // Resume an in-progress exam from localStorage so refresh/navigation does not
  // corrupt an active attempt. Runs after an async boundary; the countdown
  // effect auto-submits if the timer already ran out while away. An interrupted
  // submission is finalized FIRST via idempotent recovery.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const recovered = await recoverPendingSubmission(STORAGE_KEY);
        if (cancelled) return;
        if (recovered) {
          clearAttemptId(STORAGE_KEY);
          dropExamSnapshot(STORAGE_KEY);
          setResult(recovered.result);
          setPhase("result");
          return;
        }
      } catch {
        /* network still unusable — fall through to resume; submit will retry */
      }
      if (cancelled) return;
      {
        const saved = loadExamSnapshot<PersistedExam>(STORAGE_KEY);
        if (!saved) return;
        // If the exam had a fixed duration and the wall-clock time has since
        // elapsed beyond the grace window, the server will reject the submit
        // (ATTEMPT_DEADLINE_EXCEEDED). Drop the stale resume instead of
        // surfacing an unresolvable error.
        if (saved.durationSec > 0) {
          const elapsedSec = Math.floor((Date.now() - saved.startsAt) / 1000);
          if (elapsedSec >= saved.durationSec + 15) {
            dropExamSnapshot(STORAGE_KEY);
            return;
          }
        }
        // Resume uses the persisted attemptId if present, otherwise mints a
        // new one — but in that case a server-side re-register is required.
        // For simplicity we always mint on resume if missing, then fire-and-
        // forget the register call below.
        const attemptId = saved.attemptId ?? ensureAttemptId(STORAGE_KEY);
        const withAttempt: PersistedExam = { ...saved, attemptId };
        saveExamSnapshot(STORAGE_KEY, withAttempt);
        setExam(withAttempt);
        setAnswers(saved.answers ?? {});
        setExamIndex(Math.min(saved.currentIndex ?? 0, Math.max(0, saved.questions.length - 1)));
        setPhase("exam");
        // Always re-register on resume: idempotent, and with server-side
        // IN_PROGRESS hash adoption it heals a token whose row still holds an
        // older question-set hash (stale build reuse) so the submit can't 409.
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

  // ── Selection helpers ──
  const selectedSubjects = useMemo(
    () => subjects.filter((s) => selection[s.id] !== undefined),
    [subjects, selection],
  );

  const availableTotal = useMemo(() => {
    let total = 0;
    for (const s of selectedSubjects) {
      total += availableForSubject(s, selection);
    }
    return total;
  }, [selectedSubjects, selection]);

  const selectedGroupCount = useMemo(
    () =>
      selectedSubjects.reduce((acc, s) => {
        const sel = selection[s.id];
        const nodes = flattenNodes(s.nodes);
        if (sel.paths.length === 0) return acc + nodes.filter((n) => n.depth === 1).length;
        return acc + sel.paths.filter((p) => findNodeByPath(s.nodes, p)?.depth === 1).length;
      }, 0),
    [selectedSubjects, selection],
  );

  const selectedSubTopicCount = useMemo(
    () =>
      selectedSubjects.reduce((acc, s) => {
        const sel = selection[s.id];
        const nodes = flattenNodes(s.nodes);
        if (sel.paths.length === 0) return acc + nodes.filter((n) => n.depth > 1).length;
        return acc + sel.paths.filter((p) => (findNodeByPath(s.nodes, p)?.depth ?? 1) > 1).length;
      }, 0),
    [selectedSubjects, selection],
  );

  // Total across all selected subjects = sum of per-subject counts.
  const totalCount = useMemo(
    () => selectedSubjects.reduce((acc, s) => acc + (selection[s.id].count ?? 0), 0),
    [selectedSubjects, selection],
  );

  const overageSubjects = useMemo(
    () =>
      selectedSubjects.filter(
        (s) => (selection[s.id].count ?? 0) > availableForSubject(s, selection),
      ),
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

  const buildSelectionRequest = (): Server.ExamSelectionRequest =>
    buildExamSelectionRequest(selectedSubjects, selection, totalCount, durationMin * 60);

  const confirmAndStart = async () => {
    setBuildLoading(true);
    setBuildError(null);
    try {
      const built = await api.buildExam(buildSelectionRequest());
      if (built.questions.length === 0) {
        setBuildError("এই কনফিগারেশনে কোনো প্রশ্ন পাওয়া যায়নি।");
        return;
      }
      // A fresh exam build MUST bind to a brand-new attempt token. The token
      // is only cleared on a confirmed successful submit, so without this a
      // rebuild after an abandoned/failed attempt would REUSE the old UUID —
      // the server keeps the old question-set hash for that token and every
      // submit of the new exam 409s with ATTEMPT_HASH_MISMATCH.
      clearAttemptId(STORAGE_KEY);
      const attemptId = ensureAttemptId(STORAGE_KEY);
      // Serve-time option shuffle, seeded by the attempt: stable for this
      // exam (answering, review, AI explanations) and fresh next attempt.
      // Grading + hash are id/text-based, so display order is free.
      const persisted: PersistedExam = {
        examId: built.examId,
        attemptId,
        questions: shuffleSessionOptions(built.questions, `exam-${attemptId}`),
        answers: {},
        startsAt: Date.now(),
        durationSec: built.durationSec,
        requested: built.requested,
        available: built.available,
        shortfall: built.shortfall,
        currentIndex: 0,
      };
      saveExamSnapshot(STORAGE_KEY, persisted);
      clearOtherExams(STORAGE_KEY);
      setExam(persisted);
      setAnswers({});
      setExamIndex(0);
      setExamView("one");
      setShowConfirm(false);
      setPhase("exam");
      // Best-effort: register the attempt server-side so /api/exam/submit has
      // a row to upsert. A failure here is non-fatal — submit will retry the
      // upsert path itself.
      void registerExam({
        attemptId,
        questionIds: built.questions.map((q) => q.id),
        durationSec: built.durationSec,
      }).catch(() => {
        /* ignore — submit will surface a real error if it actually fails */
      });
    } catch {
      setBuildError("পরীক্ষা তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBuildLoading(false);
    }
  };

  const selectAnswer = (questionId: number, option: string) => {
    // One answer per question: locked once answered (lock derives from
    // answers presence, so it survives resume).
    if (answers[questionId] !== undefined) return;
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: option };
      if (exam) {
        saveExamSnapshot(STORAGE_KEY, { ...exam, answers: next, currentIndex: examIndex });
      }
      return next;
    });
  };

  // Paginated jumps persist the position so refresh resumes mid-exam.
  // Plain function (no manual useCallback): the React compiler memoizes it;
  // a manual dep list here trips preserve-manual-memoization (see jumpToReview).
  const gotoExamQuestion = (i: number) => {
    const snap = examRef.current;
    const total = snap?.questions.length ?? 0;
    if (total === 0) return;
    const next = Math.max(0, Math.min(total - 1, i));
    setExamIndex(next);
    if (snap) saveExamSnapshot(STORAGE_KEY, { ...snap, currentIndex: next });
    requestAnimationFrame(() => scrollDashboardTop());
  };

  const scrollToQuestion = (questionId: number) => {
    if (examView === "one") {
      const idx = examRef.current?.questions.findIndex((q) => q.id === questionId) ?? -1;
      if (idx >= 0) gotoExamQuestion(idx);
      return;
    }
    questionRefs.current[questionId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = exam?.questions.length ?? 0;
  const unanswered = totalQuestions - answeredCount;

  // Keep latest exam/answers in refs so timer expiry and rapid clicks never use a stale closure.
  const examRef = useRef(exam);
  const answersRef = useRef(answers);
  useEffect(() => { examRef.current = exam; }, [exam]);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // Safe navigation: block route/tab change and tab close while submission is in flight.
  useEffect(() => {
    if (!submitting && !reconciling) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [submitting, reconciling]);

  const submit = useCallback(
    async (qs: Server.ExamQuestionDTO[], ans: Record<number, string>) => {
      // Deterministic snapshot — captured synchronously at call time, never read
      // from async React state after the click.
      const snapshotQs = [...qs];
      const snapshotAns = { ...ans };
      // Never a silent no-op: every click path ends in a visible outcome.
      if (snapshotQs.length === 0) {
        setSubmitError("পরীক্ষার প্রশ্ন পাওয়া যায়নি। আবার চেষ্টা করুন।");
        return;
      }
      const examSnapshot = examRef.current;
      if (!examSnapshot?.attemptId) {
        setSubmitError("পরীক্ষার সেশন শনাক্ত করা যায়নি। পৃষ্ঠা রিফ্রেশ করে আবার চেষ্টা করুন।");
        return;
      }
      // Immediate ref guard — React state `submitting` is async; the ref prevents wedging on rapid hits
      // while the canonical `submitExamAttempt` rendezvous ensures duplicate hits JOIN instead of being dropped.
      if (submittingRef.current) {
        // A submission is already in flight — the canonical layer will join it; just surface busy state.
        setSubmitting(true);
        return;
      }
      submittingRef.current = true;
      setSubmitting(true);
      setReconciling(false);
      setSubmitError(null);
      try {
        const elapsedSec = Math.max(
          0,
          Math.floor((Date.now() - examSnapshot.startsAt) / 1000),
        );
        const { result } = await canonicalSubmitExamAttempt({
          attemptId: examSnapshot.attemptId,
          questionIds: snapshotQs.map((q) => q.id),
          durationSec: elapsedSec,
          answers: snapshotAns,
          storageKey: STORAGE_KEY,
        });
        setResult(result);
        setPhase("result");
        dropExamSnapshot(STORAGE_KEY);
        clearAttemptId(STORAGE_KEY);
      } catch (err) {
        const msg = err instanceof Error && err.message ? err.message : "ফলাফল জমা দেওয়া যায়নি। আবার চেষ্টা করুন।";
        // If the error looks like a network/timeout, offer reconciliation state
        if (msg.includes("TIMEOUT") || msg.includes("NETWORK_ERROR") || msg.includes("timed out")) {
          setReconciling(true);
          setSubmitError("সংযোগ বিচ্ছিন্ন হয়েছে — অবস্থা যাচাই করা হচ্ছে...");
          // Auto-reconcile once: if server already committed, we will recover on next mount via pending
        }
        setSubmitError(msg);
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
        setReconciling(false);
      }
    },
    [],
  );

  const handleSubmitRequest = useCallback(() => {
    const snapExam = examRef.current;
    const snapAnswers = answersRef.current;
    if (!snapExam) {
      setSubmitError("পরীক্ষা শনাক্ত করা যায়নি। আবার চেষ্টা করুন।");
      return;
    }
    const snapUnanswered = (snapExam.questions.length ?? 0) - Object.keys(snapAnswers).length;
    if (snapUnanswered > 0) {
      setShowUnansweredConfirm(true);
    } else {
      void submit(snapExam.questions, snapAnswers);
    }
  }, [submit]);

  const finalizeSubmit = useCallback(() => {
    setShowUnansweredConfirm(false);
    const snapExam = examRef.current;
    const snapAnswers = answersRef.current;
    if (snapExam) void submit(snapExam.questions, snapAnswers);
  }, [submit]);

  const resetAll = () => {
    setPhase("config");
    setExam(null);
    setAnswers({});
    setExamIndex(0);
    setExamView("one");
    setResult(null);
    setSubmitError(null);
    setShowUnansweredConfirm(false);
    setSelection({});
    setDurationMin(15);
    setDurationTouched(false);
    setReviewToggles({});
    setHighlightedReview(null);
    dropExamSnapshot(STORAGE_KEY);
  };

  // ═══════════════ CONFIG PHASE ═══════════════
  if (phase === "config") {
    return (
      <div className="space-y-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl border border-terminal-border"
        >
          <div className="p-5 md:p-6">
            <p className="command-eyebrow mb-2">Custom Exam</p>
            <div className="flex items-center gap-2 mb-1">
              <GridFour className="w-5 h-5 text-[var(--dashboard-primary)]" />
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{ecosystem === "BCS" ? "কাস্টম বিসিএস পরীক্ষা" : "Custom Bank Exam"}</h2>
            </div>
            <p className="text-xs text-[var(--dashboard-text-muted)]">
              বিষয়, টপিক ও সাবটপিক বেছে নিয়ে নিজের পছন্দের পরীক্ষা তৈরি করুন — নেগেটিভ মার্কিং সহ বাস্তব {ecosystem === "BCS" ? "বিসিএস" : "ব্যাংক"} ধাঁচে (ভুল {negativeLabel})।
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
            <Button variant="primary" size="sm" className="mt-4" onClick={handleRetryConfig}>
              আবার চেষ্টা করুন
            </Button>
          </div>
        )}

        {!configLoading && !configError && (
          <>
            <SmartMixButton subjects={subjects} totalQuestions={20} onApply={setSelection} />
            <SubjectTopicSelect
              subjects={subjects}
              selection={selection}
              onSelectionChange={setSelection}
            />

            {/* Total question count + duration */}
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
                  <p className="text-xs text-[var(--dashboard-text-muted)] mt-0.5">
                    {durationMin} মিনিট{durationTouched ? " (নিজে নির্ধারিত)" : totalCount > 0 ? ` (অটো: ${totalCount}×৩০সে = ${formatDurationShort(autoDurationSec(totalCount))})` : " (অটো: ৩০সে/প্রশ্ন)"} (প্রশ্নপ্রতি ~{Math.max(1, Math.round(durationMin / Math.max(1, totalCount)))} মি.)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustDuration(-1)}
                    className="w-11 h-11 rounded-lg bg-[var(--surface-raised)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--primary)]/40 active:scale-95 transition-all"
                    aria-label="সময় কমান"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-2xl font-bold text-[var(--dashboard-primary)] font-mono w-8 text-center">{durationMin}</span>
                  <button
                    onClick={() => adjustDuration(1)}
                    className="w-11 h-11 rounded-lg bg-[var(--surface-raised)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--primary)]/40 active:scale-95 transition-all"
                    aria-label="সময় বাড়ান"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {insufficient && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--warning)]/30 bg-[var(--dashboard-warning-subtle)] p-3 text-xs text-[var(--dashboard-warning)]">
                <Warning className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  নির্বাচিত টপিক থেকে শুধু <span className="font-mono">{availableTotal}টি</span> প্রশ্ন
                  পাওয়া যায় — মোট <span className="font-mono">{totalCount}টি</span> চাওয়া হয়েছে।
                </p>
              </div>
            )}

            {overageSubjects.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--warning)]/30 bg-[var(--dashboard-warning-subtle)] p-3 text-xs text-[var(--dashboard-warning)]">
                <Warning className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  {overageSubjects.map((s) => s.nameBn).join(", ")} এ চাওয়া প্রশ্ন সংখ্যা উপলব্ধের বেশি —
                  সর্বোচ্চ <span className="font-mono">{availableForSubject(overageSubjects[0], selection)}টি</span> হবে।
                </p>
              </div>
            )}

            {buildError && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--dashboard-danger-subtle)] p-3 text-xs text-[var(--dashboard-danger)]">
                <Warning className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{buildError}</p>
              </div>
            )}

            {/* Live config summary */}
            <motion.div
              layout
              className="glass-card rounded-2xl border border-[var(--primary)]/30 p-4"
            >
              <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest mb-2">লাইভ কনফিগারেশন সামারি</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <List className="w-4 h-4 mx-auto text-[var(--dashboard-primary)] mb-1" />
                  <p className="text-lg font-bold text-[var(--text-primary)] font-mono">{selectedSubjects.length}</p>
                  <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">বিষয়</p>
                </div>
                <div>
                  <BookOpen className="w-4 h-4 mx-auto text-[var(--dashboard-primary)] mb-1" />
                  <p className="text-lg font-bold text-[var(--text-primary)] font-mono">{selectedGroupCount}</p>
                  <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">টপিক</p>
                </div>
                <div>
                  <CircleDashed className="w-4 h-4 mx-auto text-[var(--dashboard-primary)] mb-1" />
                  <p className="text-lg font-bold text-[var(--text-primary)] font-mono">{selectedSubTopicCount}</p>
                  <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">সাবটপিক</p>
                </div>
                <div>
                  <Clock className="w-4 h-4 mx-auto text-[var(--dashboard-primary)] mb-1" />
                  <p className="text-lg font-bold text-[var(--text-primary)] font-mono">
                    {totalCount}
                    <span className="text-xs text-[var(--dashboard-text-muted)] ml-1">প্র.</span>
                  </p>
                  <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">{durationMin} মিনিট</p>
                </div>
              </div>
            </motion.div>

            {/* Sticky config dock — thumb-reachable above the bottom nav */}
            <div className="sticky z-[var(--z-sticky)] bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom,0px)+8px)] lg:bottom-2 mt-4">
              <button
                onClick={() => setShowConfirm(true)}
                disabled={selectedSubjects.length === 0 || totalCount === 0 || buildLoading}
                className="w-full py-3 min-h-[52px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-2xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ boxShadow: "var(--dashboard-shadow-md)" }}
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                কনফিগারেশন রিভিউ করে শুরু করুন{totalCount > 0 ? ` · ${totalCount}টি` : ""}
              </button>
            </div>

            {/* Confirm sheet — bottom sheet on mobile, centered dialog on desktop.
                Portaled (see ModalPortal): inline sheets trap under the
                mobile bottom nav. */}
            <ModalPortal>
            <AnimatePresence>
              {showConfirm && (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : undefined}
                  className="fixed inset-0 z-[var(--z-modal)] bg-[var(--overlay)] backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
                  onClick={closeBuildConfirm}
                >
                  <motion.div
                    ref={buildConfirmDialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="পরীক্ষা নিশ্চিত করুন"
                    tabIndex={-1}
                    initial={reduceMotion ? false : { y: 24, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
                    drag={reduceMotion ? false : "y"}
                    dragListener={false}
                    dragControls={buildSheetControls}
                    dragConstraints={{ top: 0 }}
                    dragElastic={0.2}
                    onDragEnd={(_, info) => {
                      if (info.offset.y > 100) closeBuildConfirm();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="glass-card rounded-t-2xl sm:rounded-2xl border border-[var(--dashboard-primary)]/25 p-5 sm:p-6 w-full sm:max-w-md max-h-[88vh] overflow-y-auto overscroll-contain"
                  >
                    <div
                      className="flex items-center justify-center pb-2 sm:hidden cursor-grab active:cursor-grabbing touch-none"
                      aria-hidden="true"
                      onPointerDown={(e) => buildSheetControls.start(e)}
                    >
                      <span className="w-9 h-1 rounded-full" style={{ background: "var(--dashboard-border-muted)" }} />
                    </div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-[var(--text-primary)]">পরীক্ষা নিশ্চিত করুন</h3>
                      <button
                        onClick={() => setShowConfirm(false)}
                        disabled={buildLoading}
                        className="inline-flex items-center justify-center w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] disabled:opacity-40"
                        aria-label="বন্ধ করুন"
                      >
                        <X className="w-5 h-5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="space-y-2 mb-5">
                      <p className="flex justify-between text-xs">
                        <span className="text-[var(--dashboard-text-muted)] font-mono">বিষয়</span>
                        <span className="text-[var(--text-primary)] font-mono">{selectedSubjects.map((s) => s.nameBn).join(", ")}</span>
                      </p>
                      <p className="flex justify-between text-xs">
                        <span className="text-[var(--dashboard-text-muted)] font-mono">টপিক / সাবটপিক</span>
                        <span className="text-[var(--text-primary)] font-mono">{selectedGroupCount} / {selectedSubTopicCount}</span>
                      </p>
                      <p className="flex justify-between text-xs">
                        <span className="text-[var(--dashboard-text-muted)] font-mono">প্রশ্ন</span>
                        <span className="text-[var(--dashboard-primary)] font-mono">{totalCount}টি</span>
                      </p>
                      <p className="flex justify-between text-xs">
                        <span className="text-[var(--dashboard-text-muted)] font-mono">সময়</span>
                        <span className="text-[var(--dashboard-primary)] font-mono">{durationMin} মিনিট</span>
                      </p>
                      <p className="flex justify-between text-xs">
                        <span className="text-[var(--dashboard-text-muted)] font-mono">স্কোরিং</span>
                        <span className="text-[var(--text-primary)] font-mono">সঠিক +১ • ভুল {negativeLabel} • না দেওয়া ০</span>
                      </p>
                    </div>

                    {insufficient && (
                      <p className="text-[11px] text-[var(--dashboard-warning)] mb-4 flex items-center gap-1.5">
                        <Warning className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                        শুধু {availableTotal}টি প্রশ্ন উপলব্ধ — {totalCount}টি চাওয়া হয়েছে।
                      </p>
                    )}

                    <button
                      onClick={() => void confirmAndStart()}
                      disabled={buildLoading}
                      className="w-full py-3 min-h-[52px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {buildLoading ? "তৈরি হচ্ছে..." : (
                        <>
                          <Play className="w-4 h-4" /> পরীক্ষা শুরু করুন
                        </>
                      )}
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            </ModalPortal>
          </>
        )}
      </div>
    );
  }

  // ═══════════════ EXAM PHASE ═══════════════
  // Live exam workspace — the root carries data-exam-session (see
  // PracticeTab note) so shell digit→tab shortcuts stay inert here.
  if (phase === "exam" && exam) {
    const progressPct = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

    return (
      <div className="space-y-4 lg:max-w-4xl lg:mx-auto" data-exam-session="custom-exam">
        {/* Sticky header: timer + progress + submit */}
        <div className="sticky top-0 z-[var(--z-sticky)] -mx-1 px-1 pt-1">
          <div className="glass-card rounded-2xl border border-[var(--dashboard-primary)]/25 px-4 py-3 backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--dashboard-surface) 88%, transparent)" }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <ExamTimer
                  startsAt={exam.startsAt}
                  durationSec={exam.durationSec}
                  onExpire={() => {
                    const snap = examRef.current;
                    const snapAns = answersRef.current;
                    if (snap) void submit(snap.questions, snapAns);
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">
                  উত্তর: <span className="text-[var(--dashboard-primary)]">{answeredCount}</span> / {totalQuestions}
                </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSubmitRequest();
              }}
              disabled={submitting || totalQuestions === 0}
              aria-busy={submitting}
              aria-label="পরীক্ষা জমা দিন"
              className="px-4 py-2 min-h-[48px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs font-bold rounded-xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed z-[var(--z-sticky)] relative pointer-events-auto"
            >
              <Flag className="w-3.5 h-3.5" />
              {(submitting || reconciling) ? (reconciling ? "যাচাই করা হচ্ছে..." : "জমা হচ্ছে...") : "জমা দিন"}
            </button>

              </div>
            </div>
            <div className="h-1.5 bg-[var(--surface-overlay)] rounded-full overflow-hidden mt-2" role="progressbar" aria-label="Exam progress" aria-valuemin={0} aria-valuemax={totalQuestions} aria-valuenow={answeredCount}>
              <div
                className="h-full w-full origin-left bg-[var(--dashboard-primary)] rounded-full transition-transform duration-200"
                style={{ transform: `scaleX(${progressPct / 100})` }}
              />
            </div>
          </div>
        </div>

        {/* Question palette (jump navigation) — shared pattern with quick
            practice: current/answered/unanswered distinguishable by label +
            legend, never color alone. */}
        <div className="glass-card rounded-2xl border border-terminal-border p-3 lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-2">
              <CircleDashed className="w-3.5 h-3.5 text-[var(--dashboard-primary)]" aria-hidden="true" />
              <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest">প্রশ্ন তালিকা</p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--dashboard-border-muted)" }} role="group" aria-label="প্রশ্ন দেখার ধরন">
              <button
                type="button"
                onClick={() => setExamView("one")}
                aria-pressed={examView === "one"}
                className={`min-h-[44px] px-3 rounded-md font-mono text-[11px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] ${examView === "one" ? "bg-[var(--dashboard-primary)] text-[var(--dashboard-text-inverse)] font-bold" : "text-[var(--dashboard-text-muted)]"}`}
              >
                একটি করে
              </button>
              <button
                type="button"
                onClick={() => setExamView("all")}
                aria-pressed={examView === "all"}
                className={`min-h-[44px] px-3 rounded-md font-mono text-[11px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] ${examView === "all" ? "bg-[var(--dashboard-primary)] text-[var(--dashboard-text-inverse)] font-bold" : "text-[var(--dashboard-text-muted)]"}`}
              >
                সবগুলো
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 md:grid md:grid-cols-8 lg:grid-cols-6" role="group" aria-label="প্রশ্ন তালিকা">
            {exam.questions.map((q, i) => {
              const isAnswered = answers[q.id] !== undefined;
              const isCurrent = examView === "one" && i === examIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => scrollToQuestion(q.id)}
                  className={`min-w-11 min-h-11 rounded-lg border text-xs font-mono cursor-pointer transition-[background-color,color,border-color] duration-150 [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center justify-center ${
                    isCurrent
                      ? "bg-[var(--dashboard-primary)] border-[var(--dashboard-primary)] text-[var(--dashboard-text-inverse)] font-bold"
                      : isAnswered
                      ? "border-[var(--dashboard-primary)]/40 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                      : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-[var(--dashboard-primary)]/40"
                  }`}
                  aria-label={`প্রশ্ন ${i + 1}${isAnswered ? " — উত্তর দেওয়া" : " — বাকি"}${isCurrent ? " — বর্তমান" : ""}`}
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
            <li className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full border" style={{ borderColor: "var(--dashboard-border-muted)" }} aria-hidden="true" /> ○ বাকি</li>
          </ul>
        </div>

        {examView === "one" ? (
          (() => {
            const q = exam.questions[examIndex];
            if (!q) return null;
            const userAnswer = answers[q.id];
            return (
              <div className="space-y-4">
                <div
                  key={q.id}
                  id={`exam-q-${q.id}`}
                  className="glass-card rounded-2xl border border-terminal-border p-4 md:p-5 scroll-mt-32"
                >
                  <p className="sr-only" aria-live="polite">প্রশ্ন {examIndex + 1} / {totalQuestions}</p>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-secondary)]">
                      প্রশ্ন {examIndex + 1} / {totalQuestions}
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
                    {userAnswer !== undefined && (
                      <span className="ml-auto px-2 py-0.5 rounded bg-[var(--dashboard-primary-subtle)] border border-[var(--primary)]/20 text-[10px] font-mono text-[var(--dashboard-primary)]">
                        ✓ উত্তর দেওয়া হয়েছে
                      </span>
                    )}
                  </div>

                  <div className="rounded-xl border p-4 mb-4 min-w-0" style={{ background: "var(--dashboard-surface-raised)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}>
                    <h3 className="text-sm md:text-[15px] font-semibold leading-relaxed break-words [overflow-wrap:anywhere]" style={{ color: "var(--dashboard-text-primary)", lineHeight: "1.7" }}><RichText text={q.question} /></h3>
                  </div>

                  <div className="space-y-2.5">
                    {q.options.map((option, i) => {
                      const isSelected = userAnswer === option;
                      const isLocked = userAnswer !== undefined;
                      return (
                        <button
                          key={i}
                          onClick={() => selectAnswer(q.id, option)}
                          disabled={isLocked}
                          aria-pressed={isSelected}
                          className="w-full text-left p-3 min-h-[52px] rounded-xl border cursor-pointer transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] disabled:cursor-not-allowed"
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
                            <span className="text-sm font-medium min-w-0 break-words"><RichText text={option} /></span>
                            {isSelected && <Check className="w-4 h-4 ml-auto flex-shrink-0" style={{ color: "var(--dashboard-primary)" }} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {userAnswer !== undefined && (
                    <p role="status" className="inline-flex items-center gap-1.5 text-xs font-mono rounded-full border px-3 py-1.5 mt-2" style={{ color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" /> উত্তর লক হয়েছে
                    </p>
                  )}
                </div>

                <div className="sticky z-[var(--z-sticky)] bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom,0px)+8px)] lg:bottom-2 pt-2 pb-1" style={{ background: "linear-gradient(to top, var(--dashboard-surface) 70%, transparent)" }}>
                  <div className="flex items-center gap-2 rounded-2xl border p-2 backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--dashboard-surface-muted) 92%, transparent)", borderColor: "var(--dashboard-border-muted)" }}>
                    <button
                      type="button"
                      onClick={() => gotoExamQuestion(examIndex - 1)}
                      disabled={examIndex === 0}
                      aria-label="আগের প্রশ্ন"
                      className="flex-1 min-h-[48px] px-4 py-2.5 border font-mono text-sm rounded-xl cursor-pointer transition-[background-color,color,border-color,opacity] duration-150 [touch-action:manipulation] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                      style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}
                    >
                      আগের
                    </button>
                    <span className="text-xs font-mono tabular-nums flex-shrink-0 px-1" style={{ color: "var(--dashboard-text-muted)" }} aria-live="polite">
                      {examIndex + 1}/{totalQuestions}
                    </span>
                    {examIndex < totalQuestions - 1 ? (
                      <button
                        type="button"
                        onClick={() => gotoExamQuestion(examIndex + 1)}
                        aria-label="পরের প্রশ্ন"
                        className="flex-1 min-h-[48px] px-4 py-2.5 border font-mono text-sm rounded-xl cursor-pointer transition-[background-color,opacity] duration-150 [touch-action:manipulation] flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                        style={{ background: "var(--dashboard-primary)", borderColor: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}
                      >
                        পরের
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); handleSubmitRequest(); }}
                        disabled={submitting}
                        aria-busy={submitting}
                        aria-label="পরীক্ষা জমা দিন"
                        className="flex-1 px-5 py-2.5 min-h-[48px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Flag className="w-4 h-4" aria-hidden="true" />
                        {submitting ? "জমা হচ্ছে..." : "জমা দিন"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
        <>
        {/* All questions, vertically scrollable */}
        <div className="space-y-4">
          {exam.questions.map((q, index) => {
            const userAnswer = answers[q.id];
            return (
              <div
                key={q.id}
                ref={(el) => { questionRefs.current[q.id] = el; }}
                id={`exam-q-${q.id}`}
                className="glass-card rounded-2xl border border-terminal-border p-4 md:p-5 scroll-mt-32"
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-secondary)]">
                    প্রশ্ন {index + 1}
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
                  {userAnswer !== undefined && (
                    <span className="ml-auto px-2 py-0.5 rounded bg-[var(--dashboard-primary-subtle)] border border-[var(--primary)]/20 text-[10px] font-mono text-[var(--dashboard-primary)]">
                      ✓ উত্তর দেওয়া হয়েছে
                    </span>
                  )}
                </div>

                <div className="rounded-xl border p-4 mb-4" style={{ background: "var(--dashboard-surface-raised)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}>
                  <h3 className="text-sm md:text-[15px] font-semibold leading-relaxed" style={{ color: "var(--dashboard-text-primary)", lineHeight: "1.6" }}><RichText text={q.question} /></h3>
                </div>

                <div className="space-y-2.5">
                  {q.options.map((option, i) => {
                    const isSelected = userAnswer === option;
                    const isLocked = userAnswer !== undefined;
                    return (
                      <button
                        key={i}
                        onClick={() => selectAnswer(q.id, option)}
                        disabled={isLocked}
                        aria-pressed={isSelected}
                        className="w-full text-left p-3 min-h-[52px] rounded-xl border cursor-pointer transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] disabled:cursor-not-allowed"
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
                {userAnswer !== undefined && (
                  <p role="status" className="inline-flex items-center gap-1.5 text-xs font-mono rounded-full border px-3 py-1.5 mt-2" style={{ color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
                    <Check className="w-3.5 h-3.5" aria-hidden="true" /> উত্তর লক হয়েছে
                  </p>
                )}
              </div>
            );
          })}
        </div>
        </>
        )}

        {/* Sticky submit bar — thumb-reachable above the bottom nav */}
        <div className="sticky z-40 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom,0px)+8px)] lg:bottom-2 -mx-1 px-1 pt-2 pb-1" style={{ background: "linear-gradient(to top, var(--dashboard-surface) 70%, transparent)" }}>
          <div className="glass-card rounded-2xl border border-[var(--dashboard-primary)]/25 px-4 py-3 flex items-center justify-between gap-3 flex-wrap backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--dashboard-surface-muted) 92%, transparent)" }}>
            <div className="text-xs text-[var(--dashboard-text-muted)] font-mono">
              {unanswered > 0 ? (
                <>
                  <span className="text-[var(--dashboard-warning)]">{unanswered}টি</span> উত্তর দেওয়া বাকি
                </>
              ) : (
                <span className="text-[var(--dashboard-primary)]">সব প্রশ্নের উত্তর দেওয়া হয়েছে ✓</span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSubmitRequest();
              }}
              disabled={submitting}
              aria-busy={submitting}
              aria-label="পরীক্ষা জমা দিন"
              className="px-6 py-2.5 min-h-[48px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed z-[var(--z-sticky)] relative pointer-events-auto"
            >
              {submitting ? "জমা হচ্ছে..." : (
                <>
                  <Flag className="w-4 h-4" /> পরীক্ষা জমা দিন
                </>
              )}
            </button>
          </div>
        </div>

        {submitError && (
          <p className="text-xs text-[var(--dashboard-danger)] text-center">{submitError}</p>
        )}

        {/* Unanswered confirmation sheet (portaled: see note above) */}
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
                ref={unansweredDialogRef}
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
                role="dialog"
                aria-modal="true"
                aria-labelledby="custom-unanswered-confirm-title"
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
                  <h3 id="custom-unanswered-confirm-title" className="text-base font-bold text-[var(--text-primary)]">উত্তর দেওয়া বাকি আছে</h3>
                </div>
                <p className="text-sm text-[var(--dashboard-text-muted)] mb-5">
                  <span className="text-[var(--dashboard-warning)] font-mono">{unanswered}টি</span> প্রশ্নে উত্তর দেওয়া হয়নি।
                  নিশ্চিতভাবে জমা দিতে চান? না দেওয়া প্রশ্নে ০ নম্বর পাবেন।
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowUnansweredConfirm(false)}
                    className="flex-1 py-2.5 min-h-[48px] bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-secondary)] font-mono text-sm rounded-xl hover:bg-[var(--surface-overlay)] active:opacity-80 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                  >
                    ফিরে যান
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); finalizeSubmit(); }}
                    disabled={submitting}
                    aria-busy={submitting}
                    className="flex-1 py-2.5 min-h-[48px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {(submitting || reconciling) ? (reconciling ? "যাচাই করা হচ্ছে..." : "জমা হচ্ছে...") : "জমা দিন"}
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

  // ═══════════════ RESULT PHASE ═══════════════
  if (phase === "result" && result) {
    const { summary } = result;
    const perf = performanceLabel(summary.percentage);

    return (
      <div className="space-y-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduceMotion ? { duration: 0 } : undefined}
          className="glass-card rounded-2xl border border-[var(--dashboard-primary)]/25 overflow-hidden"
        >
          <div className="p-6 text-center border-b border-terminal-border">
            <Trophy className={`w-12 h-12 mx-auto mb-3 ${summary.percentage >= 80 ? "text-[var(--dashboard-warning)]" : summary.percentage >= 50 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-danger)]"}`} />
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">পরীক্ষা সম্পন্ন!</h3>
            <p className={`text-sm font-mono mb-4 ${perf.tone}`}>{perf.label}</p>

            <ScoreRing percentage={summary.percentage} label="Exam score" />

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
              <div className="rounded-xl bg-[var(--dashboard-primary-subtle)] border border-[var(--dashboard-border-muted)] p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">ইতিবাচক</p>
                <p className="text-lg font-bold text-[var(--dashboard-primary)] font-mono">+{summary.positiveMarks}</p>
              </div>
              <div className="rounded-xl bg-[var(--dashboard-danger-subtle)] border border-[var(--dashboard-border-muted)] p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">নেতিবাচক</p>
                <p className="text-lg font-bold text-[var(--dashboard-danger)] font-mono">−{summary.negativeMarks}</p>
              </div>
              <div className="rounded-xl bg-[var(--dashboard-primary-subtle)] border border-[var(--dashboard-border-muted)] p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">অ্যাকুরেসি</p>
                <p className="text-lg font-bold text-[var(--text-primary)] font-mono">{summary.accuracy}%</p>
              </div>
            </div>

            <div className="mt-4 h-2 bg-[var(--surface-overlay)] rounded-full overflow-hidden max-w-md mx-auto" role="progressbar" aria-label="Exam score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(summary.percentage)}>
              <div
                className={`h-full w-full origin-left rounded-full transition-transform duration-200 ${
                  summary.percentage >= 80 ? "bg-[var(--dashboard-warning)]" : summary.percentage >= 50 ? "bg-[var(--dashboard-success)]" : "bg-[var(--dashboard-danger)]"
                }`}
                style={{ transform: `scaleX(${summary.percentage / 100})` }}
              />
            </div>
            <p className="text-xs text-[var(--dashboard-text-muted)] font-mono mt-2">
              স্কোর: <span className="text-[var(--text-primary)]">{summary.percentage}%</span> • সূত্র: সঠিক×১ − ভুল×০.৫
            </p>
            {summary.pointsEarned > 0 && (
              <p className="text-xs text-[var(--dashboard-primary)] font-mono mt-1">+{summary.pointsEarned} পয়েন্ট অর্জিত</p>
            )}

            <div className="max-w-md mx-auto text-left mt-4">
              <TopicBars items={result.review.map((r) => ({ subject: r.subject, topic: r.topic, status: r.status }))} />
            </div>

            <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
              <button
                onClick={resetAll}
                className="px-5 py-2.5 min-h-[48px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center gap-2"
              >
                <ArrowCounterClockwise className="w-4 h-4" aria-hidden="true" /> নতুন পরীক্ষা
              </button>
              {(summary.wrong + summary.unanswered) > 0 && exam && (
                <button
                  type="button"
                  onClick={() => {
                    const retryQs = exam.questions.filter((qq) => {
                      const rv = result.review.find((r) => r.questionId === qq.id);
                      return !rv || rv.status !== "correct";
                    });
                    if (retryQs.length === 0) return;
                    clearAttemptId(STORAGE_KEY);
                    const attemptId = ensureAttemptId(STORAGE_KEY);
                    const durationSec = Math.max(60, retryQs.length * 30);
                    const retryExam: PersistedExam = {
                      ...exam,
                      examId: `${exam.examId}-retry-${Date.now()}`,
                      attemptId,
                      questions: retryQs,
                      answers: {},
                      startsAt: Date.now(),
                      durationSec,
                      requested: retryQs.length,
                    };
                    saveExamSnapshot(STORAGE_KEY, retryExam);
                    setExam(retryExam);
                    setAnswers({});
                    setReviewToggles({});
                    setHighlightedReview(null);
                    setSubmitError(null);
                    setResult(null);
                    setPhase("exam");
                    requestAnimationFrame(() => scrollDashboardTop());
                    void registerExam({
                      attemptId,
                      questionIds: retryQs.map((qq) => qq.id),
                      durationSec,
                    }).catch(() => {
                      /* non-fatal — submit upserts */
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

        {/* Question-by-question review */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">
            প্রশ্ন-ভিত্তিক রিভিউ
          </h4>
          {result.review.map((item, i) => {
            const isCorrect = item.status === "correct";
            const isUnanswered = item.status === "unanswered";
            // Review must mirror the SESSION option order the student saw
            // (serve-time shuffled), not the server snapshot's stored order —
            // letter labels + AI explanations derive from this array.
            const displayOptions =
              exam?.questions.find((q) => q.id === item.questionId)?.options ?? item.options;
            const ringColor = isCorrect
              ? "ring-[var(--dashboard-success)]"
              : isUnanswered
                ? "ring-[var(--dashboard-teal)]"
                : "ring-[var(--dashboard-danger)]";
            const open = isReviewOpen(item.questionId, item.status);
            const verdictLabel = isCorrect ? "সঠিক" : isUnanswered ? "উত্তর বাকি" : "ভুল";
            return (
              <div
                key={item.questionId}
                id={`exam-review-${item.status}`}
                className={`glass-card rounded-2xl border overflow-hidden transition-[border-color] duration-150 ${
                  isCorrect ? "border-[var(--dashboard-success)]/25" : isUnanswered ? "border-[var(--dashboard-teal)]/30" : "border-[var(--dashboard-danger)]/25"
                } ${highlightedReview === item.status ? `ring-2 ${ringColor}` : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setReviewToggles((prev) => ({ ...prev, [item.questionId]: !isReviewOpen(item.questionId, item.status) }))}
                  aria-expanded={open}
                  aria-label={`প্রশ্ন ${i + 1} — ${verdictLabel} — ${open ? "সংকুচিত করুন" : "বিস্তারিত দেখুন"}`}
                  className="w-full flex items-center gap-3 p-4 min-h-[60px] text-left cursor-pointer transition-[background-color] duration-150 hover:bg-[var(--dashboard-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--dashboard-focus-ring)]"
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCorrect ? "bg-[var(--dashboard-success-subtle)] text-[var(--dashboard-success)]" : isUnanswered ? "bg-[var(--dashboard-teal-subtle)] text-[var(--dashboard-teal)]" : "bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]"
                  }`} aria-hidden="true">
                    {isCorrect ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : isUnanswered ? (
                      <CircleDashed className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                      {i + 1}. <RichText text={item.question} />
                    </span>
                    <span className="flex flex-wrap items-center gap-2 mt-1">
                      <MetaChip tone={isCorrect ? "success" : isUnanswered ? "teal" : "danger"}>
                        {isCorrect ? "+১" : isUnanswered ? "০" : "−০.৫"} · {verdictLabel}
                      </MetaChip>
                      <span className="text-[10px] font-mono" style={{ color: "var(--dashboard-text-secondary)" }}>{item.subject}</span>
                    </span>
                  </span>
                  <CaretRight className={`w-4 h-4 flex-shrink-0 transition-transform duration-150 ${open ? "rotate-[270deg]" : "rotate-90"}`} style={{ color: "var(--dashboard-text-muted)" }} aria-hidden="true" />
                </button>
                {open && (
                <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: "var(--dashboard-border-muted)" }}>
                  <div className="min-w-0 flex-1 pt-2">

                    <p className="text-sm text-[var(--text-primary)] mb-2"><RichText text={item.question} /></p>

                    {/* Options with correct/user highlighting */}
                    <div className="space-y-1 mb-2">
                      {displayOptions.map((option, oi) => {
                        const isUser = option === item.userAnswer;
                        const isRight = option === item.correctAnswer;
                        let cls = "border-[var(--dashboard-border-muted)]";
                        let rowStyle: CSSProperties | undefined;
                        if (isRight) {
                          cls = "border-[var(--dashboard-success)]/40 bg-[var(--dashboard-success-subtle)]";
                          rowStyle = { color: "color-mix(in srgb, var(--dashboard-success) 60%, var(--dashboard-text-primary))", fontWeight: 600 };
                        } else if (isUser) {
                          cls = "border-[var(--dashboard-danger)]/40 bg-[var(--dashboard-danger-subtle)]";
                          rowStyle = { color: "color-mix(in srgb, var(--dashboard-danger) 60%, var(--dashboard-text-primary))", fontWeight: 600 };
                        } else {
                          rowStyle = { color: "var(--dashboard-text-secondary)" };
                        }
                        return (
                          <div key={oi} className={`rounded-lg border px-3 py-1.5 text-xs flex items-center gap-2 ${cls}`} style={rowStyle}>
                            <span className="font-mono">{OPTION_LABELS[oi] ?? oi + 1}</span>
                            <span className="flex-1"><RichText text={option} /></span>
                            {isRight && <Check className="w-3.5 h-3.5 text-[var(--dashboard-success)]" />}
                            {isUser && !isRight && <X className="w-3.5 h-3.5 text-[var(--dashboard-danger)]" />}
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
                      আপনার উত্তর:{" "}
                      <span className={isCorrect ? "text-[var(--dashboard-success)]" : isUnanswered ? "text-[var(--dashboard-teal)]" : "text-[var(--dashboard-danger)]"}>
                        {item.userAnswer ? <RichText text={item.userAnswer} /> : "উত্তর দেওয়া হয়নি"}
                      </span>
                      {!isCorrect && !isUnanswered && (
                        <>
                          {" "}• সঠিক উত্তর: <span className="text-[var(--dashboard-success)]"><RichText text={item.correctAnswer} /></span>
                        </>
                      )}
                    </p>

                    {item.explanation && (
                      <p className="text-xs text-[var(--dashboard-text-muted)] mt-2 leading-relaxed"><RichText text={item.explanation} /></p>
                    )}

                    <AIExplanationButton
                      questionId={item.questionId}
                      question={item.question}
                      options={displayOptions}
                      correctAnswer={item.correctAnswer}
                      userAnswer={item.userAnswer}
                      subject={item.subject}
                      topic={item.topic}
                    />
                  </div>
                </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={resetAll}
            className="px-6 py-3 min-h-[52px] bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--accent-hover)] active:opacity-90 cursor-pointer transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] flex items-center gap-2"
          >
            <ArrowCounterClockwise className="w-4 h-4" aria-hidden="true" /> নতুন পরীক্ষা শুরু করুন
          </button>
        </div>
      </div>
    );
  }

  return null;
}