// render.ts — pure rendering of context slices into a compact, prompt-safe
// "Live preparation snapshot" block. No DB / server-only imports so prompts
// stay unit-testable.

import type { ContextSlices } from "../types";

/** Render the loaded slices as a compact bulleted block for a system prompt. */
export function renderSlicesForPrompt(slices: ContextSlices | undefined): string {
  if (!slices) return "";
  const lines: string[] = [];

  if (slices.exam) {
    const e = slices.exam;
    if (e.nextExam && e.daysLeft !== null) {
      lines.push(`- Next verified exam: ${e.nextExam.titleBn} in ${e.daysLeft} days.`);
    } else if (e.examTarget) {
      lines.push(
        `- Learner's stated exam target: ${e.examTarget}${e.personalExamDate ? ` (target date ${e.personalExamDate.slice(0, 10)})` : ""}.`,
      );
    }
  }

  if (slices.todayPlan) {
    const p = slices.todayPlan;
    if (p.total > 0) {
      if (p.remaining > 0) {
        lines.push(
          `- Today's plan: ${p.remaining} of ${p.total} tasks remaining` +
            (p.highPriorityRemaining > 0 ? ` (${p.highPriorityRemaining} high priority)` : "") +
            (p.firstTitle ? `; next: "${p.firstTitle}".` : "."),
        );
      } else {
        lines.push(`- Today's plan: all ${p.total} tasks completed.`);
      }
    }
  }

  if (slices.revision) {
    const parts: string[] = [];
    if (slices.revision.flashcardsDue > 0) parts.push(`${slices.revision.flashcardsDue} flashcards`);
    if (slices.revision.mistakeReviewsDue > 0)
      parts.push(`${slices.revision.mistakeReviewsDue} mistake reviews`);
    if (parts.length > 0) lines.push(`- Revision due: ${parts.join(" and ")}.`);
  }

  if (slices.mockPerformance && slices.mockPerformance.count > 0) {
    lines.push(
      `- Recent mock average: ${slices.mockPerformance.average ?? 0}% across ${slices.mockPerformance.count} test(s).`,
    );
  }

  if (slices.mistakes && slices.mistakes.patterns.length > 0) {
    const top = slices.mistakes.patterns.slice(0, 2);
    lines.push(
      `- Mistake patterns: ${top.map((p) => `${p.label}${p.topic ? ` ("${p.topic}")` : ""} x${p.count}`).join("; ")}.`,
    );
  }

  if (lines.length === 0) return "";
  return "## Live preparation snapshot\n" + lines.join("\n") + "\n";
}