"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Send, ChevronDown, RotateCcw } from "lucide-react";
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
 * Scrollable practice view: every question in the set is rendered at once in a
 * single scrollable column and can be answered independently. The user picks an
 * option for each question, then submits all answers in one go
 * (/api/practice/submit). After submission, correctness feedback and the
 * explanation are revealed inline per question.
 *
 * Unlike the one-at-a-time QuestionDrill, this is optimized for reviewing a
 * large question set by scrolling rather than stepping. It is scoped to the
 * MISTAKES tab practice flow.
 */

export default function ScrollPractice({
  questions,
  onExit,
  title = "প্র্যাকটিস",
  onComplete,
}: {
  questions: QuestionDTO[];
  onExit?: () => void;
  title?: string;
  /** Called with the answered records (incl. mastery feedback) once submitted. */
  onComplete?: (answered: DrillAnswered[]) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, string | undefined>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<
    Record<number, { masteryStatus?: string | null; justMastered?: boolean } | undefined>
  >({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const answeredCount = Object.keys(answers).length;
  const total = questions.length;

  const drillResults = useMemo<DrillAnswered[]>(
    () =>
      questions.map((q) => {
        const selected = answers[q.id];
        return {
          questionId: q.id,
          selected: selected ?? "",
          correct: selected != null && selected.trim() === q.correctAnswer.trim(),
          ...(feedback[q.id] ?? {}),
        };
      }),
    [questions, answers, feedback],
  );

  const enoughAnswered = questions.every((q) => answers[q.id] != null);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = async () => {
    if (submitting || !enoughAnswered) return;
    setSubmitting(true);
    const payload = questions
      .filter((q) => answers[q.id] != null)
      .map((q) => ({ questionId: q.id, selected: answers[q.id] as string }));
    try {
      const res = await api.submitPractice(payload);
      const fb = res.feedback ?? {};
      setFeedback(fb);
    } catch {
      /* Recording failure shouldn't block the user from reviewing the answers. */
    } finally {
      setSubmitting(false);
      setSubmitted(true);
      const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const behavior: ScrollBehavior = prefersReduced ? "instant" as ScrollBehavior : "smooth";
      const dash = typeof document !== "undefined" ? document.getElementById("dashboard-content") : null;
      if (dash) {
        if (typeof dash.scrollTo === "function") { try { dash.scrollTo({ top: 0, behavior }); } catch { dash.scrollTop = 0; } } else dash.scrollTop = 0;
      }
      const lr = listRef.current;
      if (lr) {
        if (typeof lr.scrollTo === "function") { try { lr.scrollTo({ top: 0, behavior }); } catch { lr.scrollTop = 0; } } else lr.scrollTop = 0;
      }
    }
  };

  const reset = () => {
    setAnswers({});
    setSubmitted(false);
    setFeedback({});
    setExpanded({});
    const lr = listRef.current;
    if (lr) {
      if (typeof lr.scrollTo === "function") { try { lr.scrollTo({ top: 0 }); } catch { lr.scrollTop = 0; } } else lr.scrollTop = 0;
    }
  };

  const finish = () => {
    if (submitted) onComplete?.(drillResults);
  };

  if (questions.length === 0) {
    return (
      <div className="glass-card rounded-terminal-rounded border border-terminal-border p-8 text-center">
        <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">কোনো প্রশ্ন নেই</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white font-mono">{title}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">
            {submitted
              ? `${drillResults.filter((a) => a.correct).length}/${total} ঠিক`
              : `${answeredCount}/${total} উত্তর দেওয়া হয়েছে`}
          </span>
          {!submitted && onExit && (
            <button
              type="button"
              onClick={onExit}
              className="text-xs text-[var(--dashboard-text-muted)] font-mono hover:text-[var(--dashboard-text-secondary)] transition-colors"
            >
              বাতিল
            </button>
          )}
        </div>
      </div>

      {!submitted && (
        <div className="flex items-center gap-2 text-xs text-[var(--dashboard-text-muted)] font-mono">
          <span className="px-2 py-1 rounded bg-[var(--dashboard-primary-subtle)] border border-emerald-500/20 text-[var(--dashboard-primary)]">
            {answeredCount === total ? "সব প্রশ্নের উত্তর দেওয়া হয়েছে" : `${total - answeredCount}টি উত্তর বাকি`}
          </span>
          <span>প্রতিটি প্রশ্নের নিচে উত্তর দিয়ে একবারে জমা দিন।</span>
        </div>
      )}

      <div
        ref={listRef}
        className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 scroll-pb-4"
      >
        {questions.map((q, qi) => {
          const selected = answers[q.id];
          const isCorrect = submitted && selected != null && selected.trim() === q.correctAnswer.trim();
          const qFb = feedback[q.id];
          const isOpen = expanded[q.id] !== false;
          return (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(qi * 0.03, 0.4) }}
              className={`glass-card rounded-terminal-rounded border p-4 ${
                submitted
                  ? qFb?.justMastered
                    ? "border-emerald-500/40"
                    : isCorrect
                      ? "border-emerald-500/20"
                      : "border-red-500/30"
                  : "border-terminal-border"
              }`}
            >
              <div className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-2">
                {q.subject} • {q.topic}
                {q.year ? ` • ${q.year}` : ""}
                {q.sourceExam ? ` • ${q.sourceExam}` : ""}
              </div>

              <div className="rounded-xl border p-3 mb-3" style={{ background: "var(--dashboard-surface-raised)", borderColor: "var(--dashboard-border-muted)" }}>
                <h4 className="text-[15px] font-semibold leading-relaxed" style={{ color: "var(--dashboard-text-primary)", lineHeight: "1.6" }}>{q.question}</h4>
              </div>

              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const optLetter = String.fromCharCode(65 + i);
                  const isSelected = selected === opt;
                  const isAnswer = opt.trim() === q.correctAnswer.trim();
                  let style: React.CSSProperties = {};
                  if (submitted) {
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
                      type="button"
                      disabled={submitted}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                      className="w-full text-left px-3.5 py-2.5 rounded-lg border text-sm transition-all flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                      style={style}
                    >
                      <span className="font-bold">{optLetter}.</span>
                      <span className="font-medium">{opt}</span>
                      {submitted && isAnswer && <CheckCircle2 className="w-4 h-4 ml-auto" style={{ color: "var(--dashboard-success)" }} />}
                      {submitted && isSelected && !isAnswer && <XCircle className="w-4 h-4 ml-auto" style={{ color: "var(--dashboard-danger)" }} />}
                    </button>
                  );
                })}
              </div>

              {submitted && (
                <div className="mt-3 flex items-center gap-2 text-xs font-mono flex-wrap">
                  {qFb?.justMastered ? (
                    <span className="px-2 py-0.5 rounded bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] border border-emerald-500/40">
                      এই প্রশ্নটি এখন আয়ত্ত — চমৎকার!
                    </span>
                  ) : isCorrect ? (
                    <span className="px-2 py-0.5 rounded bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] border border-emerald-500/25">
                      সঠিক হয়েছে — অগ্রগতি হয়েছে।
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-[var(--dashboard-warning-subtle)] text-[var(--dashboard-warning)] border border-amber-500/25">
                      ভুল হয়েছে — সঠিক উত্তর সবুজে চিহ্নিত।
                    </span>
                  )}

                  {q.explanation && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(q.id)}
                      className="ml-auto flex items-center gap-1 text-[var(--dashboard-text-muted)] hover:text-white transition-colors"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      ব্যাখ্যা
                    </button>
                  )}
                </div>
              )}

              {submitted && isOpen && q.explanation && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-2 text-sm text-[var(--dashboard-text-muted)] font-mono border-t border-terminal-border pt-3 overflow-hidden"
                >
                  💡 {q.explanation}
                </motion.p>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 sticky bottom-0">
        {!submitted ? (
          <>
            <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">
              {answeredCount === 0 ? "কোনো উত্তর বাছাই হয়নি" : `${answeredCount}/${total} উত্তর বাছাই হয়েছে`}
            </span>
            <button
              onClick={() => void handleSubmit()}
              disabled={!enoughAnswered || submitting}
              className="px-6 py-2.5 bg-emerald-500 text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              <Send className="w-4 h-4" /> {submitting ? "সংরক্ষণ হচ্ছে…" : "সব উত্তর জমা দিন"}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={reset}
              className="px-4 py-2 bg-zinc-900 border border-[var(--dashboard-border-muted)] rounded-lg text-[var(--dashboard-text-secondary)] font-mono text-sm hover:text-white transition-colors flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> আবার
            </button>
            {(onComplete || onExit) && (
              <button
                onClick={finish}
                className="px-5 py-2.5 bg-emerald-500 text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors flex items-center gap-2"
              >
                রেজাল্ট দেখুন
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
