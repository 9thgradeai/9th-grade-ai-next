// Input validation for AI endpoints. Lightweight, dependency-free validators
// (no zod) matching the repo's existing validation style.

import { ValidationError, AppError } from "~backend/errors";
import {
  MAX_AI_INPUT_CHARS,
  MAX_AI_IMAGE_BYTES,
  type AIMessageInput,
  type AIIntent,
  type TutorRequest,
  type SolverRequest,
} from "./types";

const VALID_ROLES = new Set(["user", "assistant", "system"]);
const VALID_INTENTS = new Set<AIIntent>([
  "tutor",
  "solve",
  "explain",
  "hint",
  "quiz",
  "revise",
  "summarize",
  "plan",
  "analyze_performance",
  "recommend",
  "question_generation",
  "current_affairs",
  "general",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function asOptionalInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value;
}

/** Validate and normalize a `{ role, content }` message. */
export function validateMessage(value: unknown): AIMessageInput {
  if (!isRecord(value)) {
    throw new ValidationError("Each message must be an object with role and content.");
  }
  const role = value.role;
  const content = value.content;
  if (typeof role !== "string" || !VALID_ROLES.has(role)) {
    throw new ValidationError("Message role must be 'user', 'assistant' or 'system'.");
  }
  if (typeof content !== "string") {
    throw new ValidationError("Message content must be a string.");
  }
  if (content.length === 0) {
    throw new ValidationError("Message content cannot be empty.");
  }
  if (content.length > MAX_AI_INPUT_CHARS) {
    throw new ValidationError(`Message content exceeds ${MAX_AI_INPUT_CHARS} characters.`);
  }
  return {
    role: role as "user" | "assistant" | "system",
    content,
  };
}

function normalizeMessages(messages: unknown, max: number): AIMessageInput[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError("messages is required and must be a non-empty array.");
  }
  if (messages.length > max) {
    throw new ValidationError(`Conversation exceeds ${max} messages.`);
  }
  const seenUser = messages.some(
    (m) => isRecord(m) && m.role === "user" && isFiniteString(m.content),
  );
  if (!seenUser) {
    throw new ValidationError("At least one user message is required.");
  }
  return messages.map(validateMessage);
}

/** Validate the tutor/assistant request body. */
export function validateChatRequest(body: unknown): {
  messages: AIMessageInput[];
  conversationId?: string;
  subjectId?: number;
  topicId?: number;
  topicPath?: string;
  questionId?: number;
  intent?: AIIntent;
} {
  if (!isRecord(body)) {
    throw new ValidationError("Request body must be a JSON object.");
  }
  const messages = normalizeMessages(body.messages, 100);
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId
      ? body.conversationId
      : undefined;
  const subjectId = asOptionalInt(body.subjectId);
  const topicId = asOptionalInt(body.topicId);
  const questionId = asOptionalInt(body.questionId);
  const topicPath =
    typeof body.topicPath === "string" ? body.topicPath.slice(0, 300) : undefined;
  const intent =
    typeof body.intent === "string" && VALID_INTENTS.has(body.intent as AIIntent)
      ? (body.intent as AIIntent)
      : undefined;

  return { messages, conversationId, subjectId, topicId, topicPath, questionId, intent };
}

/** Validate the solver request body. */
export function validateSolverRequest(body: unknown): SolverRequest {
  if (!isRecord(body)) {
    throw new ValidationError("Request body must be a JSON object.");
  }
  const text = typeof body.text === "string" ? body.text.trim() : undefined;
  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : undefined;
  const subject = typeof body.subject === "string" ? body.subject.trim() : undefined;

  if ((!text || text.length === 0) && !imageBase64) {
    throw new ValidationError("Provide 'text' or 'imageBase64'.");
  }
  if (text && text.length > MAX_AI_INPUT_CHARS) {
    throw new ValidationError(`Question text exceeds ${MAX_AI_INPUT_CHARS} characters.`);
  }
  if (imageBase64) {
    const bytes = Math.ceil((imageBase64.length * 3) / 4);
    if (bytes > MAX_AI_IMAGE_BYTES) {
      throw new AppError(
        413,
        "Image is too large. Maximum size is 5MB.",
        "PAYLOAD_TOO_LARGE",
      );
    }
  }
  const subjectId = asOptionalInt(body.subjectId);
  const questionId = asOptionalInt(body.questionId);

  return { text, imageBase64, subject, subjectId, questionId };
}

/** Validate a feedback submission body. */
export function validateFeedbackBody(body: unknown): {
  messageId?: string;
  rating: "HELPFUL" | "NOT_HELPFUL";
  category?: string;
  comment?: string;
} {
  if (!isRecord(body)) {
    throw new ValidationError("Request body must be a JSON object.");
  }
  const rating = body.rating;
  if (rating !== "HELPFUL" && rating !== "NOT_HELPFUL") {
    throw new ValidationError("rating must be 'HELPFUL' or 'NOT_HELPFUL'.");
  }
  const messageId =
    typeof body.messageId === "string" && body.messageId ? body.messageId : undefined;
  const category =
    typeof body.category === "string" ? body.category.slice(0, 100) : undefined;
  const comment =
    typeof body.comment === "string" ? body.comment.slice(0, 500) : undefined;
  return { messageId, rating, category, comment };
}

/** Validate the AI agent request body (Phase 1 — bounded tool loop). */
export function validateAgentRequest(body: unknown): {
  question: string;
  context: { subjectId?: number; topicId?: number; topicPath?: string; questionId?: number };
  intent?: AIIntent;
  conversationId?: string;
} {
  if (!isRecord(body)) {
    throw new ValidationError("Request body must be a JSON object.");
  }
  const question =
    typeof body.question === "string" ? body.question.trim().slice(0, MAX_AI_INPUT_CHARS) : "";
  if (!question) {
    throw new ValidationError("A non-empty 'question' is required.");
  }
  const ctx = isRecord(body.context) ? body.context : {};
  const context = {
    subjectId: asOptionalInt(ctx.subjectId),
    topicId: asOptionalInt(ctx.topicId),
    topicPath: typeof ctx.topicPath === "string" ? ctx.topicPath.slice(0, 300) : undefined,
    questionId: asOptionalInt(ctx.questionId),
  };
  const intent =
    typeof body.intent === "string" && VALID_INTENTS.has(body.intent as AIIntent)
      ? (body.intent as AIIntent)
      : undefined;
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId
      ? body.conversationId
      : undefined;
  return { question, context, intent, conversationId };
}