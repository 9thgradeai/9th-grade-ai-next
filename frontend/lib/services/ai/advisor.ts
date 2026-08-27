"use client";

import { aiJson } from "./client";
import type { AdvisorPlanDto } from "./types";

export type AdvisorOptions = {
  education?: string;
  interests?: string;
  targetExam?: string;
  weeklyHours?: number;
  examDate?: string;
};

/** Get a personalized exam-target recommendation + study plan. */
export async function getCareerAdvice(opts: AdvisorOptions): Promise<AdvisorPlanDto> {
  return aiJson<AdvisorPlanDto>("/api/ai/advisor", "POST", opts);
}
