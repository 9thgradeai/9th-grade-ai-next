"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  Play,
  Timer,
  BookOpen,
  Trophy,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Minus,
  Plus,
  Layers,
  ListOrdered,
  Clock,
  Flag,
  CircleDashed,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import TopicTreePicker, {
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

const STORAGE_KEY = "ninth-grade-ai:exam:active";

type PersistedExam = {
  examId: string;
  questions: Server.ExamQuestionDTO[];
  answers: Record<number, string>;
  startsAt: number;
  durationSec: number;
  requested: number;
  available: number;
  shortfall: number;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Isolated timer leaf: the 1-second tick only re-renders this node, not the
// whole exam surface (which can hold many questions). The expiry callback is
// held in a ref so selecting an answer doesn't reset the interval.
function ExamTimer({
  startsAt,
  durationSec,
  onExpire,
}: {
  startsAt: number;
  durationSec: number;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, durationSec - Math.floor((Date.now() - startsAt) / 1000)),
  );
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (durationSec <= 0) return;
    const tick = () => {
      const rem = Math.max(0, durationSec - Math.floor((Date.now() - startsAt) / 1000));
      setRemaining(rem);
      if (rem <= 0) onExpireRef.current();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startsAt, durationSec]);

  const timeLow = remaining > 0 && remaining <= 60;
  return (
    <>
      <Timer className={`w-4 h-4 ${timeLow ? "text-[var(--dashboard-danger)] animate-pulse motion-reduce:animate-none" : "text-[var(--dashboard-primary)]"}`} />
      <span className={`font-mono text-lg font-bold ${timeLow ? "text-[var(--dashboard-danger)]" : "text-[var(--dashboard-primary)]"}`}>
        {formatTime(remaining)}
      </span>
      <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono hidden sm:inline">
        {durationSec > 0 ? "" : "সময় সীমাহীন"}
      </span>
    </>
  );
}

function performanceLabel(percentage: number): { label: string; tone: string } {
  if (percentage >= 80) return { label: "চমৎকার", tone: "text-[var(--dashboard-warning)]" };
  if (percentage >= 60) return { label: "ভালো", tone: "text-[var(--dashboard-primary)]" };
  if (percentage >= 40) return { label: "গড়", tone: "text-yellow-400" };
  return { label: "উন্নতি প্রয়োজন", tone: "text-[var(--dashboard-danger)]" };
}

export default function CustomExamTab() {
  // ── Config state ──
  const [subjects, setSubjects] = useState<Server.ExamSubjectDTO[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({});
  const [durationMin, setDurationMin] = useState(15);
  const [showConfirm, setShowConfirm] = useState(false);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  // ── Exam state ──
  const [exam, setExam] = useState<PersistedExam | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const [phase, setPhase] = useState<ExamPhase>("config");
  const [showUnansweredConfirm, setShowUnansweredConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const submittingRef = useRef(false);

  // ── Result state ──
  const [result, setResult] = useState<Server.ExamResultDTO | null>(null);

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
      const list = await api.examConfig();
      setSubjects(list.filter((s) => s.questionCount > 0));
    } catch {
      setConfigError("কনফিগারেশন লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
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
  }, []);

  const handleRetryConfig = () => {
    setConfigLoading(true);
    setConfigError(null);
    void fetchConfig();
  };

  // Resume an in-progress exam from localStorage so refresh/navigation does not
  // corrupt an active attempt. Runs after an async boundary; the countdown
  // effect auto-submits if the timer already ran out while away.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as PersistedExam;
        if (!saved?.questions?.length) return;
        setExam(saved);
        setAnswers(saved.answers ?? {});
        const elapsed = Math.floor((Date.now() - saved.startsAt) / 1000);
        void elapsed;
        setPhase("exam");
      } catch {
        /* corrupt storage — ignore */
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

  const adjustDuration = (delta: number) => {
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
      const persisted: PersistedExam = {
        examId: built.examId,
        questions: built.questions,
        answers: {},
        startsAt: Date.now(),
        durationSec: built.durationSec,
        requested: built.requested,
        available: built.available,
        shortfall: built.shortfall,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      } catch {
        /* storage full/blocked — exam still works, just not resumable */
      }
      setExam(persisted);
      setAnswers({});
      setShowConfirm(false);
      setPhase("exam");
    } catch {
      setBuildError("পরীক্ষা তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBuildLoading(false);
    }
  };

  const selectAnswer = (questionId: number, option: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: option };
      if (exam) {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...exam, answers: next }),
          );
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = exam?.questions.length ?? 0;
  const unanswered = totalQuestions - answeredCount;

  const scrollToQuestion = (questionId: number) => {
    questionRefs.current[questionId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = useCallback(
    async (qs: Server.ExamQuestionDTO[], ans: Record<number, string>) => {
      if (qs.length === 0 || submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const payload = qs.map((q) => ({ questionId: q.id, selected: ans[q.id] ?? "" }));
        const res = await api.submitExam(payload);
        setResult(res);
        setPhase("result");
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      } catch {
        setSubmitError("ফলাফল জমা দেওয়া যায়নি। আবার চেষ্টা করুন।");
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [],
  );

  const handleSubmitRequest = () => {
    if (unanswered > 0) {
      setShowUnansweredConfirm(true);
    } else if (exam) {
      void submit(exam.questions, answers);
    }
  };

  const finalizeSubmit = () => {
    setShowUnansweredConfirm(false);
    if (exam) void submit(exam.questions, answers);
  };

  const resetAll = () => {
    setPhase("config");
    setExam(null);
    setAnswers({});
    setResult(null);
    setSubmitError(null);
    setShowUnansweredConfirm(false);
    setSelection({});
    setDurationMin(15);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  // ═══════════════ CONFIG PHASE ═══════════════
  if (phase === "config") {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl border border-terminal-border overflow-hidden"
        >
          <div className="terminal-window-bar border-b border-terminal-border">
            <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
            <div className="flex-1 text-center text-xs text-[var(--dashboard-text-muted)] font-mono">
              {"// CUSTOM_BCS_EXAM_BUILDER"}
            </div>
          </div>
          <div className="p-5 md:p-6">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-[var(--dashboard-primary)]" />
              <h2 className="text-lg font-bold text-[var(--text-primary)]">কাস্টম বিসিএস পরীক্ষা</h2>
            </div>
            <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
              বিষয়, টপিক ও সাবটপিক বেছে নিয়ে নিজের পছন্দের পরীক্ষা তৈরি করুন — নেগেটিভ মার্কিং সহ বাস্তব বিসিএস ধাঁচে।
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
              onClick={handleRetryConfig}
              className="mt-4 px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
            >
              আবার চেষ্টা করুন
            </button>
          </div>
        )}

        {!configLoading && !configError && (
          <>
            {/* Subject → topic → subtopic selection (shared picker) */}
            <TopicTreePicker
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
                    {durationMin} মিনিট (প্রশ্নপ্রতি ~{Math.max(1, Math.round(durationMin / Math.max(1, totalCount)))} মি.)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustDuration(-1)}
                    className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] border border-emerald-500/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-emerald-500/40"
                    aria-label="সময় কমান"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-2xl font-bold text-[var(--dashboard-primary)] font-mono w-8 text-center">{durationMin}</span>
                  <button
                    onClick={() => adjustDuration(1)}
                    className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] border border-emerald-500/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-emerald-500/40"
                    aria-label="সময় বাড়ান"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {insufficient && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-[var(--dashboard-warning-subtle)] p-3 text-xs text-[var(--dashboard-warning)]">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  নির্বাচিত টপিক থেকে শুধু <span className="font-mono">{availableTotal}টি</span> প্রশ্ন
                  পাওয়া যায় — মোট <span className="font-mono">{totalCount}টি</span> চাওয়া হয়েছে।
                </p>
              </div>
            )}

            {overageSubjects.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-[var(--dashboard-warning-subtle)] p-3 text-xs text-[var(--dashboard-warning)]">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  {overageSubjects.map((s) => s.nameBn).join(", ")} এ চাওয়া প্রশ্ন সংখ্যা উপলব্ধের বেশি —
                  সর্বোচ্চ <span className="font-mono">{availableForSubject(overageSubjects[0], selection)}টি</span> হবে।
                </p>
              </div>
            )}

            {buildError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-[var(--dashboard-danger-subtle)] p-3 text-xs text-[var(--dashboard-danger)]">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{buildError}</p>
              </div>
            )}

            {/* Live config summary */}
            <motion.div
              layout
              className="glass-card rounded-2xl border border-emerald-500/30 p-4"
            >
              <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest mb-2">লাইভ কনফিগারেশন সামারি</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <ListOrdered className="w-4 h-4 mx-auto text-[var(--dashboard-primary)] mb-1" />
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

            <button
              onClick={() => setShowConfirm(true)}
              disabled={selectedSubjects.length === 0 || totalCount === 0 || buildLoading}
              className="mt-4 w-full py-3 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              কনফিগারেশন রিভিউ করে শুরু করুন
            </button>

            {/* Confirm modal */}
            <AnimatePresence>
              {showConfirm && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                  onClick={() => !buildLoading && setShowConfirm(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, y: 10 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 10 }}
                    onClick={(e) => e.stopPropagation()}
                    className="glass-card rounded-2xl border border-emerald-500/30 p-6 w-full max-w-md"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-[var(--text-primary)]">পরীক্ষা নিশ্চিত করুন</h3>
                      <button
                        onClick={() => setShowConfirm(false)}
                        disabled={buildLoading}
                        className="text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        aria-label="বন্ধ করুন"
                      >
                        <X className="w-5 h-5" />
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
                        <span className="text-[var(--text-primary)] font-mono">সঠিক +১ • ভুল −০.৫ • না দেওয়া ০</span>
                      </p>
                    </div>

                    {insufficient && (
                      <p className="text-[11px] text-[var(--dashboard-warning)] mb-4 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                        শুধু {availableTotal}টি প্রশ্ন উপলব্ধ — {totalCount}টি চাওয়া হয়েছে।
                      </p>
                    )}

                    <button
                      onClick={() => void confirmAndStart()}
                      disabled={buildLoading}
                      className="w-full py-3 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40"
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
          </>
        )}
      </div>
    );
  }

  // ═══════════════ EXAM PHASE ═══════════════
  if (phase === "exam" && exam) {
    const progressPct = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

    return (
      <div className="space-y-4">
        {/* Sticky header: timer + progress + submit */}
        <div className="sticky top-0 z-40 -mx-1 px-1">
          <div className="glass-card rounded-2xl border border-emerald-500/30 px-4 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <ExamTimer
                  startsAt={exam.startsAt}
                  durationSec={exam.durationSec}
                  onExpire={() => {
                    void submit(exam.questions, answers);
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">
                  উত্তর: <span className="text-[var(--dashboard-primary)]">{answeredCount}</span> / {totalQuestions}
                </span>
                <button
                  onClick={handleSubmitRequest}
                  disabled={submitting || totalQuestions === 0}
                  className="px-4 py-1.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs rounded-lg hover:bg-[var(--accent-hover)] transition-colors shadow-neon-glow flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Flag className="w-3.5 h-3.5" />
                  {submitting ? "জমা হচ্ছে..." : "জমা দিন"}
                </button>
              </div>
            </div>
            <div className="h-1.5 bg-[var(--surface-overlay)] rounded-full overflow-hidden mt-2">
              <div
                className="h-full w-full origin-left bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-transform duration-300"
                style={{ transform: `scaleX(${progressPct / 100})` }}
              />
            </div>
          </div>
        </div>

        {/* Question palette (jump navigation) */}
        <div className="glass-card rounded-2xl border border-terminal-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <CircleDashed className="w-3.5 h-3.5 text-[var(--dashboard-primary)]" />
            <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest">প্রশ্ন তালিকা</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {exam.questions.map((q, i) => {
              const isAnswered = answers[q.id] !== undefined;
              return (
                <button
                  key={q.id}
                  onClick={() => scrollToQuestion(q.id)}
                  className={`w-8 h-8 rounded-lg border text-xs font-mono transition-all ${
                    isAnswered
                      ? "border-emerald-500/40 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                      : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-zinc-700"
                  }`}
                  aria-label={`প্রশ্ন ${i + 1}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

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
                  {userAnswer !== undefined && (
                    <span className="ml-auto px-2 py-0.5 rounded bg-[var(--dashboard-primary-subtle)] border border-emerald-500/20 text-[10px] font-mono text-[var(--dashboard-primary)]">
                      ✓ উত্তর দেওয়া হয়েছে
                    </span>
                  )}
                </div>

                <div className="rounded-xl border p-4 mb-4" style={{ background: "var(--dashboard-surface-raised)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}>
                  <h3 className="text-sm md:text-[15px] font-semibold leading-relaxed" style={{ color: "var(--dashboard-text-primary)", lineHeight: "1.6" }}>{q.question}</h3>
                </div>

                <div className="space-y-2.5">
                  {q.options.map((option, i) => {
                    const isSelected = userAnswer === option;
                    return (
                      <button
                        key={i}
                        onClick={() => selectAnswer(q.id, option)}
                        className="w-full text-left p-3 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                        style={
                          isSelected
                            ? { background: "var(--dashboard-primary-subtle)", borderColor: "var(--dashboard-primary)", color: "var(--dashboard-primary)" }
                            : { background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-primary)" }
                        }
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-mono border" style={isSelected ? { background: "var(--dashboard-primary)", color: "white", borderColor: "var(--dashboard-primary)" } : { background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}>
                            {OPTION_LABELS[i] ?? i + 1}
                          </span>
                          <span className="text-sm font-medium">{option}</span>
                          {isSelected && <Check className="w-4 h-4 ml-auto" style={{ color: "var(--dashboard-primary)" }} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky submit bar */}
        <div className="sticky bottom-0 z-40 -mx-1 px-1 pb-1">
          <div className="glass-card rounded-2xl border border-emerald-500/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
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
              onClick={handleSubmitRequest}
              disabled={submitting}
              className="px-6 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors shadow-neon-glow flex items-center gap-2 disabled:opacity-40"
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

        {/* Unanswered confirmation modal */}
        <AnimatePresence>
          {showUnansweredConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setShowUnansweredConfirm(false)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card rounded-2xl border border-amber-500/30 p-6 w-full max-w-sm"
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-[var(--dashboard-warning)]" />
                  <h3 className="text-base font-bold text-[var(--text-primary)]">উত্তর দেওয়া বাকি আছে</h3>
                </div>
                <p className="text-sm text-[var(--dashboard-text-muted)] mb-5">
                  <span className="text-[var(--dashboard-warning)] font-mono">{unanswered}টি</span> প্রশ্নে উত্তর দেওয়া হয়নি।
                  নিশ্চিতভাবে জমা দিতে চান? না দেওয়া প্রশ্নে ০ নম্বর পাবেন।
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

  // ═══════════════ RESULT PHASE ═══════════════
  if (phase === "result" && result) {
    const { summary } = result;
    const perf = performanceLabel(summary.percentage);

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-2xl border border-emerald-500/30 overflow-hidden"
        >
          <div className="p-6 text-center border-b border-terminal-border">
            <Trophy className={`w-12 h-12 mx-auto mb-3 ${summary.percentage >= 80 ? "text-[var(--dashboard-warning)]" : summary.percentage >= 50 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-danger)]"}`} />
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">পরীক্ষা সম্পন্ন!</h3>
            <p className={`text-sm font-mono mb-4 ${perf.tone}`}>{perf.label}</p>

            <div className="inline-flex flex-col items-center mb-4">
              <div className="text-5xl font-bold font-mono text-[var(--dashboard-primary)]">{summary.finalScore}</div>
              <div className="text-xs text-[var(--dashboard-text-muted)] font-mono mt-1">মোট নম্বর: {summary.total}</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-md mx-auto text-left">
              <div className="rounded-xl bg-[var(--dashboard-primary-subtle)] border border-emerald-500/20 p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">সঠিক</p>
                <p className="text-lg font-bold text-[var(--dashboard-primary)] font-mono">+{summary.correct}</p>
              </div>
              <div className="rounded-xl bg-[var(--dashboard-danger-subtle)] border border-red-500/20 p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">ভুল</p>
                <p className="text-lg font-bold text-[var(--dashboard-danger)] font-mono">−{summary.wrong}</p>
              </div>
              <div className="rounded-xl bg-subtle border border-zinc-700 p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">উত্তর দেওয়া হয়নি</p>
                <p className="text-lg font-bold text-[var(--dashboard-text-muted)] font-mono">{summary.unanswered}</p>
              </div>
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

            <div className="mt-4 h-2 bg-[var(--surface-overlay)] rounded-full overflow-hidden max-w-md mx-auto">
              <div
                className={`h-full w-full origin-left rounded-full transition-transform duration-700 ${
                  summary.percentage >= 80 ? "bg-gradient-to-r from-amber-500 to-amber-400" : summary.percentage >= 50 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-red-500 to-red-400"
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

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={resetAll}
                className="px-5 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-2 shadow-neon-glow"
              >
                <RotateCcw className="w-4 h-4" /> নতুন পরীক্ষা
              </button>
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
            return (
              <motion.div
                key={item.questionId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.5) }}
                className={`glass-card rounded-2xl border p-4 ${
                  isCorrect ? "border-emerald-500/20" : isUnanswered ? "border-zinc-700" : "border-red-500/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isCorrect ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]" : isUnanswered ? "bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-text-muted)]" : "bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]"
                  }`}>
                    {isCorrect ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : isUnanswered ? (
                      <CircleDashed className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)]">প্রশ্ন {i + 1}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        isCorrect
                          ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                          : isUnanswered
                            ? "bg-[var(--surface-overlay)] text-[var(--dashboard-text-muted)]"
                            : "bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]"
                      }`}>
                        {isCorrect ? "+১" : isUnanswered ? "০" : "−০.৫"}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)]">{item.subject}</span>
                    </div>

                    <p className="text-sm text-[var(--text-primary)] mb-2">{item.question}</p>

                    {/* Options with correct/user highlighting */}
                    <div className="space-y-1 mb-2">
                      {item.options.map((option, oi) => {
                        const isUser = option === item.userAnswer;
                        const isRight = option === item.correctAnswer;
                        let cls = "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)]";
                        if (isRight) cls = "border-emerald-500/40 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]";
                        else if (isUser) cls = "border-red-500/40 bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]";
                        return (
                          <div key={oi} className={`rounded-lg border px-3 py-1.5 text-xs flex items-center gap-2 ${cls}`}>
                            <span className="font-mono">{OPTION_LABELS[oi] ?? oi + 1}</span>
                            <span className="flex-1">{option}</span>
                            {isRight && <Check className="w-3.5 h-3.5 text-[var(--dashboard-primary)]" />}
                            {isUser && !isRight && <X className="w-3.5 h-3.5 text-[var(--dashboard-danger)]" />}
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
                      আপনার উত্তর:{" "}
                      <span className={isCorrect ? "text-[var(--dashboard-primary)]" : isUnanswered ? "text-[var(--dashboard-text-muted)]" : "text-[var(--dashboard-danger)]"}>
                        {item.userAnswer || "উত্তর দেওয়া হয়নি"}
                      </span>
                      {!isCorrect && !isUnanswered && (
                        <>
                          {" "}• সঠিক উত্তর: <span className="text-[var(--dashboard-primary)]">{item.correctAnswer}</span>
                        </>
                      )}
                    </p>

                    {item.explanation && (
                      <p className="text-xs text-[var(--dashboard-text-muted)] mt-2 leading-relaxed">{item.explanation}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={resetAll}
            className="px-6 py-3 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-2 shadow-neon-glow"
          >
            <RotateCcw className="w-4 h-4" /> নতুন পরীক্ষা শুরু করুন
          </button>
        </div>
      </div>
    );
  }

  return null;
}