// frontend/lib/hooks/useExamEngine.ts
// Shared exam engine state, derivations, and utilities extracted from
// MockTestTab, CustomExamTab, and PracticeTab to eliminate duplication.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { api } from "@/lib/services/api";
import type { ExamEcosystemCode } from "@/lib/types";
import type { Server } from "@/lib/types";

export const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"] as const;

export type Selection = Record<number, { count?: number; subTopics?: number[] }>;

// ── Helpers (pure, no hooks) ─────────────────────────────────────────────

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function scrollDashboardTop(): void {
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = prefersReduced
    ? ("instant" as ScrollBehavior)
    : "smooth";
  const el =
    typeof document !== "undefined"
      ? document.getElementById("dashboard-content")
      : null;
  if (el) {
    if (typeof el.scrollTo === "function") {
      try {
        el.scrollTo({ top: 0, behavior });
        return;
      } catch {
        /* fall through */
      }
    }
    el.scrollTop = 0;
    return;
  }
  if (
    typeof window !== "undefined" &&
    typeof window.scrollTo === "function"
  ) {
    try {
      window.scrollTo({ top: 0, behavior });
    } catch {
      window.scrollTo(0, 0);
    }
  }
}

function availableForSubject(
  subject: Server.ExamSubjectDTO,
  selection: Selection,
): number {
  const sel = selection[subject.id];
  if (!sel) return 0;
  if (sel.subTopics && sel.subTopics.length > 0) return sel.subTopics.length;
  return subject.questionCount ?? 0;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface ExamEngineOptions {
  ecosystem: ExamEcosystemCode;
  /** Called to build the exam (mock test or custom exam) */
  onBuild?: (subjects: Server.ExamSubjectDTO[], selection: Selection) => void;
}

export interface ExamEngineReturn {
  // Config state
  subjects: Server.ExamSubjectDTO[];
  configLoading: boolean;
  configError: string | null;
  selection: Selection;

  // Config actions
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  setSubjects: React.Dispatch<React.SetStateAction<Server.ExamSubjectDTO[]>>;
  setConfigError: React.Dispatch<React.SetStateAction<string | null>>;
  setConfigLoading: React.Dispatch<React.SetStateAction<boolean>>;

  // Derived values
  selectedSubjects: Server.ExamSubjectDTO[];
  availableTotal: number;
  totalCount: number;
  insufficient: boolean;

  // Answer state
  answers: Record<number, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  lockedQuestions: Set<number>;
  setLockedQuestions: React.Dispatch<React.SetStateAction<Set<number>>>;
  answeredCount: number;

  // Submit state
  submitting: boolean;
  setSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  submitError: string | null;
  setSubmitError: React.Dispatch<React.SetStateAction<string | null>>;
  showUnansweredConfirm: boolean;
  setShowUnansweredConfirm: React.Dispatch<React.SetStateAction<boolean>>;

  // Refs for stale-closure guards
  questionsRef: React.MutableRefObject<Server.ExamQuestionDTO[]>;
  answersRef: React.MutableRefObject<Record<number, string>>;
  submittingRef: React.MutableRefObject<boolean>;

  // Utilities
  selectAnswer: (questionId: number, option: string) => void;
  handleSubmitRequest: (totalQuestions: number, submitFn: () => void | Promise<void>) => void;
  finalizeSubmit: (submitFn: () => void | Promise<void>) => void;
  scrollDashboardTop: () => void;

  // Highlight review (for mock test / custom exam results)
  highlightedReview: "correct" | "wrong" | "unanswered" | null;
  jumpToReview: (status: "correct" | "wrong" | "unanswered", elementPrefix?: string) => void;
  highlightTimeoutRef: React.MutableRefObject<number | null>;
}

export function useExamEngine({
  ecosystem,
}: ExamEngineOptions): ExamEngineReturn {
  // ── Config state ──
  const [subjects, setSubjects] = useState<Server.ExamSubjectDTO[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({});

  // ── Answer state ──
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [lockedQuestions, setLockedQuestions] = useState<Set<number>>(
    new Set(),
  );

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showUnansweredConfirm, setShowUnansweredConfirm] = useState(false);

  // ── Refs ──
  const questionsRef = useRef<Server.ExamQuestionDTO[]>([]);
  const answersRef = useRef<Record<number, string>>({});
  const submittingRef = useRef(false);
  // Synchronous mirror of lockedQuestions: lets selectAnswer stay referentially
  // stable (empty deps) while still refusing locked questions, without
  // re-creating the callback — and every question row — on each answer.
  const lockedRef = useRef<Set<number>>(new Set());
  const highlightTimeoutRef = useRef<number | null>(null);
  const [highlightedReview, setHighlightedReview] = useState<
    "correct" | "wrong" | "unanswered" | null
  >(null);

  // ── Config loading ──
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
        if (!cancelled)
          setConfigError(
            "কনফিগারেশন লোড করা যায়নি। আবার চেষ্টা করুন।",
          );
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ecosystem]);

  // ── Derived values ──
  const selectedSubjects = useMemo(
    () => subjects.filter((s) => selection[s.id] !== undefined),
    [subjects, selection],
  );

  const availableTotal = useMemo(
    () =>
      selectedSubjects.reduce(
        (acc, s) => acc + availableForSubject(s, selection),
        0,
      ),
    [selectedSubjects, selection],
  );

  const totalCount = useMemo(
    () =>
      selectedSubjects.reduce(
        (acc, s) => acc + (selection[s.id].count ?? 0),
        0,
      ),
    [selectedSubjects, selection],
  );

  const insufficient = totalCount > availableTotal;

  const answeredCount = Object.keys(answers).length;

  // ── Stale-closure sync ──
  const syncRefs = useCallback(
    (q: Server.ExamQuestionDTO[], a: Record<number, string>) => {
      questionsRef.current = q;
      answersRef.current = a;
    },
    [],
  );

  // ── Answer-state setter that keeps answersRef synchronously fresh ──
  // Tabs may call setAnswers directly (resets, restores). Writing the ref
  // inside the updater guarantees handleSubmitRequest never reads a stale
  // count on rapid double-tap submit — the effect-based sync below only runs
  // after render, which is too late. (React may double-invoke updaters in
  // StrictMode; the assignment is idempotent so that's harmless.)
  const setAnswersSync = useCallback(
    (value: React.SetStateAction<Record<number, string>>) => {
      setAnswers((prev) => {
        const next =
          typeof value === "function"
            ? (value as (p: Record<number, string>) => Record<number, string>)(prev)
            : value;
        answersRef.current = next;
        return next;
      });
    },
    [],
  );
  // ── selectAnswer (stable: never re-created, rows don't re-render) ──
  const selectAnswer = useCallback((questionId: number, option: string) => {
    if (lockedRef.current.has(questionId)) return;
    lockedRef.current.add(questionId);
    answersRef.current = { ...answersRef.current, [questionId]: option };
    setAnswers(answersRef.current);
    setLockedQuestions(new Set(lockedRef.current));
  }, []);

  // ── handleSubmitRequest ──
  const handleSubmitRequest = useCallback(
    (totalQuestions: number, submitFn: () => void | Promise<void>) => {
      if (totalQuestions - Object.keys(answersRef.current).length > 0) {
        setShowUnansweredConfirm(true);
      } else {
        void submitFn();
      }
    },
    [],
  );

  // ── finalizeSubmit ──
  const finalizeSubmit = useCallback(
    (submitFn: () => void | Promise<void>) => {
      setShowUnansweredConfirm(false);
      void submitFn();
    },
    [],
  );

  // ── beforeunload guard: exam in progress OR submitting ──
  // Previously keyed on `submitting` (the submit phase) only, so accidental
  // navigation mid-exam — the actual data-loss vector — was unguarded.
  const examInProgress = Object.keys(answers).length > 0 || submitting;
  useEffect(() => {
    if (!examInProgress) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [examInProgress]);

  // ── jumpToReview ──
  const jumpToReview = useCallback(
    (status: "correct" | "wrong" | "unanswered", elementPrefix = "exam") => {
      setHighlightedReview(status);
      if (highlightTimeoutRef.current !== null)
        window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedReview((h) => (h === status ? null : null));
      }, 2000);
      const el = document.getElementById(`${elementPrefix}-review-${status}`);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      }
    },
    [],
  );

  // ── highlight timeout cleanup ──
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null)
        window.clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  // ── Sync refs on state change ──
  useEffect(() => {
    syncRefs(questionsRef.current, answers);
  }, [answers, syncRefs]);

  return {
    // Config
    subjects,
    configLoading,
    configError,
    selection,
    setSelection,
    setSubjects,
    setConfigError,
    setConfigLoading,

    // Derived
    selectedSubjects,
    availableTotal,
    totalCount,
    insufficient,

    // Answers
    answers,
    setAnswers: setAnswersSync,
    lockedQuestions,
    setLockedQuestions,
    answeredCount,

    // Submit
    submitting,
    setSubmitting,
    submitError,
    setSubmitError,
    showUnansweredConfirm,
    setShowUnansweredConfirm,

    // Refs
    questionsRef,
    answersRef,
    submittingRef,

    // Utilities
    selectAnswer,
    handleSubmitRequest,
    finalizeSubmit,
    scrollDashboardTop,

    // Highlight
    highlightedReview,
    jumpToReview,
    highlightTimeoutRef,
  };
}
