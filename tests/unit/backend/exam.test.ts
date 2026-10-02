import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import {
  buildCustomExam,
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
  const { clearBanglaSubjectsCache, clearBanglaLeafPathsCache } = await import(
    "~backend/services/bangla-union"
  );
  clearBanglaSubjectsCache();
  clearBanglaLeafPathsCache();
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

  it("keeps a Bank Bangla node with zero own rows when the BCS union has them", async () => {
    const BANK = "০১_বাংলা_ভাষা_ও_সাহিত্য";
    const BCS_ROOT = "01_বাংলা_ভাষা_ও_সাহিত্য";
    vi.mocked(prisma.subject.findMany).mockImplementation(async (args) => {
      const hasSelect = !!(args as { select?: unknown } | undefined)?.select;
      const all = [
        { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য" },
        { id: 7, nameBn: BANK },
      ];
      // Bangla detection (select) sees both ecosystems; the tree list is Bank-only.
      return (hasSelect ? all : [{ id: 7, nameBn: BANK }]) as never;
    });
    vi.mocked(prisma.topic.findMany).mockResolvedValue([
      { id: 10, subjectId: 7, parentId: null, name: "ভাষা", slug: "ভাষা", path: `${BANK}/ভাষা`, depth: 1, sortOrder: 0, questionCount: "0" },
      { id: 11, subjectId: 7, parentId: 10, name: "বানান", slug: "বানান", path: `${BANK}/ভাষা/বানান`, depth: 2, sortOrder: 0, questionCount: "0" },
    ] as never);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([
      { subjectId: 1, path: `${BCS_ROOT}/ভাষা/বানান`, _count: { _all: 40 } },
    ] as never);

    const tree = await getExamSelectionTree(2);
    expect(tree).toHaveLength(1);
    expect(tree[0].questionCount).toBe(40);
    expect(tree[0].nodes[0]).toMatchObject({ name: "ভাষা", questionCount: 40 });
    expect(tree[0].nodes[0].children[0]).toMatchObject({ name: "বানান", questionCount: 40 });
  });

  it("builds a Bank Bangla exam from BCS union rows", async () => {
    const BANK = "০১_বাংলা_ভাষা_ও_সাহিত্য";
    const BCS_ROOT = "01_বাংলা_ভাষা_ও_সাহিত্য";
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য" },
      { id: 7, nameBn: BANK },
    ] as never);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([
      { subjectId: 7, path: `${BANK}/ভাষা/বানান`, _count: { _all: 2 } },
      { subjectId: 1, path: `${BCS_ROOT}/ভাষা/বানান`, _count: { _all: 40 } },
    ] as never);
    vi.mocked(prisma.question.findMany).mockImplementation(async (args) => {
      const a = args as {
        select?: Record<string, boolean>;
        orderBy?: unknown;
        where?: { subjectId?: number; path?: { in?: string[] }; id?: { in?: number[] } };
      };
      const isPick = !!a.orderBy && !!a.select && Object.keys(a.select).length === 1 && a.select.id === true;
      if (isPick) {
        // Bank leaf offers ids 1-2, BCS leaf offers 101-140.
        const pool = a.where?.subjectId === 1
          ? Array.from({ length: 40 }, (_, i) => 101 + i)
          : [1, 2];
        return pool.map((id) => ({ id })) as never;
      }
      const ids = (a.where?.id?.in ?? []).flat();
      return ids.map((id) => ({ ...fullQuestion(id, "ক"), subjectId: id >= 101 ? 1 : 7 })) as never;
    });

    const exam = await buildCustomExam({
      subjects: [{ subjectId: 7, paths: [`${BANK}/ভাষা`] }],
      questionCount: 10,
      durationSec: 600,
      seed: 7,
      shuffleQuestions: false,
    });
    expect(exam.available).toBe(42);
    expect(exam.totalQuestions).toBe(10);
    expect(exam.shortfall).toBe(0);
    // Union draws from both pools.
    const fromBcs = exam.questions.filter((q) => q.id >= 101).length;
    expect(fromBcs).toBeGreaterThan(0);
    // The pick query reached the BCS subject, not just Bank.
    const pickSubjects = vi
      .mocked(prisma.question.findMany)
      .mock.calls.map((c) => (c[0]?.where as { subjectId?: number } | undefined)?.subjectId);
    expect(pickSubjects).toContain(1);
  });
});

