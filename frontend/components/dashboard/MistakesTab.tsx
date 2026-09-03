"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
  CheckCircle2,
  ChevronDown,
  X,
  Trophy,
  RotateCcw,
  BarChart3,
  Award,
  Clock,
} from "lucide-react";
import { api } from "@/lib/services/api";
import type {
  OverallStatsDTO,
  MistakeItemDTO,
  MistakeSelectionSubjectDTO,
  ExamBuildResultDTO,
} from "@/lib/types";
import ScrollPractice, { type DrillAnswered } from "./ScrollPractice";
import { useToastSafe } from "@/lib/toast-ctx";

type ViewMode = "dashboard" | "drilling" | "exam-result";

const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};
const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 28 } },
};

export default function MistakesTab() {
  const toast = useToastSafe();

  // ── State ──────────────────────────────────────────────
  const [view, setView] = useState<ViewMode>("dashboard");
  const [overall, setOverall] = useState<OverallStatsDTO | null>(null);
  const [selection, setSelection] = useState<MistakeSelectionSubjectDTO[]>([]);
  const [mistakes, setMistakes] = useState<MistakeItemDTO[]>([]);
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);

  // Mistake exam preferences (subject → topic → subtopic)
  const [selSubject, setSelSubject] = useState("");
  const [selTopic, setSelTopic] = useState("");
  const [selSubtopic, setSelSubtopic] = useState("");
  const [examCount, setExamCount] = useState(20);
  const [building, setBuilding] = useState(false);

  // Drill + result
  const [examResult, setExamResult] = useState<ExamBuildResultDTO | null>(null);
  const [drillResults, setDrillResults] = useState<DrillAnswered[] | null>(null);

  // Expanded wrong question
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showSelection, setShowSelection] = useState(false);

  // ── Data loading ───────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [ov, sel, res] = await Promise.all([
        api.mistakeOverallStats(),
        api.mistakeExamSelection(),
        api.mistakes({ page, limit }),
      ]);
      setOverall(ov);
      setSelection(sel);
      setMistakes(res.data);
      setTotalMistakes(res.total);
      setTotalPages(res.totalPages);
    } catch {
      toast.error("Failed to load mistake analytics");
    }
  }, [page, limit, toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await loadData();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadData]);

  // Resolve the selected subject/topic/subtopic option objects for the dropdowns.
  const currentSubject = useMemo(
    () => selection.find((s) => s.subject === selSubject),
    [selection, selSubject],
  );
  const currentTopic = useMemo(
    () => currentSubject?.topics.find((t) => t.topic === selTopic),
    [currentSubject, selTopic],
  );

  // Available wrong-question pool for the currently selected preference.
  const availableForSelection = useMemo(
    () =>
      currentTopic?.subtopics.find((st) => st.subtopic === selSubtopic)?.count ??
      currentTopic?.count ??
      currentSubject?.count ??
      totalMistakes,
    [currentTopic, currentSubject, selSubtopic, totalMistakes],
  );

  const startExam = useCallback(async () => {
    setBuilding(true);
    try {
      const result = await api.buildMistakeExam({
        subject: selSubject || undefined,
        topic: selTopic || undefined,
        subtopic: selSubtopic || undefined,
        count: Math.max(1, Math.min(examCount, availableForSelection)),
        focus: "most_wrong",
      });
      setExamResult(result);
      setView("drilling");
    } catch {
      toast.error("Could not build mistake exam. Try again.");
    } finally {
      setBuilding(false);
    }
  }, [selSubject, selTopic, selSubtopic, examCount, availableForSelection, toast]);

  const resetFilters = () => {
    setSelSubject("");
    setSelTopic("");
    setSelSubtopic("");
  };

  // ── Drilling view ──────────────────────────────────────
  if (view === "drilling" && examResult) {
    return (
      <ScrollPractice
        key="mistakes-drill"
        questions={examResult.questions.map((q) => ({
          id: q.id,
          subjectId: q.subjectId,
          subject: q.subject,
          topic: q.topic,
          subtopic: q.subtopic,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer ?? "",
          explanation: q.explanation ?? "",
          difficulty: q.difficulty,
          year: q.year,
          sourceExam: q.sourceExam,
          bcsTerm: null,
        }))}
        title="Mistake Exam"
        onComplete={(answered) => {
          setDrillResults(answered);
          setView("exam-result");
        }}
        onExit={() => {
          setView("dashboard");
          setExamResult(null);
          setDrillResults(null);
        }}
      />
    );
  }

  // ── Result view ────────────────────────────────────────
  if (view === "exam-result" && examResult) {
    const answered = drillResults ?? [];
    const total = examResult.questions.length;
    const correct = answered.filter((a) => a.correct).length;
    const stillErrors = answered.filter((a) => !a.correct).length;
    const justMastered = answered.filter((a) => a.justMastered).length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const stayPositive = stillErrors > 0
      ? `${stillErrors}টি আবার ভুল হয়েছে — ব্যাখ্যা পড়ে আবার চেষ্টা করুন।`
      : "চমৎকার! সব প্রশ্ন ঠিক করেছেন।";

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-2xl border border-[var(--primary)]/30 overflow-hidden"
        >
          <div className="p-6 text-center border-b border-terminal-border">
            <Trophy
              className={`w-12 h-12 mx-auto mb-3 ${
                score >= 80 ? "text-[var(--dashboard-warning)]" : score >= 50 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-danger)]"
              }`}
            />
            <h3 className="text-xl font-bold text-[var(--text-primary)] font-mono mb-1">Mistake Exam সম্পন্ন!</h3>
            <p className="text-sm font-mono text-[var(--dashboard-text-muted)] mb-4">
              সঠিক: {correct}/{total} • স্কোর {score}%
            </p>

            <div className="grid grid-cols-3 gap-2 max-w-lg mx-auto text-left">
              <div className="rounded-xl bg-[var(--dashboard-primary-subtle)] border border-[var(--primary)]/25 p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">সঠিক</p>
                <p className="text-lg font-bold text-[var(--dashboard-primary)] font-mono">{correct}</p>
              </div>
              <div className="rounded-xl bg-[var(--dashboard-danger-subtle)] border border-[var(--danger)]/25 p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">আবার ভুল</p>
                <p className="text-lg font-bold text-[var(--dashboard-danger)] font-mono">{stillErrors}</p>
              </div>
              <div className="rounded-xl bg-[var(--dashboard-primary-subtle)] border border-[var(--primary)]/20 p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">Mastered</p>
                <p className="text-lg font-bold text-[var(--dashboard-primary)] font-mono">{justMastered}</p>
              </div>
            </div>
            <p className="text-xs text-[var(--dashboard-text-muted)] font-mono mt-3">{stayPositive}</p>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => { setView("dashboard"); setExamResult(null); setDrillResults(null); }}
                className="px-5 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-2 shadow-neon-glow"
              >
                <RotateCcw className="w-4 h-4" /> ড্যাশবোর্ডে ফিরুন
              </button>
              <button
                onClick={() => { setView("dashboard"); setExamResult(null); setDrillResults(null); setShowSelection(true); }}
                className="px-5 py-2.5 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-secondary)] font-mono text-sm rounded-xl hover:text-[var(--text-primary)] transition-colors"
              >
                আবার Practice করুন
              </button>
            </div>
          </div>
        </motion.div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">প্রশ্ন-ভিত্তিক রিভিউ</h4>
          {examResult.questions.map((q, i) => {
            const a = answered.find((x) => x.questionId === q.id);
            const isCorrect = a?.correct ?? false;
            const isMastered = a?.justMastered ?? false;
            return (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.5) }}
                className={`glass-card rounded-2xl border p-4 ${
                  isMastered ? "border-[var(--primary)]/40" : isCorrect ? "border-[var(--primary)]/20" : "border-[var(--danger)]/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isMastered ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]" : isCorrect ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]" : "bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]"
                  }`}>
                    {isMastered ? <Award className="w-3.5 h-3.5" /> : isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)]">প্রশ্ন {i + 1}</span>
                      <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)]">{q.subject}</span>
                      {isMastered && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]">Mastered</span>
                      )}
                      {!isCorrect && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]">আবার ভুল</span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-primary)]">{q.question}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Dashboard view ─────────────────────────────────────
  const accuracy = overall?.accuracy ?? 0;
  const totalRight = overall?.totalCorrect ?? 0;
  const totalWrong = overall?.totalWrong ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-terminal-rounded border border-terminal-border p-5"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-[var(--dashboard-danger)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)] font-mono">Mistake Analytics</h2>
          </div>
          <button
            onClick={() => { setLoading(true); void loadData().then(() => setLoading(false)); }}
            aria-label="Refresh"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">
          Track overall accuracy, review every question you got wrong across all subjects, and re-practice them by subject, topic or subtopic.
        </p>
      </motion.div>

      {/* Overall stats: accuracy / right / wrong */}
      <motion.div
        variants={STAGGER}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <motion.div variants={STAGGER_ITEM} className="glass-card rounded-terminal-rounded border border-terminal-border p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-[var(--dashboard-primary)]" />
            <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase">Accuracy</span>
          </div>
          <p className="text-3xl font-bold text-[var(--text-primary)] font-mono">{accuracy}%</p>
          <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono mt-1">{overall?.totalAttempts ?? 0} total attempts</p>
        </motion.div>
        <motion.div variants={STAGGER_ITEM} className="glass-card rounded-terminal-rounded border border-[var(--primary)]/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-[var(--dashboard-primary)]" />
            <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase">Right Answers</span>
          </div>
          <p className="text-3xl font-bold text-[var(--dashboard-primary)] font-mono">{totalRight}</p>
          <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono mt-1">across {overall?.questionsAttempted ?? 0} questions</p>
        </motion.div>
        <motion.div variants={STAGGER_ITEM} className="glass-card rounded-terminal-rounded border border-[var(--danger)]/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-[var(--dashboard-danger)]" />
            <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase">Wrong Answers</span>
          </div>
          <p className="text-3xl font-bold text-[var(--dashboard-danger)] font-mono">{totalWrong}</p>
          <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono mt-1">to review &amp; re-practice</p>
        </motion.div>
      </motion.div>

      {/* Mistake exam preference builder */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card rounded-terminal-rounded border border-[var(--primary)]/20 bg-[var(--dashboard-primary-subtle)] p-5"
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-[var(--dashboard-primary)] font-mono">Practice Your Wrong Questions</h3>
          <button
            onClick={() => setShowSelection(!showSelection)}
            className="text-xs text-[var(--dashboard-primary)] font-mono hover:text-[var(--dashboard-primary)] transition-colors flex items-center gap-1"
          >
            {showSelection ? "Hide" : "Customize"} <ChevronDown className={`w-3 h-3 transition-transform ${showSelection ? "rotate-180" : ""}`} />
          </button>
        </div>
        <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
          Build a focused exam strictly from questions you answered wrong — narrowed by subject, topic and subtopic of your choice.
        </p>

        <AnimatePresence>
          {showSelection && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-4">
                {/* Subject */}
                <div>
                  <label className="block text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-1.5">Subject</label>
                  <select
                    value={selSubject}
                    onChange={(e) => { setSelSubject(e.target.value); setSelTopic(""); setSelSubtopic(""); }}
                    className="w-full bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--primary)]/50"
                  >
                    <option value="">All Subjects</option>
                    {selection.map((s) => (
                      <option key={s.subject} value={s.subject}>
                        {s.subject} ({s.count} wrong)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Topic (dependent on subject) */}
                {currentSubject && (
                  <div>
                    <label className="block text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-1.5">Topic</label>
                    <select
                      value={selTopic}
                      onChange={(e) => { setSelTopic(e.target.value); setSelSubtopic(""); }}
                      className="w-full bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--primary)]/50"
                    >
                      <option value="">Whole Subject</option>
                      {currentSubject.topics.map((t) => (
                        <option key={t.topic} value={t.topic}>
                          {t.topic || "(No topic)"} ({t.count})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Subtopic (dependent on topic) */}
                {currentTopic && currentTopic.subtopics.length > 0 && (
                  <div>
                    <label className="block text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-1.5">Subtopic</label>
                    <select
                      value={selSubtopic}
                      onChange={(e) => setSelSubtopic(e.target.value)}
                      className="w-full bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--primary)]/50"
                    >
                      <option value="">Whole Topic</option>
                      {currentTopic.subtopics.map((st) => (
                        <option key={st.subtopic} value={st.subtopic}>
                          {st.subtopic} ({st.count})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Count */}
                <div>
                  <label className="block text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-1.5">Questions</label>
                  <div className="grid grid-cols-5 gap-2">
                    {[10, 20, 30, 50].map((n) => (
                      <button
                        key={n}
                        onClick={() => setExamCount(n)}
                        className={`px-3 py-2 rounded-lg border text-sm font-mono transition-colors ${
                          examCount === n
                            ? "border-emerald-500/50 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                            : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-[var(--border-strong)]"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      onClick={() => setExamCount(availableForSelection)}
                      className={`px-3 py-2 rounded-lg border text-sm font-mono transition-colors ${
                        examCount === availableForSelection
                          ? "border-emerald-500/50 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                          : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      All
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">
                    {availableForSelection} wrong question{availableForSelection !== 1 ? "s" : ""} available
                  </span>
                  {(selSubject || selTopic || selSubtopic) && (
                    <button
                      onClick={resetFilters}
                      className="flex items-center gap-1 text-xs text-[var(--dashboard-text-muted)] font-mono hover:text-[var(--dashboard-text-secondary)] transition-colors"
                    >
                      <X className="w-3 h-3" /> Reset
                    </button>
                  )}
                </div>

                <button
                  onClick={() => void startExam()}
                  disabled={building || availableForSelection === 0}
                  className="w-full px-6 py-3 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {building ? (
                    "Building Exam…"
                  ) : (
                    <>
                      <Play className="w-4 h-4" /> Start Mistake Exam
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Wrong questions list */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass-card rounded-terminal-rounded border border-terminal-border p-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-[var(--dashboard-text-muted)]" />
          <h3 className="text-sm font-bold text-[var(--text-primary)] font-mono">Wrong Questions by Date</h3>
        </div>
        <p className="text-xs text-[var(--dashboard-text-muted)] font-mono mb-4">
          Every question you&apos;ve answered incorrectly across all subjects.
        </p>

        {loading ? (
          <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">Loading…</p>
        ) : mistakes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--dashboard-primary)] font-mono mb-1">Amazing work!</p>
            <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">No wrong answers to show yet.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {mistakes.map((m) => {
                const q = m.question;
                const isExpanded = expandedId === m.id;
                return (
                  <motion.div
                    key={m.id}
                    variants={STAGGER_ITEM}
                    className="border border-terminal-border rounded-xl overflow-hidden"
                  >
                    <div
                      className="p-3.5 flex items-start justify-between gap-3 cursor-pointer hover:bg-[var(--dashboard-surface)] transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : m.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">
                            {q.subject} • {q.topic || "General"}
                          </span>
                          {q.subtopic && (
                            <span className="text-[10px] text-[var(--dashboard-text-secondary)] font-mono">{q.subtopic}</span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--dashboard-text-primary)] leading-relaxed line-clamp-2">{q.question}</p>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-[var(--dashboard-text-muted)] shrink-0 transition-transform mt-1 ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>

                    <div className="flex items-center gap-4 px-3.5 pb-3 text-[10px] text-[var(--dashboard-text-muted)] font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {m.lastIncorrectAt ? `Wrong on ${new Date(m.lastIncorrectAt).toLocaleDateString()}` : "No date"}
                      </span>
                      <span>Wrong {m.mistakeCount}×</span>
                      <span className="text-[var(--dashboard-danger)]">{m.incorrectAttempts} wrong attempts</span>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mx-3.5 mb-3.5 pt-3 border-t border-terminal-border space-y-3">
                            <div className="space-y-1.5">
                              {q.options.map((opt, i) => {
                                const letter = String.fromCharCode(65 + i);
                                const isCorrect = opt.trim() === q.correctAnswer.trim();
                                return (
                                  <div
                                    key={letter}
                                    className={`text-xs font-mono px-3 py-2 rounded-lg border ${
                                      isCorrect
                                        ? "border-[var(--primary)]/30 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                                        : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)]"
                                    }`}
                                  >
                                    <span className="font-bold mr-2">{letter}.</span>
                                    {opt}
                                  </div>
                                );
                              })}
                            </div>
                            {q.explanation && (
                              <p className="text-xs text-[var(--dashboard-text-muted)] font-mono border-t border-terminal-border pt-3">
                                💡 {q.explanation}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-xs text-[var(--dashboard-text-muted)] font-mono disabled:opacity-40 hover:text-[var(--text-primary)] transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-xs text-[var(--dashboard-text-muted)] font-mono disabled:opacity-40 hover:text-[var(--text-primary)] transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
