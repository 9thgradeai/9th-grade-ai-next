"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  X,
  Check,
  Minus,
  Plus,
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
} from "lucide-react";
import { SUBJECTS } from "@/lib/data";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import MockTestTab from "./MockTestTab";

type PracticeMode = "mock" | "quick";

const MODES: { id: PracticeMode; label: string; hint: string }[] = [
  { id: "mock", label: "MOCK_TEST", hint: "সময়সীমা সহ পূর্ণাঙ্গ মক পরীক্ষা" },
  { id: "quick", label: "QUICK_PRACTICE", hint: "বিষয়ভিত্তিক দ্রুত প্র্যাকটিস" },
];

const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: "সহজ",
  MEDIUM: "মাঝারি",
  HARD: "কঠিন",
};

export default function PracticeTab() {
  const [mode, setMode] = useState<PracticeMode>("quick");
  const [subjects, setSubjects] = useState(SUBJECTS);
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({});

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Server.QuestionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(10);

  const [sessionActive, setSessionActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ correct: number; total: number; score: number; pointsEarned: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load real subjects + real per-subject question counts.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.subjects();
        if (!cancelled && list.length) {
          setSubjects(
            list.map((s) => ({
              name: s.nameBn,
              icon: s.icon,
              color: s.color,
              bg: s.bg,
            })),
          );
        }
      } catch {
        /* keep static fallback */
      }
      try {
        const all = await api.questions({ limit: 200 });
        if (!cancelled) {
          const counts: Record<string, number> = {};
          for (const q of all) {
            counts[q.subject] = (counts[q.subject] ?? 0) + 1;
          }
          setSubjectCounts(counts);
        }
      } catch {
        /* ignore — counts just won't show */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableTopics = useMemo(() => {
    return Array.from(new Set(questions.map((q) => q.topic))).filter(Boolean);
  }, [questions]);

  const sessionQuestions = useMemo(() => {
    const filtered = topicFilter ? questions.filter((q) => q.topic === topicFilter) : questions;
    return filtered.slice(0, quantity);
  }, [questions, topicFilter, quantity]);

  const answeredCount = Object.keys(answers).length;
  const currentQuestion = sessionQuestions[currentIndex];
  const totalQuestions = sessionQuestions.length;
  const allAnswered = totalQuestions > 0 && answeredCount === totalQuestions;

  const resetSession = () => {
    setSelectedSubject(null);
    setQuestions([]);
    setTopicFilter(null);
    setQuantity(10);
    setSessionActive(false);
    setCurrentIndex(0);
    setAnswers({});
    setResult(null);
    setLoadError(null);
    setSubmitError(null);
  };

  const startSession = async (subject: string) => {
    setSelectedSubject(subject);
    setLoading(true);
    setLoadError(null);
    setResult(null);
    setSubmitError(null);
    setTopicFilter(null);
    setQuantity(10);
    setAnswers({});
    setCurrentIndex(0);
    try {
      const list = await api.questions({ subject, limit: 200 });
      if (list.length === 0) {
        setLoadError("এই বিষয়ে এখনো কোনো প্রশ্ন যোগ করা হয়নি।");
        setQuestions([]);
      } else {
        setQuestions(list);
        setQuantity(Math.min(10, list.length));
        setSessionActive(true);
      }
    } catch {
      setLoadError("প্রশ্ন লোড করা যায়নি। আবার চেষ্টা করুন।");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const adjustQuantity = (delta: number) => {
    setQuantity((q) => Math.min(totalQuestions, Math.max(1, q + delta)));
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

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
      >
        <div className="flex gap-2 bg-zinc-900/50 border border-emerald-500/20 rounded-xl p-1 w-fit">
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
              {m.id === "mock" ? <Timer className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              [ {m.label} ]
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          {MODES.find((m) => m.id === mode)?.hint}
        </p>
      </motion.div>

      {mode === "mock" ? (
        <MockTestTab />
      ) : (
        <>
          {!selectedSubject && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {/* Subject grid — real subjects + real counts */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {subjects.map((subject, i) => {
                  const count = subjectCounts[subject.name];
                  return (
                    <motion.button
                      key={subject.name}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.03, type: "spring", stiffness: 300, damping: 20 }}
                      whileHover={{ y: -4 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => void startSession(subject.name)}
                      className="glass rounded-2xl border border-terminal-border p-4 flex flex-col items-center gap-2 hover:border-emerald-500/40 hover:shadow-neon-glow transition-all"
                    >
                      <div className={`w-12 h-12 rounded-xl ${subject.bg} flex items-center justify-center text-2xl`}>
                        {subject.icon}
                      </div>
                      <span className={`text-xs font-mono text-center leading-tight ${subject.color}`}>
                        {subject.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {count !== undefined ? `${count}টি প্রশ্ন` : "লোড হচ্ছে..."}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Loading state */}
          {selectedSubject && loading && (
            <div className="glass rounded-2xl border border-terminal-border p-10 text-center">
              <p className="text-3xl mb-3 animate-pulse">⏳</p>
              <p className="text-sm text-zinc-400 font-mono">প্রশ্ন লোড হচ্ছে...</p>
            </div>
          )}

          {/* Error state */}
          {selectedSubject && !loading && loadError && (
            <div className="glass rounded-2xl border border-terminal-border p-10 text-center">
              <p className="text-3xl mb-3">⚠️</p>
              <p className="text-sm text-zinc-400">{loadError}</p>
              <button
                onClick={() => void startSession(selectedSubject)}
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
          {selectedSubject && !loading && !loadError && questions.length === 0 && !sessionActive && (
            <div className="glass rounded-2xl border border-terminal-border p-10 text-center">
              <p className="text-3xl mb-3">📭</p>
              <p className="text-sm text-zinc-400">কোনো প্রশ্ন পাওয়া যায়নি।</p>
              <button
                onClick={resetSession}
                className="mt-4 px-4 py-2 bg-zinc-800 text-zinc-300 font-mono text-sm rounded-lg hover:bg-zinc-700 transition-colors"
              >
                ফিরে যান
              </button>
            </div>
          )}

          {/* Session setup */}
          {selectedSubject && sessionActive && !result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl border border-terminal-border p-5 md:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Quick Practice</p>
                  <h3 className="text-lg font-bold text-white mt-1">{selectedSubject}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    <span className="text-emerald-400 font-mono">{questions.length}</span>টি প্রশ্ন উপলব্ধ
                  </p>
                </div>
                <button
                  onClick={resetSession}
                  className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs font-mono rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> বন্ধ করুন
                </button>
              </div>

              {/* Real topic chips */}
              {availableTopics.length > 1 && (
                <div className="mb-5">
                  <p className="text-xs text-zinc-500 font-mono mb-2">টপিক ফিল্টার</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setTopicFilter(null)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono border transition-colors ${
                        topicFilter === null
                          ? "bg-emerald-500 text-zinc-950 border-emerald-500"
                          : "border-zinc-700 text-zinc-400 hover:border-emerald-500/40"
                      }`}
                    >
                      সবগুলো
                    </button>
                    {availableTopics.map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setTopicFilter(topicFilter === t ? null : t);
                          setCurrentIndex(0);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-mono border transition-colors ${
                          topicFilter === t
                            ? "bg-emerald-500 text-zinc-950 border-emerald-500"
                            : "border-zinc-700 text-zinc-400 hover:border-emerald-500/40"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div className="glass rounded-xl border border-terminal-border p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-zinc-300 font-mono mb-1">প্রশ্নের সংখ্যা</p>
                  <p className="text-xs text-zinc-500">
                    উপলব্ধ: <span className="text-emerald-400 font-mono">{totalQuestions}টি</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => adjustQuantity(-1)}
                    className="w-9 h-9 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                    aria-label="কমান"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-3xl font-bold text-emerald-400 font-mono w-10 text-center">{quantity}</span>
                  <button
                    onClick={() => adjustQuantity(1)}
                    className="w-9 h-9 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                    aria-label="বাড়ান"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  setSessionActive(true);
                  setCurrentIndex(0);
                }}
                className="mt-4 w-full py-3 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 shadow-neon-glow"
              >
                <Play className="w-4 h-4" /> প্র্যাকটিস শুরু করুন
              </button>
            </motion.div>
          )}

          {/* Active quiz session */}
          {selectedSubject && sessionActive && !result && totalQuestions > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl border border-emerald-500/30 overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-terminal-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-white">{selectedSubject}</span>
                  {topicFilter && (
                    <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-mono text-emerald-400">
                      {topicFilter}
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-500 font-mono">
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
                      {currentQuestion.sourceExam && (
                        <span className="px-2 py-0.5 bg-zinc-800 rounded text-[10px] font-mono text-zinc-400">
                          {currentQuestion.sourceExam}
                          {currentQuestion.year ? ` ${currentQuestion.year}` : ""}
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
                                : "bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:border-emerald-500/20"
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
          {selectedSubject && result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass rounded-2xl border border-emerald-500/30 overflow-hidden"
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
                    <Target className="w-4 h-4" /> অন্য বিষয়
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