"use client";

import { BookX, ArrowRight } from "lucide-react";
import { useLanguage, t } from "@/lib/lang-ctx";
import type { PreparationIntelligenceDTO } from "@/lib/types";

type MistakeRecoveryCardProps = {
  intelligence: PreparationIntelligenceDTO | null;
  onOpenMistakes: (subject?: string) => void;
};

function StagePill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold"
      style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: tone }}
    >
      {label}
      <span className="font-mono">{value}</span>
    </span>
  );
}

export default function MistakeRecoveryCard({ intelligence, onOpenMistakes }: MistakeRecoveryCardProps) {
  const { lang } = useLanguage();
  const mistakes = intelligence?.mistakes;
  const bySubject = mistakes?.bySubject.filter((s) => s.unmastered > 0) ?? [];
  const totalUnmastered = mistakes?.unmastered ?? 0;

  const stagePills = (
    <>
      <StagePill label={t(lang, "অমীমাংসিত", "Unmastered")} value={mistakes?.unmastered ?? 0} tone="var(--dashboard-danger)" />
      <StagePill label={t(lang, "সংগ্রামী", "Struggling")} value={mistakes?.struggling ?? 0} tone="var(--dashboard-danger)" />
      <StagePill label={t(lang, "পর্যালোচনায়", "Reviewing")} value={mistakes?.reviewing ?? 0} tone="var(--dashboard-warning)" />
      <StagePill label={t(lang, "উন্নতিশীল", "Improving")} value={mistakes?.improving ?? 0} tone="var(--dashboard-info)" />
      <StagePill label={t(lang, "নিখুঁত", "Mastered")} value={mistakes?.mastered ?? 0} tone="var(--dashboard-success)" />
    </>
  );

  if ((mistakes?.totalMistakes ?? 0) === 0) {
    return (
      <div
        className="rounded-2xl border p-8 text-center"
        style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
      >
        <span className="text-3xl" aria-hidden="true">🎯</span>
        <p className="mt-3 text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
          {t(lang, "কোনো ভুল নেই", "No mistakes to fix")}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>
          {t(
            lang,
            "ভুল উত্তর স্বয়ংক্রিয়ভাবে ভুলের খাতায় জমা হয় পুনরাবৃত্তির জন্য।",
            "Wrong answers automatically collect here for spaced correction.",
          )}
        </p>
      </div>
    );
  }

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
      aria-labelledby="mistake-recovery-title"
    >
      <div className="flex items-center justify-between">
        <h3 id="mistake-recovery-title" className="command-eyebrow flex items-center gap-1.5">
          <BookX className="w-3.5 h-3.5" style={{ color: "var(--dashboard-danger)" }} />
          {t(lang, "ভুল পুনরুদ্ধার", "Mistake recovery")}
        </h3>
        <button
          onClick={() => onOpenMistakes()}
          className="text-xs font-bold inline-flex items-center gap-1"
          style={{ color: "var(--dashboard-primary)" }}
        >
          {t(lang, "খাতা খুলুন", "Open notebook")} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
        {totalUnmastered} {t(lang, "অমীমাংসিত প্রশ্ন", "unmastered questions")}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">{stagePills}</div>

      {bySubject.length > 0 && (
        <div className="mt-4 space-y-2">
          {bySubject.slice(0, 4).map((s) => (
            <button
              key={s.subject}
              onClick={() => onOpenMistakes(s.subject)}
              className="w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-[var(--dashboard-primary)]/40"
              style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
            >
              <span className="text-xs font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>{s.subject}</span>
              <span className="text-xs font-mono font-bold shrink-0" style={{ color: "var(--dashboard-danger)" }}>
                {s.unmastered} {t(lang, "অমীমাংসিত", "unresolved")}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}