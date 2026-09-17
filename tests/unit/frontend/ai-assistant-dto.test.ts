import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/client", () => ({
  streamChat: vi.fn(),
  parseStreamedJson: vi.fn(),
}));

import { streamChat, parseStreamedJson } from "@/lib/services/ai/client";
import { askAssistant } from "@/lib/services/ai/assistant";

const streamChatMock = vi.mocked(streamChat);
const parseJsonMock = vi.mocked(parseStreamedJson);

describe("askAssistant (assistant DTO normalization)", () => {
  beforeEach(() => {
    streamChatMock.mockReset();
    parseJsonMock.mockReset();
  });

  it("normalizes streamed `actions` into suggestedActions and carries conversation id", async () => {
    streamChatMock.mockResolvedValue({
      conversationId: "c1",
      source: "groq",
      intent: "general",
      model: "openai/gpt-oss-120b",
    });
    parseJsonMock.mockReturnValue({
      reply: "ভালো পরামর্শ",
      actions: [
        { id: "a1", labelBn: "প্র্যাকটিস", labelEn: "Practice", action: "practice" },
        { id: "a2", labelBn: "রিভিশন", labelEn: "Revision", action: "revision" },
      ],
    });

    const res = await askAssistant({ content: "আজ কী পড়ব?" });

    expect(res.reply).toBe("ভালো পরামর্শ");
    expect(res.conversationId).toBe("c1");
    expect(res.source).toBe("groq");
    expect(res.suggestedActions).toEqual([
      { id: "a1", labelBn: "প্র্যাকটিস", labelEn: "Practice", action: "practice" },
      { id: "a2", labelBn: "রিভিশন", labelEn: "Revision", action: "revision" },
    ]);
  });

  it("accepts a `suggestedActions` key emitted by the model", async () => {
    streamChatMock.mockResolvedValue({
      conversationId: "c2",
      source: "anthropic",
      intent: "general",
      model: "claude-sonnet-4-6",
    });
    parseJsonMock.mockReturnValue({
      reply: "পরামর্শ",
      suggestedActions: [{ id: "x", labelBn: "মেমরি", labelEn: "Memory", action: "revise" }],
    });

    const res = await askAssistant({ content: "রিভিশন করো" });
    expect(res.suggestedActions).toEqual([
      { id: "x", labelBn: "মেমরি", labelEn: "Memory", action: "revise" },
    ]);
    expect(res.source).toBe("anthropic");
  });

  it("falls back to plain text (mock) with an empty suggestion list and mock source", async () => {
    streamChatMock.mockResolvedValue({
      conversationId: "c3",
      source: "mock",
      intent: "general",
      model: "mock",
    });
    parseJsonMock.mockReturnValue(null);
    const text = "MOCK — no API key configured. Set GROQ_API_KEY / ANTHROPIC_API_KEY for real AI.";
    streamChatMock.mockImplementation(async ({ onChunk }) => {
      onChunk(text);
      return { conversationId: "c3", source: "mock", intent: "general", model: "mock" };
    });

    const res = await askAssistant({ content: "হাই" });
    expect(res.reply).toContain("MOCK");
    expect(res.suggestedActions).toEqual([]);
    expect(res.source).toBe("mock");
    expect(res.conversationId).toBe("c3");
  });

  it("caps suggestion lists at four entries", async () => {
    streamChatMock.mockResolvedValue({ conversationId: "c4", source: "groq", intent: "general", model: "m" });
    parseJsonMock.mockReturnValue({
      reply: "ok",
      actions: Array.from({ length: 7 }, (_, i) => ({
        id: `a${i}`,
        labelBn: `লেবেল ${i}`,
        labelEn: `Label ${i}`,
        action: "general",
      })),
    });

    const res = await askAssistant({ content: "x" });
    expect(res.suggestedActions).toHaveLength(4);
  });
});