"use client";

import { useLanguage, t, type Language } from "@/lib/lang-ctx";
import { Play, CalendarClock, ClipboardList } from "lucide-react";
import type { PreparationIntelligenceDTO } from "@/lib/types";

type ContinueLearningProps = {
  intelligence: PreparationIntelligenceDTO | null;
  onResumeExam: () => void;
  onStartDailyQuiz: () => void;
};

function timeAgo(iso: string, lang: Language): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60_000));
  if (mins < 60) return t(lang, `${mins} মিনিট আগে`, `${mins} min ago`);
  const hours = Math.round(mins / 60);
  if (hours < 24) return t(lang, `${hours} ঘণ্টা আগে`, `${hours} hours ago`);
  const days = Math.round(hours / 24);
  return t(lang, `${days} দিন আগে`, `${days} days ago`);
}

export default function ContinueLearning({ intelligence, onResumeExam, onStartDailyQuiz }: ContinueLearningProps) {
  const { lang } = useLanguage();
  const unfinished = intelligence?.unfinishedActivities ?? [];

  // A pending daily quiz is also a "continue" opportunity.
  const dailyQuizPending = intelligence?.dailyQuizAvailable ?? false;

  if (unfinished.length === 0 && !dailyQuizPending) return null;

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
      aria-labelledby="continue-learning-title"
    >
      <div className="flex items-center justify-between">
        <h3
          id="continue-learning-title"
          className="command-eyebrow flex items-center gap-1.5"
        >
          <CalendarClock className="w-3.5 h-3.5" />
          {t(lang, "চালিয়ে যান", "Continue learning")}
        </h3>
        {unfinished.length + (dailyQuizPending ? 1 : 0) > 1 && (
          <span
            className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border"
            style={{ background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)" }}
          >
            {unfinished.length + (dailyQuizPending ? 1 : 0)}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {unfinished.map((a) => (
          <button
            key={`${a.type}-${a.id}`}
            onClick={onResumeExam}
            className="w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-[var(--dashboard-primary)]/40"
            style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
          >
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
              style={{ background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)", borderColor: "color-mix(in srgb, var(--dashboard-primary) 20%, transparent)" }}
            >
              <ClipboardList className="w-4 h-4" aria-hidden="true" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                {t(lang, "অসমাপ্ত মক টেস্ট", "Unfinished mock test")}
              </span>
              <span className="block text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
                {timeAgo(a.startedAt, lang)}
              </span>
            </span>
            <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--dashboard-primary)" }}>
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              {t(lang, "রিজিউম", "Resume")}
            </span>
          </button>
        ))}

        {dailyQuizPending && (
          <button
            onClick={onStartDailyQuiz}
            className="w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-[var(--dashboard-primary)]/40"
            style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
          >
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
              style={{ background: "var(--dashboard-warning-subtle)", color: "var(--dashboard-warning)", borderColor: "color-mix(in srgb, var(--dashboard-warning) 20%, transparent)" }}
            >
              <CalendarClock className="w-4 h-4" aria-hidden="true" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                {t(lang, "আজকের দৈনিক কুইজ", "Today's daily quiz")}
              </span>
              <span className="block text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
                {t(lang, "৫টি প্রশ্ন · দ্রুত ওয়ার্ম-আপ", "5 questions · quick warm-up")}
              </span>
            </span>
            <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--dashboard-warning)" }}>
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              {t(lang, "চালিয়ে যান", "Continue")}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}