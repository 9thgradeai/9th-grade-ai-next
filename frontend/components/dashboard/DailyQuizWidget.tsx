"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Trophy, Zap, ArrowRight, Inbox } from "lucide-react";
import { api } from "@/lib/services/api";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import type { Server } from "@/lib/types";

export default function DailyQuizWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [quiz, setQuiz] = useState<Server.DailyQuizDTO | null>(null);
  const [history, setHistory] = useState<Server.DailyQuizHistoryItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResult, setShowResult] = useState(false);
  const [summary, setSummary] = useState<{ correct: number; total: number; score: number; pointsEarned: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  // Shared dialog behavior: Escape, focus trap, initial focus, restore focus
  // to the trigger card on close.
  const closeModal = useCallback(() => setIsOpen(false), []);
  const dialogRef = useDialogA11y<HTMLDivElement>(isOpen, closeModal);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [dq, hist] = await Promise.allSettled([api.dailyQuiz(), api.dailyQuizHistory(14)]);
        if (!cancelled) {
          if (dq.status === "fulfilled") setQuiz(dq.value);
          if (hist.status === "fulfilled") setHistory(hist.value);
        }
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
      setSubmitFailed(false);
    } catch {
      // Server did NOT record the attempt — show the local tally but say so,
      // never let the user believe points/streak were saved.
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
      setSubmitFailed(true);
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
    setSubmitFailed(false);
    setReviewMode(false);
  };

  if (!isOpen) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.26 }}
        role="button"
        tabIndex={0}
        className="glass-card rounded-2xl border border-amber-500/20 p-4 flex items-center gap-3 hover:border-amber-500/40 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        onClick={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <div className="w-10 h-10 rounded-xl bg-[var(--dashboard-warning-subtle)] border border-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Zap className="w-5 h-5 text-[var(--dashboard-warning)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">দৈনিক কুইজ</h3>
          <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
            {loading
              ? "লোড হচ্ছে..."
              : quiz?.completed
                ? `সম্পন্ন ✓ • ${quiz.score}%`
                : quiz
                  ? `${quiz.questions.length}টি প্রশ্ন`
                  : "আজকের কুইজ শীঘ্রই আসছে"}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-[var(--dashboard-warning)]" />
      </motion.div>
    );
  }

  if (!quiz && !loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-card rounded-2xl border border-amber-500/20 p-6 flex flex-col items-center text-center"
      >
        <Inbox className="w-10 h-10 mb-3 text-[var(--dashboard-text-secondary)]" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">আজকের জন্য কোনো কুইজ নেই</h3>
        <p className="text-xs text-[var(--dashboard-text-muted)] mt-1">নতুন কুইজ প্রকাশিত হলে এখানে দেখা যাবে।</p>
        <button
          onClick={() => setIsOpen(false)}
          className="mt-4 px-4 py-2 bg-[var(--surface-overlay)] text-[var(--dashboard-text-secondary)] font-mono text-sm rounded-lg hover:bg-[var(--surface-muted)] transition-colors"
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
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <motion.div
        ref={dialogRef}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-lg bg-[var(--surface-solid)] border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="দৈনিক কুইজ"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--dashboard-border-muted)]">
          <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">দৈনিক কুইজ</span>
          <button onClick={() => setIsOpen(false)} className="text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)]" aria-label="বন্ধ করুন">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {quiz && quiz.completed && !showResult && !reviewMode ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6"
            >
              <Trophy className="w-12 h-12 mx-auto mb-3 text-[var(--dashboard-warning)]" />
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">আজকের কুইজ সম্পন্ন!</h3>
              <div className="text-4xl font-bold font-mono text-[var(--dashboard-primary)] mb-2">{quiz.score}%</div>
              <p className="text-xs text-[var(--dashboard-text-muted)] font-mono mb-6">আজকের কুইজ শেষ — কাল আবার চেষ্টা করুন।</p>

              {history.length > 0 && (
                <div className="mb-6">
                  <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-2">সাম্প্রতিক ইতিহাস</p>
                  <div className="flex items-center justify-center gap-1.5">
                    {history.slice(0, 7).map((h) => (
                      <div
                        key={h.quizId + h.completedAt}
                        title={`${h.score}% • ${h.correct}/${h.total}`}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-mono ${
                          h.score >= 80
                            ? "bg-[var(--dashboard-warning-subtle)] text-[var(--dashboard-warning)]"
                            : h.score >= 50
                            ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
                            : "bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]"
                        }`}
                      >
                        {h.score}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    resetQuiz();
                    setReviewMode(true);
                  }}
                  className="px-4 py-2 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-secondary)] font-mono text-sm rounded-lg hover:bg-[var(--surface-overlay)] transition-colors"
                >
                  আবার চেষ্টা করুন
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
                >
                  বন্ধ করুন
                </button>
              </div>
            </motion.div>
          ) : !showResult ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">
                  প্রশ্ন {currentIndex + 1}/{totalQuestions}
                </span>
                <span className="text-xs text-[var(--dashboard-warning)] font-mono">
                  {answeredCount}/{totalQuestions} সমাধান
                </span>
              </div>

              <div className="h-1.5 bg-[var(--surface-overlay)] rounded-full overflow-hidden mb-6">
                <motion.div
                  initial={false}
                  animate={{ scaleX: totalQuestions > 0 ? answeredCount / totalQuestions : 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  style={{ transformOrigin: "left" }}
                  className="h-full w-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
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
                  <span className="text-[10px] text-[var(--dashboard-warning)] font-mono uppercase tracking-wider mb-2 block">
                    {currentQuestion?.subject} • {currentQuestion?.topic}
                  </span>
                  <h3 className="text-base font-medium text-[var(--text-primary)] mb-4">{currentQuestion?.question}</h3>
                  <div className="space-y-2" role="radiogroup" aria-label="উত্তর নির্বাচন করুন">
                    {currentQuestion?.options.map((option, i) => {
                      const isSelected = answers[currentIndex] === option;
                      return (
                        <button
                          key={i}
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => selectAnswer(option)}
                          className={`w-full text-left p-3 rounded-xl border transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                            isSelected
                              ? "bg-[var(--dashboard-warning-subtle)] border-amber-500/30 text-[var(--dashboard-warning)]"
                              : "bg-subtle border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-secondary)] hover:border-amber-500/20"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-[var(--surface-overlay)] border border-zinc-700 flex items-center justify-center text-xs font-mono">
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span className="text-sm">{option}</span>
                            {isSelected && <Check className="w-4 h-4 text-[var(--dashboard-warning)] ml-auto" />}
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
                  className="px-4 py-2 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] font-mono text-sm rounded-lg hover:bg-[var(--surface-overlay)] transition-colors disabled:opacity-40"
                >
                  আগের
                </button>
                {currentIndex < totalQuestions - 1 ? (
                  <button
                    onClick={nextQuestion}
                    className="px-4 py-2 bg-[var(--warning)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--warning)] transition-colors"
                  >
                    পরের
                  </button>
                ) : (
                  <button
                    onClick={() => void finishQuiz()}
                    disabled={answeredCount < totalQuestions || submitting}
                    className="px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
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
              <Trophy className={`w-12 h-12 mx-auto mb-3 ${(summary?.score ?? 0) >= 80 ? "text-[var(--dashboard-warning)]" : (summary?.score ?? 0) >= 50 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-danger)]"}`} />
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">কুইজ সম্পন্ন!</h3>
              {submitFailed && (
                <div
                  role="alert"
                  className="mx-auto mb-4 max-w-xs rounded-xl border border-red-500/30 bg-[var(--dashboard-danger-subtle)] p-3 text-xs text-[var(--dashboard-danger)] text-left"
                >
                  সার্ভারে ফলাফল জমা হয়নি — পয়েন্ট বা স্ট্রিক সংরক্ষিত হয়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।
                </div>
              )}
              <div className="text-4xl font-bold font-mono text-[var(--dashboard-primary)] mb-2">{summary?.score ?? 0}%</div>
              <p className="text-sm text-[var(--dashboard-text-muted)] font-mono mb-1">
                {summary?.correct ?? 0} / {summary?.total ?? 0} সঠিক
              </p>
              <p className="text-xs text-[var(--dashboard-text-muted)] font-mono mb-6">
                +{summary?.pointsEarned ?? 0} পয়েন্ট অর্জিত
              </p>

              <div className="space-y-2 text-left max-h-64 overflow-y-auto mb-6">
                {quiz?.questions.map((q, i) => {
                  const userAnswer = answers[i];
                  const isCorrect = userAnswer === q.correctAnswer;
                  return (
                    <div key={q.id} className={`p-3 rounded-xl border ${isCorrect ? "border-[var(--accent)]/20" : "border-red-500/20"}`}>
                      <p className="text-sm text-[var(--text-primary)] mb-1">{i + 1}. {q.question}</p>
                      <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
                        আপনার উত্তর: <span className={isCorrect ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-danger)]"}>{userAnswer || "উত্তর দেওয়া হয়নি"}</span>
                      </p>
                      {!isCorrect && (
                        <p className="text-xs text-[var(--dashboard-primary)] font-mono">সঠিক উত্তর: {q.correctAnswer}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="px-6 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
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