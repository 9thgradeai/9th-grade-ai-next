"use client";

import { useMemo } from "react";
import { Star, Trophy, Flame, BookOpenCheck, Target, ClipboardList, BrainCircuit, Layers, Timer, TrendingUp, TrendingDown } from "lucide-react";
import { useLanguage, t } from "@/lib/lang-ctx";
import type { PreparationIntelligenceDTO, MasteryStatus } from "@/lib/types";
import { formatStudyTime } from "./PreparationPulse";

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
  const Icon = up ? TrendingUp : TrendingDown;
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
  const overall = intelligence?.overall;
  const period = intelligence?.period;
  const distribute = useMemo(() => intelligence?.masteryDistribution ?? [], [intelligence]);
  const hasData = (overall?.totalAttempts ?? 0) > 0;

  const masteryTotal = useMemo(
    () => distribute.reduce((s, d) => s + d.count, 0),
    [distribute],
  );

  const kpis = useMemo(() => {
    return [
      { icon: Target, label: t(lang, "নির্ভুলতা", "Accuracy"), value: `${overall?.accuracy ?? 0}%`, tint: "var(--dashboard-info)", delta: period?.accuracyDelta, suffix: "%" },
      { icon: BookOpenCheck, label: t(lang, "প্রশ্ন", "Questions"), value: (overall?.questionsAttempted ?? 0).toLocaleString(), tint: "var(--dashboard-primary)", delta: period?.attemptsDelta },
      { icon: Timer, label: t(lang, "অধ্যয়ন সময়", "Study time"), value: formatStudyTime(overall?.studyTimeSec ?? 0), tint: "var(--dashboard-warning)" },
      { icon: Flame, label: t(lang, "স্ট্রিক", "Streak"), value: `${overall?.streak ?? 0}`, tint: "var(--dashboard-danger)" },
      { icon: Star, label: t(lang, "পয়েন্ট", "Points"), value: (overall?.points ?? 0).toLocaleString(), tint: "var(--dashboard-warning)" },
      { icon: Trophy, label: t(lang, "র‍্যাংক", "Rank"), value: (overall?.rank ?? 0) > 0 ? `#${overall?.rank}` : "—", tint: "var(--dashboard-primary)" },
      { icon: ClipboardList, label: t(lang, "মক টেস্ট", "Mock tests"), value: `${overall?.examsAttempted ?? 0}`, tint: "var(--dashboard-primary)" },
      { icon: Layers, label: t(lang, "ফ্ল্যাশকার্ড", "Flashcards"), value: `${overall?.flashcardsReviewed ?? 0}`, tint: "var(--dashboard-success)" },
      { icon: BrainCircuit, label: t(lang, "AI প্রশ্ন", "AI questions"), value: `${overall?.aiQuestionsAsked ?? 0}`, tint: "var(--dashboard-info)" },
    ];
  }, [overall, period, lang]);

  if (!hasData || !overall || !period) {
    return (
      <section
        className="rounded-2xl border p-8 text-center"
        style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
      >
        <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
          {t(lang, "এখনো পর্যাপ্ত ডেটা নেই", "Not enough data yet")}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>
          {t(
            lang,
            "প্রশ্ন সমাধান শুরু করলে এখানে আপনার পূর্ণাঙ্গ অগ্রগতি ও বিষয়ভিত্তিক বিশ্লেষণ দেখা যাবে।",
            "Start practicing and your full progress analytics will appear here.",
          )}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI grid */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3" aria-label={t(lang, "সারসংক্ষেপ", "Progress overview")}>
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border p-4 flex flex-col justify-between"
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
            <div className="mt-2 flex items-end justify-between gap-1 flex-wrap">
              <span className="font-mono font-bold text-lg tracking-tight" style={{ color: "var(--dashboard-text-primary)" }}>
                {kpi.value}
              </span>
              {kpi.delta !== undefined && <TrendDelta delta={kpi.delta} suffix={kpi.suffix} />}
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
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {MASTERY_ORDER.map((status) => {
              const d = distribute.find((x) => x.status === status);
              return (
                <span key={status} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: MASTERY_COLOR[status] }} aria-hidden="true" />
                  {MASTERY_LABEL[status][lang === "bn" ? 0 : 1]} · {d?.count ?? 0}
                </span>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}