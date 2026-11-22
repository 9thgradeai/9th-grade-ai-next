// backend/services/adaptive-exam/question-generation.ts
// Module 8c of Adaptive Exam V2.0: QuestionGenerationService.
//
// Fills declared shortfalls through AiGenerationPort. Bounded repair attempts;
// every generated question carries full provenance. Never an answer authority.

import "server-only";

import type {
  CandidatePaperQuestion,
  QuestionGenerationService,
} from "./contracts";

export type CreateQuestionGenerationServiceOptions = Readonly<{
  maxRepairAttempts?: number;
}>;

export function createQuestionGenerationService(
  options: CreateQuestionGenerationServiceOptions = {},
): QuestionGenerationService {
  const maxAttempts = options.maxRepairAttempts ?? 2;

  return {
    maxRepairAttempts() {
      return maxAttempts;
    },

    async generate(selected, profile, specialists, ctx) {
      const generated: CandidatePaperQuestion[] = [];
      for (const item of selected) {
        if (item.sourceType !== "ORIGINAL") continue;
        const specialist = specialists;
        const instructions = specialist.instructions(
          item.subjectId,
          item.language,
          item.difficulty,
          profile.id,
        );
        const port = ctx.ports.ai;
        const result = await port.generate({
          profileId: profile.id,
          profileVersion: profile.version,
          subjectId: item.subjectId,
          topicPath: item.topicPath,
          language: item.language,
          difficulty: item.difficulty,
          count: 1,
          sourceType: "ORIGINAL",
          instructions,
          requestId: ctx.requestId,
        });
        const subjectName = profile.subjects.find((subject) => subject.subjectId === item.subjectId)?.nameEn ?? item.subjectId;
        for (const question of result.questions) {
          generated.push({
            position: item.position,
            questionId: undefined,
            subjectId: item.subjectId,
            subjectName,
            topicPath: item.topicPath,
            ...(item.subtopicPath ? { subtopicPath: item.subtopicPath } : {}),
            language: item.language,
            difficulty: item.difficulty,
            questionText: question.questionText,
            options: question.options,
            provenance: question.provenance,
            marks: 1,
            sourceType: "ORIGINAL",
          });
        }
      }
      return generated;
    },
  };
}
