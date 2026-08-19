"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Trophy, Zap, ArrowRight, Inbox } from "lucide-react";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";

export default function DailyQuizWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [quiz, setQuiz] = useState<Server.DailyQuizDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResult, setShowResult] = useState(false);
  const [summary, setSummary] = useState<{ correct: number; total: number; score: number; pointsEarned: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape to close + focus the modal when it opens.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const dq = await api.dailyQuiz();
        if (!cancelled) setQuiz(dq);
      } catch {
        if (!cancelled) setQuiz(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentQuestion = quiz?.questions[currentIndex];
  const totalQuestions = quiz?.questions.length ?? 0;
  const answeredCount = Object.keys(answers).length;

  const selectAnswer = (answer: string) => {
    if (answers[currentIndex]) return;
    setAnswers((prev) => ({ ...prev, [currentIndex]: answer }));
  };

  const nextQuestion = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const prevQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  const finishQuiz = async () => {
    if (!quiz) return;
    setSubmitting(true);
    try {
      const res = await api.submitDailyQuiz(
        quiz.id,
        quiz.questions.map((q, i) => ({
          questionId: q.id,
          selected: answers[i] ?? "",
        })),
      );
      setSummary(res);
    } catch {
      const correct = quiz.questions.reduce(
        (acc, q, i) => (answers[i] === q.correctAnswer ? acc + 1 : acc),
        0,
      );
      setSummary({
        correct,
        total: quiz.questions.length,
        score: Math.round((correct / quiz.questions.length) * 100),
        pointsEarned: 0,
      });
    } finally {
      setSubmitting(false);
      setShowResult(true);
    }
  };

  const resetQuiz = () => {
    setCurrentIndex(0);
    setAnswers({});
    setShowResult(false);
    setSummary(null);
  };

  if (!isOpen) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="glass rounded-2xl border border-amber-500/20 p-4 flex items-center gap-3 hover:border-amber-500/40 transition-all cursor-pointer"
        onClick={() => setIsOpen(true)}
      >
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Zap className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-white">দৈনিক কুইজ</h3>
          <p className="text-xs text-zinc-500 font-mono">
            {loading
              ? "লোড হচ্ছে..."
              : quiz
                ? `${quiz.questions.length}টি প্রশ্ন`
                : "আজকের কুইজ শীঘ্রই আসছে"}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-amber-400" />
      </motion.div>
    );
  }

  if (!quiz && !loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass rounded-2xl border border-amber-500/20 p-6 flex flex-col items-center text-center"
      >
        <Inbox className="w-10 h-10 mb-3 text-zinc-600" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-white">আজকের জন্য কোনো কুইজ নেই</h3>
        <p className="text-xs text-zinc-500 mt-1">নতুন কুইজ প্রকাশিত হলে এখানে দেখা যাবে।</p>
        <button
          onClick={() => setIsOpen(false)}
          className="mt-4 px-4 py-2 bg-zinc-800 text-zinc-300 font-mono text-sm rounded-lg hover:bg-zinc-700 transition-colors"
        >
          বন্ধ করুন
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        ref={dialogRef}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-lg bg-zinc-950 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="দৈনিক কুইজ"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <span className="text-xs text-zinc-400 font-mono">দৈনিক কুইজ</span>
          <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white" aria-label="বন্ধ করুন">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {!showResult ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-zinc-500 font-mono">
                  প্রশ্ন {currentIndex + 1}/{totalQuestions}
                </span>
                <span className="text-xs text-amber-400 font-mono">
                  {answeredCount}/{totalQuestions} সমাধান
                </span>
              </div>

              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-6">
                <motion.div
                  animate={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                />
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="mb-6"
                >
                  <span className="text-[10px] text-amber-400 font-mono uppercase tracking-wider mb-2 block">
                    {currentQuestion?.subject} • {currentQuestion?.topic}
                  </span>
                  <h3 className="text-base font-medium text-white mb-4">{currentQuestion?.question}</h3>
                  <div className="space-y-2">
                    {currentQuestion?.options.map((option, i) => {
                      const isSelected = answers[currentIndex] === option;
                      return (
                        <button
                          key={i}
                          onClick={() => selectAnswer(option)}
                          className={`w-full text-left p-3 rounded-xl border transition-all ${
                            isSelected
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                              : "bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:border-amber-500/20"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono">
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span className="text-sm">{option}</span>
                            {isSelected && <Check className="w-4 h-4 text-amber-400 ml-auto" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="flex items-center justify-between">
                <button
                  onClick={prevQuestion}
                  disabled={currentIndex === 0}
                  className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-sm rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-40"
                >
                  আগের
                </button>
                {currentIndex < totalQuestions - 1 ? (
                  <button
                    onClick={nextQuestion}
                    className="px-4 py-2 bg-amber-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-amber-400 transition-colors"
                  >
                    পরের
                  </button>
                ) : (
                  <button
                    onClick={() => void finishQuiz()}
                    disabled={answeredCount < totalQuestions || submitting}
                    className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-40"
                  >
                    {submitting ? "জমা হচ্ছে..." : "কুইজ জমা দিন"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6"
            >
              <Trophy className={`w-12 h-12 mx-auto mb-3 ${(summary?.score ?? 0) >= 80 ? "text-amber-400" : (summary?.score ?? 0) >= 50 ? "text-emerald-400" : "text-red-400"}`} />
              <h3 className="text-xl font-bold text-white mb-2">কুইজ সম্পন্ন!</h3>
              <div className="text-4xl font-bold font-mono text-emerald-400 mb-2">{summary?.score ?? 0}%</div>
              <p className="text-sm text-zinc-400 font-mono mb-1">
                {summary?.correct ?? 0} / {summary?.total ?? 0} সঠিক
              </p>
              <p className="text-xs text-zinc-500 font-mono mb-6">
                +{summary?.pointsEarned ?? 0} পয়েন্ট অর্জিত
              </p>

              <div className="space-y-2 text-left max-h-64 overflow-y-auto mb-6">
                {quiz?.questions.map((q, i) => {
                  const userAnswer = answers[i];
                  const isCorrect = userAnswer === q.correctAnswer;
                  return (
                    <div key={q.id} className={`p-3 rounded-xl border ${isCorrect ? "border-emerald-500/20" : "border-red-500/20"}`}>
                      <p className="text-sm text-white mb-1">{i + 1}. {q.question}</p>
                      <p className="text-xs text-zinc-500 font-mono">
                        আপনার উত্তর: <span className={isCorrect ? "text-emerald-400" : "text-red-400"}>{userAnswer || "উত্তর দেওয়া হয়নি"}</span>
                      </p>
                      {!isCorrect && (
                        <p className="text-xs text-emerald-400 font-mono">সঠিক উত্তর: {q.correctAnswer}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="px-6 py-2.5 bg-emerald-500 text-zinc-950 font-mono rounded-lg hover:bg-emerald-400 transition-colors"
              >
                বন্ধ করুন
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}