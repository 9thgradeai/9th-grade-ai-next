"use client";

// AI service layer types — re-exported from the shared client types.

export type {
  AIConversationKind,
  AIConversationSummary,
  AIMessageDto,
  SolverResultDto,
  SuggestedActionDto,
  AssistantResultDto,
  ChatTurn,
} from "@/lib/types";

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