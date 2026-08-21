import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { getConversation } from "~backend/ai/persistence/conversations";
import { getOwnedMessage } from "~backend/ai/persistence/conversations";
import { submitFeedback } from "~backend/ai/feedback";

// ── Phase 19/20: IDOR / ownership-isolation drills at the service seam ──
// Every query these functions make MUST be scoped by the caller's userId —
// the mocks below capture the exact WHERE clauses and assert the scope.

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AI conversation ownership (cross-user access denied)", () => {
  it("scopes conversation lookup to the requesting user", async () => {
    // User B asks for User A's conversation → findFirst(userId+id) misses.
    vi.mocked(prisma.aIConversation.findFirst).mockResolvedValue(null);

    await expect(getConversation("userB", "conv-of-A")).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });

    const where = vi.mocked(prisma.aIConversation.findFirst).mock.calls[0][0]?.where;
    expect(where).toEqual({ id: "conv-of-A", userId: "userB" });
  });

  it("message reads require the message to live in the CALLER's conversation", async () => {
    vi.mocked(prisma.aIMessage.findFirst).mockResolvedValue(null);

    await expect(getOwnedMessage("userB", "msg-of-A")).rejects.toMatchObject({
      statusCode: 404,
    });

    const where = vi.mocked(prisma.aIMessage.findFirst).mock.calls[0][0]?.where;
    expect(where).toEqual({ id: "msg-of-A", conversation: { userId: "userB" } });
  });

  it("feedback cannot be forged against another user's message", async () => {
    vi.mocked(prisma.aIMessage.findFirst).mockResolvedValue(null);

    await expect(
      submitFeedback({ userId: "userB", messageId: "msg-of-A", rating: "HELPFUL" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.aIFeedback.create).not.toHaveBeenCalled();
  });

  it("successful lookups still carry the composite ownership filter", async () => {
    vi.mocked(prisma.aIConversation.findFirst).mockResolvedValue({
      id: "c1",
      userId: "userA",
      kind: "TUTOR",
      title: "t",
      pinned: false,
      subjectId: null,
      topicId: null,
      topicPath: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { messages: 0 },
    } as never);

    const conv = await getConversation("userA", "c1");
    expect(conv.id).toBe("c1");
    const where = vi.mocked(prisma.aIConversation.findFirst).mock.calls[0][0]?.where;
    expect(where).toMatchObject({ userId: "userA" });
  });
});
