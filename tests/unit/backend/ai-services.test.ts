import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock the DB so every Prisma call resolves to a safe default. The specific
// shapes needed by the student model / usage summary are overridden below.
vi.mock("~backend/db", () => {
  const resolve = (model: string, method: string) => {
    switch (`${model}.${method}`) {
      case "question.findUnique":
        return Promise.resolve({
          question: "What is 2+2?",
          correctAnswer: "4",
          explanation: "Addition.",
        });
      case "aIUsage.aggregate":
        return Promise.resolve({
          _count: { _all: 5 },
          _sum: { estimatedCostUsd: 0.01 },
          _avg: { latencyMs: 100 },
        });
      case "aIUsage.groupBy":
        return Promise.resolve([
          { provider: "mock", _count: { _all: 3 }, _sum: { estimatedCostUsd: 0.005 } },
        ]);
      case "aIUsage.count":
        return Promise.resolve(5);
      case "aIMessage.count":
        return Promise.resolve(2);
      case "aIUsage.findMany":
        return Promise.resolve([
          { createdAt: new Date("2025-01-02"), estimatedCostUsd: 0.005, success: true },
          { createdAt: new Date("2025-01-03"), estimatedCostUsd: 0.002, success: false },
        ]);
      case "aIUsage.findFirst":
        return Promise.resolve({ createdAt: new Date("2025-01-01") });
      case "aIMemory.findMany":
        return Promise.resolve([
          { type: "WEAK_TOPIC", key: "Algebra", value: "sign errors", confidence: 70 },
          { type: "EXAM_GOAL", key: "goal", value: "BCS", confidence: 90 },
          { type: "PREFERRED_LANGUAGE", key: "lang", value: "Bangla", confidence: 80 },
        ]);
      case "aIConversation.create":
      case "aIConversation.findUnique":
      case "aIConversation.findFirst":
        return Promise.resolve({
          id: "x",
          _count: { messages: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
          subjectId: null,
          topicId: null,
          topicPath: null,
        });
      case "aIMessage.create":
        return Promise.resolve({ id: "x", createdAt: new Date(), updatedAt: new Date() });
      case "userProgress.upsert":
      case "aIMemory.upsert":
      case "aIUsage.create":
        return Promise.resolve({ id: "x" });
      default:
        return Promise.resolve(undefined);
    }
  };
  const modelProxy = (model: string) =>
    new Proxy(
      {},
      {
        get: (_t, method) => {
          if (method === "then") return undefined;
          return (..._a: unknown[]) => resolve(model, String(method));
        },
      },
    );
  return {
    prisma: new Proxy(
      {},
      {
        get: (_t, model) => {
          if (model === "then") return undefined;
          return modelProxy(String(model));
        },
      },
    ),
  };
});

// Avoid real LLM calls: force the mock provider path with a fake that returns
// a JSON blob rich enough to satisfy every downstream validator.
vi.mock("~backend/ai/providers/registry", () => {
  const blob = JSON.stringify({
    score: 80,
    verdict: "correct",
    strengths: ["clear"],
    gaps: ["units"],
    modelAnswer: "4",
    improvementTips: ["revise"],
    questions: [
      {
        id: "q1",
        question: "1+1?",
        options: [
          { id: "A", text: "2" },
          { id: "B", text: "3" },
          { id: "C", text: "4" },
          { id: "D", text: "5" },
        ],
        answer: "A",
        explanation: "x",
        topic: "Arithmetic",
        difficulty: "EASY",
      },
    ],
    title: "Practice Set",
    summary: "Focus on arithmetic.",
    recommendedExam: "BCS",
    focusAreas: ["arithmetic"],
    timelineWeeks: 4,
    weeklyPlan: [{ week: 1, focus: "basics", tasks: ["read"] }],
    tips: ["practice daily"],
  });
  const fakeProvider = {
    name: "mock",
    generate: async () => ({ text: blob, estimatedCostUsd: 0 }),
    stream: async () => ({
      stream: new ReadableStream(),
      done: async () => {},
      getFullText: () => "",
    }),
  };
  return {
    resolveModelCandidates: () => [{ provider: fakeProvider, model: "mock", name: "mock" }],
    resolveModel: () => ({ provider: fakeProvider, model: "mock", name: "mock" }),
    resolvedProviderName: () => "mock",
  };
});

vi.mock("~backend/ai/context/context-engine", () => ({
  buildContext: vi.fn().mockResolvedValue({
    exam: "BCS",
    subject: undefined,
    topic: undefined,
    question: undefined,
    memories: [],
    learningProfile: undefined,
    retrievedKnowledge: undefined,
    webResults: [],
  }),
  questionContextIds: vi.fn().mockResolvedValue({ subjectId: undefined, topicId: undefined }),
}));

vi.mock("~backend/ai/retrieval", () => ({
  retrieveQuestionBank: vi.fn().mockResolvedValue({ block: "", count: 0, sources: [] }),
}));

import {
  evaluateAnswer,
  generateMockTest,
  getCareerAdvice,
  getStudentModel,
  getUsageSummary,
} from "~backend/ai";

describe("AI service functions (mock provider)", () => {
  beforeAll(() => {
    process.env.GROQ_API_KEY = "";
    process.env.ANTHROPIC_API_KEY = "";
  });

  it("evaluateAnswer returns a normalized evaluation from the mock provider", async () => {
    const res = await evaluateAnswer({
      userId: "u1",
      request: { question: "What is 2+2?", learnerAnswer: "4", questionId: 1 },
    });
    expect(res).toBeDefined();
    expect(res.result.score).toBeGreaterThanOrEqual(0);
    expect(res.provider).toBe("mock");
    expect(res.result.modelAnswer).toBeTruthy();
  });

  it("generateMockTest returns parsed questions", async () => {
    const res = await generateMockTest({
      userId: "u1",
      request: { subjectId: 1, count: 5, difficulty: "EASY" },
    });
    expect(res).toBeDefined();
    expect(res.provider).toBe("mock");
    expect(Array.isArray(res.result.questions)).toBe(true);
  });

  it("getCareerAdvice returns a structured plan", async () => {
    const res = await getCareerAdvice({
      userId: "u1",
      request: { subjectId: 1, education: "HSC", interests: ["math"], targetExam: "BCS" },
    });
    expect(res).toBeDefined();
    expect(res.provider).toBe("mock");
    expect(res.result.summary).toBeTruthy();
  });

  it("getStudentModel aggregates memories and usage", async () => {
    const res = await getStudentModel("u1");
    expect(res.weakTopics.length).toBeGreaterThan(0);
    expect(res.examGoal).toBe("BCS");
    expect(res.preferredLanguage).toBe("Bangla");
    expect(res.totalAiQuestions).toBe(5);
  });

  it("getUsageSummary aggregates provider usage", async () => {
    const res = await getUsageSummary("u1");
    expect(res.totalCalls).toBe(5);
    expect(res.byProvider.length).toBeGreaterThan(0);
    expect(res.totalCostUsd).toBeGreaterThan(0);
  });
});
