"use client";

import { useState } from "react";
import { generateMockTest } from "@/lib/services/ai/mockTest";
import type { GeneratedMockTest, GeneratedMockQuestion } from "@/lib/services/ai/types";

type Difficulty = "EASY" | "MEDIUM" | "HARD";

export default function AIMockTestTab() {
  const [subject, setSubject] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [test, setTest] = useState<GeneratedMockTest | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setError(null);
    setLoading(true);
    setSubmitted(false);
    setAnswers({});
    try {
      const res = await generateMockTest({
        subject: subject.trim() || undefined,
        count,
        difficulty: difficulty || undefined,
      });
      setTest(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "মক টেস্ট তৈরি করা যায়নি। আবার চেষ্টা করো।");
    } finally {
      setLoading(false);
    }
  };

  const score = test
    ? test.questions.filter((q) => answers[q.id] === q.answer).length
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--dashboard-text-primary)]">AI মক টেস্ট</h1>
        <p className="mt-1 text-sm text-[var(--dashboard-text-muted)]">
          AI তোমার বিষয় অনুযায়ী মাল্টিপল চয়েস প্রশ্ন তৈরি করবে। উত্তর দাও আর নিজের প্রস্তুতি যাচাই করো।
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-[var(--dashboard-surface)] p-4">
        <label className="flex flex-col gap-1 text-sm text-[var(--dashboard-text-secondary)]">
          বিষয়
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="যেমন: ইতিহাস"
            className="w-40 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-[var(--dashboard-text-primary)] outline-none focus:border-emerald-500/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--dashboard-text-secondary)]">
          প্রশ্ন সংখ্যা
          <input
            type="number"
            min={1}
            max={25}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(25, Number(e.target.value) || 10)))}
            className="w-24 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-[var(--dashboard-text-primary)] outline-none focus:border-emerald-500/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--dashboard-text-secondary)]">
          কঠিনতা
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty | "")}
            className="w-32 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-[var(--dashboard-text-primary)] outline-none focus:border-emerald-500/50"
          >
            <option value="">যেকোনো</option>
            <option value="EASY">সহজ</option>
            <option value="MEDIUM">মাঝারি</option>
            <option value="HARD">কঠিন</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading}
          className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-medium text-[var(--dashboard-text-inverse)] transition-colors hover:bg-emerald-400 disabled:opacity-60"
        >
          {loading ? "তৈরি হচ্ছে…" : "টেস্ট তৈরি করো"}
        </button>
      </div>

      {error && <p className="text-sm text-[var(--dashboard-danger)]">{error}</p>}

      {test && test.questions.length > 0 && (
        <>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[var(--dashboard-surface)] px-4 py-3">
            <div>
              <h2 className="font-semibold text-[var(--dashboard-text-primary)]">{test.title}</h2>
              <p className="text-xs text-[var(--dashboard-text-muted)]">সূত্র: {test.source}</p>
            </div>
            {submitted && (
              <div className="text-right">
                <div className="text-2xl font-bold text-[var(--dashboard-primary)]">
                  {score}/{test.questions.length}
                </div>
                <div className="text-xs text-[var(--dashboard-text-muted)]">
                  {Math.round((score / test.questions.length) * 100)}%
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {test.questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                index={i + 1}
                q={q}
                selected={answers[q.id]}
                onSelect={(optId) => setAnswers((a) => ({ ...a, [q.id]: optId }))}
                showAnswer={submitted}
              />
            ))}
          </div>

          {!submitted ? (
            <button
              type="button"
              onClick={() => setSubmitted(true)}
              className="self-start rounded-xl bg-emerald-500 px-5 py-2 text-sm font-medium text-[var(--dashboard-text-inverse)] hover:bg-emerald-400"
            >
              দাখিল করো
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setAnswers({});
              }}
              className="self-start rounded-xl border border-white/10 px-5 py-2 text-sm text-[var(--dashboard-text-primary)] hover:border-emerald-500/50"
            >
              আবার চেষ্টা করো
            </button>
          )}
        </>
      )}

      {test && test.questions.length === 0 && !loading && (
        <p className="text-sm text-[var(--dashboard-text-muted)]">কোনো প্রশ্ন তৈরি হয়নি। আবার চেষ্টা করো।</p>
      )}
    </div>
  );
}

function QuestionCard({
  index,
  q,
  selected,
  onSelect,
  showAnswer,
}: {
  index: number;
  q: GeneratedMockQuestion;
  selected?: string;
  onSelect: (optId: string) => void;
  showAnswer: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--dashboard-surface)] p-4">
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 font-mono text-xs text-[var(--dashboard-text-muted)]">{index}.</span>
        <div>
          <p className="text-sm text-[var(--dashboard-text-primary)]">{q.question}</p>
          {q.topic && <span className="text-[11px] text-[var(--dashboard-text-muted)]">{q.topic}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-2 pl-6">
        {q.options.map((opt) => {
          const isSelected = selected === opt.id;
          const isCorrect = opt.id === q.answer;
          const cls = showAnswer
            ? isCorrect
              ? "border-emerald-500/60 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
              : isSelected
                ? "border-red-500/60 bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]"
                : "border-white/10 text-[var(--dashboard-text-secondary)]"
            : isSelected
              ? "border-emerald-500/50 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-text-primary)]"
              : "border-white/10 text-[var(--dashboard-text-secondary)] hover:border-emerald-500/30";
          return (
            <button
              key={opt.id}
              type="button"
              disabled={showAnswer}
              onClick={() => onSelect(opt.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${cls}`}
            >
              <span className="font-mono text-xs text-[var(--dashboard-text-muted)]">{opt.id}.</span>
              <span>{opt.text}</span>
            </button>
          );
        })}
      </div>
      {showAnswer && q.explanation && (
        <p className="mt-3 rounded-lg bg-[var(--dashboard-surface-muted)] px-3 py-2 text-xs text-[var(--dashboard-text-secondary)]">
          {q.explanation}
        </p>
      )}
    </div>
  );
}
