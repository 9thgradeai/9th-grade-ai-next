"use client";

import { aiJson } from "./client";
import type { StudentModelDto } from "./types";

/** Fetch the learner's long-term profile (goals, weak/strong topics, usage). */
export async function getStudentModel(): Promise<StudentModelDto> {
  return aiJson<StudentModelDto>("/api/ai/student-model", "GET");
}
