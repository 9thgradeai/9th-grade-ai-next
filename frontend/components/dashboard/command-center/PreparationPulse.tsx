"use client";

import { useLanguage, t } from "@/lib/lang-ctx";
import { Target, BookOpenCheck, Timer, Flame, TrendingUp, TrendingDown } from "lucide-react";
import type { PreparationIntelligenceDTO } from "@/lib/types";

type PreparationPulseProps = {
  intelligence: PreparationIntelligenceDTO | null;
};

export function formatStudyTime(sec: number): string {
  const totalMin = Math.round(sec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function TrendBadge({ delta, suffix = "" }: { delta: number; suffix?: string }) {
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const color =
    dir === "up"
      ? "var(--dashboard-success)"
      : dir === "down"
        ? "var(--dashboard-danger)"
        : "var(--dashboard-text-muted)";
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold font-mono"
      style={{ color }}
      aria-label={`${delta > 0 ? "+" : ""}${delta}${suffix} vs previous period`}
    >
      {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
      {delta > 0 ? "+" : ""}
      {delta}
      {suffix}
    </span>
  );
}

function PulseItem({
  icon: Icon,
  label,
  value,
  delta,
  suffix,
  hint,
  tint,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  delta: number;
  suffix?: string;
  hint: string;
  tint: string;
}) {
  return (
    <div className="rounded-2xl border p-3.5 sm:p-4 min-w-0" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--dashboard-surface-muted)", color: tint }}>
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: "var(--dashboard-text-muted)" }}>
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span className="font-mono font-bold text-lg sm:text-xl tracking-tight" style={{ color: "var(--dashboard-text-primary)" }}>
          {value}
        </span>
        <TrendBadge delta={delta} suffix={suffix} />
      </div>
      <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--dashboard-text-muted)" }}>
        {hint}
      </p>
    </div>
  );
}

export default function PreparationPulse({ intelligence }: PreparationPulseProps) {
  const { lang } = useLanguage();
  const overall = intelligence?.overall;
  const period = intelligence?.period;
  const hasData = (overall?.totalAttempts ?? 0) > 0;

  if (!hasData || !overall || !period) {
    return (
      <section className="rounded-2xl border p-5 text-center" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
        <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
          {t(lang, "এখনো পর্যাপ্ত ডেটা নেই", "Not enough data yet")}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>
          {t(
            lang,
            "কিছু প্রশ্ন সমাধান করলে এখানে আপনার প্রস্তুতির সারাংশ দেখা যাবে।",
            "Solve some questions and your preparation summary will appear here.",
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label={t(lang, "প্রস্তুতি পালস", "Preparation pulse")}>
      <PulseItem
        icon={Target}
        label={t(lang, "নির্ভুলতা", "Accuracy")}
        value={`${overall.accuracy}%`}
        delta={period.accuracyDelta}
        suffix="%"
        hint={t(lang, "সব সময়ের গড়", "All-time average")}
        tint="var(--dashboard-primary)"
      />
      <PulseItem
        icon={BookOpenCheck}
        label={t(lang, "প্রশ্ন সমাধান", "Questions")}
        value={overall.totalAttempts.toLocaleString()}
        delta={period.attemptsDelta}
        hint={t(lang, "মোট উত্তর দেওয়া হয়েছে", "Total answered")}
        tint="var(--dashboard-info)"
      />
      <PulseItem
        icon={Timer}
        label={t(lang, "অধ্যয়ন সময়", "Study time")}
        value={formatStudyTime(overall.studyTimeSec)}
        delta={period.studyTimeDeltaSec}
        hint={`${formatStudyTime(period.currentStudyTimeSec)} ${t(lang, "গত ৩০ দিনে", "last 30 days")}`}
        tint="var(--dashboard-warning)"
      />
      <PulseItem
        icon={Flame}
        label={t(lang, "স্ট্রিক", "Streak")}
        value={`${overall.streak}`}
        delta={overall.streak > 0 ? 0 : 0}
        hint={t(lang, "টানা অধ্যয়নের দিন", "Consecutive study days")}
        tint="var(--dashboard-danger)"
      />
    </section>
  );
}