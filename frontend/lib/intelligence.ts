/**
 * Staged intelligence merging for the Home tab (Phase 1).
 *
 * Scoped `/api/preparation-intelligence?scope=*` responses carry only their
 * scope's fields. `EMPTY_INTELLIGENCE` is the honest-zero baseline they merge
 * over, so every command-center card keeps receiving a complete DTO and no
 * card code needs scope-awareness. `mergeIntelligence` is pure and tested.
 */
import type { Server } from "./types";

export const EMPTY_INTELLIGENCE: Server.PreparationIntelligenceDTO = {
  overall: {
    totalAttempts: 0,
    totalCorrect: 0,
    totalWrong: 0,
    accuracy: 0,
    questionsAttempted: 0,
    points: 0,
    rank: 0,
    streak: 0,
    flashcardsReviewed: 0,
    aiQuestionsAsked: 0,
    examsAttempted: 0,
    studyTimeSec: 0,
  },
  activity: [],
  period: {
    currentAccuracy: 0,
    previousAccuracy: 0,
    accuracyDelta: 0,
    currentAttempts: 0,
    previousAttempts: 0,
    attemptsDelta: 0,
    currentCorrect: 0,
    previousCorrect: 0,
    correctDelta: 0,
    currentStudyTimeSec: 0,
    previousStudyTimeSec: 0,
    studyTimeDeltaSec: 0,
  },
  subjectPerformance: [],
  weakTopics: [],
  flashcardsDue: 0,
  streak: 0,
  masteryDistribution: [],
  mistakes: {
    totalMistakes: 0,
    unmastered: 0,
    struggling: 0,
    reviewing: 0,
    improving: 0,
    mastered: 0,
    bySubject: [],
  },
  recentResults: [],
  nextExam: null,
  studyTasks: [],
  unfinishedActivities: [],
  recommendations: [],
  dailyQuizAvailable: false,
};

/** Shallow-merge one scope patch over the previous state (arrays replace). */
export function mergeIntelligence(
  prev: Server.PreparationIntelligenceDTO,
  patch: Partial<Server.PreparationIntelligenceDTO>,
): Server.PreparationIntelligenceDTO {
  return { ...prev, ...patch };
}
