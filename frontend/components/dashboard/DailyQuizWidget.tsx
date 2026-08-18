"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Trophy, Zap, ArrowRight } from "lucide-react";
import { DAILY_QUIZZES } from "@/lib/data/study";
import { api } from "@/lib/services/api";
import type { DailyQuiz } from "@/lib/types";

export default function DailyQuizWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [quiz, setQuiz] = useState<DailyQuiz>(DAILY_QUIZZES[0]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);

  // Load the daily quiz from the database (fallback to static data).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.dailyQuizzes();
        if (!cancelled && list.length) {
          const dq = list[0];
          setQuiz({
            id: String(dq.id),
            title: dq.title ?? "Daily Quiz",
            date: dq.date,
            completed: false,
            score: 0,
            claimed: false,
            questions: dq.questions.map((q) => ({
              id: String(q.id),
              subject: q.subject,
              topic: q.topic,
              question: q.question,
              options: q.options,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
            })),
          });
        }
      } catch {
        /* keep static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentQuestion = quiz.questions[currentIndex];
  const totalQuestions = quiz.questions.length;
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

  const finishQuiz = () => {
    let correct = 0;
    quiz.questions.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) correct++;
    });
    setScore(correct);
    setShowResult(true);
  };

  const resetQuiz = () => {
    setCurrentIndex(0);
    setAnswers({});
    setShowResult(false);
    setScore(0);
  };

  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  if (!isOpen) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="glass rounded-terminal-rounded border border-amber-500/20 p-4 flex items-center gap-3 hover:border-amber-500/40 transition-all cursor-pointer"
        onClick={() => setIsOpen(true)}
      >
        <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Zap className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-white">Daily Quiz</h3>
          <p className="text-xs text-zinc-500 font-mono">5 questions • +50 XP</p>
        </div>
        <ArrowRight className="w-4 h-4 text-amber-400" />
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
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-lg bg-zinc-950 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="terminal-window-bar">
          <div className="dot close" onClick={() => setIsOpen(false)} role="button" />
          <div className="dot minimize" /><div className="dot maximize" />
          <div className="flex-1 text-center text-xs text-zinc-400 font-mono">
            {"// DAILY_QUIZ"}
          </div>
          <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {!showResult ? (
            <>
              {/* Progress */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-zinc-500 font-mono">
                  Question {currentIndex + 1}/{totalQuestions}
                </span>
                <span className="text-xs text-amber-400 font-mono">
                  {answeredCount}/{totalQuestions} answered
                </span>
              </div>

              {/* Progress Bar */}
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-6">
                <motion.div
                  animate={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                />
              </div>

              {/* Question */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="mb-6"
                >
                  <span className="text-[10px] text-amber-400 font-mono uppercase tracking-wider mb-2 block">
                    {currentQuestion.subject} • {currentQuestion.topic}
                  </span>
                  <h3 className="text-base font-medium text-white mb-4">{currentQuestion.question}</h3>
                  <div className="space-y-2">
                    {currentQuestion.options.map((option, i) => {
                      const isSelected = answers[currentIndex] === option;
                      return (
                        <button
                          key={i}
                          onClick={() => selectAnswer(option)}
                          className={`w-full text-left p-3 rounded-terminal-rounded border transition-all ${
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

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <button
                  onClick={prevQuestion}
                  disabled={currentIndex === 0}
                  className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-sm rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-40"
                >
                  Previous
                </button>
                {currentIndex < totalQuestions - 1 ? (
                  <button
                    onClick={nextQuestion}
                    className="px-4 py-2 bg-amber-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-amber-400 transition-colors"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={finishQuiz}
                    disabled={answeredCount < totalQuestions}
                    className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-40"
                  >
                    Finish Quiz
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Results */
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6"
            >
              <Trophy className={`w-12 h-12 mx-auto mb-3 ${percentage >= 80 ? "text-amber-400" : percentage >= 50 ? "text-emerald-400" : "text-red-400"}`} />
              <h3 className="text-xl font-bold text-white mb-2">Quiz Complete!</h3>
              <div className="text-4xl font-bold font-mono text-emerald-400 mb-2">{percentage}%</div>
              <p className="text-sm text-zinc-400 font-mono mb-1">
                {score} / {totalQuestions} correct
              </p>
              <p className="text-xs text-zinc-500 font-mono mb-6">
                +{score * 10} XP earned
              </p>

              {/* Answer Review */}
              <div className="space-y-2 text-left max-h-64 overflow-y-auto mb-6">
                {quiz.questions.map((q, i) => {
                  const userAnswer = answers[i];
                  const isCorrect = userAnswer === q.correctAnswer;
                  return (
                    <div key={q.id} className={`p-3 rounded-terminal-rounded border ${isCorrect ? "border-emerald-500/20" : "border-red-500/20"}`}>
                      <p className="text-sm text-white mb-1">{i + 1}. {q.question}</p>
                      <p className="text-xs text-zinc-500 font-mono">
                        Your answer: <span className={isCorrect ? "text-emerald-400" : "text-red-400"}>{userAnswer || "Not answered"}</span>
                      </p>
                      {!isCorrect && (
                        <p className="text-xs text-emerald-400 font-mono">Correct: {q.correctAnswer}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={resetQuiz}
                className="px-6 py-2.5 bg-emerald-500 text-zinc-950 font-mono rounded-lg hover:bg-emerald-400 transition-colors"
              >
                Retake Quiz
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
