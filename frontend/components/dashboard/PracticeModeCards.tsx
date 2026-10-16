"use client";

import { BookOpen, Flag, Sun, Timer } from "@phosphor-icons/react";

export type PracticeMode = "custom" | "mock" | "quick";

type Props = {
  mode: PracticeMode;
  onChange: (m: PracticeMode) => void;
  quickTotal: number;
  ecosystem: string;
};

const CARDS: {
  id: PracticeMode;
  title: string;
  titleBn: string;
  desc: string;
  meta: string;
  icon: typeof Sun;
}[] = [
  {
    id: "quick",
    title: "Quick Drill",
    titleBn: "কুইক প্র্যাকটিস",
    desc: "Pick topics, start instantly, review inline.",
    meta: "Instant · per-Q timer",
    icon: Sun,
  },
  {
    id: "custom",
    title: "Custom Exam",
    titleBn: "কাস্টম পরীক্ষা",
    desc: "Mix subjects + topics into your own paper.",
    meta: "Flexible · full paper",
    icon: BookOpen,
  },
  {
    id: "mock",
    title: "Mock Test",
    titleBn: "মক টেস্ট",
    desc: "Real exam pressure with negative marking.",
    meta: "Timed · negative mark",
    icon: Timer,
  },
];

export default function PracticeModeCards({ mode, onChange, quickTotal, ecosystem }: Props) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
      role="group"
      aria-label="Practice mode"
    >
      {CARDS.map((c) => {
        const active = mode === c.id;
        const Icon = c.icon;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            aria-pressed={active}
            className={`rounded-2xl border p-3.5 text-left cursor-pointer transition-all active:scale-[0.99] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] ${
              active
                ? "border-[var(--dashboard-primary)]/50 bg-[var(--dashboard-primary-subtle)]"
                : "border-[var(--border-subtle)] bg-[var(--dashboard-surface)] hover:border-[var(--dashboard-primary)]/30"
            }`}
            style={active ? { boxShadow: "var(--dashboard-shadow-sm)" } : undefined}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={
                  active
                    ? { background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }
                    : { background: "var(--dashboard-surface-muted)", color: "var(--dashboard-primary)" }
                }
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                  {c.title} <span className="font-medium" style={{ color: active ? "var(--dashboard-text-secondary)" : "var(--dashboard-text-muted)" }}>· {c.titleBn}</span>
                </p>
                <p className="text-[11px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                  {c.meta}
                  {c.id === "quick" && quickTotal > 0 ? ` · ${quickTotal}টি` : ""}
                  {c.id !== "quick" ? ` · ${ecosystem === "BCS" ? "BCS" : "ব্যাংক"}` : ""}
                </p>
              </div>
              {active && <Flag className="w-4 h-4 flex-shrink-0" style={{ color: "var(--dashboard-primary)" }} aria-hidden="true" />}
            </div>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
              {c.desc}
            </p>
          </button>
        );
      })}
    </div>
  );
}
