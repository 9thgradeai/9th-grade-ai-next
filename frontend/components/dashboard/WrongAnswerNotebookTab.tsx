"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookX,
  Play,
  RefreshCw,
  Filter,
  Target,
  TrendingUp,
  Award,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Zap,
  Brain,
  Clock,
  BarChart3,
  CheckCircle2,
  XCircle,
  Trophy,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/services/api";
import type { MistakeItemDTO, MistakeStatsDTO, SubjectMistakeCountDTO, ExamBuildResultDTO } from "@/lib/types";
import QuestionDrill, { type DrillAnswered } from "./QuestionDrill";
import { useToastSafe } from "@/lib/toast-ctx";

type ViewMode = "dashboard" | "exam-config" | "drilling" | "exam-result";

const MASTERY_COLORS: Record<string, string> = {
  STRUGGLING: "text-[var(--dashboard-danger)] bg-[var(--dashboard-danger-subtle)] border-[var(--danger)]/20",
  REVIEWING: "text-[var(--dashboard-warning)] bg-[var(--dashboard-warning-subtle)] border-[var(--warning)]/20",
  IMPROVING: "text-[var(--info)] bg-[var(--info-soft)] border-[var(--info)]/20",
  MASTERED: "text-[var(--dashboard-primary)] bg-[var(--dashboard-primary-subtle)] border-[var(--accent)]/20",
  NEW: "text-[var(--dashboard-text-muted)] bg-[var(--surface-muted)] border-[var(--dashboard-border-muted)]",
};

const MASTERY_LABELS: Record<string, string> = {
  STRUGGLING: "Needs Practice",
  REVIEWING: "Reviewing",
  IMPROVING: "Improving",
  MASTERED: "Mastered",
  NEW: "New",
};

const SORT_OPTIONS = [
  { value: "most_wrong", label: "Most Frequently Wrong" },
  { value: "recently_wrong", label: "Recently Wrong" },
  { value: "least_mastered", label: "Least Mastered" },
  { value: "highest_difficulty", label: "Highest Difficulty" },
  { value: "oldest", label: "Oldest Mistake" },
  { value: "recently_reviewed", label: "Recently Reviewed" },
];

const FOCUS_OPTIONS = [
  { value: "most_wrong", label: "Most Wrong" },
  { value: "recently_wrong", label: "Recently Wrong" },
  { value: "weakest_topics", label: "Weakest Topics" },
  { value: "due_for_review", label: "Due for Review" },
  { value: "random", label: "Random" },
];

const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};
const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 28 } },
};

export default function WrongAnswerNotebookTab() {
  const toast = useToastSafe();

  // ── State ──────────────────────────────────────────────
  const [view, setView] = useState<ViewMode>("dashboard");
  const [stats, setStats] = useState<MistakeStatsDTO | null>(null);
  const [subjects, setSubjects] = useState<SubjectMistakeCountDTO[]>([]);
  const [mistakes, setMistakes] = useState<MistakeItemDTO[]>([]);
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Filters
  const [filterSubject, setFilterSubject] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterSort, setFilterSort] = useState<string>("most_wrong");
  const [showFilters, setShowFilters] = useState(false);

  // Exam config
  const [examSubject, setExamSubject] = useState<string>("");
  const [examCount, setExamCount] = useState(20);
  const [examFocus, setExamFocus] = useState("most_wrong");
  const [examResult, setExamResult] = useState<ExamBuildResultDTO | null>(null);
  const [building, setBuilding] = useState(false);

  // Mistake drill results (§14 specialized result screen)
  const [drillResults, setDrillResults] = useState<DrillAnswered[] | null>(null);

  // Expanded question
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // ── Data loading ───────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const [s, sub] = await Promise.all([api.mistakeStats(), api.mistakeSubjects()]);
      setStats(s);
      setSubjects(sub);
    } catch {
      toast.error("Failed to load mistake statistics");
    }
  }, [toast]);

  const loadMistakes = useCallback(async () => {
    try {
      const res = await api.mistakes({
        page,
        limit,
        subject: filterSubject || undefined,
        status: filterStatus || undefined,
        sort: filterSort,
      });
      setMistakes(res.data);
      setTotalMistakes(res.total);
      setTotalPages(res.totalPages);
    } catch {
      toast.error("Failed to load mistakes");
    }
  }, [page, limit, filterSubject, filterStatus, filterSort, toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await Promise.all([loadStats(), loadMistakes()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadStats, loadMistakes]);

  // ── Exam builder ───────────────────────────────────────
  const startMistakeExam = useCallback(async () => {
    setBuilding(true);
    try {
      const result = await api.buildMistakeExam({
        subject: examSubject || undefined,
        count: examCount,
        focus: examFocus,
      });
      setExamResult(result);
      setView("drilling");
    } catch {
      toast.error("Could not build mistake exam. Try again.");
    } finally {
      setBuilding(false);
    }
  }, [examSubject, examCount, examFocus, toast]);

  // ── Empty state ────────────────────────────────────────
  if (!loading && stats && stats.totalMistakes === 0) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl border border-terminal-border p-8 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--dashboard-primary-subtle)] flex items-center justify-center">
            <Award className="w-8 h-8 text-[var(--dashboard-primary)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] font-mono mb-2">You&apos;re doing great!</h2>
          <p className="text-sm text-[var(--dashboard-text-muted)] font-mono mb-6 max-w-md mx-auto">
            You haven&apos;t made any mistakes yet. Start practicing questions and we&apos;ll keep track of the areas that need more attention.
          </p>
          <button
            onClick={() => setView("exam-config")}
            className="px-6 py-3 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            Start Practicing
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Exam config view ───────────────────────────────────
  if (view === "exam-config") {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl border border-terminal-border p-5"
        >
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-5 h-5 text-[var(--dashboard-primary)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)] font-mono">Practice My Mistakes</h2>
          </div>
          <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">
            Build a focused exam from questions you&apos; previously got wrong.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card rounded-2xl border border-terminal-border p-5 space-y-5"
        >
          {/* Subject */}
          <div>
            <label className="block text-xs text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-2">Subject</label>
            <select
              value={examSubject}
              onChange={(e) => setExamSubject(e.target.value)}
              className="w-full bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]/50"
            >
              <option value="">All Subjects</option>
              {subjects.map((s) => (
                <option key={s.subject} value={s.subject}>
                  {s.subject} ({s.unmastered} to practice)
                </option>
              ))}
            </select>
          </div>

          {/* Count */}
          <div>
            <label className="block text-xs text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-2">Questions</label>
            <div className="grid grid-cols-5 gap-2">
              {[10, 20, 30, 50].map((n) => (
                <button
                  key={n}
                  onClick={() => setExamCount(n)}
                  className={`px-3 py-2 rounded-lg border text-sm font-mono transition-colors ${
                    examCount === n
                      ? "border-[var(--accent)]/50 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                      : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setExamCount(totalMistakes)}
                className={`px-3 py-2 rounded-lg border text-sm font-mono transition-colors ${
                  examCount === totalMistakes
                    ? "border-[var(--accent)]/50 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                    : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-[var(--border-strong)]"
                }`}
              >
                All
              </button>
            </div>
          </div>

          {/* Focus */}
          <div>
            <label className="block text-xs text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-2">Focus</label>
            <div className="grid grid-cols-2 gap-2">
              {FOCUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExamFocus(opt.value)}
                  className={`px-3 py-2 rounded-lg border text-sm font-mono transition-colors ${
                    examFocus === opt.value
                      ? "border-[var(--accent)]/50 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                      : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setView("dashboard")}
              className="px-4 py-2.5 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-[var(--dashboard-text-muted)] font-mono text-sm hover:text-[var(--text-primary)] transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => void startMistakeExam()}
              disabled={building}
              className="flex-1 px-6 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {building ? (
                "Building Exam…"
              ) : (
                <>
                  <Play className="w-4 h-4" /> Start Practice
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Drilling view ──────────────────────────────────────
  if (view === "drilling" && examResult) {
    return (
      <QuestionDrill
        key="mistake-drill"
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
        title="Mistake Practice"
        onComplete={(answered) => {
          setDrillResults(answered);
          setView("exam-result");
        }}
        onExit={() => {
          setView("dashboard");
          setExamResult(null);
          setDrillResults(null);
          setLoading(true);
          void loadStats().then(() => loadMistakes()).then(() => setLoading(false));
        }}
      />
    );
  }

  // ── Specialized Mistake Exam result (§14) ──────────────
  if (view === "exam-result" && examResult) {
    const answered = drillResults ?? [];
    const total = examResult.questions.length;
    const correct = answered.filter((a) => a.correct).length;
    const justMastered = answered.filter((a) => a.justMastered).length;
    const stillErrors = answered.filter((a) => !a.correct).length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const stayPositive = stillErrors > 0
      ? `${stillErrors}টি আবার ভুল হয়েছে — ব্যাখ্যা ভালো করে পড়ে আবার চেষ্টা করুন।`
      : "চমৎকার! সব প্রশ্ন ঠিক করেছেন। ভুলগুলো ধীরে ধীরে উন্নত হচ্ছে।";

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-2xl border border-[var(--accent)]/30 overflow-hidden"
        >
          <div className="p-6 text-center border-b border-terminal-border">
            <Trophy
              className={`w-12 h-12 mx-auto mb-3 ${
                score >= 80 ? "text-[var(--dashboard-warning)]" : score >= 50 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-danger)]"
              }`}
            />
            <h3 className="text-xl font-bold text-[var(--text-primary)] font-mono mb-1">Mistake Practice সম্পন্ন!</h3>
            <p className="text-sm font-mono text-[var(--dashboard-text-muted)] mb-4">
              সঠিক: {correct}/{total} • স্কোর {score}%
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg mx-auto text-left">
              <div className="rounded-xl bg-[var(--dashboard-primary-subtle)] border border-[var(--accent)]/25 p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">সঠিক</p>
                <p className="text-lg font-bold text-[var(--dashboard-primary)] font-mono">{correct}</p>
              </div>
              <div className="rounded-xl bg-[var(--dashboard-danger-subtle)] border border-[var(--danger)]/25 p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">আবার ভুল</p>
                <p className="text-lg font-bold text-[var(--dashboard-danger)] font-mono">{stillErrors}</p>
              </div>
              <div className="rounded-xl bg-[var(--dashboard-primary-subtle)] border border-[var(--accent)]/20 p-3">
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">এরমধ্যে Mastered</p>
                <p className="text-lg font-bold text-[var(--dashboard-primary)] font-mono">{justMastered}</p>
              </div>
            </div>
            <p className="text-xs text-[var(--dashboard-text-muted)] font-mono mt-3">{stayPositive}</p>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => { setView("dashboard"); setExamResult(null); setDrillResults(null); void loadStats().then(() => loadMistakes()); }}
                className="px-5 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-2 shadow-neon-glow"
              >
                <RotateCcw className="w-4 h-4" /> ড্যাশবোর্ডে ফিরুন
              </button>
              <button
                onClick={() => { setView("exam-config"); setTimeout(() => setDrillResults(null), 0); }}
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
                  isMastered ? "border-[var(--accent)]/40" : isCorrect ? "border-[var(--accent)]/20" : "border-[var(--danger)]/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isMastered ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]" : isCorrect ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]" : "bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]"
                  }`}>
                    {isMastered ? (
                      <Award className="w-3.5 h-3.5" />
                    ) : isCorrect ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)]">প্রশ্ন {i + 1}</span>
                      <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)]">{q.subject}</span>
                      {isMastered && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]">
                          Mastered
                        </span>
                      )}
                      {!isCorrect && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]">
                          আবার ভুল
                        </span>
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

  // ── Main dashboard view ────────────────────────────────
  const unmastered = stats?.unmastered ?? 0;
  const mastered = stats?.mastered ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl border border-terminal-border p-5"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BookX className="w-5 h-5 text-[var(--dashboard-danger)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)] font-mono">Your Mistakes</h2>
          </div>
          <button
            onClick={() => { setLoading(true); void loadStats().then(() => loadMistakes()).then(() => setLoading(false)); }}
            aria-label="Refresh"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">
          Every mistake is a step toward mastery. Practice what you struggle with and get better every day.
        </p>
      </motion.div>

      {/* Summary metrics */}
      {stats && (
        <motion.div
          variants={STAGGER}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <motion.div variants={STAGGER_ITEM} className="glass-card rounded-2xl border border-terminal-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-[var(--dashboard-danger)]" />
              <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase">Total Mistakes</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)] font-mono">{stats.totalMistakes}</p>
          </motion.div>
          <motion.div variants={STAGGER_ITEM} className="glass-card rounded-2xl border border-terminal-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-[var(--dashboard-warning)]" />
              <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase">Unmastered</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)] font-mono">{unmastered}</p>
          </motion.div>
          <motion.div variants={STAGGER_ITEM} className="glass-card rounded-2xl border border-terminal-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-[var(--info)]" />
              <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase">Improving</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)] font-mono">{stats.improving}</p>
          </motion.div>
          <motion.div variants={STAGGER_ITEM} className="glass-card rounded-2xl border border-terminal-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-4 h-4 text-[var(--dashboard-primary)]" />
              <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase">Mastered</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)] font-mono">{mastered}</p>
          </motion.div>
        </motion.div>
      )}

      {/* Practice CTA */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass-card rounded-2xl border border-[var(--accent)]/20 bg-[var(--dashboard-primary-subtle)] p-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--dashboard-primary)] font-mono mb-1">
              {unmastered > 0 ? `${unmastered} questions need attention` : "All caught up!"}
            </h3>
            <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
              {unmastered > 0
                ? "Practice your mistakes and turn them into strengths."
                : "You've mastered all your tracked mistakes."}
            </p>
          </div>
          <button
            onClick={() => setView("exam-config")}
            disabled={unmastered === 0}
            className="px-5 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 flex items-center gap-2 shrink-0"
          >
            <Brain className="w-4 h-4" /> Practice My Mistakes
          </button>
        </div>
      </motion.div>

      {/* Subject breakdown */}
      {subjects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-2xl border border-terminal-border p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-[var(--dashboard-text-muted)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)] font-mono">Mistakes by Subject</h3>
          </div>
          <div className="space-y-2">
            {subjects.slice(0, 10).map((s) => {
              const pct = totalMistakes > 0 ? (s.count / totalMistakes) * 100 : 0;
              const isHot = s.count === Math.max(...subjects.map((x) => x.count));
              return (
                <button
                  key={s.subject}
                  onClick={() => {
                    setFilterSubject(filterSubject === s.subject ? "" : s.subject);
                    setPage(1);
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left ${
                    filterSubject === s.subject
                      ? "border-[var(--accent)]/30 bg-[var(--dashboard-primary-subtle)]"
                      : "border-transparent hover:bg-[var(--surface-raised)]/50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--text-primary)] font-mono truncate">{s.subject}</span>
                      {isHot && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)] font-mono border border-[var(--danger)]/20">
                          NEEDS ATTENTION
                        </span>
                      )}
                    </div>
                    <div className="mt-1 h-1.5 bg-[var(--surface-overlay)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isHot ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] font-mono">{s.count}</p>
                    <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">{s.unmastered} active</p>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-sm text-[var(--dashboard-text-muted)] font-mono hover:text-[var(--text-primary)] transition-colors mb-3"
        >
          <Filter className="w-4 h-4" />
          Filters
          {(filterSubject || filterStatus) && (
            <span className="px-1.5 py-0.5 text-[10px] bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] rounded font-mono">
              Active
            </span>
          )}
          {showFilters ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="glass-card rounded-2xl border border-terminal-border p-4 space-y-3">
                {/* Status filter */}
                <div>
                  <label className="block text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-1.5">Status</label>
                  <div className="flex flex-wrap gap-1.5">
                    {["", "STRUGGLING", "REVIEWING", "IMPROVING", "MASTERED"].map((s) => (
                      <button
                        key={s}
                        onClick={() => { setFilterStatus(s); setPage(1); }}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                          filterStatus === s
                            ? "border-[var(--accent)]/50 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                            : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-[var(--border-strong)]"
                        }`}
                      >
                        {s === "" ? "All" : MASTERY_LABELS[s] ?? s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort */}
                <div>
                  <label className="block text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-1.5">Sort By</label>
                  <select
                    value={filterSort}
                    onChange={(e) => { setFilterSort(e.target.value); setPage(1); }}
                    className="w-full bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]/50"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Clear filters */}
                {(filterSubject || filterStatus) && (
                  <button
                    onClick={() => { setFilterSubject(""); setFilterStatus(""); setPage(1); }}
                    className="flex items-center gap-1.5 text-xs text-[var(--dashboard-text-muted)] font-mono hover:text-[var(--dashboard-text-secondary)] transition-colors"
                  >
                    <X className="w-3 h-3" /> Clear all filters
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Active subject filter indicator */}
      {filterSubject && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">Filtered by:</span>
          <span className="px-2 py-1 text-xs bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] rounded font-mono flex items-center gap-1">
            {filterSubject}
            <button onClick={() => { setFilterSubject(""); setPage(1); }}>
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}

      {/* Mistake list */}
      {loading ? (
        <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
          <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">Loading mistakes…</p>
        </div>
      ) : mistakes.length === 0 ? (
        <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
          {filterSubject || filterStatus ? (
            <>
              <p className="text-sm text-[var(--dashboard-text-muted)] font-mono mb-1">Nothing to review here yet.</p>
              <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">Try adjusting your filters or practicing more questions.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--dashboard-primary)] font-mono mb-1">Amazing work!</p>
              <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">You&apos;ve mastered all your tracked mistakes.</p>
            </>
          )}
        </div>
      ) : (
        <motion.div variants={STAGGER} initial="hidden" animate="show" className="space-y-3">
          {mistakes.map((m) => {
            const q = m.question;
            const accuracy = m.totalAttempts > 0 ? Math.round((m.correctAttempts / m.totalAttempts) * 100) : 0;
            const isExpanded = expandedId === m.id;
            const statusCls = MASTERY_COLORS[m.masteryStatus] ?? MASTERY_COLORS.NEW;
            const toGo =
              m.masteryStatus === "MASTERED"
                ? 0
                : m.masteryStatus === "IMPROVING"
                  ? Math.max(0, 3 - m.consecutiveCorrect)
                  : m.masteryStatus === "REVIEWING"
                    ? Math.max(0, 2 - m.consecutiveCorrect)
                    : Math.max(0, 1 - m.consecutiveCorrect);

            return (
              <motion.div
                key={m.id}
                variants={STAGGER_ITEM}
                className="glass-card rounded-2xl border border-terminal-border p-4"
              >
                <div
                  className="flex items-start justify-between gap-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">
                        {q.subject} • {q.topic || "General"}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${statusCls}`}>
                        {MASTERY_LABELS[m.masteryStatus]}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--dashboard-text-primary)] leading-relaxed line-clamp-2">{q.question}</p>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-[var(--dashboard-text-muted)] shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 mt-3 text-[10px] text-[var(--dashboard-text-muted)] font-mono">
                  <span>Wrong: {m.mistakeCount}×</span>
                  <span>Accuracy: {accuracy}%</span>
                  <span>Score: {Math.round(m.masteryScore)}</span>
                  {m.masteryStatus !== "MASTERED" && toGo > 0 && (
                    <span className="text-[var(--accent)]">{toGo} more to master</span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mt-2 h-1 bg-[var(--surface-overlay)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full transition-all"
                    style={{ width: `${Math.min(100, m.masteryScore)}%` }}
                  />
                </div>

                {/* Expanded details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-terminal-border space-y-3">
                        {/* Options preview */}
                        <div className="space-y-1.5">
                          {q.options.map((opt, i) => {
                            const letter = String.fromCharCode(65 + i);
                            const isCorrect = opt.trim() === q.correctAnswer.trim();
                            return (
                              <div
                                key={letter}
                                className={`text-xs font-mono px-3 py-2 rounded-lg border ${
                                  isCorrect
                                    ? "border-[var(--accent)]/30 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
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

                        <div className="flex items-center gap-3 text-[10px] text-[var(--dashboard-text-muted)] font-mono">
                          {m.firstIncorrectAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              First wrong: {new Date(m.firstIncorrectAt).toLocaleDateString()}
                            </span>
                          )}
                          {m.lastReviewedAt && (
                            <span className="flex items-center gap-1">
                              <Search className="w-3 h-3" />
                              Last reviewed: {new Date(m.lastReviewedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-xs text-[var(--dashboard-text-muted)] font-mono disabled:opacity-40 hover:text-[var(--text-primary)] transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-xs text-[var(--dashboard-text-muted)] font-mono disabled:opacity-40 hover:text-[var(--text-primary)] transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Footer */}
      {mastered > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center text-xs text-[var(--dashboard-text-muted)] font-mono"
        >
          You&apos;ve mastered {mastered} question{mastered !== 1 ? "s" : ""} — keep going, you&apos;re improving!
        </motion.p>
      )}
    </div>
  );
}
