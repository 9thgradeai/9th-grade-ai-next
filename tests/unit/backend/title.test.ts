import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("../../../backend/ai/persistence/conversations", () => ({
  listMessages: vi.fn(),
  renameConversation: vi.fn(),
}));

vi.mock("../../../backend/ai/providers", () => ({
  resolveModel: vi.fn(),
}));

import { listMessages, renameConversation } from "../../../backend/ai/persistence/conversations";
import { resolveModel } from "../../../backend/ai/providers";
import {
  buildTranscript,
  sanitizeTitle,
  summarizeConversationTitle,
  DEFAULT_TITLE,
} from "../../../backend/ai/application/title";

const message = (role: string, content: string, status = "COMPLETE") => ({
  id: `m-${Math.random()}`,
  conversationId: "c1",
  role,
  status,
  content,
  intent: null,
  provider: null,
  model: null,
  metadata: null,
  errorCode: null,
  createdAt: "2026-01-01T00:00:00Z",
});

const mockModel = (text: string) => ({
  provider: {
    name: "groq",
    model: "g",
    supportsVision: false,
    generate: vi.fn().mockResolvedValue({ text }),
    stream: vi.fn(),
  },
  name: "groq",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(renameConversation).mockResolvedValue({
    id: "c1", kind: "TUTOR", title: "x", subjectId: null, topicId: null,
    topicPath: "", messageCount: 0, createdAt: "", updatedAt: "",
  });
});

describe("title summarization", () => {
  it("sanitizes model output into a clean short title", () => {
    expect(sanitizeTitle('"**নিউটনের গতি সূত্র**"')).toBe("নিউটনের গতি সূত্র");
    expect(sanitizeTitle("Newton's Laws of Motion.")).toBe("Newton's Laws of Motion");
    expect(sanitizeTitle("  •   ") ).toBe("");
  });

  it("builds a transcript from completed user and tutor messages only", () => {
    const messages = [
      message("USER", "প্রথম প্রশ্ন"),
      message("SYSTEM", "ignored"),
      message("ASSISTANT", "প্রথম উত্তর"),
      message("ASSISTANT", "failed turn", "FAILED"),
      message("USER", "দ্বিতীয় প্রশ্ন"),
    ];
    const transcript = buildTranscript(messages);
    expect(transcript).toContain("প্রথম প্রশ্ন");
    expect(transcript).toContain("প্রথম উত্তর");
    expect(transcript).not.toContain("ignored");
    expect(transcript).not.toContain("failed turn");
  });

  it("renames a conversation from the whole chat via the model", async () => {
    vi.mocked(listMessages).mockResolvedValue([
      message("USER", "গতি সূত্র কী?"),
      message("ASSISTANT", "গতির তিনটি সূত্র হলো..."),
    ]);
    vi.mocked(resolveModel).mockReturnValue(mockModel("Newton's Laws"));

    await summarizeConversationTitle("u1", "c1");
    expect(resolveModel).toHaveBeenCalledWith("tutor");
    expect(renameConversation).toHaveBeenCalledWith("u1", "c1", "Newton's Laws");
  });

  it("falls back to the first learner message when the provider is mock", async () => {
    vi.mocked(listMessages).mockResolvedValue([
      message("USER", "রসায়নের পর্যায় সারণি কীভাবে মনে রাখব?"),
      message("ASSISTANT", "কয়েকটি মজার উপায় দেখি..."),
    ]);
    vi.mocked(resolveModel).mockReturnValue({
      provider: {
        name: "mock",
        model: "mock",
        supportsVision: false,
        generate: vi.fn(),
        stream: vi.fn(),
      },
      name: "mock",
    });

    await summarizeConversationTitle("u1", "c1");
    expect(renameConversation).toHaveBeenCalledWith(
      "u1",
      "c1",
      "রসায়নের পর্যায় সারণি কীভাবে মনে রাখব?",
    );
  });

  it("skips renaming when there are no messages", async () => {
    await summarizeConversationTitle("u1", "c1");
    expect(renameConversation).not.toHaveBeenCalled();
  });

  it("falls back to the first learner message when the model returns nothing", async () => {
    vi.mocked(listMessages).mockResolvedValue([
      message("USER", "হ্যালো, আজ কী পড়ব?"),
      message("ASSISTANT", "পরিকল্পনা দেখি..."),
    ]);
    vi.mocked(resolveModel).mockReturnValue(mockModel(""));
    await summarizeConversationTitle("u1", "c1");
    expect(renameConversation).toHaveBeenCalledWith("u1", "c1", "হ্যালো, আজ কী পড়ব?");
  });

  it("skips renaming when there are no messages", async () => {
    await summarizeConversationTitle("u1", "c1");
    expect(renameConversation).not.toHaveBeenCalled();
  });

  it("exposes the default placeholder used to gate renaming", () => {
    expect(DEFAULT_TITLE).toBe("New conversation");
  });
});