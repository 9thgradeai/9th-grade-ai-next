// Session-builder tools — turn the learner's REAL mistake pool into an
// actionable practice session / mock exam (Phase 3).
//
// These tools deliberately reuse the same selection + scoring the dashboard
// mistake-exam builder uses (getMistakeQuestionIdsBySelection /
// getCrossSubjectMistakeIds / scoreMistakeQuestions), so the AI-recommended
// session matches what a human-configured session would produce. They return
// only question IDs + counts — never the full question payload — and the agent
// loop injects those IDs into the emitted practice/mock_exam action so the
// frontend can start the drill without the LLM guessing question sets.

import "server-only";

import {
  getMistakeQuestionIdsBySelectionForUser,
  getCrossSubjectMistakeIdsForUser,
  scoreMistakeQuestions,
} from "~backend/services/question-progress";
import { clamp, posInt, str, type ToolContext, type ToolDefinition, type ToolResult } from "./types";

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];
const FOCUSES = ["weakest_topics", "most_wrong", "recently_wrong", "due_for_review"];

function optEnum(value: string, allowed: string[]): string {
  return allowed.includes(value) ? value : "";
}

export const createPracticeSession: ToolDefinition = {
  name: "create_practice_session",
  description:
    "Build a practice session from the learner's own unmastered mistakes. Returns the question ids it selected so the learner can start drilling immediately. Arguments: subject (optional Bangla/English name), topic (optional), difficulty (optional EASY|MEDIUM|HARD), focus (optional weakest_topics|most_wrong|recently_wrong|due_for_review), count (default 10, max 20).",
  inputShape:
    '{"subject": "বাংলা", "topic": "ইতিহাস", "difficulty": "HARD", "focus": "weakest_topics", "count": 10}',
  validateInput(raw) {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const subject = str(args, "subject");
    const topic = str(args, "topic");
    return {
      subject,
      topic,
      difficulty: optEnum(str(args, "difficulty").toUpperCase(), DIFFICULTIES),
      focus: optEnum(str(args, "focus"), FOCUSES),
      count: clamp(posInt(args, "count", 10) ?? 10, 1, 20),
    };
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const count = args.count as number;
    const subject = (args.subject as string) || undefined;
    const topic = (args.topic as string) || undefined;
    const difficulty = (args.difficulty as string) || undefined;
    const focus = (args.focus as string) || undefined;

    const rows = await getMistakeQuestionIdsBySelectionForUser(
      ctx.userId,
      { subject, topic, difficulty },
      count,
      focus,
    );
    const ids = scoreMistakeQuestions(rows)
      .slice(0, count)
      .map((s) => s.questionId);

    if (ids.length === 0) {
      return {
        ok: false,
        summary: "No unmastered mistakes match those filters — no practice session could be built.",
        data: { questionIds: [], count: 0, reason: "empty_pool" },
      };
    }
    return {
      summary: `Practice session ready with ${ids.length} question(s) from your own mistakes${subject ? ` (${subject})` : ""}${topic ? ` / ${topic}` : ""} — weakest mastery first.`,
      data: { questionIds: ids, count: ids.length, subject, topic, difficulty, focus, reason: "agent_session" },
      action: {
        type: "practice",
        label: `Practice ${ids.length} questions`,
        params: { questionIds: ids, reason: "agent_session" },
      },
    };
  },
};

export const createMockExam: ToolDefinition = {
  name: "create_mock_exam",
  description:
    "Build a mock-exam session from the learner's unmastered mistake pool — cross-subject by default so it reads like a real exam paper. Returns question ids + count so the learner can start immediately. Arguments: subject (optional, to focus one subject), difficulty (optional EASY|MEDIUM|HARD), count (default 20, max 30).",
  inputShape: '{"subject": "বাংলা", "difficulty": "MEDIUM", "count": 20}',
  validateInput(raw) {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      subject: str(args, "subject"),
      difficulty: optEnum(str(args, "difficulty").toUpperCase(), DIFFICULTIES),
      count: clamp(posInt(args, "count", 20) ?? 20, 1, 30),
    };
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const count = args.count as number;
    const subject = (args.subject as string) || undefined;
    const difficulty = (args.difficulty as string) || undefined;

    let ids: number[];
    if (subject) {
      const rows = await getMistakeQuestionIdsBySelectionForUser(
        ctx.userId,
        { subject, difficulty },
        count,
        "weakest_topics",
      );
      ids = scoreMistakeQuestions(rows)
        .slice(0, count)
        .map((s) => s.questionId);
    } else {
      ids = await getCrossSubjectMistakeIdsForUser(ctx.userId, count);
    }

    if (ids.length === 0) {
      return {
        ok: false,
        summary: "No unmastered mistakes available to build a mock exam.",
        data: { questionIds: [], count: 0, reason: "empty_pool" },
      };
    }
    return {
      summary: `Mock exam ready with ${ids.length} question(s) drawn from your own mistakes${subject ? ` (${subject})` : " across subjects"}.`,
      data: { questionIds: ids.slice(0, count), count: ids.length, subject, difficulty, reason: "agent_session" },
      action: {
        type: "mock_exam",
        label: `Take a ${ids.length}-question mock exam`,
        params: { questionIds: ids.slice(0, count), reason: "agent_session" },
      },
    };
  },
};