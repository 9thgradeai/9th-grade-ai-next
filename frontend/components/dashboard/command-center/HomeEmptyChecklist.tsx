"use client";

import { useLanguage, t } from "@/lib/lang-ctx";
import { Target, LightningA, CalendarCheck, CaretRight } from "@phosphor-icons/react";
import type { PrepIntelligenceRecommendation } from "@/lib/types";

type HomeEmptyChecklistProps = {
  onAction: (rec: PrepIntelligenceRecommendation) => void;
  onOpenPlanner: () => void;
};

const STEPS: Array<{
  icon: typeof Target;
  titleBn: string;
  titleEn: string;
  descBn: string;
  descEn: string;
}> = [
  {
    icon: Target,
    titleBn: "১. ১০টি প্রশ্নের ডায়াগনস্টিক দিন",
    titleEn: "1. Take the 10-question diagnostic",
    descBn: "আপনার লেভেল মেপে প্রথম মিশন তৈরি হবে",
    descEn: "We'll measure your level and build your first mission",
  },
  {
    icon: LightningA,
    titleBn: "২. প্রথম ওয়ার্ম-আপ শেষ করুন",
    titleEn: "2. Finish your first warm-up",
    descBn: "ছোট সেট দিয়ে স্ট্রিক শুরু করুন",
    descEn: "Start your streak with a quick set",
  },
  {
    icon: CalendarCheck,
    titleBn: "৩. আজকের পরিকল্পনা দেখুন",
    titleEn: "3. See today's plan",
    descBn: "AI প্ল্যানার থেকে কাজ বেছে নিন",
    descEn: "Pick tasks from the AI planner",
  },
];

/**
 * Single onboarding checklist for users with no recommendations yet.
 * Replaces the stacked bespoke empties — one path forward, three steps.
 * Steps 1–2 dispatch through the standard rec pipeline (funnel intact);
 * step 3 opens the planner directly.
 */
export default function HomeEmptyChecklist({ onAction, onOpenPlanner }: HomeEmptyChecklistProps) {
  const { lang } = useLanguage();
  const handlers = [
    () => onAction({ id: "diagnostic", priority: "high", target: "practice" }),
    () => onAction({ id: "daily-warmup", priority: "medium", target: "practice" }),
    onOpenPlanner,
  ];

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
      aria-labelledby="home-empty-checklist-title"
    >
      <h3 id="home-empty-checklist-title" className="command-eyebrow flex items-center gap-1.5">
        <Target className="w-3.5 h-3.5" />
        {t(lang, "শুরু করুন — ৩টি ধাপ", "Get started — 3 steps")}
      </h3>
      <ol className="mt-3 space-y-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={i}>
              <button
                onClick={handlers[i]}
                className="w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-[var(--dashboard-primary)]/40"
                style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
              >
                <span
                  className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 border"
                  style={{ background: "var(--dashboard-surface)", color: "var(--dashboard-primary)", borderColor: "var(--dashboard-border-muted)" }}
                  aria-hidden="true"
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                    {t(lang, step.titleBn, step.titleEn)}
                  </span>
                  <span className="block text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--dashboard-text-muted)" }}>
                    {t(lang, step.descBn, step.descEn)}
                  </span>
                </span>
                <CaretRight className="w-4 h-4 shrink-0" style={{ color: "var(--dashboard-text-muted)" }} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
