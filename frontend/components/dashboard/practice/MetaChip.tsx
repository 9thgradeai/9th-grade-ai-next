"use client";

import type { CSSProperties, ReactNode } from "react";

export type MetaChipTone = "primary" | "warning" | "danger" | "success" | "teal" | "info" | "neutral";

/**
 * Guaranteed-contrast metadata chip (difficulty, topic, subtopic…).
 *
 * Small tinted chips are the #1 contrast trap: brand/semantic hues at
 * 10–11px fail 4.5:1 on their own subtle backgrounds. The text is mixed
 * 60% toward the theme's primary body text, so the hue still reads while
 * the ratio holds in BOTH light and dark themes:
 *   light: tone darkens toward near-black, dark on light tint ✓
 *   dark:  tone lightens toward near-white, light on dark tint ✓
 * Tint bg + 1px border + bold 11px mono complete the affordance without
 * relying on color alone (chips always sit beside a text label).
 */
const TONE_VAR: Record<MetaChipTone, string> = {
  primary: "var(--dashboard-primary)",
  warning: "var(--dashboard-warning)",
  danger: "var(--dashboard-danger)",
  success: "var(--dashboard-success)",
  teal: "var(--dashboard-teal)",
  info: "var(--dashboard-info)",
  neutral: "var(--dashboard-text-secondary)",
};

export default function MetaChip({
  tone,
  children,
  label,
}: {
  tone: MetaChipTone;
  children: ReactNode;
  label?: string;
}) {
  const toneVar = TONE_VAR[tone];
  const style: CSSProperties = {
    background: `color-mix(in srgb, ${toneVar} 12%, transparent)`,
    border: `1px solid color-mix(in srgb, ${toneVar} 35%, transparent)`,
    color: `color-mix(in srgb, ${toneVar} 60%, var(--dashboard-text-primary))`,
  };
  return (
    <span
      className="px-2 py-0.5 rounded text-[11px] font-mono font-bold whitespace-normal overflow-wrap:anywhere min-w-0"
      style={style}
      aria-label={label}
    >
      {children}
    </span>
  );
}
