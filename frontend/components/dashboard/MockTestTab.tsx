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
import type { Server } from "@/lib/types";
import TopicTreePicker, {
  type Selection,
  buildExamSelectionRequest,
  availableForSubject,
} from "./TopicTreePicker";

type TestState = "setup" | "active" | "completed";

const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: "সহজ",
  MEDIUM: "মাঝারি",
  HARD: "কঠিন",
};

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

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
      setQuestions(built.questions);
      setAnswers({});
      setCurrentQuestion(0);
      setTimeRemaining(built.durationSec);
      setTestState("active");
    } catch {
      setBuildError("মক টেস্ট তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBuildLoading(false);
    }
  };

  const selectAnswer = (questionId: number, option: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questions.length;

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
        setTestState("completed");
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

  // Countdown — auto-submits when the timer runs out.
  useEffect(() => {
    if (testState !== "active" || timeRemaining <= 0) return;
    const interval = setInterval(() => {
      setTimeRemaining((t) => {
        if (t <= 1) {
          clearInterval(interval);
          void submit(questions, answers);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testState, timeRemaining, questions, answers]);

  const resetTest = () => {
    setTestState("setup");
    setSelection({});
    setDurationMin(30);
    setQuestions([]);
    setAnswers({});
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
            <div className="flex-1 text-center text-xs text-zinc-400 font-mono">{"// ADAPTIVE_MOCK_TEST"}</div>
          </div>
          <div className="p-5 md:p-6">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">মক টেস্ট</h2>
            </div>
            <p className="text-xs text-zinc-500 font-mono">
              বিষয়, টপিক ও সাবটপিক বেছে নিয়ে সময়সীমা সহ পূর্ণাঙ্গ মক পরীক্ষা দিন — নেগেটিভ মার্কিং সহ বিসিএস ধাঁচে।
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
                void fetchConfig();
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

            {/* Total questions + duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              <div className="glass-card rounded-xl border border-terminal-border p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-300 font-mono">সময়সীমা</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{durationMin} মিনিট</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustDuration(-1)}
                    className="w-8 h-8 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                    aria-label="সময় কমান"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-2xl font-bold text-emerald-400 font-mono w-8 text-center">{durationMin}</span>
                  <button
                    onClick={() => adjustDuration(1)}
                    className="w-8 h-8 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                    aria-label="সময় বাড়ান"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
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

            {buildError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{buildError}</p>
              </div>
            )}

            <button
              onClick={() => void buildAndStart()}
              disabled={selectedSubjects.length === 0 || totalCount === 0 || buildLoading}
              className="mt-4 w-full py-3 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40 disabled:cursor-not-allowed"
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
        <div className="sticky top-0 z-40 -mx-1 px-1">
          <div className="glass-card rounded-2xl border border-emerald-500/30 px-4 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Timer className={`w-4 h-4 ${timeLow ? "text-red-400 animate-pulse" : "text-emerald-400"}`} />
                <span className={`font-mono text-lg font-bold ${timeLow ? "text-red-400" : "text-emerald-400"}`}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-mono">
                  উত্তর: <span className="text-emerald-400">{answeredCount}</span> / {totalQuestions}
                </span>
                <button
                  onClick={handleSubmitRequest}
                  disabled={submitting || totalQuestions === 0}
                  className="px-4 py-1.5 bg-emerald-500 text-zinc-950 font-mono text-xs rounded-lg hover:bg-emerald-400 transition-colors shadow-neon-glow flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Flag className="w-3.5 h-3.5" />
                  {submitting ? "জমা হচ্ছে..." : "জমা দিন"}
                </button>
              </div>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
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
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300">
                প্রশ্ন {currentQuestion + 1}/{totalQuestions}
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-400">
                {q.subject}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                q.difficulty === "EASY"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : q.difficulty === "MEDIUM"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-red-500/10 text-red-400"
              }`}>
                {DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}
              </span>
              {q.topic && (
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-500">
                  {q.topic}
                </span>
              )}
            </div>

            <h3 className="text-base md:text-lg font-medium text-white mb-5">{q.question}</h3>

            <div className="space-y-2.5">
              {q.options.map((option, i) => {
                const isSelected = answers[q.id] === option;
                return (
                  <button
                    key={i}
                    onClick={() => selectAnswer(q.id, option)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:border-emerald-500/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-mono ${
                        isSelected ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 border border-zinc-700 text-zinc-400"
                      }`}>
                        {OPTION_LABELS[i] ?? i + 1}
                      </span>
                      <span className="text-sm">{option}</span>
                      {isSelected && <Check className="w-4 h-4 text-emerald-400 ml-auto" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
            <p className="text-sm text-zinc-400">কোনো প্রশ্ন পাওয়া যায়নি।</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setCurrentQuestion((i) => Math.max(0, i - 1))}
            disabled={currentQuestion === 0}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-sm rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> আগের
          </button>
          <span className="text-xs text-zinc-500 font-mono">
            {answeredCount}/{totalQuestions} উত্তর
          </span>
          {currentQuestion < totalQuestions - 1 ? (
            <button
              onClick={() => setCurrentQuestion((i) => Math.min(totalQuestions - 1, i + 1))}
              className="px-4 py-2 bg-zinc-800 text-zinc-300 font-mono text-sm rounded-lg hover:bg-zinc-700 transition-colors flex items-center gap-1"
            >
              পরের <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmitRequest}
              disabled={submitting}
              className="px-5 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors flex items-center gap-2 shadow-neon-glow disabled:opacity-40"
            >
              <Flag className="w-4 h-4" />
              {submitting ? "জমা হচ্ছে..." : "জমা দিন"}
            </button>
          )}
        </div>

        {/* Question map */}
        <div className="glass-card rounded-2xl border border-terminal-border p-3">
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-2">
            প্রশ্ন তালিকা
          </p>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((qq, i) => {
              const isAnswered = answers[qq.id] !== undefined;
              return (
                <button
                  key={qq.id}
                  onClick={() => setCurrentQuestion(i)}
                  className={`w-8 h-8 rounded-lg border text-xs font-mono transition-all ${
                    i === currentQuestion
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : isAnswered
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                        : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
                  }`}
                  aria-label={`প্রশ্ন ${i + 1}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {submitError && (
          <p className="text-xs text-red-400 text-center">{submitError}</p>
        )}

        {/* Unanswered confirmation */}
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
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">উত্তর দেওয়া বাকি আছে</h3>
                </div>
                <p className="text-sm text-zinc-400 mb-5">
                  <span className="text-amber-400 font-mono">{totalQuestions - answeredCount}টি</span> প্রশ্নে
                  উত্তর দেওয়া হয়নি। নিশ্চিতভাবে জমা দিতে চান? না দেওয়া প্রশ্নে ০ নম্বর পাবেন।
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowUnansweredConfirm(false)}
                    className="flex-1 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-sm rounded-xl hover:bg-zinc-800 transition-colors"
                  >
                    ফিরে যান
                  </button>
                  <button
                    onClick={finalizeSubmit}
                    className="flex-1 py-2.5 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors shadow-neon-glow"
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
  if (testState === "completed" && result) {
    const { summary } = result;
    const percentage = summary.percentage;

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-2xl border border-emerald-500/30 overflow-hidden"
        >
          <div className="p-6 text-center border-b border-terminal-border">
            <Trophy className={`w-12 h-12 mx-auto mb-3 ${
              percentage >= 80 ? "text-amber-400" : percentage >= 50 ? "text-emerald-400" : "text-red-400"
            }`} />
            <h3 className="text-xl font-bold text-white mb-1">মক টেস্ট সম্পন্ন!</h3>
            <p className="text-sm text-zinc-400 font-mono mb-4">{summary.percentage}% স্কোর</p>

            <div className="inline-flex flex-col items-center mb-4">
              <div className="text-5xl font-bold font-mono text-emerald-400">{summary.finalScore}</div>
              <div className="text-xs text-zinc-500 font-mono mt-1">মোট নম্বর: {summary.total}</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-md mx-auto text-left">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                <p className="text-[10px] text-zinc-500 font-mono">সঠিক</p>
                <p className="text-lg font-bold text-emerald-400 font-mono">+{summary.correct}</p>
              </div>
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                <p className="text-[10px] text-zinc-500 font-mono">ভুল</p>
                <p className="text-lg font-bold text-red-400 font-mono">−{summary.wrong}</p>
              </div>
              <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-3">
                <p className="text-[10px] text-zinc-500 font-mono">উত্তর দেওয়া হয়নি</p>
                <p className="text-lg font-bold text-zinc-400 font-mono">{summary.unanswered}</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                onClick={resetTest}
                className="px-5 py-2.5 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors flex items-center gap-2 shadow-neon-glow"
              >
                <Play className="w-4 h-4" /> আবার মক টেস্ট
              </button>
            </div>
          </div>
        </motion.div>

        {/* Review */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          <h4 className="text-sm font-medium text-zinc-400 font-mono uppercase tracking-wider px-1">
            উত্তর পর্যালোচনা
          </h4>
          {result.review.map((r, i) => {
            const isCorrect = r.status === "correct";
            return (
              <div key={r.questionId} className={`p-3.5 rounded-xl border ${
                isCorrect ? "border-emerald-500/20" : r.status === "wrong" ? "border-red-500/20" : "border-zinc-800"
              }`}>
                <div className="flex items-start gap-3">
                  {isCorrect ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : r.status === "wrong" ? (
                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <CircleDashed className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white mb-1.5">{i + 1}. {r.question}</p>
                    <p className="text-xs text-zinc-500 font-mono">
                      আপনার উত্তর:{" "}
                      <span className={isCorrect ? "text-emerald-400" : "text-red-400"}>
                        {r.userAnswer || "উত্তর দেওয়া হয়নি"}
                      </span>
                    </p>
                    {!isCorrect && (
                      <p className="text-xs text-emerald-400 font-mono mt-0.5">
                        সঠিক উত্তর: {r.correctAnswer}
                      </p>
                    )}
                    {r.explanation && (
                      <p className="text-xs text-zinc-400 mt-1.5">{r.explanation}</p>
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