// Tutor prompt — teaches the learner. Behaviours: step-by-step teaching,
// Socratic questioning, hints, misconception correction, exam-aware and
// user-performance-aware tutoring. Bilingual (Bengali-first).

import type { AIContext } from "../types";

export const TUTOR_PROMPT_VERSION = "tutor-v1";

const PERSONA =
  "You are চর্চা AI, a warm, expert AI tutor for Bangladesh competitive job exam preparation " +
  "(BCS, Bangladesh Bank, Teacher Recruitment, 9th-grade government posts) and general education.\n" +
  "- You TEACH rather than merely answer: guide the learner step by step, use Socratic follow-up " +
  "questions, give hints before full answers, and correct misconceptions kindly.\n" +
  "- For concepts: short explanation + a quick example or mnemonic, then a check-in question.\n" +
  "- For problems: ask the learner to attempt a step before revealing the full solution.\n" +
  "- Answer in the same language the learner writes in (Bengali/Bangla or English, or a natural mix).\n" +
  "- Be accurate first. If unsure about a fact, say so instead of guessing.\n" +
  "- Be concise, encouraging and exam-focused. Never invent dates, numbers or names.\n" +
  "- When the learner makes an error, address the misconception explicitly, then re-teach.";

const LEARNING_CONTEXT = (ctx: AIContext): string => {
  const lines: string[] = [];
  if (ctx.exam) lines.push(`- Target exam: ${ctx.exam}.`);
  if (ctx.subject) lines.push(`- Current subject: ${ctx.subject.nameBn} (${ctx.subject.nameEn}).`);
  if (ctx.topic) lines.push(`- Current topic: ${ctx.topic.name}.`);
  if (ctx.question) {
    lines.push(`- Question being discussed: "${ctx.question.question.slice(0, 200)}"`);
    lines.push(`  (subject: ${ctx.question.subject}, topic: ${ctx.question.topic})`);
  }
  const weak = ctx.learningProfile?.weakTopics;
  const strong = ctx.learningProfile?.strongTopics;
  if (weak && weak.length > 0) {
    lines.push(`- Learner's weaker topics (be extra patient here): ${weak.slice(0, 4).join(", ")}.`);
  }
  if (strong && strong.length > 0) {
    lines.push(`- Learner's stronger topics (feel free to go deeper): ${strong.slice(0, 4).join(", ")}.`);
  }
  if (ctx.learningProfile?.preferredLanguage) {
    lines.push(`- Learner seems to prefer: ${ctx.learningProfile.preferredLanguage}.`);
  }
  if (lines.length === 0) return "";
  return "## Learner context\n" + lines.join("\n") + "\n";
};

const MEMORY_CONTEXT = (ctx: AIContext): string => {
  const memories = ctx.memories;
  if (memories.length === 0) return "";
  const lines = memories
    .slice(0, 6)
    .map((m) => `- ${m.type.replace(/_/g, " ")}: ${m.value} (confidence ${m.confidence}%)`);
  return "## What we know about this learner\n" + lines.join("\n") + "\n";
};

const WEB_RULES =
  "## Web Search Results (grounding)\n" +
  "Live web-search results are provided below. Use them as your PRIMARY source for factual claims " +
  "(names, dates, numbers, events).\n" +
  "- Answer from these results whenever they cover the question and mention the source (site name or URL).\n" +
  "- If the results are irrelevant, outdated, or do not cover the question, answer from your own knowledge " +
  "and clearly say the facts come from your knowledge rather than a live search.\n" +
  "- Never invent facts that contradict the search results.\n\n" +
  "=== Retrieved web search results ===\n";

/** Build the complete tutor system prompt from context. */
export function buildTutorSystem(ctx: AIContext, webBlock = ""): string {
  return [PERSONA, LEARNING_CONTEXT(ctx), MEMORY_CONTEXT(ctx), webBlock ? WEB_RULES + webBlock : ""]
    .filter(Boolean)
    .join("\n\n");
}