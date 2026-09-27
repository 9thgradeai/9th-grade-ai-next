/**
 * Serve-time option shuffling for practice/exam sessions.
 *
 * Grading everywhere compares option TEXT (never letters) and no stored
 * explanation references positions, so display order is free. Each session
 * shuffles once with its own seed: stable within the session (answering,
 * review, AI explanations all see the same arrangement), different across
 * sessions (no positional memorization).
 *
 * Two pin rules:
 * 1. Conventional options (`All of the above`, `None of these`, …) stay
 *    pinned at their authored index — shuffling them would read as broken.
 *    The match is exact (case-insensitive) so content like
 *    "Neither type of matters" still shuffles normally.
 * 2. Self-referential questions keep their ENTIRE authored order. Any option
 *    citing option letters ("Both A and B are perfectly standard",
 *    "A and C are correct", "Only B", "Except D", "option C") breaks the
 *    moment anything moves — so the whole question is exempt from shuffling.
 */

// Pinned only on exact match — see module docblock for why.
const PINNED_OPTION = /^(all of the above|none of the above|all of these|none of these|both a and b|all of them|neither)$/i;

export function isPinnedOption(text: string): boolean {
  return PINNED_OPTION.test(text.trim());
}

// Option-letter cross-references ("Both A and B", "A and C are correct",
// "Only B", "Except D", "option C"). The matched span must itself contain an
// UPPERCASE cited letter — so "Only a fine" (article "a") and prose like
// "vitamin A and iron" never trip it, while genuine references always do.
// Pinning is fail-safe anyway: a false positive only keeps authored order.
const LETTER_REF =
  /(both|either|neither)\s+[A-E]\b|\b[A-E]\s+and\s+[A-E]\b|\b(only|except)\s+[A-E]\b|\boptions?\s+[A-E]\b/i;

/**
 * True when any option cites option letters — the question's meaning depends
 * on the authored order, so it must not be shuffled at all.
 */
export function hasLetterReference(options: readonly string[]): boolean {
  return options.some((opt) => {
    const m = LETTER_REF.exec(opt);
    return m !== null && /[A-E]/.test(m[0]);
  });
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffle one question's options deterministically. Pinned options keep
 * their index; everything else fills the free slots in seeded order.
 * Questions with letter cross-references keep their full authored order.
 * `correctAnswer` is never touched — it stays the exact option text.
 */
export function shuffleOptions<T extends string>(options: readonly T[], seed: string | number): T[] {
  if (options.length < 2) return [...options];
  if (hasLetterReference(options)) return [...options];
  const rand = mulberry32(typeof seed === "number" ? seed : hashSeed(seed));
  const freeIdx: number[] = [];
  const out: (T | undefined)[] = new Array(options.length);
  const movable: T[] = [];
  options.forEach((opt, i) => {
    if (isPinnedOption(opt)) out[i] = opt;
    else {
      freeIdx.push(i);
      movable.push(opt);
    }
  });
  // Fisher–Yates over the movable options only.
  for (let i = movable.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [movable[i], movable[j]] = [movable[j], movable[i]];
  }
  freeIdx.forEach((idx, k) => {
    out[idx] = movable[k];
  });
  return out as T[];
}

export type ShufflableQuestion = {
  id: number;
  options: string[];
};

/**
 * Shuffle every question's options for a session. Seed once per session
 * (e.g. `Date.now()` or the attempt id) and reuse the SAME seed for all
 * questions — per-question salt comes from the question id, so each
 * question still gets its own arrangement. Self-referential questions
 * (letter cross-references) are left in authored order.
 */
export function shuffleSessionOptions<T extends ShufflableQuestion>(questions: readonly T[], sessionSeed: string | number): T[] {
  return questions.map((q) => ({
    ...q,
    options: shuffleOptions(q.options, `${sessionSeed}:${q.id}`),
  }));
}
