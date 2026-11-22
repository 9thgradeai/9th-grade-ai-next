// backend/services/adaptive-exam/subject-specialist.ts
// Module 8b of Adaptive Exam V2.0: SubjectSpecialistService.
//
// Provides per-subject generation guidance and the supported-subject list.
// Instructions only — never an answer authority.

import "server-only";

import type {
  SubjectSpecialistService,
} from "./contracts";

const SUPPORTED_BY_PROFILE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  BCS_PRELIMINARY: Object.freeze([
    "bcs.bangla", "bcs.english", "bcs.bangladesh", "bcs.international",
    "bcs.geography", "bcs.science", "bcs.computer", "bcs.math",
    "bcs.mental", "bcs.ethics",
  ]),
  BB_SENIOR_OFFICER_GENERAL: Object.freeze([
    "bank.english", "bank.bangla", "bank.math", "bank.financial",
    "bank.analytical", "bank.ict",
  ]),
});

export function createSubjectSpecialistService(): SubjectSpecialistService {
  return {
    instructions(subjectId, language, difficulty, profileId) {
      const lang = language === "bn" ? "Bangla" : "English";
      return [
        `Subject: ${subjectId}`,
        `Profile: ${profileId}`,
        `Language: ${lang}`,
        `Difficulty target: ${difficulty}`,
        "Generate exactly one MCQ with four options A-D and one correct answer.",
        "Do not reveal the answer in the stem; keep the explanation separate.",
        "Stay within the subject's syllabus scope; do not invent facts.",
      ].join(" | ");
    },
    supportedSubjects(profileId) {
      return [...(SUPPORTED_BY_PROFILE[profileId] ?? [])];
    },
  };
}
