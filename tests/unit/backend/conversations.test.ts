import { describe, it, expect, vi } from "vitest";

vi.mock("~backend/db", () => {
  const conversations: any[] = [];
  const messages: any[] = [];
  let cid = 0;
  let mid = 0;
  const now = () => new Date();
  const conversationRow = (c: any) => ({
    ...c,
    createdAt: c.createdAt ?? now(),
    updatedAt: c.updatedAt ?? now(),
    _count: { messages: messages.filter((m) => m.conversationId === c.id).length },
  });
  const messageRow = (m: any) => ({ ...m, createdAt: m.createdAt ?? now() });
  return {
    prisma: {
      aIConversation: {
        create: async ({ data }: any) => {
          const c = conversationRow({ id: `c${++cid}`, ...data });
          conversations.push(c);
          return c;
        },
        findMany: async ({ where = {} }: any) =>
          conversations
            .filter((c) => (!where.userId || c.userId === where.userId) && (!where.kind || c.kind === where.kind))
            .map(conversationRow),
        findFirst: async ({ where = {} }: any) => {
          const c = conversations.find(
            (c) => (!where.id || c.id === where.id) && (!where.userId || c.userId === where.userId),
          );
          return c ? conversationRow(c) : null;
        },
        update: async ({ where, data }: any) => {
          const c = conversations.find((c) => c.id === where.id);
          Object.assign(c, data);
          return conversationRow(c);
        },
        delete: async ({ where }: any) => {
          const i = conversations.findIndex((c) => c.id === where.id);
          if (i >= 0) conversations.splice(i, 1);
        },
      },
      aIMessage: {
        create: async ({ data }: any) => {
          const m = messageRow({ id: `m${++mid}`, ...data });
          messages.push(m);
          return m;
        },
        findMany: async ({ where = {} }: any) =>
          messages.filter((m) => (!where.conversationId || m.conversationId === where.conversationId)),
        findFirst: async ({ where = {} }: any) => {
          const m = messages.find((m) => {
            if (where.id && m.id !== where.id) return false;
            if (where.conversation && where.conversation.userId) {
              const c = conversations.find((c) => c.id === m.conversationId);
              if (!c || c.userId !== where.conversation.userId) return false;
            }
            return true;
          });
          return m ? messageRow(m) : null;
        },
        update: async ({ where, data }: any) => {
          const m = messages.find((mm) => mm.id === where.id);
          Object.assign(m, data);
          return messageRow(m);
        },
      },
    },
  };
});

import {
  createConversation,
  listConversations,
  getConversation,
  renameConversation,
  setConversationPinned,
  deleteConversation,
  listMessages,
  addMessage,
  updateMessage,
  getOwnedMessage,
} from "~backend/ai/persistence/conversations";

describe("conversation persistence", () => {
  it("creates, reads, lists, renames, pins, and deletes a conversation with messages", async () => {
    const conv = await createConversation("u1", { kind: "SOLVER", title: "Math help" });
    expect(conv.id).toBeTruthy();
    expect(conv.messageCount).toBe(0);

    const got = await getConversation("u1", conv.id);
    expect(got.title).toBe("Math help");

    const listed = await listConversations("u1", "SOLVER");
    expect(listed.length).toBe(1);

    const renamed = await renameConversation("u1", conv.id, "Algebra help");
    expect(renamed.title).toBe("Algebra help");

    const pinned = await setConversationPinned("u1", conv.id, true);
    expect(pinned.pinned).toBe(true);

    const msg = await addMessage("u1", conv.id, {
      role: "USER",
      status: "COMPLETE",
      content: "2+2?",
      intent: "solve",
    });
    expect(msg.id).toBeTruthy();

    const msgs = await listMessages("u1", conv.id);
    expect(msgs.length).toBe(1);

    const updated = await updateMessage("u1", msg.id, { status: "EDITED", content: "3+3?" });
    expect(updated.content).toBe("3+3?");

    const owned = await getOwnedMessage("u1", msg.id);
    expect(owned.id).toBe(msg.id);

    await deleteConversation("u1", conv.id);
    await expect(getConversation("u1", conv.id)).rejects.toThrow();
  });
});
