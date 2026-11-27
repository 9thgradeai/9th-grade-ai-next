// backend/services/adaptive-exam/exam-scoring.ts
// Module 9b of Adaptive Exam V2.0: ExamScoringService (pure, deterministic).
//
// Uses the profile's ScoringPolicy. All marks derived server-side from the
// immutable paper + secure key + submitted answers. Never trusts client marks.

import "server-only";

import type {
  DifficultyBand,
  ExamProfile,
  ExamScoringService,
  OptionKey,
  PerformanceSlice,
  QuestionSourceType,
  ScoreReport,
  SubmitAdaptiveExamCommand,
  SecureAnswerKey,
} from "./contracts";
import { adaptiveError } from "./errors";

const OPTION_KEYS: ReadonlySet<string> = new Set(["A", "B", "C", "D"]);

function emptySlice(subjectId?: string, topicPath?: string): PerformanceSlice {
  return {
    ...(subjectId ? { subjectId } : {}),
    ...(topicPath ? { topicPath } : {}),
    attempted: 0,
    correct: 0,
    wrong: 0,
    unanswered: 0,
    accuracy: 0,
  };
}

function finalizeSlice(slice: PerformanceSlice): PerformanceSlice {
  const answered = slice.correct + slice.wrong;
  return { ...slice, accuracy: answered > 0 ? slice.correct / answered : 0 };
}

export function createExamScoringService(): ExamScoringService {
  function fail(code: Parameters<typeof adaptiveError>[0], message: string): never {
    throw adaptiveError(code, message, { stage: "scoring", requestId: "exam-scoring" });
  }

  return {
    score(paper, key, profile, answers) {
      if (answers.paperId !== paper.id) {
        fail("ADAPTIVE_SUBMISSION_INVALID", "Submission paper does not match the immutable paper.");
      }
      if (key.paperId !== paper.id) {
        fail("ADAPTIVE_ANSWER_KEY_CORRUPT", "Answer key belongs to a different paper.");
      }
      if (key.contentHash !== paper.contentHash) {
        fail("ADAPTIVE_ANSWER_KEY_CORRUPT", "Answer key content hash does not match the paper.");
      }
      if (!Array.isArray(key.entries)) {
        fail("ADAPTIVE_ANSWER_KEY_CORRUPT", "Answer key entries are missing.");
      }

      const paperPositions = new Set(paper.questions.map((question) => question.position));
      const keyByPosition = new Map<number, SecureAnswerKey["entries"][number]>();
      for (const entry of key.entries) {
        if (!paperPositions.has(entry.position) || keyByPosition.has(entry.position)) {
          fail("ADAPTIVE_ANSWER_KEY_CORRUPT", "Answer key has duplicate or unknown positions.");
        }
        if (!OPTION_KEYS.has(entry.correctOption)) {
          fail("ADAPTIVE_ANSWER_KEY_CORRUPT", "Answer key contains an invalid option.");
        }
        keyByPosition.set(entry.position, entry);
      }
      if (keyByPosition.size !== paper.questions.length) {
        fail("ADAPTIVE_ANSWER_KEY_MISSING", "Answer key does not cover every question.");
      }

      const submitted: Record<number, OptionKey> = {};
      for (const answer of answers.answers ?? []) {
        if (!paperPositions.has(answer.position) || !OPTION_KEYS.has(answer.option)) {
          fail("ADAPTIVE_SUBMISSION_INVALID", "Submission contains an invalid answer.");
        }
        if (submitted[answer.position] !== undefined) {
          fail("ADAPTIVE_SUBMISSION_INVALID", "Submission contains duplicate answers.");
        }
        submitted[answer.position] = answer.option;
      }

      let correct = 0;
      let incorrect = 0;
      let unanswered = 0;
      let obtainedMarks = 0;
      const total = paper.questions.length;

      const subjectMap = new Map<string, PerformanceSlice>();
      const topicMap = new Map<string, PerformanceSlice>();
      const difficultyMap: Record<DifficultyBand, PerformanceSlice> = {
        EASY: emptySlice(),
        MEDIUM: emptySlice(),
        HARD: emptySlice(),
      };
      const sourceMap = new Map<QuestionSourceType, PerformanceSlice>();

      for (const question of paper.questions) {
        const position = question.position;
        const entry = keyByPosition.get(position);
        const correctOption = entry?.correctOption;
        const selected = submitted[position];
        const isUnanswered = !selected;
        if (isUnanswered) unanswered += 1;
        else if (selected === correctOption) correct += 1;
        else incorrect += 1;

        const marks = isUnanswered
          ? profile.scoring.marksForUnanswered
          : selected === correctOption
            ? profile.scoring.marksPerQuestion
            : profile.scoring.penaltyPerWrong;
        obtainedMarks += marks;

        // Slices.
        const subjectSlice = subjectMap.get(question.subjectId) ?? emptySlice(question.subjectId);
        subjectSlice.attempted += 1;
        if (isUnanswered) subjectSlice.unanswered += 1;
        else if (selected === correctOption) subjectSlice.correct += 1;
        else subjectSlice.wrong += 1;
        subjectMap.set(question.subjectId, subjectSlice);

        const topicSlice = topicMap.get(question.topicPath) ?? emptySlice(undefined, question.topicPath);
        topicSlice.attempted += 1;
        if (isUnanswered) topicSlice.unanswered += 1;
        else if (selected === correctOption) topicSlice.correct += 1;
        else topicSlice.wrong += 1;
        topicMap.set(question.topicPath, topicSlice);

        const diffSlice = difficultyMap[question.difficulty];
        diffSlice.attempted += 1;
        if (isUnanswered) diffSlice.unanswered += 1;
        else if (selected === correctOption) diffSlice.correct += 1;
        else diffSlice.wrong += 1;

        const srcSlice = sourceMap.get(question.sourceType) ?? emptySlice();
        srcSlice.attempted += 1;
        if (isUnanswered) srcSlice.unanswered += 1;
        else if (selected === correctOption) srcSlice.correct += 1;
        else srcSlice.wrong += 1;
        sourceMap.set(question.sourceType, srcSlice);
      }

      const maxMarks = total * profile.scoring.marksPerQuestion;
      // Accuracy matches the legacy definition: correct / attempted (unanswered
      // questions are excluded from the denominator). Callers must pass the
      // server-derived elapsedSec; client duration is never authoritative.
      const attempted = correct + incorrect;
      const accuracy = attempted > 0 ? correct / attempted : 0;
      const percentage = maxMarks > 0 ? (obtainedMarks / maxMarks) * 100 : 0;
      const elapsedSec = Math.max(0, Math.floor(answers.durationSec ?? 0));

      const subjectPerformance = [...subjectMap.values()].map(finalizeSlice);
      const topicPerformance = [...topicMap.values()].map(finalizeSlice);
      const difficultyPerformance = {
        EASY: finalizeSlice(difficultyMap.EASY),
        MEDIUM: finalizeSlice(difficultyMap.MEDIUM),
        HARD: finalizeSlice(difficultyMap.HARD),
      };
      const sourcePerformance = Object.fromEntries(
        [...sourceMap.entries()].map(([source, slice]) => [source, finalizeSlice(slice)]),
      ) as Record<QuestionSourceType, PerformanceSlice>;

      const report: ScoreReport = {
        attemptId: answers.attemptId,
        paperId: paper.id,
        profileId: profile.id,
        profileVersion: profile.version,
        scoring: profile.scoring,
        correct,
        incorrect,
        unanswered,
        total,
        obtainedMarks,
        maxMarks,
        accuracy: Number(accuracy.toFixed(6)),
        percentage: Number(percentage.toFixed(6)),
        subjectPerformance,
        topicPerformance,
        difficultyPerformance,
        sourcePerformance,
        timeMetrics: {
          elapsedSec,
          avgSecPerQuestion: total > 0 ? Number((elapsedSec / total).toFixed(6)) : undefined,
        },
        immutable: true,
      };
      return report;
    },
  };
}
