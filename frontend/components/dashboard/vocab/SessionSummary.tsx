"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  Star,
  BookOpen,
  Clock,
  Target,
  Repeat,
  X,
  Flame,
} from "@phosphor-icons/react";
import { useLanguage, t } from "@/lib/lang-ctx";

interface SessionSummaryProps {
  reviewed: number;
  correct: number;
  timeSpent: number;
  onClose: () => void;
  onReviewWeak: () => void;
}

const RATING_COLORS: Record<string, string> = {
  again: "bg-[var(--dashboard-danger)]",
  hard: "bg-[var(--dashboard-warning)]",
  good: "bg-emerald-500",
  easy: "bg-sky-500",
};

function getAccuracyTier(accuracy: number): {
  icon: "gold" | "silver" | "bronze";
  messageBn: string;
  messageEn: string;
} {
  if (accuracy >= 90) return { icon: "gold", messageBn: "দারুণ!", messageEn: "Excellent!" };
  if (accuracy >= 70) return { icon: "silver", messageBn: "ভালো কাজ!", messageEn: "Great work!" };
  if (accuracy >= 50) return { icon: "bronze", messageBn: "চালিয়ে যান!", messageEn: "Keep going!" };
  return { icon: "bronze", messageBn: "হালছাড়বেন না!", messageEn: "Don't give up!" };
}

function AnimatedNumber({ target, duration = 800 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setValue(Math.round(target * progress));
      if (progress < 1) requestAnimationFrame(step);
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, duration]);

  return <span>{value}</span>;
}

function ProgressRing({ percentage, size = 120 }: { percentage: number; size?: number }) {
  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    let start: number | null = null;
    const duration = 1000;
    const step = (now: number) => {
      if (!start) start = now;
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setAnimatedPct(percentage * progress);
      if (progress < 1) requestAnimationFrame(step);
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [percentage]);

  const r = (size - 12) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (animatedPct / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--terminal-border)"
        strokeWidth={6}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-100"
      />
    </svg>
  );
}

function StaggerItem({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.08 }}
    >
      {children}
    </motion.div>
  );
}

export default function SessionSummary({
  reviewed,
  correct,
  timeSpent,
  onClose,
  onReviewWeak,
}: SessionSummaryProps) {
  const { lang } = useLanguage();
  const accuracy = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
  const tier = getAccuracyTier(accuracy);
  const avgPerWord = reviewed > 0 ? timeSpent / reviewed : 0;
  const minutes = Math.floor(timeSpent / 60);
  const seconds = timeSpent % 60;

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className="glass-card rounded-2xl border border-terminal-border w-full max-w-md mx-4 p-6"
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div
            className="p-3 rounded-full"
            style={{
              backgroundColor:
                tier.icon === "gold"
                  ? "rgba(234, 179, 8, 0.15)"
                  : tier.icon === "silver"
                    ? "rgba(156, 163, 175, 0.15)"
                    : "rgba(180, 83, 9, 0.15)",
            }}
          >
            {tier.icon === "gold" ? (
              <Star size={32} weight="fill" className="text-yellow-500" />
            ) : tier.icon === "silver" ? (
              <Trophy size={32} className="text-gray-400" />
            ) : (
              <Trophy size={32} className="text-orange-700" />
            )}
          </div>
          <h2
            className="text-xl font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {t(lang, tier.messageBn, tier.messageEn)}
          </h2>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-lg hover:bg-black/10 transition-colors"
          >
            <X size={20} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StaggerItem index={0}>
            <div className="p-3 rounded-xl border border-terminal-border bg-[var(--surface-subtle)]">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen size={14} style={{ color: "var(--accent)" }} />
                <span className="text-xs font-mono uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {t(lang, "পর্যালোচিত", "Reviewed")}
                </span>
              </div>
              <span className="text-2xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                <AnimatedNumber target={reviewed} />
              </span>
            </div>
          </StaggerItem>

          <StaggerItem index={1}>
            <div className="p-3 rounded-xl border border-terminal-border bg-[var(--surface-subtle)] flex items-center gap-3">
              <div className="relative">
                <ProgressRing percentage={accuracy} size={64} />
                <span
                  className="absolute inset-0 flex items-center justify-center text-xs font-bold font-mono"
                  style={{ color: "var(--text-primary)" }}
                >
                  {Math.round(accuracy)}%
                </span>
              </div>
              <div>
                <div className="text-xs font-mono uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {t(lang, "নির্ভুলতা", "Accuracy")}
                </div>
              </div>
            </div>
          </StaggerItem>

          <StaggerItem index={2}>
            <div className="p-3 rounded-xl border border-terminal-border bg-[var(--surface-subtle)]">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={14} style={{ color: "var(--accent)" }} />
                <span className="text-xs font-mono uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {t(lang, "সময়", "Time")}
                </span>
              </div>
              <span className="text-2xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                <AnimatedNumber target={minutes} />m <AnimatedNumber target={seconds} duration={400} />s
              </span>
            </div>
          </StaggerItem>

          <StaggerItem index={3}>
            <div className="p-3 rounded-xl border border-terminal-border bg-[var(--surface-subtle)]">
              <div className="flex items-center gap-2 mb-1">
                <Target size={14} style={{ color: "var(--accent)" }} />
                <span className="text-xs font-mono uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {t(lang, "গড়/শব্দ", "Avg/Word")}
                </span>
              </div>
              <span className="text-2xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                <AnimatedNumber target={Math.round(avgPerWord)} duration={600} />s
              </span>
            </div>
          </StaggerItem>
        </div>

        {/* Rating Breakdown */}
        <StaggerItem index={4}>
          <div className="mb-6">
            <div className="text-xs font-mono uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
              {t(lang, "রেটিং বিশ্লেষণ", "Rating Breakdown")}
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-[var(--surface-subtle)] border border-terminal-border">
              {(["again", "hard", "good", "easy"] as const).map((rating) => (
                <div
                  key={rating}
                  className={`h-full ${RATING_COLORS[rating]} transition-all`}
                  style={{ width: reviewed > 0 ? `${100 / 4}%` : "0%" }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
              <span>Again</span>
              <span>Hard</span>
              <span>Good</span>
              <span>Easy</span>
            </div>
          </div>
        </StaggerItem>

        {/* Streak */}
        <StaggerItem index={5}>
          <div className="flex items-center justify-center gap-2 mb-6">
            <Flame size={16} className="text-orange-500" />
            <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>
              🔥 {t(lang, "৫ দিনের স্ট্রিক!", "5 day streak!")}
            </span>
          </div>
        </StaggerItem>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onReviewWeak}
            className="w-full py-3 px-4 rounded-xl font-mono text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg)",
            }}
          >
            <Repeat size={16} />
            {t(lang, "দুর্বল শব্দ পর্যালোচনা", "Review Weak Words")}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl font-mono text-sm font-semibold border transition-colors"
            style={{
              borderColor: "var(--terminal-border)",
              color: "var(--text-primary)",
              backgroundColor: "transparent",
            }}
          >
            {t(lang, "বন্ধ করুন", "Close")}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
