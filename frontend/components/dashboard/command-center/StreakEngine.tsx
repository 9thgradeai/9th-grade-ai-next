"use client";

import { Flame } from "@phosphor-icons/react";
import { useLanguage, t } from "@/lib/lang-ctx";
import StreakHeatmap from "../StreakHeatmap";
import { xpForSolved, levelForXp, freezeAvailable } from "@/lib/gamification";

type StreakEngineProps = {
  streak: number;
  activeDays: boolean[];
  labels: string[];
  solved: number;
  accuracy: number;
};

/**
 * Sprint 1 — one streak/XP voice for Home. Previously the header pill, the
 * heatmap, the freeze shield and the XP curve each spoke differently;
 * this strip unifies streak count + 7-day heat + freeze status + level
 * progress in a single glanceable unit.
 */
export default function StreakEngine({ streak, activeDays, labels, solved, accuracy }: StreakEngineProps) {
  const { lang } = useLanguage();
  const xp = xpForSolved(solved, accuracy);
  const { level, intoLevel, forNext } = levelForXp(xp);
  const frozen = freezeAvailable(streak, 0);
  const pct = forNext > 0 ? Math.max(0, Math.min(100, (intoLevel / forNext) * 100)) : 0;

  return (
    <span
      className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-1.5 rounded-full border text-xs font-bold"
      style={{
        background: "var(--dashboard-warning-subtle)",
        borderColor: "color-mix(in srgb, var(--dashboard-warning) 20%, transparent)",
        color: "var(--dashboard-warning)",
      }}
      role="status"
      aria-label={t(
        lang,
        `${streak} দিনের স্ট্রিক, লেভেল ${level}, ${intoLevel}/${forNext} XP`,
        `${streak}-day streak, level ${level}, ${intoLevel}/${forNext} XP`,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <Flame className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
        {streak} {t(lang, "দিনের স্ট্রিক", "day streak")}
      </span>
      <span className="inline-flex" aria-hidden="true">
        <StreakHeatmap activeDays={activeDays} labels={labels} freezeAvailable={frozen} />
      </span>
      <span
        className="hidden sm:inline-flex items-center gap-1 font-mono text-[11px]"
        style={{ color: "var(--dashboard-primary)" }}
        title={t(lang, "পরের লেভেল পর্যন্ত XP", "XP to next level")}
      >
        Lv {level} · {intoLevel}/{forNext} XP
      </span>
      <span
        className="hidden sm:block h-1 w-16 overflow-hidden rounded-full"
        style={{ background: "color-mix(in srgb, var(--dashboard-primary) 20%, transparent)" }}
        aria-hidden="true"
      >
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--dashboard-primary)" }} />
      </span>
    </span>
  );
}
