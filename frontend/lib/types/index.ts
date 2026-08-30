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
    authProvider?: "password" | "google" | "apple" | "both";
    imageUrl?: string;
    emailVerified: boolean;
    onboarded?: boolean;
    examTarget?: string;
    examDate?: string;
    prepLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
    studyHoursPerDay?: number;
    goal?: string;
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
    sourceUrl?: string;
    verified?: boolean;
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

  // ── AI domain (conversations, solver, assistant) ──────────
  export type AIConversationKind = "TUTOR" | "ASSISTANT" | "SOLVER";

  export type AIConversationSummary = {
    id: string;
    kind: AIConversationKind;
    title: string;
    pinned: boolean;
    subjectId: number | null;
    topicId: number | null;
    topicPath: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
  };

  export type AIMessageDto = {
    id: string;
    conversationId: string;
    role: "USER" | "ASSISTANT" | "SYSTEM";
    status: "COMPLETE" | "STREAMING" | "FAILED";
    content: string;
    intent: string | null;
    provider: string | null;
    model: string | null;
    errorCode: string | null;
    createdAt: string;
  };

  export type SolverResultDto = {
    solution: string;
    steps: string[];
    explanation?: string;
    relatedConcept?: string;
    misconception?: string;
    source: string;
    conversationId?: string;
  };

  export type SuggestedActionDto = {
    id: string;
    labelBn: string;
    labelEn: string;
    action: string;
  };

  export type AssistantResultDto = {
    reply: string;
    suggestedActions: SuggestedActionDto[];
    source: string;
    conversationId: string;
  };

  export type EvaluationResultDto = {
    score: number;
    verdict: "correct" | "partial" | "incorrect";
    strengths: string[];
    gaps: string[];
    modelAnswer: string;
    improvementTips: string[];
    source: string;
    conversationId?: string;
  };

  export type GeneratedMockOption = { id: string; text: string };
  export type GeneratedMockQuestion = {
    id: string;
    question: string;
    options: GeneratedMockOption[];
    answer: string;
    explanation: string;
    topic: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
  };
  export type GeneratedMockTest = {
    title: string;
    questions: GeneratedMockQuestion[];
    source: string;
  };
  export type AdvisorPlanDto = {
    summary: string;
    recommendedExam: string;
    focusAreas: string[];
    timelineWeeks: number;
    weeklyPlan: { week: number; focus: string; tasks: string[] }[];
    tips: string[];
    source: string;
  };
  export type StudentModelTopicDto = { topic: string; detail: string; confidence: number };
  export type StudentModelDto = {
    examGoal?: string;
    preferredLanguage?: string;
    weakTopics: StudentModelTopicDto[];
    strongTopics: { topic: string; detail: string }[];
    totalAiQuestions: number;
    evaluatedCount: number;
    usageByTask: { task: string; count: number }[];
    lastActive?: string;
  };
  export type UsageSummaryDto = {
    totalCalls: number;
    totalCostUsd: number;
    successRate: number;
    avgLatencyMs: number;
    byProvider: { provider: string; calls: number; costUsd: number }[];
    byDay: { date: string; calls: number; costUsd: number }[];
  };

  export type ChatTurn = {
    role: "user" | "assistant";
    content: string;
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
    parentId: number | null;
    name: string;
    slug: string;
    path: string;
    depth: number;
    sortOrder: number;
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
    bcsTerm: string | null;
    /** Exam-library linkage (absent for generic subject-wise questions). */
    paperId?: number | null;
    examId?: number | null;
    questionNumber?: number | null;
  };

  /** Exam-library hierarchy: ExamCategory "BCS" → Exam "BCS Preliminary" → papers. */
  export type ExamPaperDTO = {
    id: number;
    slug: string;
    titleBn: string;
    titleEn: string;
    bcsTerm: number | null;
    termLabel: string | null;
    year: number | null;
    heldOn: string | null;
    durationMin: number | null;
    totalQuestions: number | null;
    availableQuestions: number;
    provenance: "OFFICIAL" | "CURATED" | "UNKNOWN";
    verified: boolean;
  };

  export type ExamDTO = {
    id: number;
    slug: string;
    nameBn: string;
    nameEn: string;
    type: "PRELIMINARY" | "WRITTEN" | "VIVA" | "OTHER";
    durationMin: number | null;
    totalQuestions: number | null;
    year: number | null;
    heldOn: string | null;
    verified: boolean;
    sortOrder: number;
    papers: ExamPaperDTO[];
  };

  export type ExamCategoryDTO = {
    id: number;
    slug: string;
    nameBn: string;
    nameEn: string;
    icon: string;
    color: string;
    bg: string;
    sortOrder: number;
    exams: ExamDTO[];
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
    /** Present only for authenticated callers with prior review history. */
    srs?: {
      nextReview: string;
      intervalDays: number;
      easeFactor: number;
      repetitions: number;
      lapses: number;
      lastRating?: number; // 0=again 1=hard 2=good 3=easy
    };
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

  export type WeakTopicDTO = {
    subject: string;
    topic: string;
    attempted: number;
    correct: number;
    score: number;
  };

  export type LeaderboardEntryDTO = {
    rank: number;
    name: string;
    points: number;
    streak: number;
  };

  export type DailyQuizHistoryItemDTO = {
    quizId: number;
    date: string;
    score: number;
    correct: number;
    total: number;
    completedAt: string;
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
    sourceUrl?: string;
    verified?: boolean;
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
    sourceUrl?: string;
    verified?: boolean;
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
  // The selection tree mirrors the recursive Topic taxonomy: every node carries
  // an aggregated question count and children, so the dashboard can render the
  // full subject → group → subtopic → … hierarchy at any depth.
  export type ExamSelectionNodeDTO = {
    id: number;
    name: string;
    path: string; // relative path from subject root, e.g. "০২_নিরাপ্তা_ও_ক্ষমতা/আন্তর্জাতিক_নিরাপ্তা"
    depth: number; // 1 = top-level group under the subject
    questionCount: number; // aggregated over the whole subtree
    children: ExamSelectionNodeDTO[];
  };

  export type ExamSubjectDTO = {
    id: number;
    nameBn: string;
    nameEn: string;
    icon: string;
    color: string;
    bg: string;
    questionCount: number;
    nodes: ExamSelectionNodeDTO[];
  };

  export type ExamSelectionRequest = {
    subjects: {
      subjectId: number;
      paths: string[]; // selected node paths; empty = whole subject
      count?: number; // per-subject question count; when provided for every selected subject, questionCount becomes the sum
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
    emailVerified: boolean;
    onboarded?: boolean;
    authProvider?: "password" | "google" | "apple" | "both";
    imageUrl?: string;
    examTarget?: string;
    examDate?: string;
    prepLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
    studyHoursPerDay?: number;
    goal?: string;
  };
}

// ── Re-exports for convenience ──────────────────────────────

export type { Client as Types, Server as DTOs };

// Backward-compatible top-level aliases for existing imports
export type SubjectDTO = Server.SubjectDTO;
export type TopicDTO = Server.TopicDTO;
export type QuestionDTO = Server.QuestionDTO;
export type QuestionBankCategoryDTO = Server.QuestionBankCategoryDTO;
export type ExamPaperDTO = Server.ExamPaperDTO;
export type ExamDTO = Server.ExamDTO;
export type ExamCategoryDTO = Server.ExamCategoryDTO;
export type ExamArchiveDTO = Server.ExamArchiveDTO;
export type FlashcardDTO = Server.FlashcardDTO;
export type StudyTaskDTO = Server.StudyTaskDTO;
export type DailyQuizDTO = Server.DailyQuizDTO;
export type MockTestDTO = Server.MockTestDTO;
export type FlashNewsDTO = Server.FlashNewsDTO;
export type BadgeDTO = Server.BadgeDTO;
export type NotificationDTO = Server.NotificationDTO;
export type OfflinePackDTO = Server.OfflinePackDTO;
export type DocumentDTO = Server.DocumentDTO;
export type UserProgressDTO = Server.UserProgressDTO;
export type UserDTO = Server.UserDTO;
export type ExamScheduleDTO = Server.ExamScheduleDTO;
export type MockTestResultDTO = Server.MockTestResultDTO;
export type DashboardStatsDTO = Server.DashboardStatsDTO;
export type ExamSelectionNodeDTO = Server.ExamSelectionNodeDTO;
export type ExamSubjectDTO = Server.ExamSubjectDTO;
export type ExamSelectionRequest = Server.ExamSelectionRequest;
export type ExamQuestionDTO = Server.ExamQuestionDTO;
export type ExamBuildResultDTO = Server.ExamBuildResultDTO;
export type ExamSummaryDTO = Server.ExamSummaryDTO;
export type ExamReviewDTO = Server.ExamReviewDTO;
export type ExamResultDTO = Server.ExamResultDTO;
export type WeakTopicDTO = Server.WeakTopicDTO;
export type LeaderboardEntryDTO = Server.LeaderboardEntryDTO;
export type DailyQuizHistoryItemDTO = Server.DailyQuizHistoryItemDTO;
export type TutorMessage = Client.TutorMessage;
export type FlashNews = Client.FlashNews;
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
export type AIConversationKind = Client.AIConversationKind;
export type AIConversationSummary = Client.AIConversationSummary;
export type AIMessageDto = Client.AIMessageDto;
export type SolverResultDto = Client.SolverResultDto;
export type SuggestedActionDto = Client.SuggestedActionDto;
export type AssistantResultDto = Client.AssistantResultDto;
export type EvaluationResultDto = Client.EvaluationResultDto;
export type GeneratedMockTest = Client.GeneratedMockTest;
export type GeneratedMockQuestion = Client.GeneratedMockQuestion;
export type AdvisorPlanDto = Client.AdvisorPlanDto;
export type StudentModelDto = Client.StudentModelDto;
export type UsageSummaryDto = Client.UsageSummaryDto;
export type ChatTurn = Client.ChatTurn;
