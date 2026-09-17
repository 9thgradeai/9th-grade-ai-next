// Tool: create_study_task — writes a REAL task into the learner's study plan.
// The plan row is created by the application service; the LLM only supplies
// validated, whitelisted arguments (title, subject, Bengali weekday, minutes,
// priority). Action is surfaced so the learner can jump to the plan.

import "server-only";

import { createStudyTask, BENGALI_WEEKDAYS } from "~backend/services/study-plan";
import { clamp, str, type ToolContext, type ToolDefinition, type ToolResult } from "./types";

export const createStudyTaskTool: ToolDefinition = {
  name: "create_study_task",
  description:
    `Add a task to the learner's study plan. Provide a title, an optional subject, the day as a Bengali weekday (one of: ${BENGALI_WEEKDAYS.join(", ")}), duration in minutes (default 20), and priority (low|medium|high, default medium).`,
  inputShape: '{"title": "...", "subject": "...", "day": "সোমবার", "duration": 20, "priority": "medium"}',
  validateInput(raw) {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      title: str(args, "title", "", 200),
      subject: str(args, "subject", "", 60),
      day: str(args, "day", "", 30),
      duration: clamp(Number(args.duration) || 20, 1, 480),
      priority: (["low", "medium", "high"] as const).includes(args.priority as "low")
        ? (args.priority as string)
        : "medium",
    };
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const task = await createStudyTask(ctx.userId, {
      title: args.title as string,
      subject: args.subject as string,
      day: args.day as string,
      duration: args.duration as number,
      priority: args.priority as "low" | "medium" | "high",
    });
    return {
      summary: `Added "${task.title}" to ${task.day}'s plan (${task.duration} min, ${task.priority} priority).`,
      data: { task },
      action: { type: "open_study_plan", label: "আজকের প্ল্যানে যাও" },
    };
  },
};