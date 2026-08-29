import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import {
  buildCustomExam,
  submitCustomExam,
  getExamSelectionTree,
  shuffleWithSeed,
} from "~backend/services/exam";
import { QueryCache } from "~backend/infrastructure/cache/query-cache";
import type { ExamSelectionRequest } from "@/lib/types";

function fullQuestion(id: number, correctAnswer: string) {
  return {
    id,
    subjectId: 1,
    topic: "ভাষা",
    subtopic: "বানান",
    question: `প্রশ্ন ${id}?`,
    options: ["ক", "খ", "গ", "ঘ"],
    correctAnswer,
    explanation: "ব্যাখ্যা",
    difficulty: "MEDIUM",
    sourceExam: "BCS",
    year: null,
    subject: { nameBn: "বাংলা ভাষা ও সাহিত্য" },
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await QueryCache.invalidateExamTree();
});

describe("shuffleWithSeed", () => {
  it("is deterministic for the same seed", () => {
    const input = [1, 2, 3, 4, 5];
    expect(shuffleWithSeed(input, 42)).toEqual(shuffleWithSeed(input, 42));
    expect(shuffleWithSeed(input, 42).sort()).toEqual(input);
  });

  it("produces different order for different seeds", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffleWithSeed(input, 1)).not.toEqual(shuffleWithSeed(input, 2));
  });
});

describe("getExamSelectionTree", () => {
  it("builds a recursive topic tree with aggregated counts", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য", nameEn: "Bangla", icon: "📖", color: "", bg: "", sortOrder: 0 },
    ]);
    vi.mocked(prisma.topic.findMany).mockResolvedValue([
      { id: 1, subjectId: 1, parentId: null, name: "ভাষা", slug: "ভাষা", path: "ভাষা", depth: 1, sortOrder: 0, questionCount: "7" },
      { id: 2, subjectId: 1, parentId: 1, name: "বানান", slug: "বানান", path: "ভাষা/বানান", depth: 2, sortOrder: 0, questionCount: "4" },
      { id: 3, subjectId: 1, parentId: 1, name: "পরিভাষা", slug: "পরিভাষা", path: "ভাষা/পরিভাষা", depth: 2, sortOrder: 1, questionCount: "3" },
    ]);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([
      { subjectId: 1, path: "ভাষা/বানান", _count: { _all: 4 } },
      { subjectId: 1, path: "ভাষা/পরিভাষা", _count: { _all: 3 } },
    ]);

    const tree = await getExamSelectionTree();
    expect(tree).toHaveLength(1);
    const subject = tree[0];
    expect(subject.nodes).toHaveLength(1);
    expect(subject.nodes[0]).toMatchObject({
      name: "ভাষা",
      path: "ভাষা",
      depth: 1,
      questionCount: 7,
    });
    expect(subject.nodes[0].children).toHaveLength(2);
    expect(subject.nodes[0].children[0]).toMatchObject({ name: "বানান", questionCount: 4 });
    expect(subject.nodes[0].children[1]).toMatchObject({ name: "পরিভাষা", questionCount: 3 });
    expect(subject.questionCount).toBe(7);
  });

  it("prunes nodes with no questions", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য", nameEn: "Bangla", icon: "📖", color: "", bg: "", sortOrder: 0 },
    ]);
    vi.mocked(prisma.topic.findMany).mockResolvedValue([
      { id: 1, subjectId: 1, parentId: null, name: "ভাষা", slug: "ভাষা", path: "ভাষা", depth: 1, sortOrder: 0, questionCount: "0" },
      { id: 2, subjectId: 1, parentId: 1, name: "বানান", slug: "বানান", path: "ভাষা/বানান", depth: 2, sortOrder: 0, questionCount: "0" },
    ]);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([]);

    const tree = await getExamSelectionTree();
    expect(tree[0].nodes).toHaveLength(0);
    expect(tree[0].questionCount).toBe(0);
  });
});

describe("buildCustomExam", () => {
  const config: ExamSelectionRequest = {
    subjects: [
      { subjectId: 1, paths: ["ভাষা"] },
      { subjectId: 2, paths: [] },
    ],
    questionCount: 10,
    durationSec: 600,
    seed: 42,
    shuffleQuestions: true,
  };

  const leafCounts = [
    { subjectId: 1, path: "ভাষা/বানান", _count: { _all: 10 } },
    { subjectId: 2, path: "Grammar", _count: { _all: 10 } },
  ];

  function mockFindMany() {
    vi.mocked(prisma.question.findMany).mockImplementation(async (args) => {
      const a = args as {
        select?: Record<string, boolean>;
        orderBy?: unknown;
        where?: { subjectId?: number; path?: { in?: string[] }; id?: { in?: number[] } };
      };
      const isPick = !!a.orderBy && !!a.select && Object.keys(a.select).length === 1 && a.select.id === true;
      const base = a.where?.subjectId === 2 ? 11 : 1;
      const pool = Array.from({ length: 10 }, (_, i) => i + base);
      if (isPick) return pool.map((id) => ({ id }));
      const ids = (a.where?.id?.in ?? []).flat();
      return ids.map((id) => fullQuestion(id, "ক"));
    });
  }

  it("returns exactly the requested number of questions with no duplicates", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য" },
      { id: 2, nameBn: "English Language and Literature" },
    ] as never);
    vi.mocked(prisma.question.groupBy).mockResolvedValue(leafCounts as never);
    mockFindMany();

    const exam = await buildCustomExam(config);
    expect(exam.totalQuestions).toBe(10);
    expect(exam.requested).toBe(10);
    expect(exam.shortfall).toBe(0);
    expect(exam.available).toBe(20);
    const ids = exam.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Answers must not leak into the built exam.
    expect(exam.questions.every((q) => "correctAnswer" in q === false)).toBe(true);
  });

  it("selects only questions under the chosen node path", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য" },
    ] as never);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([
      { subjectId: 1, path: "ভাষা/বানান", _count: { _all: 10 } },
      { subjectId: 1, path: "ভাষা/পরিভাষা", _count: { _all: 20 } },
    ] as never);
    mockFindMany();

    const exam = await buildCustomExam({
      ...config,
      questionCount: 5,
      subjects: [{ subjectId: 1, paths: ["ভাষা/বানান"] }],
    });
    expect(exam.totalQuestions).toBe(5);
    expect(exam.available).toBe(10); // only the বানান leaf (10), not পরিভাষা (20)
    // The pick query must constrain by the eligible leaf paths.
    const pickCall = vi.mocked(prisma.question.findMany).mock.calls.find((c) => {
      const where = c[0]?.where as { path?: { in?: string[] } } | undefined;
      return !!where?.path?.in;
    });
    expect(pickCall?.[0]?.where).toMatchObject({ path: { in: ["ভাষা/বানান"] } });
  });

  it("respects per-subject counts when every subject provides one", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য" },
      { id: 2, nameBn: "English Language and Literature" },
    ] as never);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([
      { subjectId: 1, path: "ভাষা/বানান", _count: { _all: 10 } },
      { subjectId: 2, path: "Grammar", _count: { _all: 5 } },
    ] as never);
    mockFindMany();

    const exam = await buildCustomExam({
      subjects: [
        { subjectId: 1, paths: [], count: 4 },
        { subjectId: 2, paths: [], count: 3 },
      ],
      questionCount: 7,
      durationSec: 600,
      seed: 42,
      shuffleQuestions: false,
    });

    expect(exam.totalQuestions).toBe(7);
    expect(exam.requested).toBe(7);
    expect(exam.shortfall).toBe(0);
    // Subject 1 draws from ids 1–10, subject 2 from ids 11–15.
    const fromSub1 = exam.questions.filter((q) => q.id <= 10).length;
    const fromSub2 = exam.questions.filter((q) => q.id >= 11).length;
    expect(fromSub1).toBe(4);
    expect(fromSub2).toBe(3);
  });

  it("handles insufficient questions gracefully with a shortfall", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য" },
    ] as never);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([
      { subjectId: 1, path: "ভাষা/বানান", _count: { _all: 5 } },
    ] as never);
    mockFindMany();

    const exam = await buildCustomExam({
      ...config,
      questionCount: 10,
      subjects: [{ subjectId: 1, paths: ["ভাষা"] }],
    });
    expect(exam.totalQuestions).toBe(5);
    expect(exam.available).toBe(5);
    expect(exam.shortfall).toBe(5);
  });

  it("rejects invalid configuration", async () => {
    await expect(buildCustomExam({ ...config, questionCount: 0 })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(buildCustomExam({ ...config, subjects: [] })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("submitCustomExam", () => {
  it("grades BCS-style (+1 / −0.5 / 0) and persists attempts", async () => {
    const userId = "user-1";
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      fullQuestion(1, "খ"),
      fullQuestion(2, "ক"),
      fullQuestion(3, "ঘ"),
    ]);
    vi.mocked(prisma.questionAttempt.createMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (tx: unknown) => Promise<unknown>)(prisma),
    );

    const result = await submitCustomExam(userId, [
      { questionId: 1, selected: "খ" }, // correct +1
      { questionId: 2, selected: "গ" }, // wrong −0.5
      { questionId: 3, selected: "" }, // unanswered 0
    ]);

    expect(result.summary).toMatchObject({
      total: 3,
      attempted: 2,
      correct: 1,
      wrong: 1,
      unanswered: 1,
      positiveMarks: 1,
      negativeMarks: 0.5,
      finalScore: 0.5,
      accuracy: 50,
    });
    expect(result.review[0].status).toBe("correct");
    expect(result.review[0].marks).toBe(1);
    expect(result.review[1].status).toBe("wrong");
    expect(result.review[1].marks).toBe(-0.5);
    expect(result.review[2].status).toBe("unanswered");
    expect(result.review[2].marks).toBe(0);

    // Only answered questions persist as attempts.
    const attempts = vi.mocked(prisma.questionAttempt.createMany).mock.calls[0][0];
    expect(attempts.data).toHaveLength(2);
    expect(attempts.data.map((a: { questionId: number }) => a.questionId)).toEqual([1, 2]);
    // Progress recompute + exam counter is the single atomic statement
    // (params: userId, pointsEarned, examsIncrement ×2).
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const rawValues = vi.mocked(prisma.$executeRaw).mock.calls[0].slice(1);
    expect(rawValues[0]).toBe("user-1");
    expect(rawValues[1]).toBe(10); // 1 correct × 10 points
    expect(rawValues[2]).toBe(1); // exam counter increment
  });

  it("rejects malformed answers", async () => {
    await expect(
      submitCustomExam("user-1", [{ questionId: 1, selected: 123 as unknown as string }]),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});