"use client";

import { useState } from "react";
import { getCareerAdvice } from "@/lib/services/ai/advisor";
import { launchAI } from "@/lib/ai-launcher";
import AISourceFooter from "./ai/AISourceFooter";
import type { AdvisorPlanDto } from "@/lib/services/ai/types";

export default function AdvisorTab() {
  const [education, setEducation] = useState("");
  const [interests, setInterests] = useState("");
  const [targetExam, setTargetExam] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<AdvisorPlanDto | null>(null);

  const run = async () => {
    setError(null);
    // Validate weekly hours client-side: empty = unspecified, otherwise it
    // must be a finite number in range (never send NaN to the API).
    const trimmed = weeklyHours.trim();
    let hours: number | undefined;
    if (trimmed) {
      hours = Number(trimmed);
      if (!Number.isFinite(hours) || hours < 1 || hours > 80) {
        setError("সপ্তাহে পড়ার সময় ১–৮০ ঘণ্টার মধ্যে দিন।");
        return;
      }
    }
    setLoading(true);
    try {
      const res = await getCareerAdvice({
        education: education.trim() || undefined,
        interests: interests.trim() || undefined,
        targetExam: targetExam.trim() || undefined,
        weeklyHours: hours,
      });
      setPlan(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "পরামর্শ তৈরি করা যায়নি। আবার চেষ্টা করো।");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--dashboard-text-primary)]">ক্যারিয়ার ও পরীক্ষা উপদেশক</h1>
        <p className="mt-1 text-sm text-[var(--dashboard-text-muted)]">
          তোমার ব্যাকগ্রাউন্ড দাও — AI তোমার উপযুক্ত পরীক্ষা এবং ব্যক্তিগতকৃত প্রস্তুতির পরিকল্পনা দেবে।
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--dashboard-surface)] p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-[var(--dashboard-text-secondary)]">
          শিক্ষাগত যোগ্যতা
          <input
            value={education}
            onChange={(e) => setEducation(e.target.value)}
            placeholder="যেমন: স্নাতক (বিবিএ)"
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--dashboard-text-primary)] outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--dashboard-text-secondary)]">
          পছন্দের বিষয়
          <input
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="যেমন: বিজ্ঞান, বাংলা"
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--dashboard-text-primary)] outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--dashboard-text-secondary)]">
          লক্ষ্য (ঐচ্ছিক)
          <input
            value={targetExam}
            onChange={(e) => setTargetExam(e.target.value)}
            placeholder="যেমন: BCS"
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--dashboard-text-primary)] outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--dashboard-text-secondary)]">
          সপ্তাহে পড়ার সময় (ঘণ্টা)
          <input
            type="number"
            min={1}
            max={80}
            value={weeklyHours}
            onChange={(e) => setWeeklyHours(e.target.value)}
            placeholder="যেমন: 10"
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--dashboard-text-primary)] outline-none focus:border-[var(--primary)]/50"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void run()}
        disabled={loading}
        className="self-start rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-medium text-[var(--dashboard-text-inverse)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
      >
        {loading ? "তৈরি হচ্ছে…" : "পরিকল্পনা নাও"}
      </button>

      {error && <p className="text-sm text-[var(--dashboard-danger)]">{error}</p>}

      {plan && (
        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--dashboard-surface)] p-5">
          <p className="text-sm text-[var(--dashboard-text-primary)]">{plan.summary}</p>
          {plan.recommendedExam && (
            <div className="text-sm">
              <span className="text-[var(--dashboard-text-muted)]">প্রস্তাবিত লক্ষ্য: </span>
              <span className="font-semibold text-[var(--dashboard-primary)]">{plan.recommendedExam}</span>
            </div>
          )}
          {plan.focusAreas.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-[var(--dashboard-text-primary)]">গুরুত্বপূর্ণ বিষয়</h3>
              <div className="flex flex-wrap gap-2">
                {plan.focusAreas.map((f, i) => (
                  <span key={i} className="rounded-full border border-[var(--border-subtle)] bg-[var(--dashboard-surface-muted)] px-3 py-1 text-xs text-[var(--dashboard-text-secondary)]">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
          {plan.weeklyPlan.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[var(--dashboard-text-primary)]">
                সাপ্তাহিক পরিকল্পনা ({plan.timelineWeeks} সপ্তাহ)
              </h3>
              <div className="flex flex-col gap-2">
                {plan.weeklyPlan.map((w, i) => (
                  <div key={i} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
                    <div className="text-sm font-medium text-[var(--dashboard-primary)]">সপ্তাহ {w.week}: {w.focus}</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[var(--dashboard-text-secondary)]">
                      {w.tasks.map((t, j) => (
                        <li key={j}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
          {plan.tips.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-[var(--dashboard-text-primary)]">টিপস</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-[var(--dashboard-text-secondary)]">
                {plan.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const text = [
                  plan.summary,
                  `লক্ষ্য: ${plan.recommendedExam}`,
                  `ফোকাস: ${plan.focusAreas.join(", ")}`,
                  ...plan.weeklyPlan.flatMap((w) => [`সপ্তাহ ${w.week}: ${w.focus}`, ...w.tasks.map((t) => `- ${t}`)]),
                  `টিপস: ${plan.tips.join("; ")}`,
                ].join("\n");
                void navigator.clipboard?.writeText(text).catch(() => {});
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors hover:border-[var(--dashboard-primary)]/40"
              style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" }}
            >
              পরিকল্পনা কপি করো
            </button>
            <button
              type="button"
              onClick={() =>
                launchAI({
                  mode: "tutor",
                  prompt: `আমার প্রস্তাবিত পরীক্ষা: ${plan.recommendedExam}। ফোকাস এলাকা: ${plan.focusAreas.join(", ")}। প্রথম সপ্তাহ থেকে ধাপে ধাপে পড়াও।`,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors hover:border-[var(--dashboard-primary)]/40"
              style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" }}
            >
              টিউটরের সাথে শুরু করো
            </button>
          </div>
          <AISourceFooter provider={plan.source} model={plan.model} />
        </div>
      )}
    </div>
  );
}
