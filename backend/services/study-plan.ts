// backend/services/study-plan.ts — server-side study-plan operations.
//
// The seeded plan is a shared template of `StudyPlanDay` + `StudyTask` rows;
// per-user state is a `StudyTaskCompletion` join (see schema). User-created
// tasks carry a `userId` and live next to the template rows for that day.

import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "~backend/db";
import { ValidationError } from "~backend/errors";
import type { StudyTaskDTO } from "@/lib/types";

/** Bengali weekday names (index = Date#getDay()). */
export const BENGALI_WEEKDAYS = [
  "রবিবার",
  "সোমবার",
  "মঙ্গলবার",
  "বুধবার",
  "বৃহস্পতিবার",
  "শুক্রবার",
  "শনিবার",
] as const;

/** Bengali weekday name for the given date (defaults to now, local time). */
export function todayBengaliName(now: Date = new Date()): string {
  return BENGALI_WEEKDAYS[now.getDay()];
}

export type CreateStudyTaskInput = {
  title: string;
  subject?: string;
  day: string;
  duration?: number;
  priority?: "low" | "medium" | "high";
  description?: string;
};

const PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);
const MAX_DURATION = 480; // 8 hour cap
const MAX_TITLE = 200;

/**
 * Create a real, per-user study task for today (or a given Bengali weekday).
 * Task creation is scoped to the authenticated user; template rows are never
 * mutated.
 */
export async function createStudyTask(
  userId: string,
  raw: unknown,
): Promise<StudyTaskDTO> {
  const input = (raw && typeof raw === "object" ? raw : {}) as CreateStudyTaskInput;
  const title = typeof input.title === "string" ? input.title.trim().slice(0, MAX_TITLE) : "";
  if (!title) throw new ValidationError("title is required.");

  const day = typeof input.day === "string" ? input.day.trim() : "";
  if (!(BENGALI_WEEKDAYS as readonly string[]).includes(day)) {
    throw new ValidationError(`day must be one of: ${BENGALI_WEEKDAYS.join(", ")}.`);
  }

  const subject = typeof input.subject === "string" ? input.subject.trim().slice(0, 60) : "";
  const duration = Number.isFinite(Number(input.duration))
    ? Math.min(MAX_DURATION, Math.max(1, Math.floor(Number(input.duration))))
    : 20;
  const priorityRaw = typeof input.priority === "string" ? input.priority.toUpperCase() : "MEDIUM";
  const priority = PRIORITIES.has(priorityRaw) ? priorityRaw : "MEDIUM";
  const description =
    typeof input.description === "string" ? input.description.trim().slice(0, 300) : "";

  const date = new Date().toISOString().slice(0, 10);
  const sourceKey = createHash("md5").update(`${day}|${date}`).digest("hex");

  let dayRow = await prisma.studyPlanDay.findUnique({
    where: { sourceKey },
    select: { id: true, day: true, date: true },
  });
  if (!dayRow) {
    dayRow = await prisma.studyPlanDay.create({
      data: { day, date, sourceKey, focusAreas: [], totalMinutes: duration },
      select: { id: true, day: true, date: true },
    });
  }

  const task = await prisma.studyTask.create({
    data: {
      dayId: dayRow.id,
      userId,
      title,
      subject,
      duration,
      priority: priority as "LOW" | "MEDIUM" | "HIGH",
      description,
    },
    select: {
      id: true,
      dayId: true,
      title: true,
      subject: true,
      duration: true,
      priority: true,
      description: true,
    },
  });

  return {
    id: task.id,
    dayId: dayRow.id,
    day: dayRow.day,
    date: dayRow.date,
    title: task.title,
    subject: task.subject,
    duration: task.duration,
    priority: task.priority.toLowerCase() as "high" | "medium" | "low",
    description: task.description,
    completed: false,
  };
}