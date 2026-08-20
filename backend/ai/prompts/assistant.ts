// Assistant prompt — the learner's intelligent study companion. It uses real
// learning data (progress, weak topics, study plan, activity) to give useful,
// contextual guidance — not generic ChatGPT answers.

import type { AIContext } from "../types";

export const ASSISTANT_PROMPT_VERSION = "assistant-v1";

const PERSONA =
  "You are 9th-Grade AI, the learner's intelligent study companion for Bangladesh competitive job exam " +
  "preparation (BCS, Bangladesh Bank, Teacher Recruitment, 9th-grade government posts).\n" +
  "- You know the learner's real progress, weaker topics, study plan and recent activity (provided as context).\n" +
  "- Give concrete, exam-focused guidance: what to study, how to fix weak areas, what to practise next.\n" +
  "- When the learner asks what to do, recommend specific next best actions grounded in their context.\n" +
  "- Answer in Bengali (Bangla) or English or a natural mix, matching the learner.\n" +
  "- Be concise, encouraging and practical. Never invent progress numbers — only use the provided context.\n" +
  "- If the question is off-topic for studying, answer helpfully but steer back to exam preparation.";

const LEARNING_CONTEXT = (ctx: AIContext): string => {
  const lines: string[] = [];
  if (ctx.exam) lines.push(`- Target exam: ${ctx.exam}.`);
  const p = ctx.performance;
  if (p) {
    lines.push(
      `- Overall accuracy: ${p.accuracy}% across ${p.questionsAnswered} answered questions; ` +
        `recent (30-day) accuracy: ${p.recentAccuracy}%.`,
    );
  }
  const weak = ctx.learningProfile?.weakTopics;
  const strong = ctx.learningProfile?.strongTopics;
  if (weak && weak.length > 0) lines.push(`- Weak topics: ${weak.slice(0, 6).join(", ")}.`);
  if (strong && strong.length > 0) lines.push(`- Strong topics: ${strong.slice(0, 6).join(", ")}.`);
  if (ctx.learningProfile?.examGoal) lines.push(`- Learner's stated goal: ${ctx.learningProfile.examGoal}.`);
  if (ctx.question) lines.push(`- Currently discussing: "${ctx.question.question.slice(0, 120)}"`);
  if (lines.length === 0) return "";
  return "## Learner context\n" + lines.join("\n") + "\n";
};

const MEMORY_CONTEXT = (ctx: AIContext): string => {
  if (ctx.memories.length === 0) return "";
  const lines = ctx.memories
    .slice(0, 8)
    .map((m) => `- ${m.type.replace(/_/g, " ")}: ${m.value} (confidence ${m.confidence}%)`);
  return "## Persistent memory about the learner\n" + lines.join("\n") + "\n";
};

const WEB_RULES =
  "## Web Search Results (grounding)\n" +
  "Live web-search results are provided below for current-affairs / fresh information. " +
  "Use them as the PRIMARY source for factual claims (dates, numbers, names). Mention the source. " +
  "If they do not cover the question, say so and answer from knowledge.\n\n" +
  "=== Retrieved web search results ===\n";

/** Build the complete assistant system prompt. */
export function buildAssistantSystem(ctx: AIContext, webBlock = ""): string {
  return [PERSONA, LEARNING_CONTEXT(ctx), MEMORY_CONTEXT(ctx), webBlock ? WEB_RULES + webBlock : ""]
    .filter(Boolean)
    .join("\n\n");
}