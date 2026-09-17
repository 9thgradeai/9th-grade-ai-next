// Core AI domain types shared across the backend AI layer.
// Pure types — no server-only imports so the modules stay testable.

export type AITask = "tutor" | "solver" | "assistant" | "agent";

export type AIIntent =
  | "tutor"
  | "solve"
  | "explain"
  | "hint"
  | "quiz"
  | "revise"
  | "summarize"
  | "plan"
  | "analyze_performance"
  | "recommend"
  | "question_generation"
  | "current_affairs"
  | "general"
  | "practice"
  | "mock_exam"
  | "exam_strategy"
  | "career"
  | "navigation";

export type AIMessageInput = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AILearningProfile = {
  weakTopics: string[];
  strongTopics: string[];
  preferredLanguage?: string;
  examGoal?: string;
  difficultyPreference?: string;
};

export type AIPerformance = {
  accuracy: number;
  questionsAnswered: number;
  recentAccuracy: number;
};

export type AIContext = {
  userId: string;
  exam?: string;
  subject?: { id: number; nameBn: string; nameEn: string } | null;
  topic?: { id: number; name: string; path: string } | null;
  question?: { id: number; question: string; subject: string; topic: string } | null;
  learningProfile?: AILearningProfile;
  performance?: AIPerformance;
  memories: { type: string; value: string; confidence: number }[];
  retrievedKnowledge?: string;
  webResults?: number;
  intent?: AIIntent;
  /** Task-selected live data slices loaded only for the current intent. */
  slices?: ContextSlices;
};

// ── Task-aware context slices ─────────────────────────────
// Each slice is a compact, pre-computed block a task opts into via
// `resolveContextPlan`. Values are derived in the application layer (never by
// the LLM); the model only interprets them.

export type MistakePatternDto = {
  /** Machine key of the pattern (REPEATED_MISTAKE, CARELESS, GUESSING, ...). */
  pattern: string;
  /** Bengali label for the UI / prompt. */
  label: string;
  /** Confidence-aware severity — never "high" on weak evidence. */
  severity: "high" | "medium" | "low";
  topic?: string;
  count: number;
  /** Observable evidence (what the data actually shows). */
  detail: string;
  /** Concrete next study action for that pattern. */
  advice: string;
};

export type ContextSliceKey = keyof ContextSlices;

export type ContextSlices = {
  exam?: {
    examTarget?: string;
    personalExamDate?: string;
    nextExam?: { titleBn: string; titleEn: string; type: string; date: string } | null;
    daysLeft: number | null;
  };
  todayPlan?: {
    total: number;
    remaining: number;
    highPriorityRemaining: number;
    firstTitle: string;
    dayName: string;
  };
  revision?: { flashcardsDue: number; mistakeReviewsDue: number };
  mistakes?: { patterns: MistakePatternDto[]; recentWrongCount: number };
  mockPerformance?: { average: number | null; count: number };
};

export type AIUsageRecord = {
  task: AITask;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  errorCode?: string;
  estimatedCostUsd?: number;
  intent?: string;
};

export type TutorRequest = {
  conversationId?: string;
  messages: AIMessageInput[];
  subjectId?: number;
  topicId?: number;
  topicPath?: string;
  questionId?: number;
  intent?: AIIntent;
  imageBase64?: string;
};

export type SolverRequest = {
  text?: string;
  imageBase64?: string;
  subject?: string;
  subjectId?: number;
  questionId?: number;
};

export type SolverResult = {
  solution: string;
  steps: string[];
  explanation?: string;
  relatedConcept?: string;
  misconception?: string;
  source: string;
};

export type AssistantRequest = {
  conversationId?: string;
  messages: AIMessageInput[];
  questionId?: number;
  intent?: AIIntent;
};

export type SuggestedAction = {
  id: string;
  labelBn: string;
  labelEn: string;
  action: string;
};

export type AssistantResult = {
  reply: string;
  suggestedActions: SuggestedAction[];
  source: string;
};

export const MAX_AI_INPUT_CHARS = 8_000;
export const MAX_AI_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_AI_CONVERSATION_MESSAGES = 100;