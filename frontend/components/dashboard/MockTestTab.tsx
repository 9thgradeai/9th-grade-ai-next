"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { X, Play, Pause, RotateCcw, Check, Clock, Trophy, ChevronLeft, ChevronRight } from "lucide-react";
import { MOCK_TEST_QUESTIONS } from "@/lib/data/study";
import { api } from "@/lib/services/api";
import type { MockQuestion, Server } from "@/lib/types";

type TestState = "setup" | "active" | "completed";

export default function MockTestTab() {
  const [testState, setTestState] = useState<TestState>("setup");
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [tests, setTests] = useState<Record<string, MockQuestion[]>>(MOCK_TEST_QUESTIONS);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load mock tests from the database (fallback to static data).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.mockTests();
        if (!cancelled && list.length) {
          const grouped: Record<string, MockQuestion[]> = {};
          for (const t of list) {
            grouped[t.subject] = t.questions.map((q: Server.QuestionDTO) => ({
              id: String(q.id),
              subject: q.subject,
              topic: q.topic,
              question: q.question,
              options: q.options,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
            }));
          }
          setTests(grouped);
        }
      } catch {
        /* keep static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subjects = Object.keys(tests);
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).length;

  const startTest = useCallback(() => {
    if (!selectedSubject) return;
    const qs = tests[selectedSubject] || [];
    const shuffled = [...qs].sort(() => Math.random() - 0.5);
    setQuestions(shuffled);
    setCurrentQuestion(0);
    setAnswers({});
    setTimeRemaining(shuffled.length * 60);
    setScore(0);
    setTestState("active");
    setShowResults(false);
    setIsPaused(false);
  }, [selectedSubject, tests]);

  useEffect(() => {
    if (testState !== "active" || isPaused || timeRemaining <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeRemaining((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          setTestState("completed");
          setShowResults(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [testState, isPaused, timeRemaining]);

  const selectAnswer = (questionIndex: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionIndex]: answer }));
  };

  const submitTest = () => {
    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) correct++;
    });
    setScore(correct);
    setTestState("completed");
    setShowResults(true);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const resetTest = () => {
    setTestState("setup");
    setSelectedSubject(null);
    setQuestions([]);
    setCurrentQuestion(0);
    setAnswers({});
    setTimeRemaining(0);
    setScore(0);
    setShowResults(false);
    setIsPaused(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ── Setup Screen ────────────────────────────────────
  if (testState === "setup") {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-terminal-rounded border border-terminal-border p-5"
        >
          <div className="terminal-window-bar mb-4 border-b border-terminal-border">
            <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
            <div className="flex-1 text-center text-xs text-zinc-400 font-mono">{"// ADAPTIVE_MOCK_TEST"}</div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Adaptive Mock Test</h2>
          </div>

          <p className="text-sm text-zinc-400 font-mono mb-4">
            Select a subject to generate a timed mock test. Questions are shuffled and timed like the real exam.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {subjects.map((subject, i) => (
              <motion.button
                key={subject}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -2 }}
                onClick={() => setSelectedSubject(subject)}
                className={`glass rounded-terminal-rounded border p-4 text-left transition-all ${
                  selectedSubject === subject
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-terminal-border hover:border-emerald-500/20"
                }`}
              >
                <h3 className="text-sm font-medium text-white mb-1">{subject}</h3>
                <p className="text-xs text-zinc-500 font-mono">
                  {tests[subject]?.length ?? 0} questions • {tests[subject]?.length ?? 0} min
                </p>
              </motion.button>
            ))}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={startTest}
            disabled={!selectedSubject}
            className="mt-4 w-full py-3 bg-emerald-500 text-zinc-950 font-mono rounded-lg hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            Start Mock Test
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ── Active Test ─────────────────────────────────────
  if (testState === "active" && !showResults) {
    const q = questions[currentQuestion];
    const timePercent = (timeRemaining / (questions.length * 60)) * 100;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-zinc-400">
              Q {currentQuestion + 1}/{totalQuestions}
            </span>
            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-mono text-emerald-400">
              {q.subject}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <button
              onClick={submitTest}
              className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 font-mono text-xs rounded hover:bg-red-500/20 transition-colors"
            >
              Submit
            </button>
          </div>
        </div>

        {/* Timer Bar */}
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            animate={{ width: `${timePercent}%` }}
            transition={{ duration: 1 }}
            className={`h-full rounded-full ${timePercent < 20 ? "bg-red-500" : "bg-emerald-500"}`}
          />
        </div>
        <div className="text-right text-xs font-mono text-zinc-500">
          <Clock className="w-3 h-3 inline mr-1" />
          {formatTime(timeRemaining)}
        </div>

        {/* Question */}
        <motion.div
          key={currentQuestion}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass rounded-terminal-rounded border border-terminal-border p-6"
        >
          <h3 className="text-lg font-medium text-white mb-6">{q.question}</h3>
          <div className="space-y-3">
            {q.options.map((option, i) => {
              const isSelected = answers[currentQuestion] === option;
              return (
                <button
                  key={i}
                  onClick={() => selectAnswer(currentQuestion, option)}
                  className={`w-full text-left p-4 rounded-terminal-rounded border transition-all ${
                    isSelected
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:border-emerald-500/20"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-sm">{option}</span>
                    {isSelected && <Check className="w-4 h-4 text-emerald-400 ml-auto" />}
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentQuestion((q) => Math.max(0, q - 1))}
            disabled={currentQuestion === 0}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-sm rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-xs text-zinc-500 font-mono">
            {answeredCount}/{totalQuestions} answered
          </span>
          <button
            onClick={() => setCurrentQuestion((q) => Math.min(totalQuestions - 1, q + 1))}
            disabled={currentQuestion === totalQuestions - 1}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-sm rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Question Map */}
        <div className="flex flex-wrap gap-1.5">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentQuestion(i)}
              className={`w-8 h-8 rounded-lg border text-xs font-mono transition-all ${
                i === currentQuestion
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : answers[i]
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Results Screen ──────────────────────────────────
  if (showResults) {
    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-terminal-rounded border border-terminal-border p-6 text-center"
        >
          <Trophy className={`w-16 h-16 mx-auto mb-4 ${percentage >= 80 ? "text-amber-400" : percentage >= 50 ? "text-emerald-400" : "text-red-400"}`} />
          <h3 className="text-2xl font-bold text-white mb-2">Test Complete!</h3>
          <div className="text-5xl font-bold font-mono text-emerald-400 mb-2">{percentage}%</div>
          <p className="text-sm text-zinc-400 font-mono mb-1">
            {score} / {totalQuestions} correct
          </p>
          <p className="text-xs text-zinc-500 font-mono">
            Time: {formatTime(questions.length * 60 - timeRemaining)}
          </p>
        </motion.div>

        {/* Question Review */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-zinc-400 font-mono uppercase tracking-wider">Question Review</h4>
          {questions.map((q, i) => {
            const userAnswer = answers[i];
            const isCorrect = userAnswer === q.correctAnswer;
            return (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`glass rounded-terminal-rounded border p-4 ${
                  isCorrect ? "border-emerald-500/20" : "border-red-500/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCorrect ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  }`}>
                    {isCorrect ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white mb-2">{q.question}</p>
                    <p className="text-xs text-zinc-500 font-mono mb-1">
                      Your answer: <span className={isCorrect ? "text-emerald-400" : "text-red-400"}>{userAnswer || "Not answered"}</span>
                    </p>
                    {!isCorrect && (
                      <p className="text-xs text-emerald-400 font-mono">
                        Correct: {q.correctAnswer}
                      </p>
                    )}
                    <p className="text-xs text-zinc-500 mt-2">{q.explanation}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={resetTest}
          className="w-full py-3 bg-emerald-500 text-zinc-950 font-mono rounded-lg hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Take Another Test
        </motion.button>
      </div>
    );
  }

  return null;
}
