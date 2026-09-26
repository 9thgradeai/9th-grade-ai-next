"use client";

import { motion } from "framer-motion";
import { useMotionTier, useFirstMountAnimate } from "@/lib/motion/use-motion-tier";

type StreakHeatmapProps = {
  activeDays: boolean[];
  labels: string[];
};

export default function StreakHeatmap({ activeDays, labels }: StreakHeatmapProps) {
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
      aria-label={`গত ৭ দিনের মধ্যে ${activeCount} দিন অধ্যয়ন করেছেন`}
      initial={animateOnce ? "hidden" : false}
      animate="show"
      variants={
        animateOnce
          ? { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
          : undefined
      }
    >
      {days.map((active, i) => (
        <motion.div
          key={i}
          className="flex flex-col items-center gap-1"
          variants={
            animateOnce
              ? {
                  hidden: { opacity: 0, scale: 0.5 },
                  show: {
                    opacity: 1,
                    scale: 1,
                    transition: { type: "spring", stiffness: 380, damping: 18 },
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
            }`}
            aria-hidden="true"
          />
          <span className="text-[9px] text-[var(--dashboard-text-muted)] font-mono">{dayLabels[i]}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}
