"use client";

import { Gauge, Info } from "@phosphor-icons/react";
import { useLanguage, t, type Language } from "@/lib/lang-ctx";
import type { PreparationIntelligenceDTO } from "@/lib/types";

type ReadinessIndicatorCardProps = {
  intelligence: PreparationIntelligenceDTO | null;
};

/**
 * Honest, deterministic exam-readiness estimate built exclusively from real
 * server data. Never invented — when inputs are missing we show an empty state.
 */
function computeReadiness(intel: PreparationIntelligenceDTO | null): { value: number; basedOn: string } | null {
  if (!intel) return null;
  const accuracy = intel.overall.accuracy;
  const exams = intel.recentResults;
  const examAvg =
    exams.length > 0
      ? Math.round(exams.reduce((s, r) => s + r.score, 0) / exams.length)
      : null;
  const hasAttempts = intel.overall.totalAttempts > 0;
  if (!hasAttempts) return null;

  const weights = examAvg != null ? 0.6 * examAvg : 0;
  const base = 0.4 * accuracy;
  let value = Math.round(weights + base);
  const basedOn =
    examAvg != null
      ? `0.6 × মক গড় ${examAvg}% + 0.4 × নির্ভুলতা ${accuracy}%`
      : `মক টেস্ট ছাড়া · নির্ভুলতা ${accuracy}% ভিত্তিক`;
  value = Math.max(0, Math.min(100, value));
  return { value, basedOn };
}

export type DriverStatus = "good" | "warn" | "bad" | "na";

export type ReadinessDriver = {
  id: "accuracy" | "mock" | "coverage" | "consistency" | "trend";
  labelBn: string;
  labelEn: string;
  detailBn: string;
  detailEn: string;
  status: DriverStatus;
  /** Rank for "biggest lever" selection — higher = more room to improve. */
  leverage: number;
};

/**
 * What moves the number: five deterministic drivers computed from the same
 * intelligence payload (no new fetching). Coverage counts topics touched vs
 * topics with confident (≥3) attempts; consistency counts active days in the
 * activity window; trend reads the period accuracy delta. Exported pure for tests.
 */
export function computeDrivers(intel: PreparationIntelligenceDTO | null): ReadinessDriver[] {
  if (!intel || intel.overall.totalAttempts === 0) return [];
  const accuracy = intel.overall.accuracy;
  const exams = intel.recentResults;
  const examAvg =
    exams.length > 0
      ? Math.round(exams.reduce((s, r) => s + r.score, 0) / exams.length)
      : null;

  const touched = new Set<string>();
  let confident = 0;
  for (const s of intel.subjectPerformance) {
    for (const tp of s.topics) {
      const attempted = tp.attempted ?? 0;
      if (attempted <= 0) continue;
      touched.add(`${s.subject}→${tp.topic}`);
      if (attempted >= 3) confident += 1;
    }
  }

  const windowDays = Math.max(1, intel.activity.length);
  const activeDays = intel.activity.filter((d) => d.answered > 0).length;

  const hasPrev = intel.period.previousAttempts > 0;
  const delta = intel.period.accuracyDelta;

  const statusOf = (pct: number | null, goodAt: number, warnAt: number): DriverStatus =>
    pct == null ? "na" : pct >= goodAt ? "good" : pct >= warnAt ? "warn" : "bad";

  const coveragePct = touched.size === 0 ? null : Math.round((confident / touched.size) * 100);
  const consistencyPct = Math.round((activeDays / windowDays) * 100);

  return [
    {
      id: "accuracy",
      labelBn: "নির্ভুলতা",
      labelEn: "Accuracy",
      detailBn: `${accuracy}%`,
      detailEn: `${accuracy}%`,
      status: statusOf(accuracy, 70, 45),
      leverage: 100 - accuracy,
    },
    {
      id: "mock",
      labelBn: "মক গড়",
      labelEn: "Mock average",
      detailBn: examAvg != null ? `${examAvg}% · ${exams.length}টি` : "এখনো মক নেই",
      detailEn: examAvg != null ? `${examAvg}% · ${exams.length}` : "No mocks yet",
      status: statusOf(examAvg, 70, 45),
      leverage: examAvg == null ? 75 : 100 - examAvg,
    },
    {
      id: "coverage",
      labelBn: "টপিক কভারেজ",
      labelEn: "Topic coverage",
      detailBn: touched.size === 0 ? "—" : `${confident}/${touched.size} টপিকে ৩+ প্রচেষ্টা`,
      detailEn: touched.size === 0 ? "—" : `${confident}/${touched.size} topics at 3+ attempts`,
      status: statusOf(coveragePct, 60, 30),
      leverage: coveragePct == null ? 60 : 100 - coveragePct,
    },
    {
      id: "consistency",
      labelBn: "ধারাবাহিকতা",
      labelEn: "Consistency",
      detailBn: `${activeDays}/${windowDays} দিন সক্রিয়`,
      detailEn: `${activeDays}/${windowDays} active days`,
      status: statusOf(consistencyPct, 70, 40),
      leverage: 100 - consistencyPct,
    },
    {
      id: "trend",
      labelBn: "গতির ধারা",
      labelEn: "Trend",
      detailBn: !hasPrev ? "তুলনার ডেটা নেই" : `${delta >= 0 ? "+" : ""}${delta}%`,
      detailEn: !hasPrev ? "No comparison data" : `${delta >= 0 ? "+" : ""}${delta}%`,
      status: !hasPrev ? "na" : delta > 0 ? "good" : delta === 0 ? "warn" : "bad",
      leverage: !hasPrev ? 0 : delta >= 0 ? 0 : 50 - delta,
    },
  ];
}

/** The weakest actionable driver — "what improves most if I do it". */
export function biggestLever(drivers: ReadinessDriver[]): ReadinessDriver | null {
  const actionable = drivers.filter((d) => d.status === "warn" || d.status === "bad");
  if (actionable.length === 0) return null;
  return actionable.reduce((a, b) => (b.leverage > a.leverage ? b : a));
}

function toneFor(value: number): string {
  if (value >= 80) return "var(--dashboard-success)";
  if (value >= 55) return "var(--dashboard-warning)";
  return "var(--dashboard-danger)";
}

function stageFor(value: number, lang: Language): string {
  if (value >= 80) return t(lang, "পরীক্ষার জন্য প্রস্তুত", "Ready for the exam");
  if (value >= 65) return t(lang, "প্রায় প্রস্তুত", "Almost ready");
  if (value >= 45) return t(lang, "শক্তিশালী হচ্ছে", "Building up");
  if (value >= 20) return t(lang, "ভিত্তি শক্ত করুন", "Strengthen foundations");
  return t(lang, "সবে শুরু", "Just getting started");
}

export default function ReadinessIndicatorCard({ intelligence }: ReadinessIndicatorCardProps) {
  const { lang } = useLanguage();
  const readiness = computeReadiness(intelligence);
  const exams = intelligence?.recentResults ?? [];
  const drivers = computeDrivers(intelligence);
  const lever = biggestLever(drivers);
  const statusColor: Record<DriverStatus, string> = {
    good: "var(--dashboard-success)",
    warn: "var(--dashboard-warning)",
    bad: "var(--dashboard-danger)",
    na: "var(--dashboard-text-muted)",
  };

  return (
    <section
      className="command-card p-5 flex flex-col h-full"
      style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
      aria-labelledby="readiness-title"
    >
      <h3 id="readiness-title" className="command-eyebrow flex items-center gap-1.5">
        <Gauge className="w-3.5 h-3.5" style={{ color: "var(--dashboard-primary)" }} />
        {t(lang, "পরীক্ষার প্রস্তুতি সূচক", "Exam readiness")}
      </h3>

      {readiness === null ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <span className="text-3xl" aria-hidden="true">🎯</span>
          <p className="mt-3 text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
            {t(lang, "প্রস্তুতি সূচক গণনা করা যায়নি", "Readiness can't be computed yet")}
          </p>
          <p className="text-xs mt-1 max-w-xs" style={{ color: "var(--dashboard-text-muted)" }}>
            {t(
              lang,
              "কিছু প্রশ্ন সমাধান করুন — সূচকটি বাস্তব নির্ভুলতা ও মক টেস্ট স্কোর থেকে তৈরি হয়।",
              "Solve some questions first — the indicator is built from real accuracy and mock-test scores.",
            )}
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center py-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="font-display font-black text-5xl tracking-tight" style={{ color: toneFor(readiness.value) }}>
                {readiness.value}
              </span>
              <span className="ml-1 text-lg font-bold" style={{ color: "var(--dashboard-text-muted)" }}>/100</span>
            </div>
            <div
              className="text-right text-xs font-bold rounded-lg px-3 py-1.5 border"
              style={{ color: toneFor(readiness.value), borderColor: "color-mix(in srgb, currentColor 25%, transparent)", background: "var(--dashboard-surface-muted)" }}
            >
              {stageFor(readiness.value, lang)}
            </div>
          </div>

          <div className="mt-4 h-3 rounded-full overflow-hidden" style={{ background: "var(--dashboard-surface-muted)" }} role="img" aria-label={`${readiness.value} / 100`}>
            <div className="h-full rounded-full" style={{ width: `${readiness.value}%`, background: toneFor(readiness.value) }} />
          </div>

          <p className="mt-3 text-[11px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
            {readiness.basedOn} {exams.length > 0 ? `· ${exams.length}টি মক টেস্ট` : ""}
          </p>
          <p className="mt-2 inline-flex items-start gap-1.5 text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
            <Info className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
            {t(
              lang,
              "এটি একটি নিয়মতান্ত্রিক অনুমান — অফিসিয়াল ফলের পূর্বাভাস নয়।",
              "A deterministic estimate — not a prediction of the official result.",
            )}
          </p>

          {drivers.length > 0 && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--dashboard-border-muted)" }}>
              <p className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: "var(--dashboard-text-muted)" }}>
                {t(lang, "কী কী নম্বর বদলাবে", "What moves the number")}
              </p>
              <ul className="space-y-1.5">
                {drivers.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: statusColor[d.status] }}
                      aria-hidden="true"
                    />
                    <span className="font-medium" style={{ color: "var(--dashboard-text-primary)" }}>
                      {t(lang, d.labelBn, d.labelEn)}
                    </span>
                    <span className="ml-auto font-mono tabular-nums" style={{ color: "var(--dashboard-text-muted)" }}>
                      {t(lang, d.detailBn, d.detailEn)}
                    </span>
                  </li>
                ))}
              </ul>
              {lever && (
                <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
                  {t(lang, "সবচেয়ে বড় সুযোগ", "Biggest lever")}:{" "}
                  <span className="font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
                    {t(lang, lever.labelBn, lever.labelEn)}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}