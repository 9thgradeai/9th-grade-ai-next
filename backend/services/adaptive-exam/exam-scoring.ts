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
  return {
    score(paper, key, profile, answers) {
      const keyByPosition = new Map(key.entries.map((entry) => [entry.position, entry]));
      const submitted: Record<number, OptionKey> = {};
      for (const answer of answers.answers ?? []) {
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
      const accuracy = total > 0 ? correct / total : 0;
      const percentage = maxMarks > 0 ? (obtainedMarks / maxMarks) * 100 : 0;
      const elapsedSec = answers.durationSec ?? 0;

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
