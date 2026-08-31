import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOverallStatsForUser, getMistakeSelectionTreeForUser } from "~backend/services/question-progress";
import { prisma } from "~backend/db";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mistake analytics: overall answer-history stats", () => {
  it("computes accuracy from all attempts (not just mistakes)", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        totalAttempts: 120,
        totalCorrect: 84,
        totalWrong: 36,
        questionsAttempted: 25,
      },
    ] as never);

    const stats = await getOverallStatsForUser("usr_1");
    expect(stats.totalAttempts).toBe(120);
    expect(stats.totalCorrect).toBe(84);
    expect(stats.totalWrong).toBe(36);
    expect(stats.questionsAttempted).toBe(25);
    expect(stats.accuracy).toBe(70);
  });

  it("returns 0% accuracy when there are no attempts", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        totalAttempts: 0,
        totalCorrect: 0,
        totalWrong: 0,
        questionsAttempted: 0,
      },
    ] as never);

    const stats = await getOverallStatsForUser("usr_1");
    expect(stats.accuracy).toBe(0);
    expect(stats.totalWrong).toBe(0);
  });
});

describe("mistake analytics: mistake selection tree", () => {
  it("aggregates wrong questions into subject→topic→subtopic counts", async () => {
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([
      { question: { subject: { nameBn: "Math" }, topic: "Algebra", subtopic: "Linear" } },
      { question: { subject: { nameBn: "Math" }, topic: "Algebra", subtopic: "Linear" } },
      { question: { subject: { nameBn: "Math" }, topic: "Algebra", subtopic: "Quadratics" } },
      { question: { subject: { nameBn: "English" }, topic: "Grammar", subtopic: "" } },
    ] as never);

    const flat = await getMistakeSelectionTreeForUser("usr_1");
    const math = flat.find((r) => r.subject === "Math");
    const english = flat.find((r) => r.subject === "English");

    // Two Math/Algebra/Linear rows collapse into one entry with count 2.
    const linearCount = flat
      .filter((r) => r.subject === "Math" && r.topic === "Algebra" && r.subtopic === "Linear")
      .reduce((acc, r) => acc + r.count, 0);
    expect(linearCount).toBe(2);
    expect(math).toBeTruthy();
    expect(english).toBeTruthy();
  });

  it("returns an empty array when the user has no mistakes", async () => {
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([] as never);
    const flat = await getMistakeSelectionTreeForUser("usr_1");
    expect(flat).toEqual([]);
  });
});
