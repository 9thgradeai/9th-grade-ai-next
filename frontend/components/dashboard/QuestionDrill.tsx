"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, ArrowRight, RotateCcw, TrendingUp } from "lucide-react";
import { api } from "@/lib/services/api";
import type { QuestionDTO } from "@/lib/types";

export type DrillAnswered = {
  questionId: number;
  selected: string;
  correct: boolean;
  masteryStatus?: string | null;
  justMastered?: boolean;
};

/**
 * Inline practice session over a fixed, caller-supplied list of questions
 * (e.g. the wrong-answer notebook, bookmarked set, or a weak topic). Each
 * answer is persisted via /api/practice/submit so progress (and the notebook
 * itself) stays authoritative on the server.
 *
 * The question set is treated as immutable for the component's lifetime — the
 * caller should pass a `key` to remount when a different set is drilled.
 */

export default function QuestionDrill({
  questions,
  onExit,
  title = "প্র্যাকটিস",
  onComplete,
}: {
  questions: QuestionDTO[];
  onExit?: () => void;
  title?: string;
  /** Called with the answered records (incl. mastery feedback) once the set is finished. */
  onComplete?: (answered: DrillAnswered[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState<DrillAnswered[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<{ masteryStatus?: string | null; justMastered?: boolean } | null>(null);

  const reportedRef = useRef(false);

  const correctCount = answered.filter((a) => a.correct).length;
  const done = index >= questions.length - 1 && revealed;

  useEffect(() => {
    if (done && !reportedRef.current) {
      reportedRef.current = true;
      onComplete?.(answered);
    }
  }, [done, answered, onComplete]);

  const resetDrill = () => {
    setIndex(0);
    setSelected(null);
    setRevealed(false);
    setAnswered([]);
    setLastFeedback(null);
    reportedRef.current = false;
  };

  if (questions.length === 0) {
    return (
      <div className="glass-card rounded-terminal-rounded border border-terminal-border p-8 text-center">
        <p className="text-sm text-zinc-400 font-mono">কোনো প্রশ্ন নেই</p>
      </div>
    );
  }

  const current = questions[index];
  const isLast = index >= questions.length - 1;
  const isCorrect = selected !== null && selected.trim() === current.correctAnswer.trim();

  const handleSubmit = async () => {
    if (selected === null || revealed || submitting) return;
    setSubmitting(true);
    let fb: { masteryStatus?: string | null; justMastered?: boolean } = {};
    try {
      const res = await api.submitPractice([{ questionId: current.id, selected }]);
      const questionFb = res.feedback?.[current.id];
      if (questionFb) {
        fb = { masteryStatus: questionFb.masteryStatus, justMastered: questionFb.justMastered };
      }
    } catch {
      /* Recording failure shouldn't block the user from reviewing the answer. */
    } finally {
      setSubmitting(false);
      setRevealed(true);
      setLastFeedback(fb);
      setAnswered((prev) => [
        ...prev,
        { questionId: current.id, selected, correct: isCorrect, ...fb },
      ]);
    }
  };

  const next = () => {
    if (isLast) return;
    setIndex((i) => i + 1);
    setSelected(null);
    setRevealed(false);
    setLastFeedback(null);
  };

  if (done) {
    const score = Math.round((correctCount / questions.length) * 100);
    return (
      <div className="glass-card rounded-terminal-rounded border border-terminal-border p-8 text-center space-y-4">
        <h3 className="text-lg font-bold text-white font-mono">{title} — শেষ</h3>
        <div className={`text-3xl font-bold font-mono ${score >= 60 ? "text-emerald-400" : "text-amber-400"}`}>
          {score}%
        </div>
        <p className="text-sm text-zinc-400 font-mono">
          {correctCount}/{questions.length} ঠিক
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={resetDrill}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-300 font-mono text-sm hover:text-white transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> আবার
          </button>
          {onExit && (
            <button
              onClick={onExit}
              className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors"
            >
              শেষ করুন
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white font-mono">{title}</h3>
        <span className="text-xs text-zinc-500 font-mono">
          {index + 1} / {questions.length}
        </span>
      </div>

      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          initial={false}
          animate={{ scaleX: (index + (revealed ? 1 : 0)) / questions.length }}
          style={{ transformOrigin: "left" }}
          className="h-full w-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
        />
      </div>

      <div className="glass-card rounded-terminal-rounded border border-terminal-border p-5">
        <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mb-2">
          {current.subject} • {current.topic}
          {current.year ? ` • ${current.year}` : ""}
          {current.sourceExam ? ` • ${current.sourceExam}` : ""}
        </div>
        <h4 className="text-lg text-white leading-relaxed mb-4">{current.question}</h4>

        <div className="space-y-2">
          {current.options.map((opt, i) => {
            const optLetter = String.fromCharCode(65 + i);
            const isSelected = selected === opt;
            const isAnswer = opt.trim() === current.correctAnswer.trim();
            let cls = "border-zinc-800 hover:border-emerald-500/30 text-zinc-300";
            if (revealed) {
              if (isAnswer) cls = "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
              else if (isSelected) cls = "border-red-500/50 bg-red-500/10 text-red-300";
              else cls = "border-zinc-800 text-zinc-500";
            } else if (isSelected) {
              cls = "border-emerald-500/50 bg-emerald-500/10 text-emerald-200";
            }
            return (
              <button
                key={optLetter}
                disabled={revealed}
                onClick={() => setSelected(opt)}
                className={`w-full text-left px-4 py-3 rounded-lg border font-mono text-sm transition-all flex items-center gap-3 ${cls}`}
              >
                <span className="font-bold">{optLetter}.</span>
                <span>{opt}</span>
                {revealed && isAnswer && <CheckCircle2 className="w-4 h-4 ml-auto text-emerald-400" />}
                {revealed && isSelected && !isAnswer && <XCircle className="w-4 h-4 ml-auto text-red-400" />}
              </button>
            );
          })}
        </div>

        {revealed && current.explanation && (
          <p className="mt-4 text-sm text-zinc-400 font-mono border-t border-terminal-border pt-3">
            💡 {current.explanation}
          </p>
        )}
      </div>

      {revealed && lastFeedback && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-terminal-rounded border px-4 py-3 flex items-center gap-3 ${
            lastFeedback.justMastered
              ? "bg-emerald-500/15 border-emerald-500/40"
              : isCorrect
                ? "bg-emerald-500/10 border-emerald-500/25"
                : "bg-amber-500/10 border-amber-500/25"
          }`}
        >
          {lastFeedback.justMastered ? (
            <>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-sm font-mono font-bold text-emerald-300">Mastered!</p>
                <p className="text-xs font-mono text-emerald-500/80">এই প্রশ্নটি এখন আয়ত্ত — চমৎকার!</p>
              </div>
            </>
          ) : isCorrect ? (
            <>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-sm font-mono font-bold text-emerald-300">Improved!</p>
                <p className="text-xs font-mono text-emerald-500/80">সঠিক উত্তর — অগ্রগতি হয়েছে।</p>
              </div>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-amber-400" />
              <div>
                <p className="text-sm font-mono font-bold text-amber-300">Keep Working On It</p>
                <p className="text-xs font-mono text-amber-500/80">ভুল হয়েছে — ব্যাখ্যা পড়ে আবার চেষ্টা করুন।</p>
              </div>
            </>
          )}
        </motion.div>
      )}

      <div className="flex items-center justify-between">
        {!revealed ? (
          <button
            onClick={() => void handleSubmit()}
            disabled={selected === null || submitting}
            className="px-5 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-40"
          >
            {submitting ? "সংরক্ষণ হচ্ছে…" : "জমা দিন"}
          </button>
        ) : (
          <button
            onClick={next}
            className="px-5 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors flex items-center gap-2"
          >
            {isLast ? "শেষ" : "পরবর্তী"} <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {onExit && (
          <button
            onClick={onExit}
            className="px-3 py-2 text-xs text-zinc-500 font-mono hover:text-zinc-300 transition-colors"
          >
            বাতিল
          </button>
        )}
      </div>
    </div>
  );
}
