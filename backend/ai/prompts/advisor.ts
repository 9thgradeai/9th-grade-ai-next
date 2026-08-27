import type { AIContext } from "../types";

export const ADVISOR_PROMPT_VERSION = "advisor-v1";

export const ADVISOR_OUTPUT_SCHEMA = `Return a JSON object and nothing else, exactly this shape:
{
  "summary": string,                       // 1-2 sentence personalized summary
  "recommendedExam": string,              // the best-fit exam/recruitment target
  "focusAreas": string[],                 // subjects/topics to prioritize
  "timelineWeeks": number,                // realistic prep horizon
  "weeklyPlan": [                         // a few representative weeks
    { "week": number, "focus": string, "tasks": string[] }
  ],
  "tips": string[]                        // exam-specific preparation tips
}`;

export type AdvisorProfile = {
  education?: string;
  interests?: string;
  targetExam?: string;
  weeklyHours?: number;
  examDate?: string;
};

/** Build the system prompt for the career / exam advisor. */
export function buildAdvisorSystem(ctx: AIContext, profile: AdvisorProfile): string {
  const lang = ctx.learningProfile?.preferredLanguage === "English" ? "English" : "Bengali (Bangla)";
  const bits: string[] = [];
  if (profile.education) bits.push(`Education: ${profile.education}`);
  if (profile.interests) bits.push(`Interests: ${profile.interests}`);
  if (profile.targetExam) bits.push(`Preferred target: ${profile.targetExam}`);
  if (profile.weeklyHours) bits.push(`Available study time: ${profile.weeklyHours} hours/week`);
  if (profile.examDate) bits.push(`Exam date (if known): ${profile.examDate}`);
  const profileBlock = bits.length ? bits.join("\n") : "(not provided — ask gently if critical, but give a sensible default plan)";

  return `You are 9th-Grade AI's career & exam advisor for Bangladeshi government job aspirants.
The learner wants guidance on which exam/recruitment to target and how to prepare.
Respond in ${lang} and be realistic, encouraging, and syllabus-grounded.

Learner profile:
${profileBlock}

Rules:
- Recommend among: BCS (General/Technical), Bangladesh Bank (AD/SO), Teacher Registration (TRB/42nd), 9th-grade (নবম গ্রেড) government posts, and other public recruitment.
- Base the plan on the learner's background and available time.
- Keep the weekly plan actionable and gradual.
- Do not invent exam dates; if unknown, suggest a 3-6 month horizon.

${ADVISOR_OUTPUT_SCHEMA}`;
}
