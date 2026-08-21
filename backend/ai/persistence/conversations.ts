// Conversation persistence — ownership-scoped CRUD for AI conversations and
// messages. Every query is scoped to the authenticated userId; cross-user
// access is impossible by construction.

import "server-only";

import { prisma } from "~backend/db";
import { NotFoundError } from "~backend/errors";
import type {
  AIConversationKind,
  AIMessageRole,
  AIMessageStatus,
  Prisma,
} from "@prisma/client";

export type ConversationSummary = {
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

export type MessageRow = {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  status: AIMessageStatus;
  content: string;
  intent: string | null;
  provider: string | null;
  model: string | null;
  metadata: Record<string, unknown> | null;
  errorCode: string | null;
  createdAt: string;
};

export type NewMessage = {
  role: AIMessageRole;
  status: AIMessageStatus;
  content: string;
  intent?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  errorCode?: string;
};

function toMetadata(value?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
  return value ? (value as Prisma.InputJsonValue) : undefined;
}

export async function createConversation(
  userId: string,
  opts: {
    kind: AIConversationKind;
    title?: string;
    subjectId?: number;
    topicId?: number;
    topicPath?: string;
  },
): Promise<ConversationSummary> {
  const row = await prisma.aIConversation.create({
    data: {
      userId,
      kind: opts.kind,
      title: opts.title ?? "New conversation",
      subjectId: opts.subjectId,
      topicId: opts.topicId,
      topicPath: opts.topicPath ?? "",
    },
    include: { _count: { select: { messages: true } } },
  });
  return toSummary(row);
}

export async function listConversations(
  userId: string,
  kind?: AIConversationKind,
): Promise<ConversationSummary[]> {
  const rows = await prisma.aIConversation.findMany({
    where: { userId, ...(kind ? { kind } : {}) },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    take: 50,
    include: { _count: { select: { messages: true } } },
  });
  return rows.map(toSummary);
}

export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationSummary> {
  const row = await prisma.aIConversation.findFirst({
    where: { id: conversationId, userId },
    include: { _count: { select: { messages: true } } },
  });
  if (!row) throw new NotFoundError("Conversation not found");
  return toSummary(row);
}

export async function renameConversation(
  userId: string,
  conversationId: string,
  title: string,
): Promise<ConversationSummary> {
  const existing = await getConversation(userId, conversationId);
  const row = await prisma.aIConversation.update({
    where: { id: existing.id },
    data: { title: title.slice(0, 120) || "New conversation" },
    include: { _count: { select: { messages: true } } },
  });
  return toSummary(row);
}

export async function setConversationPinned(
  userId: string,
  conversationId: string,
  pinned: boolean,
): Promise<ConversationSummary> {
  const existing = await getConversation(userId, conversationId);
  const row = await prisma.aIConversation.update({
    where: { id: existing.id },
    data: { pinned },
    include: { _count: { select: { messages: true } } },
  });
  return toSummary(row);
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const existing = await getConversation(userId, conversationId);
  await prisma.aIConversation.delete({ where: { id: existing.id } });
}

// Bounded history window returned per conversation (Phase 6): the most
// recent 200 messages, chronological order preserved.
const MAX_MESSAGES_RETURNED = 200;

export async function listMessages(
  userId: string,
  conversationId: string,
): Promise<MessageRow[]> {
  await getConversation(userId, conversationId);
  const rows = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_MESSAGES_RETURNED,
  });
  return rows.reverse().map(toMessageRow);
}

export async function addMessage(
  userId: string,
  conversationId: string,
  msg: NewMessage,
): Promise<MessageRow> {
  const conv = await getConversation(userId, conversationId);
  const row = await prisma.aIMessage.create({
    data: {
      conversationId: conv.id,
      role: msg.role,
      status: msg.status,
      content: msg.content,
      intent: msg.intent ?? "",
      provider: msg.provider ?? "",
      model: msg.model ?? "",
      metadata: toMetadata(msg.metadata),
      errorCode: msg.errorCode ?? "",
    },
  });
  await prisma.aIConversation.update({
    where: { id: conv.id },
    data: { updatedAt: new Date() },
  });
  return toMessageRow(row);
}

export async function updateMessage(
  userId: string,
  messageId: string,
  patch: Partial<NewMessage>,
): Promise<MessageRow> {
  const row = await prisma.aIMessage.findFirst({
    where: { id: messageId, conversation: { userId } },
  });
  if (!row) throw new NotFoundError("Message not found");
  const updated = await prisma.aIMessage.update({
    where: { id: row.id },
    data: {
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
      ...(patch.intent !== undefined ? { intent: patch.intent } : {}),
      ...(patch.metadata !== undefined ? { metadata: toMetadata(patch.metadata) } : {}),
    },
  });
  return toMessageRow(updated);
}

/** Fetch a message only if it belongs to the user's conversation. */
export async function getOwnedMessage(
  userId: string,
  messageId: string,
): Promise<MessageRow> {
  const row = await prisma.aIMessage.findFirst({
    where: { id: messageId, conversation: { userId } },
  });
  if (!row) throw new NotFoundError("Message not found");
  return toMessageRow(row);
}

function toSummary(row: {
  id: string;
  kind: AIConversationKind;
  title: string;
  pinned: boolean;
  subjectId: number | null;
  topicId: number | null;
  topicPath: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { messages: number };
}): ConversationSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    pinned: row.pinned,
    subjectId: row.subjectId,
    topicId: row.topicId,
    topicPath: row.topicPath,
    messageCount: row._count.messages,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessageRow(row: {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  status: AIMessageStatus;
  content: string;
  intent: string | null;
  provider: string | null;
  model: string | null;
  metadata: unknown;
  errorCode: string | null;
  createdAt: Date;
}): MessageRow {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    status: row.status,
    content: row.content,
    intent: row.intent,
    provider: row.provider,
    model: row.model,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    errorCode: row.errorCode,
    createdAt: row.createdAt.toISOString(),
  };
}