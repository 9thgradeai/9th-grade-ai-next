// backend/services/adaptive-exam/question-generation.ts
// Module 8c of Adaptive Exam V2.0: QuestionGenerationService.
//
// Fills declared shortfalls through AiGenerationPort in 5–10 question batches.
// Every generated answer must pass independent verification and the global
// duplicate gate before an answer-key entry is produced. No "A" or zero-score
// fallback exists in this module.

import "server-only";

import type {
  AdaptiveExecutionContext,
  AnswerVerificationPort,
  CandidatePaperQuestion,
  ExamProfile,
  GenerationTelemetry,
  GlobalDuplicateService,
  OptionKey,
  QuestionGenerationService,
  QuestionIdentityService,
  SelectedQuestion,
  SubjectSpecialistService,
  SecureAnswerKeyEntry,
} from "./contracts";
import { adaptiveError } from "./errors";
import { conceptKey } from "./question-identity";

export type CreateQuestionGenerationServiceOptions = Readonly<{
  identity: QuestionIdentityService;
  duplicateGate: GlobalDuplicateService;
  verification: AnswerVerificationPort;
  batchSize?: number;
  maxRepairAttempts?: number;
}>;

type GeneratedQuestion = {
  questionText: string;
  options: CandidatePaperQuestion["options"];
  correctOption: OptionKey;
  explanation: string;
  topicPath: string;
  subtopicPath?: string;
  difficulty: CandidatePaperQuestion["difficulty"];
  provenance: CandidatePaperQuestion["provenance"];
};

type Assembly = {
  candidateQuestions: CandidatePaperQuestion[];
  answerKeyEntries: SecureAnswerKeyEntry[];
  telemetry: GenerationTelemetry[];
};

export function createQuestionGenerationService(
  options: CreateQuestionGenerationServiceOptions,
): QuestionGenerationService {
  const batchSize = Math.min(10, Math.max(5, options.batchSize ?? 5));
  const maxAttempts = options.maxRepairAttempts ?? 2;

  function fail(message: string, metadata: Record<string, unknown> = {}): never {
    throw adaptiveError("ADAPTIVE_VALIDATION_FAILED", message, {
      stage: "generation",
      requestId: "question-generation",
      metadata,
    });
  }

  async function assemble(
    selected: SelectedQuestion[],
    profile: ExamProfile,
    specialists: SubjectSpecialistService,
    ctx: AdaptiveExecutionContext,
    revisionMode: boolean,
  ): Promise<Assembly> {
    const candidateQuestions: CandidatePaperQuestion[] = [];
    const answerKeyEntries: SecureAnswerKeyEntry[] = [];
    const telemetry: GenerationTelemetry[] = [];
    const currentPaperFingerprints = new Set<string>();
    const currentPaperConcepts: string[] = [];

    function remember(
      text: string,
      opts: CandidatePaperQuestion["options"],
      subjectId: string,
      topicPath: string,
    ): string {
      const fp = options.identity.fingerprint(text, opts);
      currentPaperFingerprints.add(fp.exactHash);
      currentPaperFingerprints.add(fp.nearHash);
      currentPaperFingerprints.add(fp.templateHash);
      currentPaperConcepts.push(conceptKey(text, subjectId, topicPath));
      return fp.fingerprint;
    }

    for (const item of selected.filter((entry) => entry.sourceType === "PYQ")) {
      const record = item.record;
      if (!record || !record.verifiedAnswer) {
        fail("Verified PYQ answer is missing; refusing to guess an answer.", {
          subjectId: item.subjectId,
          topicPath: item.topicPath,
        });
      }
      const fp = options.identity.fingerprint(record.normalizedText, record.options);
      const decision = await options.duplicateGate.check({
        questionText: record.normalizedText,
        options: record.options,
        profileId: profile.id,
        subjectId: item.subjectId,
        topicPath: item.topicPath,
        revisionMode,
        currentPaperFingerprints,
        conceptKey: conceptKey(record.normalizedText, item.subjectId, item.topicPath),
        currentPaperConcepts,
      });
      if (!decision.accepted) {
        fail(`PYQ rejected by duplicate gate: ${decision.reason}`, { subjectId: item.subjectId });
      }
      remember(record.normalizedText, record.options, item.subjectId, item.topicPath);
      const subjectName = profile.subjects.find((subject) => subject.subjectId === item.subjectId)?.nameEn ?? item.subjectId;
      candidateQuestions.push({
        position: item.position,
        questionId: record.id,
        sourceType: "PYQ",
        subjectId: item.subjectId,
        subjectName,
        topicPath: record.topicPath,
        ...(record.subtopicPath ? { subtopicPath: record.subtopicPath } : {}),
        language: item.language,
        difficulty: item.difficulty,
        questionText: record.normalizedText,
        options: record.options,
        provenance: record.provenance,
        marks: profile.scoring.marksPerQuestion,
      });
      answerKeyEntries.push({
        position: item.position,
        correctOption: record.verifiedAnswer,
        explanation: record.explanation ?? "",
      });
      await options.duplicateGate.record({
        fingerprint: fp,
        profileId: profile.id,
        subjectId: item.subjectId,
        topicPath: item.topicPath,
        source: "PYQ",
        visibility: "PRIVATE",
        ownerId: ctx.userId,
      });
    }

    const originalItems = selected.filter((entry) => entry.sourceType === "ORIGINAL");
    const groups = new Map<string, SelectedQuestion[]>();
    for (const item of originalItems) {
      const key = [item.subjectId, item.language, item.difficulty, item.topicPath, item.subtopicPath ?? ""].join("|");
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      for (let offset = 0; offset < group.length; offset += batchSize) {
        const chunk = group.slice(offset, offset + batchSize);
        const first = chunk[0];
        const instructions = specialists.instructions(first.subjectId, first.language, first.difficulty, profile.id);
        const result = await ctx.ports.ai.generate({
          profileId: profile.id,
          profileVersion: profile.version,
          subjectId: first.subjectId,
          topicPath: first.topicPath,
          ...(first.subtopicPath ? { subtopicPath: first.subtopicPath } : {}),
          language: first.language,
          difficulty: first.difficulty,
          // A short final chunk still uses a compliant batch; unused output is discarded.
          count: Math.max(batchSize, chunk.length),
          sourceType: "ORIGINAL",
          instructions,
          requestId: ctx.requestId,
          userId: ctx.userId,
        });
        telemetry.push({
          provider: result.provider,
          model: result.model,
          promptVersion: result.promptVersion,
          mock: result.questions.some((question) => question.provenance.generation?.mock === true),
          batches: 1,
          questions: chunk.length,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd: result.usage.costUsd,
          durationMs: result.durationMs,
        });

        for (let index = 0; index < chunk.length; index += 1) {
          const item = chunk[index];
          const subjectName = profile.subjects.find((subject) => subject.subjectId === item.subjectId)?.nameEn ?? item.subjectId;
          let chosen: GeneratedQuestion | null = null;
          let verifiedOption: OptionKey | null = null;

          for (let attempt = 0; attempt < maxAttempts && !chosen; attempt += 1) {
            const candidate = result.questions[index + attempt];
            if (!candidate) break;
            const duplicate = await options.duplicateGate.check({
              questionText: candidate.questionText,
              options: candidate.options,
              profileId: profile.id,
              subjectId: item.subjectId,
              topicPath: item.topicPath,
              revisionMode: false,
              currentPaperFingerprints,
              conceptKey: conceptKey(candidate.questionText, item.subjectId, item.topicPath),
              currentPaperConcepts,
            });
            if (!duplicate.accepted) continue;
            const verification = await options.verification.verify({
              questionText: candidate.questionText,
              options: candidate.options,
              claimedOption: candidate.correctOption,
              language: item.language,
              subjectId: item.subjectId,
              topicPath: item.topicPath,
              profileId: profile.id,
              evidence: candidate.provenance.sourceUrl
                ? [{ url: candidate.provenance.sourceUrl, publishedAt: candidate.provenance.publishedAt }]
                : undefined,
            });
            if (!verification.accepted || !verification.correctOption) continue;
            chosen = candidate;
            verifiedOption = verification.correctOption;
          }

          if (!chosen || !verifiedOption) {
            fail("Generated question failed independent verification or duplicate checks.", {
              subjectId: item.subjectId,
              topicPath: item.topicPath,
              position: item.position,
            });
          }

          const questionFp = options.identity.fingerprint(chosen.questionText, chosen.options);
          remember(chosen.questionText, chosen.options, item.subjectId, item.topicPath);
          candidateQuestions.push({
            position: item.position,
            sourceType: "ORIGINAL",
            subjectId: item.subjectId,
            subjectName,
            topicPath: chosen.topicPath,
            ...(chosen.subtopicPath ? { subtopicPath: chosen.subtopicPath } : {}),
            language: item.language,
            difficulty: item.difficulty,
            questionText: chosen.questionText,
            options: chosen.options,
            provenance: chosen.provenance,
            marks: profile.scoring.marksPerQuestion,
          });
          answerKeyEntries.push({
            position: item.position,
            correctOption: verifiedOption,
            explanation: chosen.explanation,
          });
          await options.duplicateGate.record({
            fingerprint: questionFp,
            profileId: profile.id,
            subjectId: item.subjectId,
            topicPath: item.topicPath,
            source: "GENERATED",
            visibility: "PRIVATE",
            ownerId: ctx.userId,
          });
        }
      }
    }

    candidateQuestions.sort((a, b) => a.position - b.position);
    answerKeyEntries.sort((a, b) => a.position - b.position);
    return { candidateQuestions, answerKeyEntries, telemetry };
  }

  return {
    maxRepairAttempts() {
      return maxAttempts;
    },

    async generate(selected, profile, specialists, ctx) {
      return (await assemble(selected, profile, specialists, ctx, false)).candidateQuestions;
    },

    async generateWithKeys(selected, profile, specialists, ctx) {
      const revisionMode = selected.some((item) => item.sourceType === "PYQ_DERIVED");
      return assemble(selected, profile, specialists, ctx, revisionMode);
    },
  };
}
