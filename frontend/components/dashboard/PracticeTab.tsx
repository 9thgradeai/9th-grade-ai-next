"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Check, BookOpen, CaretLeft, CaretRight, CircleDashed, Trophy, ArrowCounterClockwise, Target, CheckCircle, XCircle, Spinner, Warning, Package, Sun, Flag } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useEcosystem } from "@/lib/ecosystem-ctx";
import { autoDurationMin, autoDurationSec, formatDurationShort, negativeLabelForEcosystem, negativePenaltyForEcosystem, SECONDS_PER_QUESTION } from "@/lib/exam-scoring";
import { DIFFICULTY_LABEL } from "@/lib/exam-ui";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import type { Server } from "@/lib/types";
import MockTestTab from "./MockTestTab";
import CustomExamTab from "./CustomExamTab";
import RichText from "@/components/ui/RichText";
import ModalPortal from "@/components/ui/ModalPortal";
import QuestionRenderer from "./practice/QuestionRenderer";
import MetaChip from "./practice/MetaChip";
import SessionTimer from "./practice/SessionTimer";
import { isAnswerCorrect, serializeAnswer, getCorrectSet } from "@/lib/question-type";
import SubjectTopicSelect from "./SubjectTopicSelect";
import PracticeStartDock from "./PracticeStartDock";
import PracticeModeCards from "./PracticeModeCards";
import ScoreRing from "./practice/ScoreRing";
import SmartMixButton from "./practice/SmartMixButton";
import TopicBars from "./practice/TopicBars";
import AIExplanationButton from "./AIExplanationButton";
import {
  type Selection,
  availableForSubject,
  flattenNodes,
} from "./TopicTreePicker";
import { allocateEvenly, shuffle } from "@/lib/balanced";
import { shuffleSessionOptions } from "@/lib/shuffle-options";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { useToastSafe } from "@/lib/toast-ctx";
import {
  QUICK_EXAM_KEY,
  loadExamSnapshot,
  saveExamSnapshot,
  dropExamSnapshot,
  clearOtherExams,
} from "@/lib/exam-persist";
import {
  queuePracticeSubmit,
  loadQueuedPracticeSubmit,
  clearQueuedPracticeSubmit,
  isNetworkFailure,
} from "@/lib/practice-submit-queue";

type PracticeMode = "custom" | "mock" | "quick";

const QUESTION_TIME_LIMIT = SECONDS_PER_QUESTION;

// Quick-practice sessions survive tab switches/remounts via localStorage.
// Key + validation live in @/lib/exam-persist (single seam for all exam modes).
const QUICK_STORAGE_KEY = QUICK_EXAM_KEY;

type PersistedQuickSession = {
  questions: Server.QuestionDTO[];
  // Selection is always string[] (single = 1-element). Legacy snapshots
  // stored plain strings, normalized to arrays on resume below.
  answers: Record<number, string[] | string>;
  multiLocked?: Record<number, true>;
  currentIndex: number;
  /** Wall-clock session deadline basis, the server has no attempt row for
   * quick practice, so the persisted start + duration is authoritative. */
  startsAt: number;
  durationSec: number;
};

/** Normalize a persisted answer (string legacy or string[]) to string[]. */
function toAnswerArray(v: string[] | string | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

/** Unbiased Fisher-Yates shuffle (sort-compare is biased). */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function PracticeTimer({
  startsAt,
  durationSec,
  onExpire,
}: {
  startsAt: number;
  durationSec: number;
  onExpire: () => void;
}) {
  return <SessionTimer startsAt={startsAt} durationSec={durationSec} onExpire={onExpire} />;
}

export default function PracticeTab() {
  const { practiceIntent, setPracticeIntent, setMistakeIntent } = useDashboardStore(s => ({ practiceIntent: s.practiceIntent, setPracticeIntent: s.setPracticeIntent, setMistakeIntent: s.setMistakeIntent }));
  const { ecosystem } = useEcosystem();
  const router = useRouter();
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
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  // Explicit locks for MULTIPLE_CHOICE only, single-choice locks on first
  // pick (presence), but multi needs several toggles before locking.
  const [multiLocked, setMultiLocked] = useState<Record<number, true>>({});
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const toggleFlag = useCallback((questionId: number) => {
    setFlagged((prev) => {
      const next = { ...prev };
      if (next[questionId]) delete next[questionId];
      else next[questionId] = true;
      return next;
    });
  }, []);
  const [result, setResult] = useState<{ correct: number; total: number; score: number; pointsEarned: number; wrong?: number; negativeMarks?: number; finalScore?: number; penaltyPerWrong?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Offline outbox: a network-failed submit queues the payload for retry
  // instead of dropping answers. Cleared on the first acknowledged success.
  const [offlineQueued, setOfflineQueued] = useState(false);
  const [showUnansweredConfirm, setShowUnansweredConfirm] = useState(false);
  const closeUnansweredConfirm = useCallback(() => setShowUnansweredConfirm(false), []);
  const unansweredDialogRef = useDialogA11y<HTMLDivElement>(showUnansweredConfirm, closeUnansweredConfirm);
  useScrollLock(showUnansweredConfirm);
  const [showQuickConfirm, setShowQuickConfirm] = useState(false);
  const closeQuickConfirm = useCallback(() => setShowQuickConfirm(false), []);
  const quickConfirmDialogRef = useDialogA11y<HTMLDivElement>(showQuickConfirm, closeQuickConfirm);
  useScrollLock(showQuickConfirm);
  const [timerKey, setTimerKey] = useState(0);
  // Wall-clock session basis (persisted + resumed). durationMin is the editable
  // config; on start it freezes into sessionDurationSec + sessionStartsAt.
  const [sessionStartsAt, setSessionStartsAt] = useState(0);
  const [sessionDurationSec, setSessionDurationSec] = useState(0);
  // Swipe navigation (mobile-app feel): horizontal swipe on the question
  // canvas moves prev/next. Ref-held so swipes never re-render.
  const touchX = useRef<number | null>(null);
  const toast = useToastSafe();
  // Reduced-motion: entrances render in their final state (dashboard shell
  // already wraps in MotionConfig reducedMotion="user", this is the local
  // gate for the per-section fade-ups).
  const reduceMotion = useReducedMotion();
  // Review filters + lazy expansion: the result list can be long on mobile,
  // so wrong/unanswered auto-expand while correct stays collapsed, and the
  // AI explanation button mounts only inside an expanded item.
  type ReviewFilter = "all" | "correct" | "wrong" | "unanswered";
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [expandedReview, setExpandedReview] = useState<Record<number, boolean>>({});
  // Mis-tap undo: single-choice locks on first pick, so a 4s window lets
  // users revert an accidental tap. Ref-held timeout, state-held target.
  const [undoPick, setUndoPick] = useState<number | null>(null);
  const undoTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
  }, []);
  // Total session time (minutes, editable). Auto = 30s per selected MCQ.
  const [durationMin, setDurationMin] = useState(10);
  const [durationTouched, setDurationTouched] = useState(false);
  // Session difficulty filter (ALL = mixed). Passed to /api/questions, which
  // already validates it, the leaf counts stay difficulty-agnostic, so a
  // narrow filter may yield fewer than requested (existing fallback applies).
  const [difficulty, setDifficulty] = useState<"ALL" | "EASY" | "MEDIUM" | "HARD">("ALL");
  const difficultyParam = difficulty === "ALL" ? undefined : difficulty;

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

  // Load the selection tree, re-fetches on ecosystem toggle.
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
  }, [ecosystem]);

  // Consume cross-tab practice intent (from Command Center), pre-select subject and open quick practice.
  useEffect(() => {
    if (!practiceIntent?.subject || subjects.length === 0) return;
    if (mode !== "quick") {
      const match = subjects.find(s => s.nameBn === practiceIntent.subject || s.nameEn === practiceIntent.subject);
      if (match) queueMicrotask(() => setMode("quick"));
      return;
    }
    const match = subjects.find(s => s.nameBn === practiceIntent.subject || s.nameEn === practiceIntent.subject || s.nameBn.includes(practiceIntent.subject!) || practiceIntent.subject!.includes(s.nameBn));
    if (match && !selection[match.id]) {
      queueMicrotask(() => {
        setSelection(prev => ({ ...prev, [match.id]: { paths: [], count: Math.min(match.questionCount, 20) } }));
        setPracticeIntent(null);
      });
    }
  }, [practiceIntent, subjects, mode, selection, setPracticeIntent]);
  // Also handle intent regardless of current mode by switching to quick when nothing selected
  useEffect(() => {
    if (practiceIntent?.subject && subjects.length > 0 && !Object.keys(selection).length) {
      const match = subjects.find(s => s.nameBn === practiceIntent.subject || s.nameEn === practiceIntent.subject);
      if (match) {
        queueMicrotask(() => {
          setMode("quick");
          setSelection({ [match.id]: { paths: [], count: Math.min(match.questionCount, 20) } });
          setPracticeIntent(null);
        });
      }
    }
  }, [practiceIntent, subjects, selection, setPracticeIntent]);
  // Mode-only intent (Mock Exam vs Practice), no subject
  useEffect(() => {
    if (practiceIntent?.mode && !practiceIntent.subject) {
      const m = practiceIntent.mode;
      if (m === "mock" || m === "quick" || m === "custom") {
        queueMicrotask(() => {
          setMode(m);
          setPracticeIntent(null);
        });
      }
    } else if (practiceIntent?.mode && practiceIntent.subject) {
      // subject + mode together, consume once, then clear like the others.
      queueMicrotask(() => {
        setMode(practiceIntent.mode as typeof mode);
        setPracticeIntent(null);
      });
    }
  }, [practiceIntent, setPracticeIntent]);

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
  const penaltyPerWrong = negativePenaltyForEcosystem(ecosystem);
  const negativeLabel = negativeLabelForEcosystem(ecosystem);
  const autoMin = autoDurationMin(totalCount);
  const autoSec = autoDurationSec(totalCount);

  // Auto time = 30s per selected MCQ; user edits opt out of auto-sync.
  useEffect(() => {
    if (!durationTouched && totalCount > 0) setDurationMin(autoDurationMin(totalCount));
  }, [totalCount, durationTouched]);

  const adjustDuration = (delta: number) => {
    setDurationTouched(true);
    setDurationMin((d) => Math.max(1, Math.min(180, d + delta)));
  };

  const sessionQuestions = questions;

  const answeredCount = Object.keys(answers).length;
  const currentQuestion = sessionQuestions[currentIndex];
  const totalQuestions = sessionQuestions.length;
  const allAnswered = totalQuestions > 0 && answeredCount === totalQuestions;

  const resetSession = () => {
    dropExamSnapshot(QUICK_STORAGE_KEY);
    setSelection({});
    setQuestions([]);
    setSessionActive(false);
    setCurrentIndex(0);
    setAnswers({});
    setMultiLocked({});
    setFlagged({});
    setUndoPick(null);
    setReviewFilter("all");
    setExpandedReview({});
    setResult(null);
    setLoadError(null);
    setSubmitError(null);
    setShowQuickConfirm(false);
    setSessionStartsAt(0);
    setSessionDurationSec(0);
    setTimerKey((k) => k + 1);
    setDurationTouched(false);
    setDifficulty("ALL");
  };

  // Resume an interrupted quick-practice session so tab switches never
  // destroy progress. Validated load via exam-persist (corrupt → null + dropped).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const saved = loadExamSnapshot<PersistedQuickSession>(QUICK_STORAGE_KEY);
      if (!saved) return;
      // Wall-clock expiry while away: a long-expired quick session can no
      // longer be meaningfully resumed, drop it instead of reviving a dead
      // timer. Legacy snapshots without timing fields resume with a fresh
      // duration derived from the question count.
      const resumedDuration = saved.durationSec > 0 ? saved.durationSec : saved.questions.length * QUESTION_TIME_LIMIT;
      const resumedStartsAt = saved.startsAt > 0 ? saved.startsAt : Date.now();
      if (resumedDuration > 0 && Math.floor((Date.now() - resumedStartsAt) / 1000) >= resumedDuration + 15) {
        dropExamSnapshot(QUICK_STORAGE_KEY);
        return;
      }
      setQuestions(saved.questions);
        const normalized: Record<number, string[]> = {};
        for (const [k, v] of Object.entries(saved.answers ?? {})) {
          const arr = toAnswerArray(v);
          if (arr) normalized[Number(k)] = arr;
        }
        setAnswers(normalized);
        setMultiLocked(saved.multiLocked ?? {});
        setCurrentIndex(Math.min(saved.currentIndex ?? 0, saved.questions.length - 1));
        setSessionStartsAt(resumedStartsAt);
        setSessionDurationSec(resumedDuration);
        setSessionActive(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the persisted snapshot in sync while a session is running.
  useEffect(() => {
    if (!sessionActive || result || questions.length === 0) return;
    const snapshot: PersistedQuickSession = {
      questions,
      answers,
      multiLocked,
      currentIndex,
      startsAt: sessionStartsAt,
      durationSec: sessionDurationSec,
    };
    saveExamSnapshot(QUICK_STORAGE_KEY, snapshot);
  }, [sessionActive, result, questions, answers, multiLocked, currentIndex, sessionStartsAt, sessionDurationSec]);

  // When a quick-practice session starts or its result appears, always show the
  // top (question 1 / score summary), fix: previously kept previous scroll.
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

  // Fetch questions with whole-subject even distribution across topics.
  // The editable durationMin freezes into the session wall-clock on start.
  const startSession = async () => {
    setLoading(true);
    sessionRecRef.current = practiceIntentRef.current?.recId ?? null;
    setLoadError(null);
    setResult(null);
    setSubmitError(null);
    setAnswers({});
    setMultiLocked({});
    setFlagged({});
    setCurrentIndex(0);
    setShowQuickConfirm(false);
    setTimerKey((k) => k + 1);
    try {
      const pools = await Promise.all(
        selectedSubjects.map(async (s) => {
          const sel = selection[s.id];
          const requested = sel.count ?? 0;
          if (requested <= 0) return [] as Server.QuestionDTO[];
          // Determine eligible leaves
          const allLeaves = flattenNodes(s.nodes).filter((n) => n.children.length === 0);
          const eligible = sel.paths.length === 0
            ? allLeaves
            : allLeaves.filter((leaf) => sel.paths.some((p) => leaf.path === p || leaf.path.startsWith(p + "/")));
          if (eligible.length === 0) {
            const res = await api.questions({ subject: s.nameBn, paths: sel.paths.length > 0 ? sel.paths : undefined, limit: Math.min(requested, 200), ecosystem, difficulty: difficultyParam });
            return res;
          }
          const caps = eligible.map((l) => l.questionCount);
          const alloc = allocateEvenly(requested, caps);
          const perLeafPools = await Promise.all(
            eligible.map((leaf, idx) => {
              const need = alloc[idx];
              if (need <= 0) return [] as Server.QuestionDTO[];
              return api.questions({ subject: s.nameBn, paths: [leaf.path], limit: need, ecosystem, difficulty: difficultyParam });
            }),
          );
          const mergedLeaf = perLeafPools.flat().filter(Boolean);
          // If leaf counts were stale and we got fewer than requested, fallback to whole-subject fetch
          if (mergedLeaf.length < requested) {
            const fallback = await api.questions({ subject: s.nameBn, paths: sel.paths.length > 0 ? sel.paths : undefined, limit: requested, ecosystem, difficulty: difficultyParam });
            // Merge and deduplicate, then balanced-sample the fallback pool
            const seen = new Set(mergedLeaf.map((q) => q.id));
            for (const q of fallback) if (!seen.has(q.id)) mergedLeaf.push(q);
          }
          return shuffle(mergedLeaf).slice(0, Math.min(requested, mergedLeaf.length));
        }),
      );
      const merged = pools.flat().filter(Boolean);
      if (merged.length === 0) {
        setLoadError("নির্বাচিত টপিক থেকে কোনো প্রশ্ন পাওয়া যায়নি।");
        setQuestions([]);
      } else {
        // Serve-time option shuffle: one seed per session keeps the
        // arrangement stable while answering + reviewing, and grading +
        // AI explanations key off option text so they stay exact.
        const finalQuestions = shuffleSessionOptions(shuffle(merged), `practice-${Date.now()}`);
        setQuestions(finalQuestions);
        // Freeze the wall-clock session: durationMin (editable in config)
        // becomes the authoritative deadline for this attempt.
        const durationSec = Math.max(60, Math.round(durationMin * 60));
        const startsAt = Date.now();
        setSessionStartsAt(startsAt);
        setSessionDurationSec(durationSec);
        saveExamSnapshot(QUICK_STORAGE_KEY, {
          questions: finalQuestions,
          answers: {},
          multiLocked: {},
          currentIndex: 0,
          startsAt,
          durationSec,
        });
        clearOtherExams(QUICK_STORAGE_KEY);
        setSessionActive(true);
        requestAnimationFrame(() => scrollDashboardTop());
      }
    } catch {
      setLoadError("প্রশ্ন লোড করা যায়নি। আবার চেষ্টা করুন।");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const isMulti = (q: Server.QuestionDTO) => q.questionType === "MULTIPLE_CHOICE";
  const isLocked = (q: Server.QuestionDTO) =>
    answers[q.id] !== undefined && (!isMulti(q) || multiLocked[q.id] === true);

  const selectAnswer = (questionId: number, next: string[]) => {
    const q = questions.find((x) => x.id === questionId);
    // Single-choice locks on first pick; multi toggles freely until the
    // explicit lock button. Locks survive session resume via state below.
    if (!q || isLocked(q)) return;
    if (next.length === 0) return;
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
    // Single-choice mis-tap window: offer a 4s undo (multi has its own
    // lock button, so no window needed there).
    if (!isMulti(q)) {
      setUndoPick(questionId);
      if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndoPick(null), 4000);
    }
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

  const lockMultiAnswer = (questionId: number) => {
    if ((answers[questionId] ?? []).length === 0) return;
    setMultiLocked((prev) => ({ ...prev, [questionId]: true }));
  };

  // ── Production-grade submit guard: duplicate hits JOIN the in-flight
  // request instead of wedging the button. Covers double-click, mobile
  // double-tap, and timer auto-submit racing a manual submit.
  const practiceSubmitInFlight = useRef<Promise<void> | null>(null);
  // Rec funnel: which recommendation (if any) started this session. Snapshotted
  // at start so mid-session intent changes can't misattribute the outcome.
  const practiceIntentRef = useRef(practiceIntent);
  useEffect(() => { practiceIntentRef.current = practiceIntent; }, [practiceIntent]);
  const sessionRecRef = useRef<string | null>(null);
  const sessionQuestionsRef = useRef(sessionQuestions);
  const answersRef = useRef(answers);
  const resultRef = useRef(result);
  const ecosystemRef = useRef(ecosystem);
  useEffect(() => { sessionQuestionsRef.current = sessionQuestions; }, [sessionQuestions]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { resultRef.current = result; }, [result]);
  useEffect(() => { ecosystemRef.current = ecosystem; }, [ecosystem]);
  // Auto-expand wrong/unanswered when the result lands (correct stays
  // collapsed); the AI button mounts only inside expanded items.
  useEffect(() => {
    if (!result) return;
    const open: Record<number, boolean> = {};
    for (const q of sessionQuestionsRef.current) {
      const ua = answersRef.current[q.id] ?? [];
      if (ua.length === 0 || !isAnswerCorrect(q, ua)) open[q.id] = true;
    }
    setExpandedReview(open);
    setReviewFilter("all");
  }, [result]);

  const submitAnswers = useCallback(async () => {
    if (practiceSubmitInFlight.current) return practiceSubmitInFlight.current;
    const qs = sessionQuestionsRef.current;
    if (qs.length === 0) {
      setSubmitError("প্রশ্ন পাওয়া যায়নি। আবার চেষ্টা করুন।");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const p = (async () => {
      const payload = qs.map((q) => {
        const sel = answersRef.current[q.id];
        return { questionId: q.id, selected: sel && sel.length > 0 ? sel : "" };
      });
      try {
        const summary = await api.submitPractice(payload, ecosystemRef.current);
        dropExamSnapshot(QUICK_STORAGE_KEY);
        clearQueuedPracticeSubmit();
        setOfflineQueued(false);
        setResult(summary);
        // Funnel: the session this rec started has now completed with an outcome.
        if (sessionRecRef.current) {
          api.recordRecCompleted({
            recId: sessionRecRef.current,
            target: "practice",
            total: summary.total,
            correct: summary.correct,
          });
          sessionRecRef.current = null;
        }
        requestAnimationFrame(() => scrollDashboardTop());
      } catch (err) {
        // Network failure ≠ lost answers: park the payload in the offline
        // outbox so it can be retried when connectivity returns.
        if (isNetworkFailure(err)) {
          queuePracticeSubmit({ answers: payload, ecosystem: ecosystemRef.current, queuedAt: Date.now() });
          setOfflineQueued(true);
          setSubmitError("অফলাইনে আছেন, উত্তর সংরক্ষিত আছে, সংযোগ ফিরলে আবার জমা দিন।");
        }
        throw err;
      }
    })();
    practiceSubmitInFlight.current = p;
    try {
      await p;
    } catch (err) {
      // Offline path already set a specific message + queued flag above;
      // only fall back to the generic message when none is set.
      setSubmitError((prev) => prev ?? "ফলাফল জমা দেওয়া যায়নি। আবার চেষ্টা করুন।");
      void err;
      throw new Error("practice submit failed");
    } finally {
      practiceSubmitInFlight.current = null;
      setSubmitting(false);
    }
  }, []);

  const handleSubmitRequest = useCallback(() => {
    if (practiceSubmitInFlight.current) { void practiceSubmitInFlight.current.catch(() => {}); return; }
    if (!allAnswered) {
      setShowUnansweredConfirm(true);
    } else {
      void submitAnswers().catch(() => {});
    }
  }, [allAnswered, submitAnswers]);

  const finalizeSubmit = useCallback(() => {
    setShowUnansweredConfirm(false);
    if (practiceSubmitInFlight.current) { void practiceSubmitInFlight.current.catch(() => {}); return; }
    void submitAnswers().catch(() => {});
  }, [submitAnswers]);

  // Retry a payload parked in the offline outbox (manual retry button or
  // automatic flush on `online`). Success clears the queue + shows results.
  const retryQueuedSubmit = useCallback(async () => {
    const queued = loadQueuedPracticeSubmit();
    if (!queued) {
      setOfflineQueued(false);
      return;
    }
    if (practiceSubmitInFlight.current) return;
    setSubmitting(true);
    try {
      const summary = await api.submitPractice(queued.answers, queued.ecosystem);
      clearQueuedPracticeSubmit();
      setOfflineQueued(false);
      setSubmitError(null);
      dropExamSnapshot(QUICK_STORAGE_KEY);
      setResult(summary);
      requestAnimationFrame(() => scrollDashboardTop());
    } catch (err) {
      if (!isNetworkFailure(err)) {
        // Server rejected it (not a connectivity blip), surface the error
        // and drop the poison payload so it can't wedge future retries.
        clearQueuedPracticeSubmit();
        setOfflineQueued(false);
        setSubmitError("ফলাফল জমা দেওয়া যায়নি। আবার চেষ্টা করুন।");
      } else {
        setSubmitError("এখনো অফলাইনে আছেন, সংযোগ ফিরলে আবার চেষ্টা করুন।");
      }
    } finally {
      setSubmitting(false);
    }
  }, []);

  // On mount, surface a previously-queued payload; on reconnect, flush it.
  useEffect(() => {
    if (loadQueuedPracticeSubmit()) setOfflineQueued(true);
    const onOnline = () => {
      if (loadQueuedPracticeSubmit() && !resultRef.current) void retryQueuedSubmit().catch(() => {});
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retryQueuedSubmit]);

  const handleAutoSubmit = useCallback(async () => {
    // Session wall-clock expiry submits the whole attempt for grading —
    // answers collected so far are preserved, nothing is silently discarded.
    if (resultRef.current) return;
    if (practiceSubmitInFlight.current) return;
    toast.info("সময় শেষ, উত্তর জমা দেওয়া হচ্ছে");
    try {
      const qs = sessionQuestionsRef.current;
      if (qs.length === 0) return;
      setSubmitting(true);
      setSubmitError(null);
      const payload = qs.map((q) => {
        const sel = answersRef.current[q.id];
        return { questionId: q.id, selected: sel && sel.length > 0 ? sel : "" };
      });
      try {
        const summary = await api.submitPractice(payload, ecosystemRef.current);
        dropExamSnapshot(QUICK_STORAGE_KEY);
        clearQueuedPracticeSubmit();
        setOfflineQueued(false);
        setResult(summary);
        requestAnimationFrame(() => scrollDashboardTop());
      } catch (err) {
        if (isNetworkFailure(err)) {
          queuePracticeSubmit({ answers: payload, ecosystem: ecosystemRef.current, queuedAt: Date.now() });
          setOfflineQueued(true);
        }
        throw err;
      }
    } catch {
      setSubmitError((prev) => prev ?? "সময় শেষে জমা দেওয়া যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSubmitting(false);
    }
  }, [toast]);

  // Keyboard navigation (desktop): ←/→ move, 1-6/A-D pick, F flag.
  // Single stable subscription: the handler reads ONLY refs and stable
  // setters, so the dep array is legitimately empty. A dep-less effect would
  // get compiler-inferred deps and resubscribe on every render; refs keep
  // every read fresh with exactly one subscription for the tab lifetime.
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  const multiLockedRef = useRef(multiLocked);
  useEffect(() => {
    multiLockedRef.current = multiLocked;
  }, [multiLocked]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const qs = sessionQuestionsRef.current;
      if (qs.length === 0 || resultRef.current) return;
      const i = Math.max(0, Math.min(qs.length - 1, currentIndexRef.current));
      if (e.key === "ArrowRight") {
        setCurrentIndex(Math.min(qs.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowLeft") {
        setCurrentIndex(Math.max(0, i - 1));
        return;
      }
      const q = qs[i];
      if (!q) return;
      if (e.key === "f" || e.key === "F") {
        toggleFlag(q.id);
        return;
      }
      const picked = answersRef.current[q.id];
      if (picked !== undefined && (q.questionType !== "MULTIPLE_CHOICE" || multiLockedRef.current[q.id] === true)) return;
      const idx =
        ["1", "2", "3", "4", "5", "6"].indexOf(e.key) >= 0
          ? ["1", "2", "3", "4", "5", "6"].indexOf(e.key)
          : ["a", "b", "c", "d", "e", "f"].indexOf(e.key.toLowerCase());
      if (idx < 0 || q.options[idx] === undefined) return;
      const opt = q.options[idx];
      if (q.questionType === "MULTIPLE_CHOICE") {
        const cur = answersRef.current[q.id] ?? [];
        const next = cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt];
        if (next.length === 0) return;
        setAnswers((prev) => ({ ...prev, [q.id]: next }));
      } else {
        setAnswers((prev) => {
          if (prev[q.id] !== undefined) return prev;
          return { ...prev, [q.id]: [opt] };
        });
        setUndoPick(q.id);
        if (undoTimer.current != null) window.clearTimeout(undoTimer.current);
        undoTimer.current = window.setTimeout(() => setUndoPick(null), 4000);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // Empty deps are correct: everything read here is ref-held or a stable
    // setter (setCurrentIndex/setAnswers/toggleFlag), never render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jump helper: clamps + moves; the sticky bar keeps timer visible.
  const gotoQuestion = useCallback((i: number) => {    const total = sessionQuestionsRef.current.length;
    setCurrentIndex(Math.max(0, Math.min(Math.max(0, total - 1), i)));
  }, []);

  // Safe navigation: block route/tab close while a quick-practice submission is
  // in flight so a mobile browser kill can't abandon the request mid-flight.
  useEffect(() => {
    if (!submitting) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [submitting]);

  return (
    <div className="space-y-6">
      {/* Sprint 7: display-voice header, matches Home (eyebrow + Bricolage h1). */}
      <div>
        <p className="command-eyebrow">Practice</p>
        <h1 className="font-display text-xl font-semibold tracking-tight mt-1" style={{ color: "var(--dashboard-text-primary)" }}>
          প্র্যাকটিস
        </h1>
      </div>
      {/* Mode cards, visual picker (mobile stack, desktop 3-col) */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <PracticeModeCards mode={mode} onChange={setMode} quickTotal={totalCount} ecosystem={ecosystem} />
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
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="command-card command-card--hero overflow-hidden"
              >
                <div className="border-b border-[var(--border-subtle)] pb-3 mb-5 flex items-center justify-between gap-2">
                  <span className="command-eyebrow">Quick Practice</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-muted)" }}>{ecosystem === "BCS" ? "BCS" : "ব্যাংক"} · {subjects.length} বিষয়</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sun className="w-5 h-5 text-[var(--dashboard-primary)]" />
                    <h2 className="font-display text-lg font-bold" style={{ color: "var(--dashboard-text-primary)" }}>কুইক প্র্যাকটিস</h2>
                    <span className={`ml-2 text-[10px] font-mono px-2 py-0.5 rounded-full border ${ecosystem === "BCS" ? "bg-[var(--dashboard-primary-subtle)] border-[var(--dashboard-primary)]/20 text-[var(--dashboard-primary)]" : "bg-amber-500/10 border-amber-500/20 text-amber-600"}`}>{ecosystem === "BCS" ? "BCS" : "ব্যাংক"}</span>
                  </div>
                  <p className="text-xs text-[var(--dashboard-text-secondary)] font-mono">
                    যেকোনো বিষয়ের নির্দিষ্ট টপিক ও সাবটপিক বেছে নিয়ে তৎক্ষণাৎ প্রশ্ন অনুশীলন করুন।
                  </p>
                </div>
              </motion.div>

              {configLoading && (
                <div className="command-card p-10 text-center">
                  <Spinner className="w-10 h-10 mx-auto mb-3 text-[var(--accent)] animate-spin" aria-hidden="true" />
                  <p className="text-sm text-[var(--dashboard-text-secondary)] font-mono">বিষয় লোড হচ্ছে...</p>
                </div>
              )}

              {configError && (
                <div className="command-card p-10 text-center">
                  <Warning className="w-10 h-10 mx-auto mb-3 text-[var(--warning)]" aria-hidden="true" />
                  <p className="text-sm text-[var(--dashboard-text-muted)]">{configError}</p>
                  <button
                    onClick={() => {
                      setConfigLoading(true);
                      setConfigError(null);
                      void (async () => {
                        try {
        const list = await api.examConfig(ecosystem);
                          setSubjects(list);
                        } catch {
                          setConfigError("কনফিগারেশন লোড করা যায়নি। আবার চেষ্টা করুন।");
                        } finally {
                          setConfigLoading(false);
                        }
                      })();
                    }}
                    className="mt-4 px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
                  >
                    আবার চেষ্টা করুন
                  </button>
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

                  {/* Sticky one-handed start dock: totals + difficulty + time + start stay
                      pinned above the bottom nav, no scrolling to begin. */}
                  <PracticeStartDock
                    totalCount={totalCount}
                    availableTotal={availableTotal}
                    insufficient={insufficient}
                    durationMin={durationMin}
                    durationTouched={durationTouched}
                    difficulty={difficulty}
                    onDifficultyChange={setDifficulty}
                    autoCaption={
                      durationTouched
                        ? " · নিজে নির্ধারিত"
                        : totalCount > 0
                          ? ` · ${totalCount}×৩০সে`
                          : ""
                    }
                    selectedCount={selectedSubjects.length}
                    loading={loading}
                    onAdjustDuration={adjustDuration}
                    onStart={() => setShowQuickConfirm(true)}
                  />
                  {!durationTouched && totalCount > 0 && durationMin !== autoMin && (
                    <p className="text-[11px] text-[var(--dashboard-text-muted)] font-mono">
                      অটো সময় {autoMin} মিনিট ({formatDurationShort(autoSec)}), প্রয়োজনে +/− দিয়ে বদলাতে পারেন।
                    </p>
                  )}

                  <p className="text-[11px] text-[var(--dashboard-text-muted)] font-mono">
                    স্কোরিং: সঠিক +১ • ভুল {negativeLabel} • না দেওয়া ০ ({ecosystem === "BCS" ? "BCS" : "ব্যাংক"} নিয়ম)
                  </p>

                  {insufficient && (
                    <div className="flex items-start gap-2 rounded-xl border border-[var(--warning)]/30 bg-[var(--dashboard-warning-subtle)] p-3 text-xs text-[var(--dashboard-warning)]">
                      <Warning className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p>
                        নির্বাচিত টপিক থেকে শুধু <span className="font-mono">{availableTotal}টি</span> প্রশ্ন
                        পাওয়া যায়, মোট <span className="font-mono">{totalCount}টি</span> চাওয়া হয়েছে।
                      </p>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* Pre-exam confirmation, title, count, duration, scoring, finality.
              Portaled (see ModalPortal): inline sheets trap under the mobile
              bottom nav. */}
          {showQuickConfirm && !sessionActive && (
            <ModalPortal>
            <div className="fixed inset-0 z-[var(--z-modal)] bg-[var(--overlay)] backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={closeQuickConfirm}>
              <div ref={quickConfirmDialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-confirm-title" tabIndex={-1} onClick={(e) => e.stopPropagation()} className="rounded-t-2xl sm:rounded-2xl border p-5 sm:p-6 w-full sm:max-w-md max-h-[88vh] overflow-y-auto overscroll-contain" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-lg)" }}>
                <h3 id="quick-confirm-title" className="text-base font-bold mb-4" style={{ color: "var(--dashboard-text-primary)" }}>প্র্যাকটিস শুরু করুন</h3>
                <dl className="space-y-2 mb-5 text-xs font-mono">
                  <div className="flex justify-between gap-3"><dt style={{ color: "var(--dashboard-text-muted)" }}>বিষয়</dt><dd className="text-right" style={{ color: "var(--dashboard-text-primary)" }}>{sessionTitle || "—"}</dd></div>
                  <div className="flex justify-between gap-3"><dt style={{ color: "var(--dashboard-text-muted)" }}>প্রশ্ন</dt><dd style={{ color: "var(--dashboard-primary)" }}>{totalCount}টি</dd></div>
                  <div className="flex justify-between gap-3"><dt style={{ color: "var(--dashboard-text-muted)" }}>সময়</dt><dd style={{ color: "var(--dashboard-primary)" }}>{durationMin} মিনিট</dd></div>
                  <div className="flex justify-between gap-3"><dt style={{ color: "var(--dashboard-text-muted)" }}>স্কোরিং</dt><dd className="text-right" style={{ color: "var(--dashboard-text-primary)" }}>সঠিক +১ • ভুল {negativeLabel} • বাকি ০</dd></div>
                </dl>
                <p className="text-[11px] mb-5" style={{ color: "var(--dashboard-text-muted)" }}>সময় শেষ হলে উত্তরগুলো স্বয়ংক্রিয়ভাবে জমা হবে। মাঝপথে বেরিয়ে গেলেও অগ্রগতি সংরক্ষিত থাকবে।</p>
                <div className="flex gap-3">
                  <button type="button" onClick={closeQuickConfirm} className="flex-1 py-2.5 min-h-[48px] border rounded-xl text-sm font-mono" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}>ফিরে যান</button>
                  <button type="button" onClick={() => void startSession()} disabled={loading || totalCount === 0} aria-busy={loading} className="flex-1 py-2.5 min-h-[48px] rounded-xl text-sm font-mono font-bold disabled:opacity-40" style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}>{loading ? "তৈরি হচ্ছে..." : `শুরু করুন · ${totalCount}টি`}</button>
                </div>
              </div>
            </div>
            </ModalPortal>
          )}

          {/* Loading state */}
          {sessionActive && loading && (
            <div className="command-card p-10 text-center">
              <Spinner className="w-10 h-10 mx-auto mb-3 text-[var(--accent)] animate-spin" aria-hidden="true" />
              <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">প্রশ্ন লোড হচ্ছে...</p>
            </div>
          )}

          {/* Error state */}
          {sessionActive && !loading && loadError && (
            <div className="command-card p-10 text-center">
              <Warning className="w-10 h-10 mx-auto mb-3 text-[var(--warning)]" aria-hidden="true" />
              <p className="text-sm text-[var(--dashboard-text-muted)]">{loadError}</p>
              <button
                onClick={() => void startSession()}
                className="mt-4 px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
              >
                আবার চেষ্টা করুন
              </button>
              <button
                onClick={resetSession}
                className="mt-4 ml-2 px-4 py-2 bg-[var(--surface-overlay)] text-[var(--dashboard-text-secondary)] font-mono text-sm rounded-lg hover:bg-[var(--surface-muted)] transition-colors"
              >
                ফিরে যান
              </button>
            </div>
          )}

          {/* Empty state */}
          {sessionActive && !loading && !loadError && questions.length === 0 && !result && (
            <div className="command-card p-10 text-center">
              <Package className="w-10 h-10 mx-auto mb-3 text-[var(--dashboard-text-secondary)]" aria-hidden="true" />
              <p className="text-sm text-[var(--dashboard-text-muted)]">কোনো প্রশ্ন পাওয়া যায়নি।</p>
              <button
                onClick={resetSession}
                className="mt-4 px-4 py-2 bg-[var(--surface-overlay)] text-[var(--dashboard-text-secondary)] font-mono text-sm rounded-lg hover:bg-[var(--surface-muted)] transition-colors"
              >
                ফিরে যান
              </button>
            </div>
          )}

          {/* Active quiz session */}
          {sessionActive && !loading && !loadError && !result && totalQuestions > 0 && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              // Marks the live exam workspace: the dashboard shell's global
              // digit→tab shortcuts stay inert inside it (see layout).
              data-exam-session="quick-practice"
              className="rounded-2xl border overflow-hidden"
              style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
            >
              {/* Sticky session bar, progress rail + palette + timer stay pinned
                  while the stem/options scroll (overscroll-contain stops chain). */}
              <div className="sticky top-0 z-[var(--z-sticky)] border-b backdrop-blur-md" style={{ borderColor: "var(--dashboard-border-muted)", background: "color-mix(in srgb, var(--dashboard-surface-muted) 88%, transparent)" }}>
                <div className="px-4 sm:px-5 pt-3 pb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: "var(--dashboard-primary)" }} aria-hidden="true" />
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--dashboard-text-primary)" }}>{sessionTitle}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {!result && sessionStartsAt > 0 && sessionDurationSec > 0 && (
                      <PracticeTimer
                        key={`timer-${timerKey}-${sessionStartsAt}`}
                        startsAt={sessionStartsAt}
                        durationSec={sessionDurationSec}
                        onExpire={() => { void handleAutoSubmit(); }}
                      />
                    )}
                    <span className="text-xs font-mono tabular-nums" style={{ color: "var(--dashboard-text-muted)" }} aria-live="polite">
                      {currentIndex + 1}/{totalQuestions}
                    </span>
                  </div>
                </div>
                <div
                  className="mx-4 sm:mx-5 h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--dashboard-surface-muted)" }}
                  role="progressbar"
                  aria-label="Practice progress"
                  aria-valuemin={0}
                  aria-valuemax={totalQuestions}
                  aria-valuenow={answeredCount}
                  aria-valuetext={`${answeredCount} of ${totalQuestions} answered`}
                >
                  <div
                    className="h-full w-full origin-left rounded-full transition-transform duration-200"
                    style={{ transform: `scaleX(${totalQuestions > 0 ? answeredCount / totalQuestions : 0})`, background: "var(--dashboard-primary)" }}
                  />
                </div>
                {/* Question palette, dots scroll horizontally, never wrap the bar taller.
                    Legend below uses icon + text so status never relies on color alone. */}
                <div className="px-4 sm:px-5 pt-2 flex items-center gap-1.5 overflow-x-auto overscroll-contain" role="group" aria-label="প্রশ্ন তালিকা">
                  {sessionQuestions.map((q, i) => {
                    const answered = answers[q.id] !== undefined;
                    const current = i === currentIndex;
                    const isFlagged = flagged[q.id] === true;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => gotoQuestion(i)}
                        aria-label={`প্রশ্ন ${i + 1}${answered ? ", উত্তর দেওয়া" : ""}${current ? ", বর্তমান" : ""}${isFlagged ? ", ফ্ল্যাগ করা" : ""}`}
                        aria-current={current ? "true" : undefined}
                        className={`flex-shrink-0 w-11 h-11 min-w-[44px] rounded-lg font-mono text-[11px] tabular-nums border cursor-pointer transition-[background-color,color,border-color] duration-150 [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--dashboard-surface)] ${
                          current ? "" : "hover:border-[var(--dashboard-primary)]/40"
                        }`}
                        style={
                          current
                            ? { background: "var(--dashboard-primary)", borderColor: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)", fontWeight: 700 }
                            : isFlagged
                              ? { background: "var(--dashboard-warning-subtle)", borderColor: "var(--dashboard-warning)", color: "color-mix(in srgb, var(--dashboard-warning) 60%, var(--dashboard-text-primary))", fontWeight: 700 }
                              : answered
                              ? { background: "var(--dashboard-primary-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-primary) 30%, transparent)", color: "color-mix(in srgb, var(--dashboard-primary) 60%, var(--dashboard-text-primary))", fontWeight: 600 }
                              : { background: "transparent", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-muted)" }
                        }
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
                <ul className="px-4 sm:px-5 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono" style={{ color: "var(--dashboard-text-muted)" }} aria-label="প্রশ্ন অবস্থার নির্দেশিকা">
                  <li className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "var(--dashboard-primary)" }} aria-hidden="true" /> বর্তমান</li>
                  <li className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full border" style={{ borderColor: "var(--dashboard-primary)", background: "var(--dashboard-primary-subtle)" }} aria-hidden="true" /> ✓ উত্তর দেওয়া</li>
                  <li className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "var(--dashboard-warning)" }} aria-hidden="true" /> ⚑ ফ্ল্যাগ</li>
                  <li className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full border" style={{ borderColor: "var(--dashboard-border-muted)" }} aria-hidden="true" /> ○ বাকি</li>
                </ul>
              </div>

              <div
                className="p-4 sm:p-5 overscroll-contain"
                onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
                onTouchEnd={(e) => {
                  if (touchX.current == null) return;
                  const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
                  touchX.current = null;
                  if (Math.abs(dx) < 60) return;
                  if (dx < 0) gotoQuestion(currentIndex + 1);
                  else gotoQuestion(currentIndex - 1);
                }}
              >

                {currentQuestion && (
                  <motion.div
                    key={currentQuestion.id}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: "easeOut" }}
                    className="scroll-mt-28"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="sr-only" aria-live="polite">প্রশ্ন {currentIndex + 1} / {totalQuestions}</span>
                      <MetaChip
                        tone={
                          currentQuestion.difficulty === "EASY"
                            ? "primary"
                            : currentQuestion.difficulty === "MEDIUM"
                              ? "warning"
                              : "danger"
                        }
                        label={`কাঠিন্য: ${DIFFICULTY_LABEL[currentQuestion.difficulty] ?? currentQuestion.difficulty}`}
                      >
                        {DIFFICULTY_LABEL[currentQuestion.difficulty] ?? currentQuestion.difficulty}
                      </MetaChip>
                      {currentQuestion.topic && (
                        <MetaChip tone="neutral">{currentQuestion.topic}</MetaChip>
                      )}
                      {currentQuestion.subtopic && (
                        <MetaChip tone="neutral">{currentQuestion.subtopic}</MetaChip>
                      )}
                      <button
                        type="button"
                        onClick={() => currentQuestion && toggleFlag(currentQuestion.id)}
                        aria-pressed={currentQuestion ? flagged[currentQuestion.id] === true : false}
                        aria-label="পরে দেখার জন্য ফ্ল্যাগ করুন"
                        className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-full border font-mono text-[11px] cursor-pointer transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                        style={
                          currentQuestion && flagged[currentQuestion.id]
                            ? { color: "color-mix(in srgb, var(--dashboard-warning) 60%, var(--dashboard-text-primary))", borderColor: "var(--dashboard-warning)", background: "var(--dashboard-warning-subtle)" }
                            : { color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)", background: "transparent" }
                        }
                      >
                        <Flag className="w-3.5 h-3.5" weight={currentQuestion && flagged[currentQuestion.id] ? "fill" : "regular"} aria-hidden="true" />
                        ফ্ল্যাগ
                      </button>
                      <span className="text-[11px] text-[var(--dashboard-text-secondary)] font-mono ml-auto" aria-live="polite">
                        {answeredCount}/{totalQuestions} উত্তর
                      </span>
                    </div>

                    <QuestionRenderer
                      question={currentQuestion}
                      selected={answers[currentQuestion.id] ?? []}
                      locked={isLocked(currentQuestion)}
                      onSelect={(next) => selectAnswer(currentQuestion.id, next)}
                    />
                    {isMulti(currentQuestion) && !isLocked(currentQuestion) && (answers[currentQuestion.id] ?? []).length > 0 && (
                      <button
                        onClick={() => lockMultiAnswer(currentQuestion.id)}
                        className="w-full mt-3 py-3 min-h-[48px] rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold cursor-pointer transition-[background-color,opacity] duration-150 hover:bg-[var(--accent-hover)] active:opacity-90 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                      >
                        <Check className="w-4 h-4" aria-hidden="true" /> উত্তর লক করুন ({(answers[currentQuestion.id] ?? []).length}টি নির্বাচিত)
                      </button>
                    )}
                    {isLocked(currentQuestion) && (
                      <div className="flex flex-wrap items-center gap-2 mb-4 mt-3">
                        <p role="status" className="inline-flex items-center gap-1.5 text-xs font-mono rounded-full border px-3 py-1.5" style={{ color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
                          <Check className="w-3.5 h-3.5" aria-hidden="true" /> উত্তর লক হয়েছে
                        </p>
                        {undoPick === currentQuestion.id && !isMulti(currentQuestion) && (
                          <button
                            type="button"
                            onClick={() => undoSinglePick(currentQuestion.id)}
                            aria-label="ভুলে চাপ দেওয়া উত্তর ফিরিয়ে নিন"
                            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border font-mono text-xs font-bold cursor-pointer transition-[background-color,color,border-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                            style={{ color: "var(--dashboard-primary)", borderColor: "color-mix(in srgb, var(--dashboard-primary) 40%, transparent)", background: "var(--dashboard-primary-subtle)" }}
                          >
                            <ArrowCounterClockwise className="w-3.5 h-3.5" aria-hidden="true" /> ভুলে চাপ? ফিরিয়ে নিন
                          </button>
                        )}
                      </div>
                    )}

                    {/* Sticky thumb nav, always in reach above the bottom nav */}
                    <div className="sticky z-[var(--z-sticky)] bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom,0px)+8px)] lg:bottom-2 -mx-1 px-1 pt-2 pb-1" style={{ background: "linear-gradient(to top, var(--dashboard-surface) 70%, transparent)" }}>
                      <div className="flex items-center gap-2 rounded-2xl border p-2 backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--dashboard-surface-muted) 92%, transparent)", borderColor: "var(--dashboard-border-muted)" }}>
                        <button
                          onClick={() => gotoQuestion(currentIndex - 1)}
                          disabled={currentIndex === 0}
                          aria-label="আগের প্রশ্ন"
                          className="flex-1 min-h-[48px] px-4 py-2.5 border font-mono text-sm rounded-xl cursor-pointer transition-[background-color,color,border-color,opacity] duration-150 [touch-action:manipulation] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                          style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}
                        >
                          <CaretLeft className="w-4 h-4" aria-hidden="true" /> আগের
                        </button>
                        <span className="text-xs font-mono tabular-nums flex-shrink-0 px-1" style={{ color: "var(--dashboard-text-muted)" }} aria-live="polite">
                          {currentIndex + 1}/{totalQuestions}
                        </span>
                        {currentIndex < totalQuestions - 1 ? (
                          <button
                            onClick={() => gotoQuestion(currentIndex + 1)}
                            aria-label="পরের প্রশ্ন"
                            className="flex-1 min-h-[48px] px-4 py-2.5 border font-mono text-sm rounded-xl cursor-pointer transition-[background-color,color,border-color] duration-150 [touch-action:manipulation] flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                            style={{ background: "var(--dashboard-primary)", borderColor: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}
                          >
                            পরের <CaretRight className="w-4 h-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); handleSubmitRequest(); }}
                            disabled={submitting}
                            aria-busy={submitting}
                            aria-label="ফলাফল জমা দিন"
                            className="flex-1 px-5 py-2.5 min-h-[48px] font-mono text-sm rounded-xl cursor-pointer transition-[background-color,opacity] duration-150 [touch-action:manipulation] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                            style={{ background: "var(--accent)", color: "var(--dashboard-text-inverse)" }}
                          >
                            {submitting ? "জমা হচ্ছে..." : "ফলাফল জমা দিন"}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* Submit error + offline outbox, visible in-session (the result
              panel only mounts on success, so failures need their own slot). */}
          {mode === "quick" && !loading && !result && (submitError || offlineQueued) && (
            <div className="rounded-2xl border p-4 flex flex-wrap items-center gap-3" style={{ borderColor: "var(--dashboard-warning)", background: "var(--dashboard-warning-subtle)" }} role="alert">
              <Warning className="w-5 h-5 flex-shrink-0" style={{ color: "var(--dashboard-warning)" }} aria-hidden="true" />
              <p className="text-xs font-mono flex-1 min-w-[200px]" style={{ color: "var(--dashboard-text-primary)" }}>
                {submitError ?? "উত্তর সংরক্ষিত আছে।"}
              </p>
              {offlineQueued && (
                <>
                  <button
                    type="button"
                    onClick={() => void retryQueuedSubmit().catch(() => {})}
                    disabled={submitting}
                    aria-busy={submitting}
                    className="px-4 py-2 min-h-[44px] rounded-xl font-mono text-xs font-bold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}
                  >
                    {submitting ? "জমা হচ্ছে..." : "আবার জমা দিন"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { clearQueuedPracticeSubmit(); setOfflineQueued(false); setSubmitError(null); }}
                    className="px-4 py-2 min-h-[44px] rounded-xl border font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    style={{ borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}
                  >
                    বাতিল করুন
                  </button>
                </>
              )}
            </div>
          )}

          {/* Unanswered confirm for quick practice (portaled: see note above) */}
          {showUnansweredConfirm && (
            <ModalPortal>
            <div className="fixed inset-0 z-[var(--z-modal)] bg-[var(--overlay)] backdrop-blur-sm flex items-center justify-center p-4" onClick={closeUnansweredConfirm}>
              <div ref={unansweredDialogRef} role="dialog" aria-modal="true" aria-label="উত্তর দেওয়া বাকি আছে" onClick={(e) => e.stopPropagation()} className="rounded-2xl border p-6 w-full max-w-sm" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-lg)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Warning className="w-5 h-5" style={{ color: "var(--dashboard-warning)" }} />
                  <h3 className="text-base font-bold" style={{ color: "var(--dashboard-text-primary)" }}>উত্তর দেওয়া বাকি আছে</h3>
                </div>
                <p className="text-sm mb-5" style={{ color: "var(--dashboard-text-secondary)" }}>
                  <span className="font-mono" style={{ color: "var(--dashboard-warning)" }}>{totalQuestions - answeredCount}টি</span> প্রশ্নে উত্তর দেওয়া হয়নি। নিশ্চিতভাবে জমা দিতে চান?
                </p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowUnansweredConfirm(false)} className="flex-1 py-2.5 border rounded-xl text-sm" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}>ফিরে যান</button>
                  <button type="button" onClick={(e) => { e.preventDefault(); finalizeSubmit(); }} disabled={submitting} aria-busy={submitting} className="flex-1 py-2.5 min-h-11 rounded-xl text-sm disabled:opacity-40" style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}>জমা দিন</button>
                </div>
              </div>
            </div>
            </ModalPortal>
          )}

          {/* Result panel */}
          {result && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border overflow-hidden"
              style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
            >
              <div className="p-6 text-center border-b" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
                <Trophy className={`w-12 h-12 mx-auto mb-3 ${
                  result.score >= 80 ? "text-[var(--dashboard-warning)]" : result.score >= 50 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-danger)]"
                }`} />
                <h3 className="text-xl font-bold mb-2" style={{ color: "var(--dashboard-text-primary)" }}>প্র্যাকটিস সম্পন্ন!</h3>
                <ScoreRing percentage={result.score} label="Practice score" />
                <p className="text-sm font-mono mb-1" style={{ color: "var(--dashboard-text-secondary)" }}>
                  {result.correct} / {result.total} সঠিক
                </p>
                {result.wrong !== undefined && (
                  <p className="text-xs font-mono mb-1" style={{ color: "var(--dashboard-text-secondary)" }}>
                    ভুল {result.wrong}টি × {negativeLabelForEcosystem(ecosystem)} = −{result.negativeMarks ?? 0} • নিট {result.finalScore ?? result.correct}
                  </p>
                )}
                <p className="text-xs font-mono" style={{ color: "var(--dashboard-text-secondary)" }}>
                  +{result.pointsEarned} পয়েন্ট অর্জিত
                </p>
                {submitError && (
                  <p className="mt-3 text-xs text-[var(--dashboard-danger)]">{submitError}</p>
                )}
                <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
                  <button
                    onClick={() => {
                      dropExamSnapshot(QUICK_STORAGE_KEY);
                    setSessionActive(false);
                    setResult(null);
                    setAnswers({});
                    setMultiLocked({});
                    setCurrentIndex(0);
                      setQuestions([]);
                      setReviewFilter("all");
                      setExpandedReview({});
                                        setTimerKey((k) => k + 1);
                      setSessionStartsAt(0);
                      setSessionDurationSec(0);
                    }}
                    className="px-5 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-2"
                  >
                    <ArrowCounterClockwise className="w-4 h-4" /> আবার প্র্যাকটিস
                  </button>
                  <button
                    onClick={resetSession}
                    className="px-5 py-2.5 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-secondary)] font-mono text-sm rounded-xl hover:bg-[var(--surface-overlay)] transition-colors flex items-center gap-2"
                  >
                    <Target className="w-4 h-4" /> নতুন নির্বাচন
                  </button>
                  {sessionQuestions.some((q) => {
                    const ua = answers[q.id] ?? [];
                    return ua.length === 0 || !isAnswerCorrect(q, ua);
                  }) && (
                    <button
                      onClick={() => {
                        const retryQs = sessionQuestions.filter((q) => {
                          const ua = answers[q.id] ?? [];
                          return ua.length === 0 || !isAnswerCorrect(q, ua);
                        });
                        if (retryQs.length === 0) return;
                        setQuestions(retryQs);
                        setAnswers({});
                        setMultiLocked({});
                        setFlagged({});
                        setCurrentIndex(0);
                        setResult(null);
                        setReviewFilter("all");
                        setExpandedReview({});
                        setTimerKey((k) => k + 1);
                        // Fresh wall-clock for the retry round, persisted immediately.
                        const retrySec = Math.max(60, retryQs.length * QUESTION_TIME_LIMIT);
                        const retryStartsAt = Date.now();
                        setSessionStartsAt(retryStartsAt);
                        setSessionDurationSec(retrySec);
                        saveExamSnapshot(QUICK_STORAGE_KEY, { questions: retryQs, answers: {}, multiLocked: {}, currentIndex: 0, startsAt: retryStartsAt, durationSec: retrySec });
                        requestAnimationFrame(() => scrollDashboardTop());
                      }}
                      className="px-5 py-2.5 min-h-[48px] bg-[var(--dashboard-primary)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:brightness-110 active:opacity-90 cursor-pointer transition-all flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    >
                      <ArrowCounterClockwise className="w-4 h-4" /> ভুলগুলো আবার ({sessionQuestions.filter((q) => { const ua = answers[q.id] ?? []; return ua.length === 0 || !isAnswerCorrect(q, ua); }).length})
                    </button>
                  )}
                  {sessionQuestions.some((q) => {
                    const ua = answers[q.id] ?? [];
                    return ua.length > 0 && !isAnswerCorrect(q, ua);
                  }) && (
                    <button
                      onClick={() => {
                        const wrongSubject = sessionQuestions.find((q) => {
                          const ua = answers[q.id] ?? [];
                          return ua.length > 0 && !isAnswerCorrect(q, ua);
                        })?.subject;
                        setMistakeIntent(wrongSubject ? { subject: wrongSubject } : null);
                        router.push("/dashboard/mistakes");
                      }}
                      className="px-5 py-2.5 bg-[var(--dashboard-warning-subtle)] border border-[var(--dashboard-warning)]/30 font-mono text-sm rounded-xl hover:brightness-110 transition-all flex items-center gap-2"
                      style={{ color: "color-mix(in srgb, var(--dashboard-warning) 60%, var(--dashboard-text-primary))" }}
                    >
                      <XCircle className="w-4 h-4" /> ভুলগুলো পর্যালোচনা করুন
                    </button>
                  )}
                </div>
              </div>

              {/* Review, filter tabs + lazy-expand disclosures (AI mounts on open) */}
              <div className="p-4 sm:p-5">
                <div className="mb-3">
                  <TopicBars
                    items={sessionQuestions.map((q) => {
                      const ua = answers[q.id] ?? [];
                      return {
                        subject: q.subject,
                        topic: q.topic,
                        status: ua.length === 0 ? ("unanswered" as const) : isAnswerCorrect(q, ua) ? ("correct" as const) : ("wrong" as const),
                      };
                    })}
                  />
                </div>
                {(() => {
                  const verdictOf = (q: Server.QuestionDTO) => {
                    const ua = answers[q.id] ?? [];
                    if (ua.length === 0) return "unanswered" as const;
                    return isAnswerCorrect(q, ua) ? "correct" as const : "wrong" as const;
                  };
                  const counts = { all: sessionQuestions.length, correct: 0, wrong: 0, unanswered: 0 };
                  for (const q of sessionQuestions) counts[verdictOf(q)] += 1;
                  const tabs: { id: ReviewFilter; label: string }[] = [
                    { id: "all", label: `সব ${counts.all}` },
                    { id: "correct", label: `সঠিক ${counts.correct}` },
                    { id: "wrong", label: `ভুল ${counts.wrong}` },
                    { id: "unanswered", label: `বাকি ${counts.unanswered}` },
                  ];
                  const visible = sessionQuestions
                    .map((q, i) => ({ q, i, verdict: verdictOf(q) }))
                    .filter(({ verdict }) => reviewFilter === "all" || verdict === reviewFilter);
                  return (
                    <>
                      <div className="flex gap-1.5 overflow-x-auto overscroll-contain pb-1 mb-3" role="group" aria-label="উত্তর ফিল্টার">
                        {tabs.map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setReviewFilter(tab.id)}
                            aria-pressed={reviewFilter === tab.id}
                            className={`flex-shrink-0 min-h-[44px] px-4 rounded-xl border font-mono text-xs cursor-pointer transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] ${
                              reviewFilter === tab.id
                                ? "bg-[var(--dashboard-primary)] text-[var(--dashboard-text-inverse)] border-[var(--dashboard-primary)]"
                                : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-secondary)] hover:border-[var(--dashboard-primary)]/40"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      {visible.length === 0 ? (
                        <p className="text-xs text-[var(--dashboard-text-muted)] font-mono text-center py-6">
                          এই ফিল্টারে কোনো প্রশ্ন নেই।
                        </p>
                      ) : (
                        <div className="max-h-96 overflow-y-auto overscroll-contain space-y-2">
                          {visible.map(({ q, i }) => {
                            const userAnswer = answers[q.id] ?? [];
                            const verdict = verdictOf(q);
                            const isCorrect = verdict === "correct";
                            const isUnanswered = verdict === "unanswered";
                            const open = expandedReview[q.id] === true;
                            const verdictLabel = isCorrect ? "সঠিক" : isUnanswered ? "উত্তর বাকি" : "ভুল";
                            return (
                              <div key={q.id} className={`rounded-xl border overflow-hidden transition-[border-color] duration-150 ${
                                isCorrect
                                  ? "border-[var(--dashboard-success)]/25"
                                  : isUnanswered
                                    ? "border-[var(--dashboard-teal)]/30"
                                    : "border-[var(--dashboard-danger)]/25"
                              }`} style={{ background: "var(--dashboard-surface)" }}>
                                <button
                                  type="button"
                                  onClick={() => setExpandedReview((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                                  aria-expanded={open}
                                  aria-label={`প্রশ্ন ${i + 1}, ${verdictLabel}, ${open ? "সংকুচিত করুন" : "বিস্তারিত দেখুন"}`}
                                  className="w-full flex items-center gap-3 p-3.5 min-h-[56px] text-left cursor-pointer transition-[background-color] duration-150 hover:bg-[var(--dashboard-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--dashboard-focus-ring)]"
                                >
                                  {isCorrect ? (
                                    <CheckCircle className="w-4 h-4 text-[var(--dashboard-success)] flex-shrink-0" aria-hidden="true" />
                                  ) : isUnanswered ? (
                                    <CircleDashed className="w-4 h-4 text-[var(--dashboard-teal)] flex-shrink-0" aria-hidden="true" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-[var(--dashboard-danger)] flex-shrink-0" aria-hidden="true" />
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                                      {i + 1}. <RichText text={q.question} />
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
                                      <p className="text-xs" style={{ color: "var(--dashboard-text-secondary)", fontFamily: 'inherit' }}>
                                        আপনার উত্তর:{" "}
                                        <span style={{ color: `color-mix(in srgb, var(${isCorrect ? "--dashboard-success" : isUnanswered ? "--dashboard-teal" : "--dashboard-danger"}) 60%, var(--dashboard-text-primary))`, fontWeight: 700 }}>
                                          {isUnanswered ? "উত্তর দেওয়া হয়নি" : <RichText text={serializeAnswer(userAnswer)} />}
                                        </span>
                                      </p>
                                      {!isCorrect && (
                                        <p className="text-xs mt-0.5" style={{ color: "color-mix(in srgb, var(--dashboard-success) 60%, var(--dashboard-text-primary))", fontFamily: 'inherit', fontWeight: 700 }}>
                                          সঠিক উত্তর: <RichText text={serializeAnswer(getCorrectSet(q))} />
                                        </p>
                                      )}
                                      {q.explanation && (
                                        <p className="text-xs mt-1.5" style={{ color: "var(--dashboard-text-secondary)", lineHeight: "1.7" }}><RichText text={q.explanation} /></p>
                                      )}
                                      <AIExplanationButton
                                        questionId={q.id}
                                        question={q.question}
                                        options={q.options}
                                        correctAnswer={q.correctAnswer}
                                        userAnswer={isUnanswered ? undefined : serializeAnswer(userAnswer)}
                                        subject={q.subject}
                                        topic={q.topic}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}