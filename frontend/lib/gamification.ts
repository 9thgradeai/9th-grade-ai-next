/**
 * Gamification engine — Phase 1 ambient Home.
 * Pure functions only (testable, no React). Duolingo-inspired:
 * streak separate from daily goal, freeze, XP curve, leagues.
 */

export type League = "Bronze" | "Silver" | "Gold" | "Diamond" | "Elite";

export function xpForSolved(solved: number, accuracy: number): number {
  const s = Math.max(0, solved);
  const a = Math.max(0, Math.min(100, accuracy));
  return Math.round(s * (0.6 + (a / 100) * 0.8));
}

export function levelForXp(xp: number): { level: number; intoLevel: number; forNext: number } {
  const safe = Math.max(0, xp);
  // 100 XP per level, growing 12% per level: threshold(n) = 100 * 1.12^(n-1)
  let level = 1;
  let consumed = 0;
  let need = 100;
  while (safe >= consumed + need && level < 100) {
    consumed += need;
    level += 1;
    need = Math.round(100 * Math.pow(1.12, level - 1));
  }
  return { level, intoLevel: safe - consumed, forNext: need };
}

export function leagueForScore(score: number): League {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 85) return "Elite";
  if (s >= 70) return "Diamond";
  if (s >= 55) return "Gold";
  if (s >= 35) return "Silver";
  return "Bronze";
}

/** Streak freeze: earned at 3/7/30-day milestones, one freeze protects one missed day. */
export function freezeEarned(streak: number): number {
  if (streak >= 30) return 2;
  if (streak >= 7) return 1;
  if (streak >= 3) return 1;
  return 0;
}

export function freezeAvailable(streak: number, freezesUsed: number): boolean {
  return freezeEarned(streak) > freezesUsed;
}

export type AmbientCardId = "mission" | "performance" | "plan" | "actions" | "pulse" | "coach";

export type AmbientSignals = {
  unmasteredMistakes?: number;
  flashcardsDue?: number;
  weakAccuracy?: number | null;
  streak?: number;
  planCompletionPct?: number;
};

/**
 * Ambient ranking — highest-need card first. Deterministic, no AI needed.
 * Mistakes > flashcards > weak topic > plan > performance > pulse/coach.
 */
export function rankAmbientCards(signals: AmbientSignals): AmbientCardId[] {
  const scored: { id: AmbientCardId; score: number }[] = [
    { id: "mission", score: 50 },
    { id: "performance", score: 20 },
    { id: "plan", score: (signals.planCompletionPct ?? 100) < 60 ? 45 : 25 },
    { id: "actions", score: 30 },
    { id: "pulse", score: 10 },
    { id: "coach", score: 5 },
  ];
  if ((signals.unmasteredMistakes ?? 0) > 0) {
    scored.find((s) => s.id === "mission")!.score += 40;
  }
  if ((signals.flashcardsDue ?? 0) > 0) {
    scored.find((s) => s.id === "plan")!.score += 20;
  }
  if (signals.weakAccuracy != null && signals.weakAccuracy < 60) {
    scored.find((s) => s.id === "actions")!.score += 25;
  }
  if ((signals.streak ?? 0) >= 7) {
    scored.find((s) => s.id === "pulse")!.score += 10;
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.id);
}
