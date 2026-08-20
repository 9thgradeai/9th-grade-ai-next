import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  validateChatRequest,
  validateSolverRequest,
  validateFeedbackBody,
  validateMessage,
} from "../../../backend/ai/schemas";
import { ValidationError, AppError } from "../../../backend/errors";
import {
  parseJsonObject,
  validateSolverOutput,
  sanitizeReply,
} from "../../../backend/ai/validation/outputs";
import { detectIntent } from "../../../backend/ai/application/services";
import {
  buildTutorSystem,
  buildSolverSystem,
  buildAssistantSystem,
} from "../../../backend/ai/prompts";
import { chunkedTextStream } from "../../../backend/ai/providers/types";
import {
  checkRateLimit,
  checkDailyQuota,
  getRateLimitKey,
  resetRateLimitStore,
} from "../../../backend/rate-limit";
import type { AIContext } from "../../../backend/ai/types";

const minimalContext: AIContext = {
  exam: "BCS",
  subject: undefined,
  topic: undefined,
  question: undefined,
  memories: [],
  learningProfile: undefined,
  retrievedKnowledge: undefined,
  webResults: [],
};

describe("AI input schemas", () => {
  it("accepts a valid chat request", () => {
    const parsed = validateChatRequest({
      messages: [{ role: "user", content: "Explain photosynthesis" }],
      conversationId: "conv-1",
      topicId: 3,
      intent: "explain",
    });
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].role).toBe("user");
    expect(parsed.conversationId).toBe("conv-1");
    expect(parsed.intent).toBe("explain");
  });

  it("rejects a chat request without user messages", () => {
    expect(() =>
      validateChatRequest({ messages: [{ role: "assistant", content: "Hi" }] }),
    ).toThrow(ValidationError);
  });

  it("rejects an invalid role", () => {
    expect(() =>
      validateChatRequest({ messages: [{ role: "robot", content: "Hi" }] }),
    ).toThrow(ValidationError);
  });

  it("rejects empty content", () => {
    expect(() =>
      validateChatRequest({ messages: [{ role: "user", content: "" }] }),
    ).toThrow(ValidationError);
  });

  it("rejects unknown intents", () => {
    const parsed = validateChatRequest({
      messages: [{ role: "user", content: "Hi" }],
      intent: "not-an-intent",
    });
    expect(parsed.intent).toBeUndefined();
  });

  it("validates a solver request with text", () => {
    const parsed = validateSolverRequest({ text: "What is 2+2?", subject: "Math" });
    expect(parsed.text).toBe("What is 2+2?");
    expect(parsed.subject).toBe("Math");
  });

  it("requires text or image for the solver", () => {
    expect(() => validateSolverRequest({})).toThrow(ValidationError);
  });

  it("rejects oversized solver images", () => {
    const huge = "a".repeat(10_000_000);
    expect(() => validateSolverRequest({ imageBase64: huge })).toThrow(AppError);
  });

  it("validates feedback bodies", () => {
    const parsed = validateFeedbackBody({ rating: "HELPFUL", messageId: "m-1", comment: "Great" });
    expect(parsed.rating).toBe("HELPFUL");
    expect(parsed.messageId).toBe("m-1");
    expect(() => validateFeedbackBody({ rating: "MEH" })).toThrow(ValidationError);
  });

  it("validates a single message", () => {
    const msg = validateMessage({ role: "system", content: "rules" });
    expect(msg.role).toBe("system");
    expect(() => validateMessage({ role: "user", content: "" })).toThrow(ValidationError);
  });
});

describe("output validation", () => {
  it("parses a JSON object from a plain string", () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON wrapped in a code fence", () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers a JSON object embedded in prose", () => {
    expect(parseJsonObject('Here you go {"solution":"x"} thanks')).toEqual({
      solution: "x",
    });
  });

  it("returns null for non-JSON", () => {
    expect(parseJsonObject("not json at all")).toBeNull();
    expect(parseJsonObject("")).toBeNull();
  });

  it("normalizes a solver response", () => {
    const result = validateSolverOutput(
      JSON.stringify({
        solution: "The answer is 42.",
        steps: ["Step one", "Step two", 123, "", "Step three"],
        explanation: "Because of the meaning of life.",
        relatedConcept: "Misc",
      }),
      "fallback",
    );
    expect(result.solution).toBe("The answer is 42.");
    expect(result.steps).toEqual(["Step one", "Step two", "Step three"]);
    expect(result.explanation).toBe("Because of the meaning of life.");
    expect(result.source).toBe("ai");
  });

  it("falls back when the response is garbage", () => {
    const result = validateSolverOutput("no structure", "fallback text");
    expect(result.solution).toBe("fallback text");
    expect(result.steps).toEqual([]);
  });

  it("sanitizes replies and clamps length", () => {
    const long = "x".repeat(20_000);
    expect(sanitizeReply(long).length).toBe(8_000);
    expect(sanitizeReply("  hi  ")).toBe("hi");
  });
});

describe("intent detection", () => {
  it("detects intent from keywords", () => {
    expect(detectIntent("একটা quiz দিন")).toBe("quiz");
    expect(detectIntent("Can you explain DNA replication?")).toBe("explain");
    expect(detectIntent("solve this integration")).toBe("solve");
    expect(detectIntent("সাম্প্রতিক কারেন্ট অ্যাফেয়ার্স")).toBe("current_affairs");
  });

  it("falls back to the default intent", () => {
    expect(detectIntent("আসসালামু আলাইকুম", "tutor")).toBe("tutor");
    expect(detectIntent("hello", "general")).toBe("general");
  });
});

describe("prompt builders", () => {
  it("builds a tutor system prompt with persona and context", () => {
    const prompt = buildTutorSystem(minimalContext);
    expect(prompt).toContain("চর্চা AI");
    expect(prompt).toContain("BCS");
  });

  it("includes learner memories when present", () => {
    const ctx: AIContext = {
      ...minimalContext,
      memories: [{ type: "preferred_language", value: "Bangla", confidence: 90 }],
    };
    const prompt = buildTutorSystem(ctx);
    expect(prompt).toContain("preferred language");
    expect(prompt).toContain("90%");
  });

  it("includes web-search grounding rules when web results exist", () => {
    const prompt = buildTutorSystem(minimalContext, "1. Dhaka is the capital.");
    expect(prompt).toContain("Web Search Results");
    expect(prompt).toContain("Dhaka is the capital.");
  });

  it("builds a solver system prompt with a JSON output schema", () => {
    const prompt = buildSolverSystem(minimalContext);
    expect(prompt).toContain("solution");
    expect(prompt).toContain("steps");
  });

  it("builds an assistant system prompt", () => {
    const prompt = buildAssistantSystem(minimalContext);
    expect(prompt).toContain("চর্চা AI");
    expect(prompt).toContain("exam-focused");
  });
});

describe("stream chunking", () => {
  it("emits the full text without dropping characters", async () => {
    const text =
      "MOCK — no API key configured. Set GROQ_API_KEY / ANTHROPIC_API_KEY for real AI.";
    const { stream, done, getFullText } = await chunkedTextStream(text);
    const reader = stream.getReader();
    const parts: string[] = [];
    while (true) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;
      parts.push(new TextDecoder().decode(value));
    }
    await done;
    expect(parts.join("")).toBe(text);
    expect(getFullText()).toBe(text);
  });
});

describe("rate limiting", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });
  afterEach(() => {
    resetRateLimitStore();
    vi.useRealTimers();
  });

  it("allows requests under the limit and blocks beyond it", () => {
    expect(checkRateLimit("a", 2, 1000)).toBe(true);
    expect(checkRateLimit("a", 2, 1000)).toBe(true);
    expect(checkRateLimit("a", 2, 1000)).toBe(false);
  });

  it("resets after the window expires", () => {
    expect(checkRateLimit("a", 1, 1000)).toBe(true);
    expect(checkRateLimit("a", 1, 1000)).toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 1001);
    expect(checkRateLimit("a", 1, 1000)).toBe(true);
  });

  it("enforces a daily quota per calendar day", () => {
    expect(checkDailyQuota("user-1", 3)).toBe(true);
    expect(checkDailyQuota("user-1", 3)).toBe(true);
    expect(checkDailyQuota("user-1", 3)).toBe(true);
    expect(checkDailyQuota("user-1", 3)).toBe(false);
  });

  it("keys limits by userId when present", () => {
    const req = new Request("http://local/api/ai/tutor", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(getRateLimitKey(req, "tutor", "user-7")).toBe("tutor:user:user-7");
    expect(getRateLimitKey(req, "tutor", null)).toContain("tutor:");
    expect(getRateLimitKey(req, "tutor", null)).toContain("1.2.3.4");
  });
});