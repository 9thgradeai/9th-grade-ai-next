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
  | "general";

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