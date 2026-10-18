"use client";

import { useMemo } from "react";

export type TopicBarItem = {
  subject: string;
  topic?: string | null;
  status: "correct" | "wrong" | "unanswered";
};

/**
 * TopicBars, per-topic accuracy breakdown for result panels.
 * Aggregates items by subject › topic, worst-first, top 6.
 * Shared by Quick / Mock / Custom results.
 */
export default function TopicBars({ items }: { items: TopicBarItem[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { correct: number; total: number; answered: number }>();
    for (const it of items) {
      const key = it.topic ? `${it.subject} › ${it.topic}` : it.subject || "অন্যান্য";
      const row = map.get(key) ?? { correct: 0, total: 0, answered: 0 };
      row.total += 1;
      if (it.status !== "unanswered") row.answered += 1;
      if (it.status === "correct") row.correct += 1;
      map.set(key, row);
    }
    return [...map.entries()]
      .map(([label, v]) => ({ label, ...v, pct: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct || b.total - a.total)
      .slice(0, 6);
  }, [items]);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border p-3 sm:p-4" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface)" }}>
      <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest mb-2.5">
        টপিকভিত্তিক পারফরম্যান্স
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs truncate" style={{ color: "var(--dashboard-text-secondary)" }}>
                {r.label}
              </span>
              <span className="text-[11px] font-mono tabular-nums flex-shrink-0" style={{ color: "var(--dashboard-text-muted)" }}>
                {r.correct}/{r.total} · {r.pct}%
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--dashboard-surface-muted)" }}
              role="progressbar"
              aria-label={`${r.label}: ${r.correct} of ${r.total} correct`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={r.pct}
            >
              <div
                className="h-full rounded-full transition-transform duration-300 origin-left"
                style={{
                  transform: `scaleX(${r.pct / 100})`,
                  background:
                    r.pct >= 80
                      ? "var(--dashboard-success)"
                      : r.pct >= 50
                        ? "var(--dashboard-primary)"
                        : "var(--dashboard-danger)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
