import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import {
  buildCustomExam,
  submitCustomExam,
  getExamSelectionTree,
  shuffleWithSeed,
} from "~backend/services/exam";
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

beforeEach(() => {
  vi.clearAllMocks();
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
  it("builds subject → topic → subtopic tree with real counts", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য", nameEn: "Bangla", icon: "📖", color: "", bg: "", sortOrder: 0 },
    ]);
    vi.mocked(prisma.topic.findMany).mockResolvedValue([
      { id: 1, subjectId: 1, groupName: "ভাষা (১৫ নম্বর)", name: "বানান ও শুদ্ধি", questionCount: "45/12K" },
      { id: 2, subjectId: 1, groupName: "ভাষা (১৫ নম্বর)", name: "পরিভাষা", questionCount: "32/8K" },
    ]);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([
      { subjectId: 1, topic: "ভাষা (১৫ নম্বর)", subtopic: "বানান ও শুদ্ধি", _count: { _all: 4 } },
      { subjectId: 1, topic: "ভাষা (১৫ নম্বর)", subtopic: "পরিভাষা", _count: { _all: 3 } },
    ]);

    const tree = await getExamSelectionTree();
    expect(tree).toHaveLength(1);
    const subject = tree[0];
    expect(subject.groups).toHaveLength(1);
    expect(subject.groups[0].subTopics).toHaveLength(2);
    expect(subject.groups[0].subTopics[0]).toMatchObject({ name: "বানান ও শুদ্ধি", questionCount: 4 });
    expect(subject.groups[0].questionCount).toBe(7);
    expect(subject.questionCount).toBe(7);
  });
});

describe("buildCustomExam", () => {
  const config: ExamSelectionRequest = {
    subjects: [
      { subjectId: 1, groups: [{ groupName: "ভাষা", subTopics: [] }] },
      { subjectId: 2, groups: [] },
    ],
    questionCount: 10,
    durationSec: 600,
    seed: 42,
    shuffleQuestions: true,
  };

  it("returns exactly the requested number of questions with no duplicates", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য" },
      { id: 2, nameBn: "English Language and Literature" },
    ] as never);

    vi.mocked(prisma.question.count).mockResolvedValue(10);
    vi.mocked(prisma.question.findMany).mockImplementation(async (args) => {
      const a = args as {
        select?: Record<string, boolean>;
        orderBy?: unknown;
        where?: { subjectId?: number; id?: { in?: number[] } };
      };
      const isPick = !!a.orderBy && !!a.select && Object.keys(a.select).length === 1 && a.select.id === true;
      const base = a.where?.subjectId === 2 ? 11 : 1;
      const pool = Array.from({ length: 10 }, (_, i) => i + base);
      if (isPick) return pool.map((id) => ({ id }));
      const ids = (a.where?.id?.in ?? []).flat();
      return ids.map((id) => fullQuestion(id, "ক"));
    });

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

  it("handles insufficient questions gracefully with a shortfall", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য" },
    ] as never);
    vi.mocked(prisma.question.count).mockResolvedValue(5);
    vi.mocked(prisma.question.findMany).mockImplementation(async (args) => {
      const a = args as {
        select?: Record<string, boolean>;
        orderBy?: unknown;
        where?: { subjectId?: number; id?: { in?: number[] } };
      };
      const isPick = !!a.orderBy && !!a.select && Object.keys(a.select).length === 1 && a.select.id === true;
      if (isPick) return [1, 2, 3, 4, 5].map((id) => ({ id }));
      const ids = (a.where?.id?.in ?? []).flat();
      return ids.map((id) => fullQuestion(id, "ক"));
    });

    const exam = await buildCustomExam({
      ...config,
      questionCount: 10,
      subjects: [{ subjectId: 1, groups: [{ groupName: "ভাষা", subTopics: [] }] }],
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
    vi.mocked(prisma.questionAttempt.count).mockResolvedValue(2);
    vi.mocked(prisma.questionAttempt.createMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.userProgress.update).mockResolvedValue({} as never);

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
    // Exam counted as an exam attempt.
    expect(
      vi.mocked(prisma.userProgress.update).mock.calls.some((c) => c[0].data?.examsAttempted !== undefined),
    ).toBe(true);
  });

  it("rejects malformed answers", async () => {
    await expect(
      submitCustomExam("user-1", [{ questionId: 1, selected: 123 as unknown as string }]),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});