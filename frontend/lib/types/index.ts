// Shared types for 9Th-Grade AI
// Client-facing types + server-side DTOs
/* eslint-disable @typescript-eslint/no-namespace */

// ── Common utility types ────────────────────────────────────

export type ApiResponse<T> = {
  data?: T;
  error?: { message: string; code: string };
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type QueryParams = Record<string, string | number | boolean | undefined>;

// ── Client types (Client.Auth, Client.Content, etc.) ────────

export namespace Client {
  export type User = {
    id: string;
    name: string;
    email: string;
    handle: string;
    role: "student" | "admin";
    createdAt: string;
  };

  export type TutorMessage = {
    id: string;
    role: "user" | "ai";
    text: string;
    timestamp: number;
  };

  export type FlashNews = {
    id: string;
    tag: string;
    title: {
      bn: string;
      en?: string;
    };
    text: string;
    time: string;
    full?: string;
    date?: string;
    readTime?: number;
    category?: {
      bn: string;
      en?: string;
    };
  };

  export type Recommendation = {
    id: string;
    subject: {
      bn: string;
      en?: string;
    };
    metric: string;
    accuracy: number;
    title: {
      bn: string;
      en: string;
    };
    description: {
      bn: string;
      en?: string;
    };
    cta: {
      bn: string;
      en: string;
    };
  };

  export type SubjectCard = {
    id: string;
    name: {
      bn: string;
      en: string;
    };
    icon: string;
    bg: string;
    color: string;
  };

  export type PresetPrompt = {
    id: string;
    label: {
      bn: string;
      en: string;
    };
    icon: string;
  };

  export type Flashcard = {
    id: string;
    subject: string;
    question: string;
    answer: string;
    hint?: string;
    difficulty: "easy" | "medium" | "hard";
    nextReview: number;
    interval: number;
    easeFactor: number;
    repetitions: number;
  };

  export type StudyTask = {
    id: string;
    title: string;
    subject: string;
    duration: number;
    completed: boolean;
    priority: "high" | "medium" | "low";
    description: string;
  };

  export type StudyPlanDay = {
    day: string;
    date: string;
    tasks: StudyTask[];
    totalMinutes: number;
    focusAreas: string[];
  };

  export type MockQuestion = {
    id: string;
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    subject: string;
    topic: string;
  };

  export type MockTest = {
    id: string;
    title: string;
    subject: string;
    totalQuestions: number;
    duration: number;
    questions: MockQuestion[];
    currentQuestion: number;
    answers: Record<number, string>;
    timeRemaining: number;
    isActive: boolean;
    isCompleted: boolean;
    score: number;
  };

  export type DailyQuiz = {
    id: string;
    title?: string;
    date: string;
    questions: MockQuestion[];
    completed: boolean;
    score: number;
    claimed: boolean;
  };

  export type Badge = {
    id: string;
    name: string;
    description: string;
    icon: string;
    unlocked: boolean;
    unlockedAt?: string;
    rarity: "common" | "rare" | "epic" | "legendary";
  };

  export type LeaderboardEntry = {
    rank: number;
    name: string;
    points: number;
    streak: number;
    avatar?: string;
  };

  export type SolverInput = {
    type: "text" | "image";
    content: string;
    subject?: string;
  };

  export type Notification = {
    id: string;
    title: string;
    message: string;
    type: "info" | "success" | "warning" | "reminder";
    timestamp: number;
    read: boolean;
  };
}

// ── Server-side DTOs ────────────────────────────────────────

export namespace Server {
  export type SubjectDTO = {
    id: number;
    nameBn: string;
    nameEn: string;
    icon: string;
    color: string;
    bg: string;
    sortOrder: number;
  };

  export type TopicDTO = {
    id: number;
    subjectId: number;
    groupName: string;
    name: string;
    questionCount: string;
  };

  export type QuestionDTO = {
    id: number;
    subjectId: number;
    subject: string;
    topic: string;
    subtopic: string;
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    year: number | null;
    sourceExam: string;
  };

  export type QuestionBankCategoryDTO = {
    id: number;
    label: string;
    count: number;
  };

  export type ExamArchiveDTO = {
    id: number;
    name: string;
    icon: string;
    count: number;
    yearRange: string;
    status: string;
    accent: string;
  };

  export type FlashcardDTO = {
    id: number;
    subjectName: string;
    question: string;
    answer: string;
    hint: string;
    difficulty: "easy" | "medium" | "hard";
  };

  export type StudyTaskDTO = {
    id: number;
    dayId: number;
    day: string;
    date: string;
    title: string;
    subject: string;
    duration: number;
    priority: "high" | "medium" | "low";
    description: string;
    completed: boolean;
  };

  export type DailyQuizDTO = {
    id: number;
    title?: string;
    date: string;
    completed: boolean;
    score: number;
    claimed: boolean;
    questions: {
      id: number;
      subject: string;
      topic: string;
      question: string;
      options: string[];
      correctAnswer: string;
      explanation: string;
    }[];
  };

  export type MockTestDTO = {
    id: number;
    title: string;
    subject: string;
    totalQuestions: number;
    duration: number;
    questions: QuestionDTO[];
  };

  export type FlashNewsDTO = {
    id: number;
    tag: string;
    titleBn: string;
    titleEn: string;
    text: string;
    full: string;
    date: string;
    readTime: number;
    categoryBn: string;
    categoryEn: string;
  };

  export type RecommendationDTO = {
    id: number;
    subjectBn: string;
    subjectEn: string;
    metric: string;
    accuracy: number;
    titleBn: string;
    titleEn: string;
    descriptionBn: string;
    descriptionEn: string;
    ctaBn: string;
    ctaEn: string;
  };

  export type BadgeDTO = {
    id: number;
    name: string;
    description: string;
    icon: string;
    rarity: string;
    unlocked: boolean;
  };

  export type NotificationDTO = {
    id: number;
    title: string;
    message: string;
    type: string;
    timestamp: string;
    read: boolean;
  };

  export type OfflinePackDTO = {
    id: number;
    name: string;
    size: string;
    downloaded: boolean;
    subject: string;
  };

  export type DocumentDTO = {
    id: number;
    title: string;
    category: string;
    type: string;
    url: string;
    description: string;
    year: string;
  };

  export type UserProgressDTO = {
    points: number;
    streak: number;
    accuracy: number;
    questionsAnswered: number;
    flashcardsReviewed: number;
    aiQuestionsAsked: number;
    examsAttempted: number;
    rank: number;
  };

  export type ExamScheduleDTO = {
    id: number;
    titleBn: string;
    titleEn: string;
    type: string;
    date: string;
    year: string;
    circularNo: string;
    note: string;
  };

  export type MockTestResultDTO = {
    id: number;
    mockTestId: number | null;
    title: string;
    score: number;
    correct: number;
    total: number;
    durationSec: number;
    createdAt: string;
  };

  // ── Custom exam engine (BCS-style) ─────────────────────────
  export type ExamSubTopicDTO = {
    name: string;
    questionCount: number;
  };

  export type ExamTopicGroupDTO = {
    groupName: string;
    questionCount: number;
    subTopics: ExamSubTopicDTO[];
  };

  export type ExamSubjectDTO = {
    id: number;
    nameBn: string;
    nameEn: string;
    icon: string;
    color: string;
    bg: string;
    questionCount: number;
    groups: ExamTopicGroupDTO[];
  };

  export type ExamSelectionRequest = {
    subjects: {
      subjectId: number;
      groups: {
        groupName: string;
        subTopics: string[]; // empty = whole group
      }[];
    }[];
    questionCount: number;
    durationSec: number;
    shuffleQuestions?: boolean;
    seed?: number;
  };

  export type ExamQuestionDTO = {
    id: number;
    subject: string;
    subjectId: number;
    topic: string;
    subtopic: string;
    question: string;
    options: string[];
    difficulty: "EASY" | "MEDIUM" | "HARD";
    sourceExam: string;
    year: number | null;
  };

  export type ExamBuildResultDTO = {
    examId: string;
    questions: ExamQuestionDTO[];
    totalQuestions: number;
    requested: number;
    available: number;
    shortfall: number;
    durationSec: number;
    config: ExamSelectionRequest;
  };

  export type ExamSummaryDTO = {
    total: number;
    attempted: number;
    correct: number;
    wrong: number;
    unanswered: number;
    positiveMarks: number;
    negativeMarks: number;
    finalScore: number;
    accuracy: number;
    percentage: number;
    pointsEarned: number;
  };

  export type ExamReviewDTO = {
    questionId: number;
    subject: string;
    topic: string;
    subtopic: string;
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    userAnswer: string;
    status: "correct" | "wrong" | "unanswered";
    marks: number;
  };

  export type ExamResultDTO = {
    summary: ExamSummaryDTO;
    review: ExamReviewDTO[];
  };

  export type DashboardStatsDTO = {
    points: number;
    exams: number;
    rank: number;
    streak: number;
    questionsAnswered: number;
    accuracy: number;
    completion: number;
    flashcardsReviewed: number;
    aiQuestionsAsked: number;
    activity: { date: string; answered: number; correct: number }[];
  };

  export type UserDTO = {
    id: string;
    name: string;
    email: string;
    handle: string;
    role: "student" | "admin";
    createdAt: string;
  };
}

// ── Re-exports for convenience ──────────────────────────────

export type { Client as Types, Server as DTOs };

// Backward-compatible top-level aliases for existing imports
export type SubjectDTO = Server.SubjectDTO;
export type TopicDTO = Server.TopicDTO;
export type QuestionDTO = Server.QuestionDTO;
export type QuestionBankCategoryDTO = Server.QuestionBankCategoryDTO;
export type ExamArchiveDTO = Server.ExamArchiveDTO;
export type FlashcardDTO = Server.FlashcardDTO;
export type StudyTaskDTO = Server.StudyTaskDTO;
export type DailyQuizDTO = Server.DailyQuizDTO;
export type MockTestDTO = Server.MockTestDTO;
export type FlashNewsDTO = Server.FlashNewsDTO;
export type RecommendationDTO = Server.RecommendationDTO;
export type BadgeDTO = Server.BadgeDTO;
export type NotificationDTO = Server.NotificationDTO;
export type OfflinePackDTO = Server.OfflinePackDTO;
export type DocumentDTO = Server.DocumentDTO;
export type UserProgressDTO = Server.UserProgressDTO;
export type UserDTO = Server.UserDTO;
export type ExamScheduleDTO = Server.ExamScheduleDTO;
export type MockTestResultDTO = Server.MockTestResultDTO;
export type DashboardStatsDTO = Server.DashboardStatsDTO;
export type ExamSubTopicDTO = Server.ExamSubTopicDTO;
export type ExamTopicGroupDTO = Server.ExamTopicGroupDTO;
export type ExamSubjectDTO = Server.ExamSubjectDTO;
export type ExamSelectionRequest = Server.ExamSelectionRequest;
export type ExamQuestionDTO = Server.ExamQuestionDTO;
export type ExamBuildResultDTO = Server.ExamBuildResultDTO;
export type ExamSummaryDTO = Server.ExamSummaryDTO;
export type ExamReviewDTO = Server.ExamReviewDTO;
export type ExamResultDTO = Server.ExamResultDTO;
export type TutorMessage = Client.TutorMessage;
export type FlashNews = Client.FlashNews;
export type Recommendation = Client.Recommendation;
export type SubjectCard = Client.SubjectCard;
export type PresetPrompt = Client.PresetPrompt;
export type Flashcard = Client.Flashcard;
export type StudyTask = Client.StudyTask;
export type StudyPlanDay = Client.StudyPlanDay;
export type MockQuestion = Client.MockQuestion;
export type MockTest = Client.MockTest;
export type DailyQuiz = Client.DailyQuiz;
export type Badge = Client.Badge;
export type LeaderboardEntry = Client.LeaderboardEntry;
export type SolverInput = Client.SolverInput;
export type Notification = Client.Notification;
