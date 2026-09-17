// Planner tool — the deterministic "next best action" derived from real data.
// Deterministic on purpose: this recommendation feeds the AI coach and must
// stay reproducible, auditable, and independent of any LLM caprice.

import "server-only";

import { prisma } from "~backend/db";
import { getWeakTopics } from "~backend/services/analytics";
import { findUserById } from "~backend/services/user";
import { getOverallStatsForUser } from "~backend/services/question-progress";
import type { ToolContext, ToolDefinition, ToolResult } from "./types";

export const recommendNextAction: ToolDefinition = {
  name: "recommend_next_action",
  description:
    "Deterministic next-best-action recommendation: whether to start practice, revise weak topics, tackle mistakes, or take a mock exam — based on the learner's real progress. No arguments.",
  inputShape: "{}",
  validateInput(raw) {
    return raw && typeof raw === "object" ? {} : {};
  },
  async execute(ctx: ToolContext): Promise<ToolResult> {
    const [user, stats, weak, mistakes] = await Promise.all([
      findUserById(ctx.userId),
      getOverallStatsForUser(ctx.userId),
      getWeakTopics(ctx.userId, { minAttempts: 2, limit: 5 }),
      prisma.userQuestionProgress.count({ where: { userId: ctx.userId, isMistake: true } }),
    ]);

    const freshStart = stats.questionsAttempted === 0 && mistakes === 0;
    if (freshStart) {
      return {
        summary:
          "Fresh start: begin with the question bank practice tab and attempt questions on your target exam's subjects.",
        action: {
          type: "open_tab",
          label: "Start practicing",
          params: { tab: "practice", reason: "fresh_start" },
        },
        data: { action: "practice", reason: "fresh_start" },
      };
    }

    if (mistakes > 0) {
      const worst = weak[0];
      const subject = worst?.subject ?? "";
      return {
        summary:
          `${mistakes} questions in the mistake notebook. Practice them now (${subject ? `weakest: ${subject}` : "any subject"}) — mistakes are the highest-leverage learning target.`,
        action: {
          type: "practice",
          label: `Practice ${mistakes} mistakes`,
          params: { questions: Math.min(mistakes, 20), reason: "mistakes", subject },
        },
        data: { action: "practice", reason: "mistakes", count: mistakes, subject },
      };
    }

    if (weak.length > 0) {
      const t = weak[0];
      return {
        summary: `Weak topic "${t.topic}" (${t.attempted} attempts, ${t.score}% accuracy). Run a targeted practice session on it.`,
        action: {
          type: "open_tab",
          label: `Practice ${t.topic}`,
          params: { tab: "practice", reason: "weak_topic", topic: t.topic },
        },
        data: { action: "practice", reason: "weak_topic", topic: t.topic, accuracy: t.score },
      };
    }

    if (user?.examDate && new Date(user.examDate) < new Date(Date.now() + 7 * 86400_000)) {
      return {
        summary: "Exam is within a week — take a mock exam to benchmark readiness.",
        action: { type: "open_tab", label: "Take a mock exam", params: { tab: "exam", reason: "exam_soon" } },
        data: { action: "mock_exam", reason: "exam_soon" },
      };
    }

    return {
      summary: "Keep the streak alive — next practice session is the best move.",
      action: { type: "open_tab", label: "Continue practicing", params: { tab: "practice", reason: "steady" } },
      data: { action: "practice", reason: "steady" },
    };
  },
};