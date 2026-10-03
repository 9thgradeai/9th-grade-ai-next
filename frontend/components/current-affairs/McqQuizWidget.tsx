"use client";

// Interactive MCQ practice for the daily note.
// Immediate green/red feedback on selection; the full
// explanation (Bangla or English per UI language)
// appears once an option is chosen.

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle, XCircle, BookOpen } from "@phosphor-icons/react";
import { useLanguage } from "@/lib/lang-ctx";
import type { Server } from "@/lib/types";

interface McqQuizWidgetProps {
  mcqs: Server.CurrentAffairsMcqDTO[];
  title: string;
  subtitle: string;
}

export default function McqQuizWidget({ mcqs, title, subtitle }: McqQuizWidgetProps) {
  const { lang } = useLanguage();
  const reduceMotion = useReducedMotion();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState(0);

  const answered = Object.keys(answers).length;
  const correct = mcqs.filter((m) => answers[m.id] === m.correctOption).length;
  const active = mcqs[Math.min(current, mcqs.length - 1)];

  const choose = (mcqId: string, optionIndex: number) => {
    setAnswers((prev) => (prev[mcqId] !== undefined ? prev : { ...prev, [mcqId]: optionIndex }));
  };

  const reset = () => {
    setAnswers({});
    setCurrent(0);
  };

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
          {subtitle} · {answered}/{mcqs.length}
          {answered > 0 && ` · ${correct} correct`}
        </span>
      </header>

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
              const revealed = selected !== undefined;
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
              }

              return (
                <button
                  key={i}
                  type="button"
                  disabled={revealed}
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

          {answers[active.id] !== undefined && (
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
