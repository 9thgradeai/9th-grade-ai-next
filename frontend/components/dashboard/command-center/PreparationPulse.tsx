"use client";

import { useLanguage, t } from "@/lib/lang-ctx";
import { Target, BookOpen, Timer, Flame, TrendUp, TrendDown } from "@phosphor-icons/react";
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

function TrendBadge({ delta, suffix = "", duration = false }: { delta: number; suffix?: string; duration?: boolean }) {
  const { lang } = useLanguage();
  const display = duration ? `${delta < 0 ? "−" : ""}${formatStudyTime(Math.abs(delta))}` : `${delta}${suffix}`;
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const color =
    dir === "up"
      ? "var(--dashboard-success)"
      : dir === "down"
        ? "var(--dashboard-danger)"
        : "var(--dashboard-text-muted)";
  const Icon = dir === "up" ? TrendUp : dir === "down" ? TrendDown : null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold font-mono"
      style={{ color }}
      aria-label={`${delta > 0 ? "+" : ""}${display} ${t(lang, "আগের সময়ের তুলনায়", "vs previous period")}`}
    >
      {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
      {delta > 0 ? "+" : ""}
      {display}
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
  duration,
  samples = [],
}: {
  icon: typeof Target;
  label: string;
  value: string;
  delta?: number;
  suffix?: string;
  hint: string;
  duration?: boolean;
  samples?: { date: string; value: number }[];
}) {
  const max = Math.max(1, ...samples.map((sample) => sample.value));
  return (
    <div className="preparation-metric min-w-0 rounded-xl border p-4" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
      <div className="flex items-center justify-between gap-2 text-[var(--dashboard-text-secondary)]">
        <span className="text-xs font-medium">{label}</span>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-[var(--dashboard-text-primary)]">
          {value}
        </span>
          {samples.length > 0 && (
            <div role="img" aria-label={`${label}: ${samples.map((sample) => `${sample.date}: ${sample.value}`).join(", ")}`} className="flex h-8 w-24 shrink-0 items-end gap-1">
              {samples.map((sample) => (
                <span
                  key={sample.date}
                  className="flex-1 rounded-t-sm bg-[var(--dashboard-primary)] hover:opacity-80 transition-opacity cursor-default"
                  style={{ height: `${(sample.value / max) * 100}%` }}
                  title={`${sample.date}: ${sample.value}`}
                  aria-label={`${sample.date}: ${sample.value}`}
                />
              ))}
            </div>
          )}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {delta != null && <TrendBadge delta={delta} suffix={suffix} duration={duration} />}
        <p className="text-xs text-[var(--dashboard-text-muted)]">{hint}</p>
      </div>
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
      <section className="rounded-2xl border p-6 text-center" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
        <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
          {t(lang, "এখনো পর্যাপ্ত ডেটা নেই", "Not enough data yet")}
        </p>
        <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: "var(--dashboard-text-muted)" }}>
          {t(
            lang,
            "১০টি প্রশ্ন দিয়ে শুরু করুন — প্রথম ওয়ার্ম-আপেই আপনার পালস তৈরি হবে।",
            "Start with 10 questions — your pulse appears after the first warm-up.",
          )}
        </p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("dashboard:start-practice"))}
          className="command-primary-btn mt-4"
        >
          {t(lang, "১০-প্রশ্ন ওয়ার্ম-আপ শুরু করুন", "Start 10-question warm-up")}
        </button>
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
        suffix=" pp"
        hint={t(lang, "সব সময়ের গড়", "All-time average")}
      />
      <PulseItem
        icon={BookOpen}
        label={t(lang, "প্রশ্ন সমাধান", "Questions")}
        value={overall.totalAttempts.toLocaleString()}
        delta={period.attemptsDelta}
        hint={t(lang, "মোট উত্তর দেওয়া হয়েছে", "Total answered")}
        samples={intelligence.activity.slice(-7).map((day) => ({ date: day.date, value: day.answered }))}
      />
      <PulseItem
        icon={Timer}
        label={t(lang, "অধ্যয়ন সময়", "Study time")}
        value={formatStudyTime(overall.studyTimeSec)}
        delta={period.studyTimeDeltaSec}
        hint={`${formatStudyTime(period.currentStudyTimeSec)} ${t(lang, "গত ৩০ দিনে", "last 30 days")}`}
        duration
      />
      <PulseItem
        icon={Flame}
        label={t(lang, "স্ট্রিক", "Streak")}
        value={`${overall.streak}`}
        hint={t(lang, "টানা অধ্যয়নের দিন", "Consecutive study days")}
      />
    </section>
  );
}