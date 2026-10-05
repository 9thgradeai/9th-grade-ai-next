"use client";

import { motion } from "framer-motion";
import { useMotionTier, useFirstMountAnimate } from "@/lib/motion/use-motion-tier";
import { useLanguage, t } from "@/lib/lang-ctx";

type StreakHeatmapProps = {
  activeDays: boolean[];
  labels: string[];
  freezeAvailable?: boolean;
};

export default function StreakHeatmap({ activeDays, labels, freezeAvailable = false }: StreakHeatmapProps) {
  const { lang } = useLanguage();
  const { fullMotion } = useMotionTier();
  const days = activeDays.slice(-7);
  const dayLabels = labels.slice(-7);
  const activeCount = days.filter(Boolean).length;
  // Day cells pop in with a stagger on first mount only — silent
  // revalidations render the final state with no re-animation.
  const animateOnce = useFirstMountAnimate(fullMotion && days.length > 0);

  return (
    <motion.div
      className="flex items-center gap-1.5"
      role="img"
      aria-label={t(lang, `গত ৭ দিনের মধ্যে ${activeCount} দিন অধ্যয়ন করেছেন`, `Studied ${activeCount} of the last 7 days`)}
      initial={animateOnce ? "hidden" : false}
      animate="show"
      variants={
        animateOnce
          ? { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
          : undefined
      }
    >
      {days.map((active, i) => (
        <motion.div
          key={i}
          className="flex flex-col items-center gap-1"
          title={`${dayLabels[i]} — ${active ? t(lang, "পড়া হয়েছে", "studied") : t(lang, "পড়া হয়নি", "missed")}${i === days.length - 1 ? ` (${t(lang, "আজ", "today")})` : ""}`}
          variants={
            animateOnce
              ? {
                  hidden: { opacity: 0, scale: 0.3, rotate: -14 },
                  show: {
                    opacity: 1,
                    scale: 1,
                    rotate: 0,
                    transition: { type: "spring", stiffness: 450, damping: 13 },
                  },
                }
              : undefined
          }
        >
          <span
            className={`w-5 h-5 rounded-md border transition-colors ${
              active
                ? "bg-[var(--accent)] border-[var(--primary)] shadow-[0_0_10px_var(--primary)]"
                : "bg-[var(--dashboard-surface-muted)] border-[var(--border-strong)]"
            } ${i === days.length - 1 ? "ring-1 ring-[var(--dashboard-primary)]" : ""}`}
            aria-hidden="true"
          />
          <span className="text-[9px] text-[var(--dashboard-text-muted)] font-mono">{dayLabels[i]}</span>
        </motion.div>
      ))}
      {freezeAvailable && (
        <span
          title="Streak Freeze available — protects one missed day"
          aria-label="Streak Freeze available"
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-md border text-[11px]"
          style={{ borderColor: "var(--dashboard-info)", color: "var(--dashboard-info)", background: "var(--dashboard-info-subtle)" }}
        >
          🛡️
        </span>
      )}
    </motion.div>
  );
}
