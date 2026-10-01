import type { ExamEcosystemCode } from "@/lib/types";

/** Seconds allocated per MCQ — the single source of truth for auto timing. */
export const SECONDS_PER_QUESTION = 30;

/** Negative marking per wrong MCQ: Bank −0.25, BCS −0.50. */
export function negativePenaltyForEcosystem(ecosystem: ExamEcosystemCode | string | null | undefined): number {
  return ecosystem === "BANGLADESH_BANK" ? 0.25 : 0.5;
}

/** "−০.৫" (BCS) / "−০.২৫" (Bank) — Bengali-digit label matching UI convention. */
export function negativeLabelForEcosystem(ecosystem: ExamEcosystemCode | string | null | undefined): string {
  const raw = negativePenaltyForEcosystem(ecosystem).toFixed(2).replace(/0$/, "");
  const bn = raw.replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
  return `−${bn}`;
}

/** Auto total seconds for a question count (30s per MCQ). */
export function autoDurationSec(totalQuestions: number): number {
  if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) return 0;
  return Math.floor(totalQuestions) * SECONDS_PER_QUESTION;
}

/** Auto duration in whole minutes (min 1) for minute-stepper UIs. */
export function autoDurationMin(totalQuestions: number): number {
  if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) return 1;
  return Math.max(1, Math.ceil(autoDurationSec(totalQuestions) / 60));
}

/** Human short label, e.g. 90 → "1 মি 30 সে", 60 → "1 মিনিট". */
export function formatDurationShort(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} সে`;
  if (r === 0) return `${m} মিনিট`;
  return `${m} মি ${r} সে`;
}
