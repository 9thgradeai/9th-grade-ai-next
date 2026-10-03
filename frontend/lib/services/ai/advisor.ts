import { aiJsonWithMeta } from "./client";
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
  const { data, meta } = await aiJsonWithMeta<AdvisorPlanDto>("/api/ai/advisor", "POST", opts);
  return { ...data, source: data.source || meta.source || "ai", model: meta.model || undefined };
}
