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

  const sessionQuestions = useMemo(() => questions, [questions]);

  const answeredCount = Object.keys(answers).length;
  const currentQuestion = sessionQuestions[currentIndex];
  const totalQuestions = sessionQuestions.length;
  const allAnswered = totalQuestions > 0 && answeredCount === totalQuestions;

  const resetSession = () => {
    setSelection({});
    setQuestions([]);
    setSessionActive(false);
    setCurrentIndex(0);
    setAnswers({});
    setResult(null);
    setLoadError(null);
    setSubmitError(null);
  };

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
        const shuffled = [...merged].sort(() => Math.random() - 0.5);
        setQuestions(shuffled.slice(0, Math.min(requested, merged.length)));
        setSessionActive(true);
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
      setResult(summary);
    } catch {
      setSubmitError("ফলাফল জমা দেওয়া যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSubmitting(false);
    }
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
                    <h2 className="text-lg font-bold text-white">কুইক প্র্যাকটিস</h2>
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
              className="glass-card rounded-2xl border border-emerald-500/30 overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-terminal-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-white truncate">{sessionTitle}</span>
                </div>
                <span className="text-xs text-zinc-500 font-mono flex-shrink-0">
                  প্রশ্ন {currentIndex + 1}/{totalQuestions}
                </span>
              </div>

              <div className="p-5">
                {/* Progress bar */}
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-6">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%` }}
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
                        <span className="px-2 py-0.5 bg-zinc-800 rounded text-[10px] font-mono text-zinc-400">
                          {currentQuestion.topic}
                        </span>
                      )}
                      {currentQuestion.subtopic && (
                        <span className="px-2 py-0.5 bg-zinc-800 rounded text-[10px] font-mono text-zinc-500">
                          {currentQuestion.subtopic}
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-500 font-mono ml-auto">
                        {answeredCount}/{totalQuestions} উত্তর
                      </span>
                    </div>

                    <h3 className="text-base font-medium text-white mb-5">{currentQuestion.question}</h3>

                    <div className="space-y-2.5 mb-6">
                      {currentQuestion.options.map((option, i) => {
                        const isSelected = answers[currentQuestion.id] === option;
                        return (
                          <button
                            key={i}
                            onClick={() => selectAnswer(currentQuestion.id, option)}
                            className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                              isSelected
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                : "bg-subtle border-zinc-800 text-zinc-300 hover:border-emerald-500/20"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono flex-shrink-0">
                                {String.fromCharCode(65 + i)}
                              </span>
                              <span className="text-sm">{option}</span>
                              {isSelected && <Check className="w-4 h-4 text-emerald-400 ml-auto" />}
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
                        className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-sm rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-40 flex items-center gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" /> আগের
                      </button>
                      <span className="text-xs text-zinc-500 font-mono">
                        {currentIndex + 1} / {totalQuestions}
                      </span>
                      {currentIndex < totalQuestions - 1 ? (
                        <button
                          onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
                          className="px-4 py-2 bg-zinc-800 text-zinc-300 font-mono text-sm rounded-lg hover:bg-zinc-700 transition-colors flex items-center gap-1"
                        >
                          পরের <ChevronRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => void submitAnswers()}
                          disabled={!allAnswered || submitting}
                          className="px-5 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors flex items-center gap-2 shadow-neon-glow disabled:opacity-40 disabled:cursor-not-allowed"
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

          {/* Result panel */}
          {result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card rounded-2xl border border-emerald-500/30 overflow-hidden"
            >
              <div className="p-6 text-center border-b border-terminal-border">
                <Trophy className={`w-12 h-12 mx-auto mb-3 ${
                  result.score >= 80 ? "text-amber-400" : result.score >= 50 ? "text-emerald-400" : "text-red-400"
                }`} />
                <h3 className="text-xl font-bold text-white mb-2">প্র্যাকটিস সম্পন্ন!</h3>
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
                      setSessionActive(false);
                      setResult(null);
                      setAnswers({});
                      setCurrentIndex(0);
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
                          <p className="text-sm text-white mb-1.5">{i + 1}. {q.question}</p>
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