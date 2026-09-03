"use client";

import { useState } from "react";
import { evaluateAnswer } from "@/lib/services/ai/evaluator";
import type { EvaluationResultDto } from "@/lib/services/ai/types";

const VERDICT_LABEL: Record<EvaluationResultDto["verdict"], { bn: string; color: string }> = {
  correct: { bn: "সঠিক", color: "text-[var(--dashboard-primary)]" },
  partial: { bn: "আংশিক সঠিক", color: "text-[var(--dashboard-warning)]" },
  incorrect: { bn: "ভুল", color: "text-[var(--dashboard-danger)]" },
};

export default function AnswerEvaluatorTab() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluationResultDto | null>(null);

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
      setError(e instanceof Error ? e.message : "মূল্যায়ন করা যায়নি। আবার চেষ্টা করো।");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--dashboard-text-primary)]">উত্তর মূল্যায়ন</h1>
        <p className="mt-1 text-sm text-[var(--dashboard-text-muted)]">
          তোমার লেখা উত্তর দাও — AI বুঝবে কতটা সঠিক, কোথায় ঘাটতি আছে এবং কীভাবে ভালো করবে।
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm text-[var(--dashboard-text-secondary)]">
          প্রশ্ন
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--dashboard-text-primary)] outline-none focus:border-emerald-500/50"
            placeholder="যে প্রশ্নটির উত্তর দিয়েছো, সেটি এখানে লিখো…"
          />
        </label>

        <label className="text-sm text-[var(--dashboard-text-secondary)]">
          তোমার উত্তর
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--dashboard-text-primary)] outline-none focus:border-emerald-500/50"
            placeholder="তোমার নিজের লেখা উত্তর এখানে দাও…"
          />
        </label>

        {error && <p className="text-sm text-[var(--dashboard-danger)]">{error}</p>}

        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="self-start rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-medium text-[var(--dashboard-text-inverse)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {loading ? "মূল্যায়ন হচ্ছে…" : "মূল্যায়ন করো"}
        </button>
      </div>

      {result && (
        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[var(--dashboard-surface)] p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 flex-col items-center justify-center rounded-2xl bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] ring-1 ring-emerald-500/20">
              <span className="text-2xl font-bold">{result.score}</span>
              <span className="text-[10px] uppercase tracking-wide">/ 100</span>
            </div>
            <div>
              <div className={`text-lg font-semibold ${VERDICT_LABEL[result.verdict].color}`}>
                {VERDICT_LABEL[result.verdict].bn}
              </div>
              <p className="text-sm text-[var(--dashboard-text-muted)]">সূত্র: {result.source}</p>
            </div>
          </div>

          {result.strengths.length > 0 && (
            <Section title="শক্তি" items={result.strengths} />
          )}
          {result.gaps.length > 0 && <Section title="ঘাটতি" items={result.gaps} />}
          {result.modelAnswer && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-[var(--dashboard-text-primary)]">মডেল উত্তর</h3>
              <p className="whitespace-pre-wrap text-sm text-[var(--dashboard-text-secondary)]">{result.modelAnswer}</p>
            </div>
          )}
          {result.improvementTips.length > 0 && (
            <Section title="উন্নতির টিপস" items={result.improvementTips} />
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-[var(--dashboard-text-primary)]">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--dashboard-text-secondary)]">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
