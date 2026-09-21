"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Trophy,
  ArrowRight,
  ArrowCounterClockwise,
  CheckCircle,
  XCircle,
  Spinner,
  WarningCircle,
  ListChecks,
} from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useToastSafe } from "@/lib/toast-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";
import type { Server } from "@/lib/types";

type QuizWord = Server.VocabQuizWordDTO;
type Answer = { wordId: number; correct: boolean };

type QuizState = {
  phase: "loading" | "playing" | "results" | "error" | "empty";
  questions: QuizWord[];
  currentIndex: number;
  score: { correct: number; total: number; answers: Answer[] };
  selected: number | null;
  answered: boolean;
};

const SHUFFLE_ARRAY = <T,>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function shuffleOptions(word: QuizWord): { id: number; bengaliMeaning: string }[] {
  return SHUFFLE_ARRAY([
    { id: word.id, bengaliMeaning: word.bengaliMeaning },
    ...word.distractors.map((d) => ({ id: d.id, bengaliMeaning: d.bengaliMeaning })),
  ]);
}

export default function QuizMode({
  onExit,
  difficulty,
}: {
  onExit: () => void;
  difficulty?: string;
}) {
  const toast = useToastSafe();
  const { lang } = useLanguage();
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<QuizState>({
    phase: "loading",
    questions: [],
    currentIndex: 0,
    score: { correct: 0, total: 0, answers: [] },
    selected: null,
    answered: false,
  });

  const fetchQuiz = useCallback(async () => {
    setState((s) => ({ ...s, phase: "loading" }));
    try {
      const words = await api.vocabQuiz({ count: 10, difficulty });
      if (words.length === 0) {
        setState((s) => ({ ...s, phase: "empty" }));
      } else {
        setState({
          phase: "playing",
          questions: words,
          currentIndex: 0,
          score: { correct: 0, total: 0, answers: [] },
          selected: null,
          answered: false,
        });
      }
    } catch {
      toast.error("Failed to load quiz words");
      setState((s) => ({ ...s, phase: "error" }));
    }
  }, [difficulty, toast]);

  useEffect(() => {
    void fetchQuiz();
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [fetchQuiz]);

  const advance = useCallback(() => {
    setState((s) => {
      const next = s.currentIndex + 1;
      if (next >= s.questions.length) {
        return { ...s, phase: "results" };
      }
      return { ...s, currentIndex: next, selected: null, answered: false };
    });
  }, []);

  const handleSelect = useCallback(
    (optionId: number) => {
      setState((s) => {
        if (s.answered || s.phase !== "playing") return s;
        const word = s.questions[s.currentIndex];
        const correct = optionId === word.id;
        const newScore = {
          correct: s.score.correct + (correct ? 1 : 0),
          total: s.score.total + 1,
          answers: [...s.score.answers, { wordId: word.id, correct }],
        };
        return { ...s, selected: optionId, answered: true, score: newScore };
      });
      advanceTimer.current = setTimeout(advance, 1500);
    },
    [advance],
  );

  useEffect(() => {
    if (state.phase !== "playing" || state.answered) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (advanceTimer.current) clearTimeout(advanceTimer.current);
        onExit();
        return;
      }
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < 4) {
        const word = state.questions[state.currentIndex];
        const opts = shuffleOptions(word);
        handleSelect(opts[idx].id);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.phase, state.answered, state.currentIndex, state.questions, handleSelect, onExit]);

  useEffect(() => {
    if (state.phase !== "playing" || !state.answered) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (advanceTimer.current) clearTimeout(advanceTimer.current);
        advance();
      }
      if (e.key === "Escape") {
        if (advanceTimer.current) clearTimeout(advanceTimer.current);
        onExit();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.phase, state.answered, advance, onExit]);

  if (state.phase === "loading") {
    return (
      <div className="glass-card rounded-2xl border border-[var(--terminal-border)] p-8 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Spinner className="w-8 h-8 text-[var(--accent)] animate-spin" />
        <span className="font-mono text-sm text-[var(--text-muted)]">
          {t(lang, "কুইজ লোড হচ্ছে...", "Loading quiz...")}
        </span>
      </div>
    );
  }

  if (state.phase === "empty") {
    return (
      <div className="glass-card rounded-2xl border border-[var(--terminal-border)] p-8 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <ListChecks className="w-10 h-10 text-[var(--text-muted)]" />
        <span className="font-mono text-sm text-[var(--text-muted)]">
          {t(lang, "কোনো শব্দ পাওয়া যায়নি", "No words available for quiz")}
        </span>
        <button onClick={onExit} className="btn-primary font-mono text-sm mt-2">
          {t(lang, "ফিরে যান", "Back")}
        </button>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="glass-card rounded-2xl border border-[var(--terminal-border)] p-8 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <WarningCircle className="w-10 h-10 text-[var(--dashboard-danger)]" />
        <span className="font-mono text-sm text-[var(--text-muted)]">
          {t(lang, "ত্রুটি ঘটেছে", "Something went wrong")}
        </span>
        <div className="flex gap-3">
          <button onClick={() => void fetchQuiz()} className="btn-primary font-mono text-sm">
            {t(lang, "পুনঃ চেষ্টা করুন", "Retry")}
          </button>
          <button onClick={onExit} className="btn-ghost font-mono text-sm">
            {t(lang, "ফিরে যান", "Back")}
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "results") {
    const pct = state.score.total > 0 ? Math.round((state.score.correct / state.score.total) * 100) : 0;
    const incorrectWords = state.score.answers
      .filter((a) => !a.correct)
      .map((a) => state.questions.find((q) => q.id === a.wordId))
      .filter(Boolean) as QuizWord[];

    return (
      <div className="glass-card rounded-2xl border border-[var(--terminal-border)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--terminal-border)] bg-[var(--surface-raised)]">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--dashboard-danger)]" />
            <div className="w-3 h-3 rounded-full bg-[var(--dashboard-warning)]" />
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
          </div>
          <span className="font-mono text-xs text-[var(--text-muted)]">quiz_results</span>
          <button onClick={onExit} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-6">
          <Trophy className="w-14 h-14 text-[var(--accent)]" />
          <div className="text-center">
            <p className="text-3xl font-bold text-[var(--text-primary)]">{pct}%</p>
            <p className="font-mono text-sm text-[var(--text-muted)] mt-1">
              {state.score.correct}/{state.score.total}{" "}
              {t(lang, "সঠিক", "correct")}
            </p>
          </div>

          {incorrectWords.length > 0 && (
            <div className="w-full">
              <h3 className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">
                {t(lang, "পুনরালোচনা করুন", "Words to Review")}
              </h3>
              <div className="space-y-2">
                {incorrectWords.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--dashboard-danger-subtle)] border border-[var(--dashboard-danger)]/20"
                  >
                    <span className="font-medium text-[var(--text-primary)]">{w.word}</span>
                    <span className="text-sm text-[var(--text-muted)]">{w.bengaliMeaning}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 w-full">
            <button onClick={() => void fetchQuiz()} className="btn-primary font-mono text-sm flex-1 flex items-center justify-center gap-2">
              <ArrowCounterClockwise className="w-4 h-4" />
              {t(lang, "আবার চেষ্টা করুন", "Try Again")}
            </button>
            <button onClick={onExit} className="btn-ghost font-mono text-sm flex-1 flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              {t(lang, "শব্দতালিকায় ফিরে যান", "Back to Vocab")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const word = state.questions[state.currentIndex];
  const opts = shuffleOptions(word);
  const progress = ((state.currentIndex + (state.answered ? 1 : 0)) / state.questions.length) * 100;

  return (
    <div className="glass-card rounded-2xl border border-[var(--terminal-border)] overflow-hidden">
      {/* Terminal bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--terminal-border)] bg-[var(--surface-raised)]">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[var(--dashboard-danger)]" />
          <div className="w-3 h-3 rounded-full bg-[var(--dashboard-warning)]" />
          <div className="w-3 h-3 rounded-full bg-emerald-400" />
        </div>
        <span className="font-mono text-xs text-[var(--text-muted)]">
          {state.currentIndex + 1}/{state.questions.length}
        </span>
        <button
          onClick={() => {
            if (advanceTimer.current) clearTimeout(advanceTimer.current);
            onExit();
          }}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-[var(--surface-raised)]">
        <motion.div
          className="h-full bg-[var(--accent)]"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Score + progress label */}
      <div className="flex items-center justify-between px-6 pt-4">
        <span className="font-mono text-xs text-[var(--text-muted)]">
          {state.currentIndex + 1}/{state.questions.length}
        </span>
        <span className="font-mono text-xs text-[var(--accent)]">
          {state.score.correct} ✓
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={state.currentIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="p-6"
        >
          {/* Word display */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-2">{word.word}</h2>
            <span className="inline-block px-3 py-1 rounded-full bg-[var(--surface-raised)] border border-[var(--terminal-border)] font-mono text-xs text-[var(--text-muted)]">
              {word.partOfSpeech}
            </span>
          </div>

          {/* Options grid */}
          <div className="grid grid-cols-2 gap-3">
            {opts.map((opt, i) => {
              const isSelected = state.selected === opt.id;
              const isCorrect = opt.id === word.id;
              const showResult = state.answered;

              let optClass = "border-[var(--terminal-border)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)]";
              if (showResult && isCorrect) {
                optClass = "border-emerald-500 bg-emerald-500/10 text-emerald-700";
              } else if (showResult && isSelected && !isCorrect) {
                optClass = "border-[var(--dashboard-danger)] bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]";
              } else if (isSelected) {
                optClass = "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]";
              }

              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelect(opt.id)}
                  disabled={state.answered}
                  className={`relative p-4 rounded-xl border transition-all duration-200 font-medium text-sm text-left ${optClass} ${state.answered ? "cursor-default" : "cursor-pointer"}`}
                >
                  <span className="absolute top-2 left-3 font-mono text-[10px] text-[var(--text-muted)]">
                    {i + 1}
                  </span>
                  <span className="ml-4">{opt.bengaliMeaning}</span>
                  {showResult && isCorrect && (
                    <CheckCircle className="absolute top-2 right-3 w-4 h-4 text-emerald-500" />
                  )}
                  {showResult && isSelected && !isCorrect && (
                    <XCircle className="absolute top-2 right-3 w-4 h-4 text-[var(--dashboard-danger)]" />
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Keyboard hint */}
      <div className="px-6 pb-4 text-center">
        <p className="font-mono text-[10px] text-[var(--text-muted)]">
          {t(lang, "১-৪: বিকল্প নির্বাচন · এন্টার: পরবরী · এস্কেপ: বের", "1-4: select · Enter: next · Esc: exit")}
        </p>
      </div>
    </div>
  );
}
