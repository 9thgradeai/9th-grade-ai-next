"use client";

// Interactive MCQ practice + timed exam mode for the daily note.
// Practice: immediate green/red feedback per question (ephemeral).
// Exam: countdown timer, one pass through all questions, then answers are
// submitted to /api/current-affairs/mcq-attempt so the score feeds
// progress/accuracy/streak like every other practice mode.

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle, XCircle, BookOpen, Timer } from "@phosphor-icons/react";
import { useLanguage } from "@/lib/lang-ctx";
import { useToastSafe } from "@/lib/toast-ctx";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";

interface McqQuizWidgetProps {
  mcqs: Server.CurrentAffairsMcqDTO[];
  title: string;
  subtitle: string;
  dailyNoteId: string;
}

const SEC_PER_QUESTION = 60;

function formatClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function McqQuizWidget({ mcqs, title, subtitle, dailyNoteId }: McqQuizWidgetProps) {
  const { lang } = useLanguage();
  const toast = useToastSafe();
  const reduceMotion = useReducedMotion();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState(0);

  // ── Exam mode state ──
  const [examMode, setExamMode] = useState(false);
  const [examStartedAt, setExamStartedAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(mcqs.length * SEC_PER_QUESTION);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ correct: number; total: number; score: number; pointsEarned: number } | null>(null);
  const durations = useRef<Record<string, number>>({});

  const answered = Object.keys(answers).length;
  const correct = mcqs.filter((m) => answers[m.id] === m.correctOption).length;
  const active = mcqs[Math.min(current, mcqs.length - 1)];

  const choose = (mcqId: string, optionIndex: number) => {
    if (examMode) {
      // Exam: free choice until submit (no instant reveal), track time.
      setAnswers((prev) => {
        if (prev[mcqId] === undefined) {
          durations.current[mcqId] = 0;
        }
        return { ...prev, [mcqId]: optionIndex };
      });
      return;
    }
    setAnswers((prev) => (prev[mcqId] !== undefined ? prev : { ...prev, [mcqId]: optionIndex }));
  };

  const reset = () => {
    setAnswers({});
    setCurrent(0);
    setExamMode(false);
    setExamStartedAt(null);
    setResult(null);
    durations.current = {};
  };

  const startExam = () => {
    setAnswers({});
    setCurrent(0);
    setResult(null);
    durations.current = {};
    setRemaining(mcqs.length * SEC_PER_QUESTION);
    setExamStartedAt(Date.now());
    setExamMode(true);
  };

  const finishExam = async () => {
    if (submitting || result) return;
    const payload = mcqs
      .filter((m) => answers[m.id] !== undefined)
      .map((m) => ({ mcqId: m.id, selectedOption: answers[m.id], durationSec: durations.current[m.id] ?? 0 }));
    if (payload.length === 0) {
      toast.error("Answer at least one question before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const { summary } = await api.submitCurrentAffairsMcq(dailyNoteId, payload);
      setResult(summary);
      toast.success(`Exam submitted — ${summary.correct}/${summary.total} correct (+${summary.pointsEarned} pts)`);
    } catch {
      toast.error("Could not submit your exam — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!examMode || examStartedAt === null || result) return;
    const total = mcqs.length * SEC_PER_QUESTION;
    const id = setInterval(() => {
      const left = total - Math.floor((Date.now() - (examStartedAt as number)) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) void finishExam();
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examMode, examStartedAt, result, mcqs.length]);

  if (mcqs.length === 0) return null;

  return (
    <section
      className="rounded-2xl border"
      style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-solid)" }}
      aria-label={title}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--dashboard-border-muted)" }}>
        <span className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" style={{ color: "var(--dashboard-primary)" }} aria-hidden="true" />
          <span className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>{title}</span>
        </span>
        <span className="text-[11px] font-semibold" style={{ color: "var(--dashboard-text-muted)" }}>
          {examMode ? (
            <span className="inline-flex items-center gap-1 font-mono" style={{ color: remaining < 60 ? "var(--dashboard-danger)" : "var(--dashboard-text-primary)" }}>
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              {formatClock(remaining)}
            </span>
          ) : (
            <>{subtitle} · {answered}/{mcqs.length}{answered > 0 && !examMode && ` · ${correct} correct`}</>
          )}
        </span>
      </header>

      {/* Mode toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2" style={{ borderColor: "var(--dashboard-border-muted)" }}>
        {!examMode ? (
          <button
            type="button"
            onClick={startExam}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--dashboard-primary)" }}
          >
            <Timer className="h-4 w-4" aria-hidden="true" />
            Start Timed Exam ({formatClock(mcqs.length * SEC_PER_QUESTION)})
          </button>
        ) : result ? (
          <p className="text-xs font-bold" style={{ color: "var(--dashboard-primary)" }}>
            {result.correct}/{result.total} correct — {result.score}% · +{result.pointsEarned} pts saved to your progress
          </p>
        ) : (
          <>
            <span className="text-[11px] font-semibold" style={{ color: "var(--dashboard-text-muted)" }}>
              Exam in progress · {answered}/{mcqs.length} answered
            </span>
            <button
              type="button"
              onClick={() => void finishExam()}
              disabled={submitting || answered === 0}
              className="ml-auto inline-flex min-h-[36px] items-center rounded-xl px-3 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--dashboard-primary)" }}
            >
              {submitting ? "Submitting…" : "Submit Exam"}
            </button>
          </>
        )}
      </div>

      {answered === mcqs.length && (
        <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-primary-subtle)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--dashboard-primary)" }}>
            {correct}/{mcqs.length} correct — {Math.round((correct / mcqs.length) * 100)}%
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors hover:bg-white/5"
            style={{ color: "var(--dashboard-primary)" }}
          >
            Retry
          </button>
        </div>
      )}

      {active && (
        <motion.div
          key={active.id}
          initial={reduceMotion ? undefined : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          className="px-4 py-4"
        >
          <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--dashboard-primary)" }}>
            Q{current + 1} of {mcqs.length} · {active.relevantExam}
          </p>
          <h3 className="mb-3 text-[15px] font-semibold leading-snug" style={{ color: "var(--dashboard-text-primary)" }}>
            {active.question}
          </h3>

          <div className="grid gap-2">
            {active.options.map((option, i) => {
              const selected = answers[active.id];
              // Exam mode hides correctness until the exam is submitted.
              const revealed = examMode ? result !== null : selected !== undefined;
              const isCorrect = i === active.correctOption;
              const isPicked = i === selected;

              let style: React.CSSProperties = {
                borderColor: "var(--dashboard-border-muted)",
                background: "var(--dashboard-surface-muted)",
                color: "var(--dashboard-text-primary)",
              };
              if (revealed && isCorrect) {
                style = { borderColor: "var(--dashboard-success)", background: "var(--dashboard-success-subtle)", color: "var(--dashboard-text-primary)" };
              } else if (revealed && isPicked) {
                style = { borderColor: "var(--dashboard-danger)", background: "var(--dashboard-danger-subtle)", color: "var(--dashboard-text-primary)" };
              } else if (!revealed && isPicked) {
                style = { borderColor: "var(--dashboard-primary)", background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-text-primary)" };
              }

              return (
                <button
                  key={i}
                  type="button"
                  disabled={(!examMode && revealed) || (examMode && result !== null)}
                  onClick={() => choose(active.id, i)}
                  className="flex min-h-[44px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] disabled:cursor-default"
                  style={style}
                  aria-label={`Option ${String.fromCharCode(65 + i)}: ${option}`}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold"
                    style={{ background: "var(--dashboard-surface)", color: "var(--dashboard-text-muted)" }}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-0 flex-1">{option}</span>
                  {revealed && isCorrect && <CheckCircle className="h-4 w-4 shrink-0" style={{ color: "var(--dashboard-success)" }} aria-hidden="true" />}
                  {revealed && isPicked && !isCorrect && <XCircle className="h-4 w-4 shrink-0" style={{ color: "var(--dashboard-danger)" }} aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {(examMode ? result !== null : answers[active.id] !== undefined) && (
            <div
              className="mt-3 rounded-xl border p-3"
              style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
            >
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--dashboard-text-primary)" }}>
                {lang === "bn" && active.explanationBn ? active.explanationBn : active.explanation}
              </p>
              {lang === "bn" && active.explanationBn && active.explanation && (
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
                  {active.explanation}
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex justify-between">
            <button
              type="button"
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
              className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40"
              style={{ color: "var(--dashboard-primary)" }}
            >
              ← Previous
            </button>
            {current < mcqs.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrent((c) => Math.min(mcqs.length - 1, c + 1))}
                className="rounded-lg px-3 py-1.5 text-xs font-bold"
                style={{ color: "var(--dashboard-primary)" }}
              >
                Next →
              </button>
            ) : null}
          </div>
        </motion.div>
      )}
    </section>
  );
}
