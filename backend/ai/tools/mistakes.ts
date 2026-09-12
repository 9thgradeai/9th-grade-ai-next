// Tool: analyze_my_mistakes — reads the learner's real wrong-answer evidence
// through the deterministic mistake-pattern analyzer (application layer).
// The model interprets the derived patterns; it never invents labels.

import "server-only";

import { analyzeMistakePatterns } from "../analysis/mistakes";
import type { ToolContext, ToolDefinition, ToolResult } from "./types";

export const analyzeMyMistakes: ToolDefinition = {
  name: "analyze_my_mistakes",
  description:
    "Analyze the learner's recent mistake patterns over the last 30 days: repeated same-topic errors, carelessness, guessing, memory failures, time pressure — each with plain-language advice. Returns empty when evidence is insufficient. No arguments.",
  inputShape: "{}",
  validateInput(raw) {
    return raw && typeof raw === "object" ? {} : {};
  },
  async execute(ctx: ToolContext): Promise<ToolResult> {
    const { patterns, recentWrongCount } = await analyzeMistakePatterns(ctx.userId);
    const summary =
      patterns.length > 0
        ? patterns
            .map((p) => `${p.label}${p.topic ? ` ("${p.topic}")` : ""} x${p.count}`)
            .join("; ")
        : recentWrongCount === 0
          ? "No wrong answers in the last 30 days."
          : `Only ${recentWrongCount} recent wrong answers — not enough evidence for a reliable pattern yet.`;
    return {
      summary,
      data: { patterns, recentWrongCount },
    };
  },
};