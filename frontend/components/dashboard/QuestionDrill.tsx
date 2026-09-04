"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, ArrowRight, RotateCcw, TrendingUp, Timer } from "lucide-react";
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

const QUESTION_TIME_LIMIT = 30;

function DrillTimer({
  remaining,
  onExpire,
}: {
  remaining: number;
  onExpire: () => void;
}) {
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);
  const [secs, setSecs] = useState(remaining);
  useEffect(() => {
    if (secs <= 0) { onExpireRef.current(); return; }
    const id = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) { onExpireRef.current(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [secs <= 0]);
  const timeLow = secs > 0 && secs <= 10;
  return (
    <span className={`font-mono text-xs ${timeLow ? "text-[var(--dashboard-danger)] animate-pulse" : "text-[var(--dashboard-text-muted)]"}`}>
      <Timer className="w-3 h-3 inline mr-1" />
      {Math.floor(secs / 60)}:{(secs % 60).toString().padStart(2, "0")}
    </span>
  );
}

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
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState<DrillAnswered[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<{ masteryStatus?: string | null; justMastered?: boolean } | null>(null);
  const [timerKey, setTimerKey] = useState(0);

  const reportedRef = useRef(false);

  const correctCount = answered.filter((a) => a.correct).length;
  const done = index >= questions.length - 1 && revealed;
  const current = questions[index];
  const isLast = index >= questions.length - 1;
  const isCorrect = selected !== null && selected.trim() === current.correctAnswer.trim();

  useEffect(() => {
    if (done && !reportedRef.current) {
      reportedRef.current = true;
      onComplete?.(answered);
    }
  }, [done, answered, onComplete]);

  const resetDrill = () => {
    setIndex(0);
    setSelected(null);
    setLocked(false);
    setRevealed(false);
    setAnswered([]);
    setLastFeedback(null);
    setTimerKey((k) => k + 1);
    reportedRef.current = false;
  };

  // When moving to next question or showing the final result, keep the top visible
  useEffect(() => {
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = prefersReduced ? "instant" as ScrollBehavior : "smooth";
    const dash = typeof document !== "undefined" ? document.getElementById("dashboard-content") : null;
    if (dash) {
      if (typeof dash.scrollTo === "function") { try { dash.scrollTo({ top: 0, behavior }); } catch { dash.scrollTop = 0; } } else dash.scrollTop = 0;
    }
  }, [index, done]);

  const handleAutoSubmit = useCallback(async () => {
    if (revealed || submitting) return;
    setSubmitting(true);
    let fb: { masteryStatus?: string | null; justMastered?: boolean } = {};
    try {
      const res = await api.submitPractice([{ questionId: current.id, selected: selected ?? "" }]);
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
        { questionId: current.id, selected: selected ?? "", correct: selected !== null && selected.trim() === current.correctAnswer.trim(), ...fb },
      ]);
    }
  }, [revealed, submitting, current.id, current.correctAnswer, selected]);

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
    setLocked(false);
    setRevealed(false);
    setLastFeedback(null);
    setTimerKey((k) => k + 1);
  };

  if (questions.length === 0) {
    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-8 text-center">
        <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">কোনো প্রশ্ন নেই</p>
      </div>
    );
  }

  if (done) {
    const score = Math.round((correctCount / questions.length) * 100);
    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-8 text-center space-y-4">
        <h3 className="text-lg font-bold text-[var(--text-primary)] font-mono">{title} — শেষ</h3>
        <div className={`text-3xl font-bold font-mono ${score >= 60 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-warning)]"}`}>
          {score}%
        </div>
        <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">
          {correctCount}/{questions.length} ঠিক
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={resetDrill}
            className="px-4 py-2 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-[var(--dashboard-text-secondary)] font-mono text-sm hover:text-[var(--text-primary)] transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> আবার
          </button>
          {onExit && (
            <button
              onClick={onExit}
              className="px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
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
        <h3 className="text-sm font-medium text-[var(--text-primary)] font-mono">{title}</h3>
        <div className="flex items-center gap-3">
          {!revealed && (
            <DrillTimer
              key={`timer-${timerKey}`}
              remaining={QUESTION_TIME_LIMIT}
              onExpire={() => { void handleAutoSubmit(); }}
            />
          )}
          <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">
            {index + 1} / {questions.length}
          </span>
        </div>
      </div>

      <div className="h-1.5 bg-[var(--surface-overlay)] rounded-full overflow-hidden">
        <motion.div
          initial={false}
          animate={{ scaleX: (index + (revealed ? 1 : 0)) / questions.length }}
          style={{ transformOrigin: "left" }}
          className="h-full w-full bg-gradient-to-r from-[var(--success)] to-[var(--success)] rounded-full"
        />
      </div>

      <div className="rounded-xl border p-5" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}>
        <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--dashboard-text-muted)" }}>
          {current.subject} • {current.topic}
          {current.year ? ` • ${current.year}` : ""}
          {current.sourceExam ? ` • ${current.sourceExam}` : ""}
        </div>
        <div className="rounded-xl border p-4 mb-4" style={{ background: "var(--dashboard-surface-raised)", borderColor: "var(--dashboard-border-muted)" }}>
          <h4 className="text-lg font-semibold leading-relaxed" style={{ color: "var(--dashboard-text-primary)", lineHeight: "1.6" }}>{current.question}</h4>
        </div>

        <div className="space-y-2">
          {current.options.map((opt, i) => {
            const optLetter = String.fromCharCode(65 + i);
            const isSelected = selected === opt;
            const isAnswer = opt.trim() === current.correctAnswer.trim();
            const disabled = revealed || locked;
            let style: React.CSSProperties = {};
            if (revealed) {
              if (isAnswer) style = { borderColor: "var(--dashboard-success)", background: "var(--dashboard-success-subtle)", color: "var(--dashboard-success)" };
              else if (isSelected) style = { borderColor: "var(--dashboard-danger)", background: "var(--dashboard-danger-subtle)", color: "var(--dashboard-danger)" };
              else style = { borderColor: "var(--dashboard-border-strong)", background: "var(--dashboard-surface)", color: "var(--dashboard-text-muted)" };
            } else if (isSelected) {
              style = { borderColor: "var(--dashboard-primary)", background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)" };
            } else {
              style = { borderColor: "var(--dashboard-border-strong)", background: "var(--dashboard-surface)", color: "var(--dashboard-text-primary)" };
            }
            return (
              <button
                key={optLetter}
                disabled={disabled}
                onClick={() => { if (!locked) { setSelected(opt); setLocked(true); } }}
                className="w-full text-left px-4 py-3 rounded-lg border text-sm transition-all flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                style={style}
              >
                <span className="font-bold">{optLetter}.</span>
                <span className="font-medium">{opt}</span>
                {revealed && isAnswer && <CheckCircle2 className="w-4 h-4 ml-auto" style={{ color: "var(--dashboard-success)" }} />}
                {revealed && isSelected && !isAnswer && <XCircle className="w-4 h-4 ml-auto" style={{ color: "var(--dashboard-danger)" }} />}
              </button>
            );
          })}
        </div>

        {revealed && current.explanation && (
          <p className="mt-4 text-sm text-[var(--dashboard-text-muted)] font-mono border-t border-terminal-border pt-3">
            💡 {current.explanation}
          </p>
        )}
      </div>

      {revealed && lastFeedback && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${
            lastFeedback.justMastered
              ? "bg-[var(--dashboard-primary-subtle)] border-[var(--primary)]/40"
              : isCorrect
                ? "bg-[var(--dashboard-primary-subtle)] border-[var(--primary)]/25"
                : "bg-[var(--dashboard-warning-subtle)] border-amber-500/25"
          }`}
        >
          {lastFeedback.justMastered ? (
            <>
              <TrendingUp className="w-5 h-5 text-[var(--dashboard-primary)]" />
              <div>
                <p className="text-sm font-mono font-bold text-[var(--dashboard-primary)]">Mastered!</p>
                <p className="text-xs font-mono text-[var(--accent)]/80">এই প্রশ্নটি এখন আয়ত্ত — চমৎকার!</p>
              </div>
            </>
          ) : isCorrect ? (
            <>
              <TrendingUp className="w-5 h-5 text-[var(--dashboard-primary)]" />
              <div>
                <p className="text-sm font-mono font-bold text-[var(--dashboard-primary)]">Improved!</p>
                <p className="text-xs font-mono text-[var(--accent)]/80">সঠিক উত্তর — অগ্রগতি হয়েছে।</p>
              </div>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-[var(--dashboard-warning)]" />
              <div>
                <p className="text-sm font-mono font-bold text-[var(--dashboard-warning)]">Keep Working On It</p>
                <p className="text-xs font-mono text-[var(--warning)]/80">ভুল হয়েছে — ব্যাখ্যা পড়ে আবার চেষ্টা করুন।</p>
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
            className="px-5 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
          >
            {submitting ? "সংরক্ষণ হচ্ছে…" : "জমা দিন"}
          </button>
        ) : (
          <button
            onClick={next}
            className="px-5 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-2"
          >
            {isLast ? "শেষ" : "পরবর্তী"} <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {onExit && (
          <button
            onClick={onExit}
            className="px-3 py-2 text-xs text-[var(--dashboard-text-muted)] font-mono hover:text-[var(--dashboard-text-secondary)] transition-colors"
          >
            বাতিল
          </button>
        )}
      </div>
    </div>
  );
}
