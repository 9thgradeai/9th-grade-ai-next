// Tools answering "who is this learner": profile and goals.

import "server-only";

import { findUserById } from "~backend/services/user";
import { getOverallStatsForUser } from "~backend/services/question-progress";
import type { ToolContext, ToolDefinition, ToolResult } from "./types";

type ProfileKind = "profile" | "goals";

function buildProfileTool(kind: ProfileKind): ToolDefinition {
  return {
    name: kind === "profile" ? "get_my_profile" : "get_my_goals",
    description:
      kind === "profile"
        ? "Summary of the learner profile: name, progress points, streak-ready stats, overall accuracy and questions answered. No arguments."
        : "The learner's stated exam goal: target exam, exam date, preparation level, study hours per day, and written goal. No arguments.",
    inputShape: "{}",
    validateInput(raw) {
      return raw && typeof raw === "object" ? {} : {};
    },
    async execute(ctx: ToolContext): Promise<ToolResult> {
      const [user, stats] = await Promise.all([
        findUserById(ctx.userId),
        getOverallStatsForUser(ctx.userId),
      ]);
      if (!user) return { ok: false, summary: "Profile not found for this learner." };
      if (kind === "profile") {
        const accuracy = stats.questionsAttempted > 0 ? Math.round(stats.accuracy) : 0;
        return {
          summary:
            `Learner ${user.name}: questions answered ${stats.questionsAttempted}, ` +
            `accuracy ${accuracy}% (${stats.totalCorrect}/${stats.totalAttempts} attempts).`,
          data: {
            name: user.name,
            handle: user.handle,
            accuracy,
            questionsAttempted: stats.questionsAttempted,
            totalAttempts: stats.totalAttempts,
            totalCorrect: stats.totalCorrect,
          },
        };
      }
      return {
        summary: [
          user.examTarget && `Target exam: ${user.examTarget}`,
          user.examDate && `Exam date: ${user.examDate}`,
          user.prepLevel && `Prep level: ${user.prepLevel}`,
          user.studyHoursPerDay && `Study hours/day: ${user.studyHoursPerDay}`,
          user.goal && `Goal: ${user.goal}`,
        ]
          .filter(Boolean)
          .join("; ") || "No exam goal set yet.",
        data: {
          examTarget: user.examTarget ?? "",
          examDate: user.examDate ?? "",
          prepLevel: user.prepLevel ?? "",
          studyHoursPerDay: user.studyHoursPerDay ?? 0,
          goal: user.goal ?? "",
        },
      };
    },
  };
}

export const getMyProfile: ToolDefinition = buildProfileTool("profile");
export const getMyGoals: ToolDefinition = buildProfileTool("goals");