"use client";

import { useState } from "react";
import { generateMockTest } from "@/lib/services/ai/mockTest";
import { api } from "@/lib/services/api";
import AISourceFooter from "./ai/AISourceFooter";
import AIExplanationButton from "./AIExplanationButton";
import RichText from "@/components/ui/RichText";
import type { GeneratedMockTest, GeneratedMockQuestion } from "@/lib/services/ai/types";

type Difficulty = "EASY" | "MEDIUM" | "HARD";

export default function AIMockTestTab() {
  const [subject, setSubject] = useState("");
  const [count, setCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [topics, setTopics] = useState<string[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [test, setTest] = useState<GeneratedMockTest | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

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
        topics: topics.length > 0 ? topics : undefined,
      });
      setTest(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "মক টেস্ট তৈরি করা যায়নি। আবার চেষ্টা করো।");
    } finally {
      setLoading(false);
    }
  };

  /** Weakness-built mock: focus generation on the learner's weakest topics. */
  const loadWeakTopics = async () => {
    setError(null);
    setTopicsLoading(true);
    try {
      const weak = await api.weakTopics();
      const labels = weak.slice(0, 3).map((w) => `${w.subject} → ${w.topic}`);
      if (labels.length === 0) {
        setError("দুর্বল টপিক পাওয়া যায়নি — আগে কিছু প্রশ্ন সমাধান করো।");
        return;
      }
      setTopics(labels);
      if (!subject.trim() && weak[0]) setSubject(weak[0].subject);
    } catch {
      setError("দুর্বল টপিক লোড করা যায়নি। আবার চেষ্টা করো।");
    } finally {
      setTopicsLoading(false);
    }
  };

  const score = test
    ? test.questions.filter((q) => answers[q.id] === q.answer).length
    : 0;

  const percentage = test ? Math.round((score / test.questions.length) * 100) : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">AI মক টেস্ট</h1>
        <p className="text-sm text-text-muted">
          AI তোমার বিষয় অনুযায়ী মাল্টিপল চয়েস প্রশ্ন তৈরি করবে। উত্তর দাও আর নিজের প্রস্তুতি যাচাই করো।
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          বিষয়
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="যেমন: ইতিহাস"
            className="w-48 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          প্রশ্ন সংখ্যা
          <input
            type="number"
            min={1}
            max={25}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(25, Number(e.target.value) || 10)))}
            className="w-32 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          কঠিনতা
          <select
            value={difficulty}
            onChange={(e) => {
              const v = e.target.value;
              setDifficulty(v === "EASY" || v === "MEDIUM" || v === "HARD" ? v : "");
            }}
            className="w-40 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50"
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
          className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "তৈরি হচ্ছে…" : "টেস্ট তৈরি করো"}
        </button>
        <button
          type="button"
          onClick={() => void loadWeakTopics()}
          disabled={loading || topicsLoading}
          className="rounded-xl border border-border px-5 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {topicsLoading ? "খুঁজছি…" : "দুর্বল টপিক থেকে বানাও"}
        </button>
      </div>

      {topics.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {topics.map((tp) => (
            <span key={tp} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
              {tp}
              <button
                type="button"
                onClick={() => setTopics((prev) => prev.filter((x) => x !== tp))}
                aria-label={`${tp} সরাও`}
                className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface-raised"
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setTopics([])}
            className="text-xs text-text-muted underline underline-offset-2 hover:text-text-secondary"
          >
            সব মুছো
          </button>
        </div>
      )}

      {error && <p className="text-sm text-dashboard-danger">{error}</p>}

      {test && test.questions.length > 0 && (
        <>
          <div className="rounded-2xl border border-border bg-surface px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-text-primary">{test.title}</h2>
              <AISourceFooter provider={test.source} model={test.model} />
            </div>
            {submitted && (
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold text-primary">
                  {score}/{test.questions.length}
                </div>
                <div className="text-xs text-text-muted">
                  {percentage}%
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {test.questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                index={i + 1}
                q={q}
                selected={answers[q.id]}
                onSelect={(optId) => setAnswers((a) => ({ ...a, [q.id]: optId }))}
                showAnswer={submitted || showResults}
                showResults={showResults}
              />
            ))}

            {!submitted && !showResults && (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setSubmitted(true)}
                  className="flex-1 rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover"
                >
                  জমা দাও (স্কোর দেখো)
                </button>
                <button
                  type="button"
                  onClick={() => setShowResults(true)}
                  className="flex-1 rounded-xl border border-border px-6 py-2.5 text-sm text-text-primary transition-colors hover:border-primary/50"
                >
                  সমাধান দেখুন
                </button>
              </div>
            )}

            {submitted ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setAnswers({});
                    setShowResults(false);
                  }}
                  className="flex-1 rounded-xl border border-border px-6 py-2.5 text-sm text-text-primary transition-colors hover:border-primary/50"
                >
                  আবার চেষ্টা করো
                </button>
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={loading}
                  className="flex-1 rounded-xl border border-border px-6 py-2.5 text-sm text-text-primary transition-colors hover:border-primary/50 disabled:opacity-60"
                >
                  {loading ? "তৈরি হচ্ছে…" : "একই নিয়মে পুনরায় তৈরি"}
                </button>
              </div>
            ) : showResults && (
              <button
                type="button"
                onClick={() => setShowResults(false)}
                className="w-full rounded-xl border border-border px-6 py-2.5 text-sm text-text-primary transition-colors hover:border-primary/50"
              >
                সমাধান লুকাও
              </button>
            )}
          </div>
        </>
      )}

      {test && test.questions.length === 0 && !loading && (
        <p className="text-sm text-text-muted">কোনো প্রশ্ন তৈরি হয়নি। আবার চেষ্টা করো。</p>
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
  showResults,
}: {
  index: number;
  q: GeneratedMockQuestion;
  selected?: string;
  onSelect: (optId: string) => void;
  showAnswer: boolean;
  showResults?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-start gap-2">
        <span className="mt-0.5 font-mono text-xs text-text-muted">{index}.</span>
        <div>
          <p className="text-sm text-text-primary"><RichText text={q.question} /></p>
          {q.topic && <span className="text-[10px] text-text-muted">{q.topic}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-3 pl-8">
        {q.options.map((opt) => {
          const isSelected = selected === opt.id;
          const isCorrect = opt.id === q.answer;
          const isShowing = showAnswer || (showResults ?? false);
          const cls = isShowing
            ? isCorrect
              ? "border-primary/60 bg-primary-subtle text-primary"
              : isSelected
                ? "border-danger/60 bg-danger-subtle text-danger"
                : "border-border text-text-secondary"
            : isSelected
              ? "border-primary/50 bg-primary-subtle text-text-primary"
              : "border-border text-text-secondary hover:border-primary/30";

          return (
            <button
              key={opt.id}
              type="button"
              disabled={isShowing}
              onClick={() => onSelect(opt.id)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${cls}`}
            >
              <span className="font-mono text-xs text-text-muted">{opt.id}.</span>
              <span><RichText text={opt.text} /></span>
            </button>
          );
        })}

        {showAnswer && q.explanation && (
          <>
            <p className="mt-3 rounded-lg bg-surface-muted px-4 py-2 text-xs text-text-secondary">
              <RichText text={q.explanation} />
            </p>
            <AIExplanationButton
              question={q.question}
              options={q.options.map((o) => o.text)}
              correctAnswer={q.options.find((o) => o.id === q.answer)?.text ?? q.answer}
              topic={q.topic}
            />
          </>
        )}
      </div>
    </div>
  );
}