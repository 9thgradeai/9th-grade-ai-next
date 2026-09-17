"use client";

import { Gauge, Info } from "lucide-react";
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
        </div>
      )}
    </section>
  );
}