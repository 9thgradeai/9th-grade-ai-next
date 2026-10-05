/**
 * Phase 3 — Calm exam engine helpers (LMU 2025: familiarization, backtracking,
 * calm countdown, randomization as least-stressful anti-cheat).
 * Pure functions only.
 */

export type TimerLevel = "normal" | "low" | "critical";

/** Calm thresholds: normal > 5min, low 60s–5min, critical ≤ 60s (only pulse). */
export function calmTimerLevel(remainingSec: number): TimerLevel {
  if (remainingSec <= 60) return "critical";
  if (remainingSec <= 300) return "low";
  return "normal";
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export type PaletteState = "answered" | "current" | "unseen";

export function paletteStates(
  questionIds: number[],
  answers: Record<number, string>,
  currentId: number | null,
): PaletteState[] {
  return questionIds.map((id) => {
    if (id === currentId) return "current";
    if (answers[id] && answers[id].trim().length > 0) return "answered";
    return "unseen";
  });
}

/** Wrapped-style share line for post-exam virality (score, accuracy, streak). */
export function wrappedLine(score: number, total: number, streakDays: number): string {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  return `আমি 9th-Grade AI মকে ${score}/${total} (${pct}%) পেয়েছি — 🔥 ${streakDays} দিনের স্ট্রিক!`;
}
