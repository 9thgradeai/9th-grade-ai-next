// Explain prompt — detailed MCQ explanation for exam review.

import type { AIContext } from "../types";

export const EXPLAIN_PROMPT_VERSION = "explain-v1";

const PERSONA =
  "You are 9th-Grade AI, a patient, expert tutor for Bangladesh competitive job exams " +
  "(BCS, Bangladesh Bank, Assistant Director, 9th-grade government posts). " +
  "A student has completed an MCQ exam and wants a detailed explanation of a specific question.\n" +
  "You are given the question, all options, and the correct answer.\n" +
  "Respond with JSON only, exactly this shape:\n" +
  "{\n" +
  '  "correctAnswerExplanation": "<detailed explanation of why the correct answer is correct — include reasoning, facts, and definitions>",\n' +
  '  "whyOthersWrong": [\n' +
  '    { "option": "<option text>", "reason": "<specific reason why this option is wrong>" }\n' +
  '  ],\n' +
  '  "keyDefinitions": ["<definition 1>", "<definition 2>"],\n' +
  '  "relatedConcepts": "<broader concepts the student should understand>",\n' +
  '  "examTip": "<practical exam tip for answering similar questions>"\n' +
  "}\n" +
  "Rules:\n" +
  "- Respond in the same language the question is written in (Bengali or English).\n" +
  "- Be thorough but concise — each explanation should be 2-4 sentences.\n" +
  "- For 'whyOthersWrong', provide a specific, factual reason for EACH wrong option — do not skip any.\n" +
  "- Never refer to options by letter (A/B/C/D) anywhere in the output — always quote the option text itself. Option order varies per student, so letters are meaningless.\n" +
  "- For 'keyDefinitions', list 2-4 key terms/definitions relevant to the question.\n" +
  "- For 'examTip', give one actionable tip for solving similar MCQs in exams.\n" +
  "- If the question is from a specific subject (e.g., Bangladesh Affairs, General Knowledge), use domain-appropriate terminology.\n" +
  "- Never invent facts. Base explanations on established knowledge.\n" +
  "- Keep the output well-structured and easy to read.";

const DOMAIN_RULES =
  "\n\n## Question Bank Context (grounding)\n" +
  "The following are real past/exam questions from our curated bank, with verified answers. " +
  "Use this context to ground your explanation in exam-relevant facts.\n\n" +
  "=== Retrieved question-bank entries (trusted, curated) ===\n";

/** Build the explain system prompt. `episodicBlock` carries the learner's own
 * history with this exact topic (counts only — never fabricated). */
export function buildExplainSystem(ctx: AIContext, domainBlock = "", episodicBlock = ""): string {
  const subjectLine = ctx.subject
    ? `\n[Subject: ${ctx.subject.nameBn} (${ctx.subject.nameEn})]`
    : "";
  return PERSONA + subjectLine + (domainBlock ? DOMAIN_RULES + domainBlock : "") + episodicBlock;
}

/**
 * Render the episodic topic-history block from real progress rows. Returns ""
 * when there is no history — the caller then sends no personalization rather
 * than inventing any.
 */
export function buildTopicEpisodicBlock(
  topicName: string,
  rows: Array<{
    totalAttempts: number;
    correctAttempts: number;
    isMistake: boolean;
    lastIncorrectAt: Date | null;
  }>,
  now: Date = new Date(),
): string {
  const touched = rows.length;
  if (touched === 0) return "";
  const attempts = rows.reduce((a, r) => a + r.totalAttempts, 0);
  const correct = rows.reduce((a, r) => a + r.correctAttempts, 0);
  const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
  const openMistakes = rows.filter((r) => r.isMistake).length;
  const lastWrong = rows
    .map((r) => r.lastIncorrectAt?.getTime() ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);
  const daysAgo =
    lastWrong > 0 ? Math.max(0, Math.round((now.getTime() - lastWrong) / 86_400_000)) : null;

  let block =
    "\n\n## Learner's History With This Topic (personalization — adapt depth, not facts)\n" +
    `Topic "${topicName}": ${attempts} attempts across ${touched} question(s), ${accuracy}% accuracy` +
    `, ${openMistakes} still marked as mistake(s)`;
  block += daysAgo != null ? ` (last wrong ${daysAgo} day(s) ago)` : " (no recent wrong answers)";
  block += ".\n";
  if (openMistakes > 0 && attempts >= 3) {
    block +=
      "This is a repeat struggle: address the underlying misconception explicitly, " +
      "not just this question, and end relatedConcepts with what to practice next.\n";
  }
  return block;
}

/** JSON shape the model must return; validated by the application layer. */
export const EXPLAIN_OUTPUT_SCHEMA = {
  correctAnswerExplanation: "string (required)",
  whyOthersWrong: "Array<{ option: string, reason: string }> (required)",
  keyDefinitions: "string[] (optional)",
  relatedConcepts: "string (optional)",
  examTip: "string (optional)",
} as const;
