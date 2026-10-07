import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/client", () => ({
  aiJson: vi.fn(),
  aiJsonWithMeta: vi.fn(),
}));

import { aiJson, aiJsonWithMeta } from "@/lib/services/ai/client";
import { evaluateAnswer } from "@/lib/services/ai/evaluator";
import { generateMockTest } from "@/lib/services/ai/mockTest";
import { getCareerAdvice } from "@/lib/services/ai/advisor";
import { getStudentModel } from "@/lib/services/ai/studentModel";
import { getUsageSummary } from "@/lib/services/ai/usage";

const aiJsonMock = vi.mocked(aiJson);
const aiJsonWithMetaMock = vi.mocked(aiJsonWithMeta);

describe("AI service wrappers", () => {
  beforeEach(() => {
    aiJsonMock.mockReset();
    aiJsonWithMetaMock.mockReset();
    aiJsonWithMetaMock.mockResolvedValue({
      data: {},
      meta: { source: "mock", model: "mock" },
    });
  });

  it("evaluateAnswer posts to /api/ai/evaluate", async () => {
    aiJsonWithMetaMock.mockResolvedValue({
      data: { evaluation: { score: 5 }, source: "mock", gradingKey: {} },
      meta: { source: "mock", model: "mock" },
    });
    const res = await evaluateAnswer({
      question: "2+2?",
      questionId: 1,
      learnerAnswer: "4",
    });
    expect(aiJsonWithMetaMock).toHaveBeenCalledWith("/api/ai/evaluate", "POST", {
      question: "2+2?",
      questionId: 1,
      learnerAnswer: "4",
    });
    expect(res.source).toBe("mock");
  });

  it("generateMockTest posts to /api/ai/mock-test", async () => {
    aiJsonWithMetaMock.mockResolvedValue({
      data: { questions: [], source: "mock" },
      meta: { source: "mock", model: "mock" },
    });
    await generateMockTest({
      subjectId: 1,
      count: 5,
      difficulty: "EASY",
    });
    expect(aiJsonWithMetaMock).toHaveBeenCalledWith(
      "/api/ai/mock-test",
      "POST",
      expect.objectContaining({ subjectId: 1, count: 5 }),
    );
  });

  it("getCareerAdvice posts to /api/ai/advisor", async () => {
    aiJsonWithMetaMock.mockResolvedValue({
      data: { summary: "s", source: "mock" },
      meta: { source: "mock", model: "mock" },
    });
    await getCareerAdvice({ education: "HSC", interests: "math", targetExam: "BCS" });
    expect(aiJsonWithMetaMock).toHaveBeenCalledWith(
      "/api/ai/advisor",
      "POST",
      expect.objectContaining({ interests: "math" }),
    );
  });

  it("getStudentModel gets /api/ai/student-model", async () => {
    aiJsonMock.mockResolvedValue({ weakTopics: [], source: "mock" });
    await getStudentModel();
    expect(aiJsonMock).toHaveBeenCalledWith("/api/ai/student-model", "GET");
  });

  it("getUsageSummary gets /api/ai/usage/summary", async () => {
    aiJsonMock.mockResolvedValue({ totalRequests: 0, source: "mock" });
    await getUsageSummary();
    expect(aiJsonMock).toHaveBeenCalledWith("/api/ai/usage/summary", "GET");
  });
});
