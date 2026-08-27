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
  validateEvaluationOutput,
  validateMockTestOutput,
  validateAdvisorOutput,
  sanitizeReply,
} from "../../../backend/ai/validation/outputs";
import { detectIntent } from "../../../backend/ai/application/services";
import {
  buildTutorSystem,
  buildSolverSystem,
  buildAssistantSystem,
  buildEvaluatorSystem,
  buildMockTestSystem,
  buildAdvisorSystem,
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

  it("normalizes an evaluation response with a grading key", () => {
    const result = validateEvaluationOutput(
      JSON.stringify({
        score: 87,
        verdict: "correct",
        strengths: ["Clear reasoning", "Correct formula", 5],
        gaps: ["Minor notation slip"],
        modelAnswer: "F = ma",
        improvementTips: ["Show units"],
      }),
      "fallback",
    );
    expect(result.score).toBe(87);
    expect(result.verdict).toBe("correct");
    expect(result.strengths).toEqual(["Clear reasoning", "Correct formula"]);
    expect(result.gaps).toEqual(["Minor notation slip"]);
    expect(result.modelAnswer).toBe("F = ma");
    expect(result.improvementTips).toEqual(["Show units"]);
    expect(result.source).toBe("ai");
  });

  it("infers a verdict from the score when missing", () => {
    expect(validateEvaluationOutput('{"score":90}', "fallback").verdict).toBe("correct");
    expect(validateEvaluationOutput('{"score":60}', "fallback").verdict).toBe("partial");
    expect(validateEvaluationOutput('{"score":10}', "fallback").verdict).toBe("incorrect");
  });

  it("clamps the score into 0-100 and falls back on garbage", () => {
    expect(validateEvaluationOutput('{"score":999}', "fallback").score).toBe(100);
    expect(validateEvaluationOutput("not json", "fallback model").modelAnswer).toBe("fallback model");
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
    expect(prompt).toContain("9th-Grade AI");
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
    expect(prompt).toContain("9th-Grade AI");
    expect(prompt).toContain("exam-focused");
  });

  it("builds an evaluator system prompt with a grading key and exam rules", () => {
    const prompt = buildEvaluatorSystem(minimalContext, "Correct answer: 42");
    expect(prompt).toContain("answer evaluator");
    expect(prompt).toContain("Grading key");
    expect(prompt).toContain("Correct answer: 42");
    expect(prompt).toContain("score");
    expect(prompt).toContain("verdict");
  });

  it("builds a mock-test system prompt with a question count and subject", () => {
    const prompt = buildMockTestSystem(minimalContext, { subjectName: "History", exam: "BCS", count: 12 });
    expect(prompt).toContain("mock-test generator");
    expect(prompt).toContain("12");
    expect(prompt).toContain("History");
    expect(prompt).toContain("BCS");
  });

  it("builds an advisor system prompt from a learner profile", () => {
    const prompt = buildAdvisorSystem(minimalContext, {
      education: "BSc",
      interests: "Science",
      targetExam: "BCS",
      weeklyHours: 12,
    });
    expect(prompt).toContain("career");
    expect(prompt).toContain("BSc");
    expect(prompt).toContain("Science");
    expect(prompt).toContain("BCS");
    expect(prompt).toContain("12");
  });
});

describe("advisor validation", () => {
  it("normalizes an advisor plan with a weekly schedule", () => {
    const result = validateAdvisorOutput(
      JSON.stringify({
        summary: "Focus on BCS.",
        recommendedExam: "BCS",
        focusAreas: ["Bangla", "Math"],
        timelineWeeks: 16,
        weeklyPlan: [
          { week: 1, focus: "Basics", tasks: ["Revise Bangla", "Daily current affairs"] },
          { week: 2, focus: "Math", tasks: ["Algebra"] },
        ],
        tips: ["Practice past papers"],
      }),
      "fallback",
    );
    expect(result.summary).toContain("BCS");
    expect(result.recommendedExam).toBe("BCS");
    expect(result.focusAreas).toEqual(["Bangla", "Math"]);
    expect(result.timelineWeeks).toBe(16);
    expect(result.weeklyPlan).toHaveLength(2);
    expect(result.weeklyPlan[0].tasks).toEqual(["Revise Bangla", "Daily current affairs"]);
  });

  it("applies defaults on garbage input", () => {
    const result = validateAdvisorOutput("not json", "fallback summary");
    expect(result.summary).toBe("fallback summary");
    expect(result.timelineWeeks).toBe(12);
    expect(result.weeklyPlan).toEqual([]);
  });
});

describe("mock-test validation", () => {
  it("normalizes a generated mock test and clamps options/answer", () => {
    const result = validateMockTestOutput(
      JSON.stringify({
        title: "History Test",
        questions: [
          {
            id: "q1",
            question: "When did Bangladesh become independent?",
            options: [
              { id: "A", text: "1971" },
              { id: "B", text: "1947" },
              { id: "C", text: "1952" },
              { id: "D", text: "1990" },
            ],
            answer: "A",
            explanation: "1971",
            topic: "History",
            difficulty: "EASY",
          },
          { question: "", options: [{ id: "A", text: "x" }], answer: "A" }, // dropped: empty + <2 options
        ],
      }),
      "fallback",
      10,
    );
    expect(result.title).toBe("History Test");
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].answer).toBe("A");
    expect(result.questions[0].options).toHaveLength(4);
  });

  it("drops questions whose answer does not match an option", () => {
    const result = validateMockTestOutput(
      JSON.stringify({
        questions: [
          {
            id: "q1",
            question: "What is 2+2?",
            options: [
              { id: "A", text: "3" },
              { id: "B", text: "4" },
            ],
            answer: "Z", // invalid
            explanation: "4",
            topic: "Math",
          },
        ],
      }),
      "fallback",
      10,
    );
    expect(result.questions).toHaveLength(0);
  });

  it("returns an empty test on garbage input", () => {
    const result = validateMockTestOutput("not json", "fallback", 10);
    expect(result.questions).toEqual([]);
    expect(result.title).toBe("Mock Test");
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
  beforeEach(async () => {
    await resetRateLimitStore();
  });
  afterEach(async () => {
    await resetRateLimitStore();
    vi.useRealTimers();
  });

  it("allows requests under the limit and blocks beyond it", async () => {
    await expect(checkRateLimit("a", 2, 1000)).resolves.toBe(true);
    await expect(checkRateLimit("a", 2, 1000)).resolves.toBe(true);
    await expect(checkRateLimit("a", 2, 1000)).resolves.toBe(false);
  });

  it("resets after the window expires", async () => {
    await expect(checkRateLimit("a", 1, 1000)).resolves.toBe(true);
    await expect(checkRateLimit("a", 1, 1000)).resolves.toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 1001);
    await expect(checkRateLimit("a", 1, 1000)).resolves.toBe(true);
  });

  it("enforces a daily quota per calendar day", async () => {
    await expect(checkDailyQuota("user-1", 3)).resolves.toBe(true);
    await expect(checkDailyQuota("user-1", 3)).resolves.toBe(true);
    await expect(checkDailyQuota("user-1", 3)).resolves.toBe(true);
    await expect(checkDailyQuota("user-1", 3)).resolves.toBe(false);
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