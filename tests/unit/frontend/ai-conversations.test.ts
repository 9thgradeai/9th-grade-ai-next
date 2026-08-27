import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/client", () => ({
  aiJson: vi.fn(),
}));

import { aiJson } from "@/lib/services/ai/client";
import {
  listConversations,
  createConversation,
  getConversation,
  renameConversation,
  pinConversation,
  deleteConversation,
  submitFeedback,
} from "@/lib/services/ai/conversations";

const aiJsonMock = vi.mocked(aiJson);

describe("AI conversations service wrappers", () => {
  beforeEach(() => aiJsonMock.mockReset());

  it("listConversations GETs with optional kind query", async () => {
    aiJsonMock.mockResolvedValue({ conversations: [{ id: "c1" } as any] });
    const res = await listConversations("SOLVER");
    expect(aiJsonMock).toHaveBeenCalledWith("/api/ai/conversations?kind=SOLVER", "GET");
    expect(res).toHaveLength(1);
  });

  it("createConversation POSTs kind + opts", async () => {
    aiJsonMock.mockResolvedValue({ conversation: { id: "c1" } as any });
    await createConversation("TUTOR", { title: "t" });
    expect(aiJsonMock).toHaveBeenCalledWith(
      "/api/ai/conversations",
      "POST",
      { kind: "TUTOR", title: "t" },
    );
  });

  it("getConversation GETs by id", async () => {
    aiJsonMock.mockResolvedValue({ conversation: { id: "c1" } as any, messages: [] });
    await getConversation("c1");
    expect(aiJsonMock).toHaveBeenCalledWith("/api/ai/conversations/c1", "GET");
  });

  it("renameConversation PATCHes title", async () => {
    aiJsonMock.mockResolvedValue({ conversation: { id: "c1" } as any });
    await renameConversation("c1", "new");
    expect(aiJsonMock).toHaveBeenCalledWith("/api/ai/conversations/c1", "PATCH", { title: "new" });
  });

  it("pinConversation PATCHes pinned", async () => {
    aiJsonMock.mockResolvedValue({ conversation: { id: "c1" } as any });
    await pinConversation("c1", true);
    expect(aiJsonMock).toHaveBeenCalledWith("/api/ai/conversations/c1", "PATCH", { pinned: true });
  });

  it("deleteConversation DELETEs", async () => {
    aiJsonMock.mockResolvedValue({ ok: true });
    await deleteConversation("c1");
    expect(aiJsonMock).toHaveBeenCalledWith("/api/ai/conversations/c1", "DELETE");
  });

  it("submitFeedback POSTs to /api/ai/feedback", async () => {
    aiJsonMock.mockResolvedValue({ ok: true });
    await submitFeedback({ rating: "HELPFUL", comment: "good" });
    expect(aiJsonMock).toHaveBeenCalledWith("/api/ai/feedback", "POST", {
      rating: "HELPFUL",
      comment: "good",
    });
  });
});
