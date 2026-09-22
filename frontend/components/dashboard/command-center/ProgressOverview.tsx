"use client";

import { useMemo } from "react";
import { Star, Trophy, ClipboardText, Brain, GridFour, TrendUp, TrendDown } from "@phosphor-icons/react";
import { useLanguage, t } from "@/lib/lang-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import type { PreparationIntelligenceDTO, MasteryStatus } from "@/lib/types";

type ProgressOverviewProps = {
  intelligence: PreparationIntelligenceDTO | null;
};

const MASTERY_ORDER: MasteryStatus[] = ["NEW", "STRUGGLING", "REVIEWING", "IMPROVING", "MASTERED"];
const MASTERY_COLOR: Record<MasteryStatus, string> = {
  NEW: "var(--dashboard-text-muted)",
  STRUGGLING: "var(--dashboard-danger)",
  REVIEWING: "var(--dashboard-warning)",
  IMPROVING: "var(--dashboard-info)",
  MASTERED: "var(--dashboard-success)",
};
const MASTERY_LABEL: Record<MasteryStatus, [string, string]> = {
  NEW: ["নতুন", "New"],
  STRUGGLING: ["সংগ্রামী", "Struggling"],
  REVIEWING: ["পর্যালোচনায়", "Reviewing"],
  IMPROVING: ["উন্নতিশীল", "Improving"],
  MASTERED: ["নিখুঁত", "Mastered"],
};

function TrendDelta({ delta, suffix = "" }: { delta: number; suffix?: string }) {
  if (delta === 0) return null;
  const up = delta > 0;
  const Icon = up ? TrendUp : TrendDown;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-bold font-mono"
      style={{ color: up ? "var(--dashboard-success)" : "var(--dashboard-danger)" }}
      aria-label={`${up ? "+" : ""}${delta}${suffix} vs previous 30 days`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {up ? "+" : ""}
      {delta}
      {suffix}
    </span>
  );
}

export default function ProgressOverview({ intelligence }: ProgressOverviewProps) {
  const { lang } = useLanguage();
  const setActiveTab = useDashboardStore((s) => s.setActiveTab);
  const overall = intelligence?.overall;
  const period = intelligence?.period;
  const distribute = useMemo(() => intelligence?.masteryDistribution ?? [], [intelligence]);
  const hasData = (overall?.totalAttempts ?? 0) > 0;

  const masteryTotal = useMemo(
    () => distribute.reduce((s, d) => s + d.count, 0),
    [distribute],
  );

  // Deduped from Home Pulse (Accuracy/Questions/Study time/Streak live on Home).
  // Progress tab shows the *distinct* extended metrics only.
  const kpis = useMemo(() => {
    return [
      { icon: Star, label: t(lang, "পয়েন্ট", "Points"), value: (overall?.points ?? 0).toLocaleString(), tint: "var(--dashboard-warning)" },
      { icon: Trophy, label: t(lang, "র‍্যাংক", "Rank"), value: (overall?.rank ?? 0) > 0 ? `#${overall?.rank}` : "—", tint: "var(--dashboard-primary)" },
      { icon: ClipboardText, label: t(lang, "মক টেস্ট", "Mock tests"), value: `${overall?.examsAttempted ?? 0}`, tint: "var(--dashboard-primary)" },
      { icon: GridFour, label: t(lang, "ফ্ল্যাশকার্ড", "Flashcards"), value: `${overall?.flashcardsReviewed ?? 0}`, tint: "var(--dashboard-success)" },
      { icon: Brain, label: t(lang, "AI প্রশ্ন", "AI questions"), value: `${overall?.aiQuestionsAsked ?? 0}`, tint: "var(--dashboard-info)" },
    ];
  }, [overall, lang]);

  if (!hasData || !overall || !period) {
    return (
      <section
        className="rounded-2xl border p-8 text-center"
        style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
      >
        <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
          {t(lang, "এখনো পর্যাপ্ত ডেটা নেই", "Not enough data yet")}
        </p>
        <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: "var(--dashboard-text-muted)" }}>
          {t(
            lang,
            "প্রশ্ন সমাধান শুরু করলে এখানে আপনার পূর্ণাঙ্গ অগ্রগতি ও বিষয়ভিত্তিক বিশ্লেষণ দেখা যাবে।",
            "Start practicing and your full progress analytics will appear here.",
          )}
        </p>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("dashboard:start-practice"))} className="command-primary-btn mt-4">
          {t(lang, "প্র্যাকটিস শুরু করুন", "Start practicing")}
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* Extended KPI grid — distinct from Home pulse */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3" aria-label={t(lang, "সম্প্রসারিত সারাংশ", "Extended progress overview")}>
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border p-4 flex flex-col justify-between transition-colors hover:border-[var(--dashboard-border-strong)]"
            style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "var(--dashboard-surface-muted)", color: kpi.tint }}
              >
                <kpi.icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: "var(--dashboard-text-muted)" }}>
                {kpi.label}
              </span>
            </div>
            <div className="mt-3">
              <span className="font-mono font-bold text-xl tracking-tight" style={{ color: "var(--dashboard-text-primary)" }}>
                {kpi.value}
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* Mastery distribution strip */}
      {masteryTotal > 0 && (
        <section
          className="rounded-2xl border p-5"
          style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
          aria-label={t(lang, "নিপুণতা বণ্টন", "Mastery distribution")}
        >
          <div className="flex items-center justify-between">
            <p className="command-eyebrow">{t(lang, "নিপুণতার স্তর", "Mastery distribution")}</p>
            <span className="text-[11px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
              {masteryTotal} {t(lang, "প্রশ্ন", "questions")}
            </span>
          </div>
          <div className="mt-3 flex h-2.5 rounded-full overflow-hidden" style={{ background: "var(--dashboard-surface-muted)" }} role="img" aria-label={t(lang, "নিপুণতার স্তর অনুযায়ী প্রশ্ন বণ্টন", "Question distribution across mastery levels")}>
            {distribute.map((d) =>
              d.count > 0 ? (
                <div
                  key={d.status}
                  style={{ width: `${(d.count / masteryTotal) * 100}%`, background: MASTERY_COLOR[d.status] }}
                  title={`${(MASTERY_LABEL[d.status][lang === "bn" ? 0 : 1])}: ${d.count}`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {MASTERY_ORDER.map((status) => {
              const d = distribute.find((x) => x.status === status);
              const count = d?.count ?? 0;
              const disabled = count === 0;
              return (
                <button
                  key={status}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    setActiveTab("question-bank");
                  }}
                  className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:border-[var(--dashboard-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                  style={{ color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
                  title={disabled ? t(lang, "এই স্তরে কোনো প্রশ্ন নেই", "No questions at this level") : t(lang, "ফিল্টার করে প্রশ্নব্যাংকে দেখুন", "Filter in question bank")}
                  aria-label={`${MASTERY_LABEL[status][lang === "bn" ? 0 : 1]} · ${count}`}
                >
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: MASTERY_COLOR[status] }} aria-hidden="true" />
                  {MASTERY_LABEL[status][lang === "bn" ? 0 : 1]} · {count}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}