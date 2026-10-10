"use client";

import { useState } from "react";
import { evaluateAnswer } from "@/lib/services/ai/evaluator";
import type { EvaluationResultDto } from "@/lib/services/ai/types";
import { launchAI } from "@/lib/ai-launcher";
import { useToastSafe } from "@/lib/toast-ctx";
import AiTaskPanel from "./ai/AiTaskPanel";
import Button from "@/components/ui/Button";

const VERDICT_LABEL: Record<EvaluationResultDto["verdict"], { bn: string; color: string }> = {
  correct: { bn: "সঠিক", color: "text-[var(--dashboard-primary)]" },
  partial: { bn: "আংশিক সঠিক", color: "text-[var(--dashboard-warning)]" },
  incorrect: { bn: "ভুল", color: "text-[var(--dashboard-danger)]" },
};

const TEXTAREA =
  "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--dashboard-text-primary)] outline-none focus:border-[var(--primary)]/50";

export default function AnswerEvaluatorTab() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluationResultDto | null>(null);
  const toast = useToastSafe();

  const copyModelAnswer = async () => {
    if (!result?.modelAnswer) return;
    try {
      await navigator.clipboard?.writeText(result.modelAnswer);
      toast.success("মডেল উত্তর কপি হয়েছে");
    } catch {
      toast.error("কপি করা যায়নি — আবার চেষ্টা করো");
    }
  };

  const run = async () => {
    setError(null);
    if (!question.trim() || !answer.trim()) {
      setError("প্রশ্ন এবং তোমার উত্তর দুটোই লিখো।");
      return;
    }
    setLoading(true);
    try {
      const res = await evaluateAnswer({ question, learnerAnswer: answer });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "মূল্যায়ন করা যায়না। আবার চেষ্টা করো।");
    } finally {
      setLoading(false);
    }
  };

  const tutorAgain = () =>
    launchAI({
      mode: "tutor",
      prompt: `প্রশ্ন: ${question}\nআমার উত্তর: ${answer}\nঘাটতি: ${result?.gaps.join("; ")}\nএই ঘাটতিগুলো ধাপে ধাপে শিখিয়ে দাও।`,
    });

  return (
    <AiTaskPanel
      title="উত্তর মূল্যায়ন"
      description="তোমার লেখা উত্তর দাও — AI বুঝবে কতটা সঠিক, কোথায় ঘাটতি আছে এবং কীভাবে ভালো করবে।"
      submitLabel="মূল্যায়ন করো"
      loadingLabel="মূল্যায়ন হচ্ছে…"
      loading={loading}
      error={error}
      onSubmit={() => void run()}
      fields={
        <div>
          <label className="text-sm text-[var(--dashboard-text-secondary)]">
            প্রশ্ন
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              className={TEXTAREA}
              placeholder="যে প্রশ্নটির উত্তর দিয়েছো, সেটি এখানে লিখো…"
            />
          </label>
          <label className="text-sm text-[var(--dashboard-text-secondary)]">
            তোমার উত্তর
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              className={TEXTAREA}
              placeholder="তোমার নিজের লেখা উত্তর এখানে দাও…"
            />
          </label>
        </div>
      }
      result={
        result && (
          <>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 flex-col items-center justify-center rounded-2xl bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] ring-1 ring-[var(--primary)]/20">
                <span className="text-2xl font-bold">{result.score}</span>
                <span className="text-[10px] uppercase tracking-wide">/ 100</span>
              </div>
              <div>
                <div className={`text-lg font-semibold ${VERDICT_LABEL[result.verdict].color}`}>
                  {VERDICT_LABEL[result.verdict].bn}
                </div>
              </div>
            </div>

            {result.strengths.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-[var(--dashboard-text-primary)]">শক্তি</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--dashboard-text-secondary)]">
                  {result.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.gaps.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-[var(--dashboard-text-primary)]">ঘাটতি</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--dashboard-text-secondary)]">
                  {result.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.modelAnswer && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-[var(--dashboard-text-primary)]">মডেল উত্তর</h3>
                <p className="whitespace-pre-wrap text-sm text-[var(--dashboard-text-secondary)]">{result.modelAnswer}</p>
              </div>
            )}
            {result.improvementTips.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-[var(--dashboard-text-primary)]">উন্নতির টিপস</h3>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-[var(--dashboard-text-secondary)]">
                  {result.improvementTips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.improvementTips.length === 0 && result.gaps.length === 0 && (
              <p className="text-sm text-[var(--dashboard-text-muted)]">
                আর কোনো পরামর্শ নেই — দারুণ উত্তর!
              </p>
            )}
          </>
        )
      }
      resultActions={
        result && (
          <>
            <Button variant="secondary" size="sm" onClick={() => void copyModelAnswer()}>
              মডেল উত্তর কপি করো
            </Button>
            <Button variant="secondary" size="sm" onClick={tutorAgain}>
              টিউটরের কাছে আবার শেখো
            </Button>
          </>
        )
      }
      sourceProvider={result?.source ?? null}
      sourceModel={result?.model ?? null}
    />
  );
}