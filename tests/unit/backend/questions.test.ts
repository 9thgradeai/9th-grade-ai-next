import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { getQuestions, getSpotlightQuestions } from "~backend/services/content";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getQuestions paths filter", () => {
  it("builds AND/OR where matching selected nodes and their subtrees", async () => {
    vi.mocked(prisma.subject.findFirst).mockResolvedValue({ id: 3 } as never);
    vi.mocked(prisma.question.findMany).mockResolvedValue([]);

    await getQuestions({ subject: "বাংলা", paths: ["ভাষা/বানান"], limit: 50 });

    const call = vi.mocked(prisma.question.findMany).mock.calls[0][0];
    expect(call?.where).toEqual({
      AND: [
        { subjectId: 3 },
        {
          OR: [
            { path: { startsWith: "ভাষা/বানান/" } },
            { path: { in: ["ভাষা/বানান"] } },
          ],
        },
      ],
    });
    expect(call?.take).toBe(50);
  });

  it("returns mapped QuestionDTO rows", async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      {
        id: 7,
        subjectId: 1,
        subject: { nameBn: "বাংলা ভাষা ও সাহিত্য" },
        topic: "ভাষা",
        subtopic: "বানান ও শুদ্ধি",
        question: "প্রশ্ন ৭?",
        options: ["ক", "খ"],
        correctAnswer: "ক",
        explanation: "ব্যাখ্যা",
        difficulty: "EASY",
        year: 2023,
        sourceExam: "BCS",
      },
    ] as never);

    const rows = await getQuestions({ paths: ["ভাষা"] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 7,
      subject: "বাংলা ভাষা ও সাহিত্য",
      topic: "ভাষা",
      subtopic: "বানান ও শুদ্ধি",
      difficulty: "EASY",
      year: 2023,
      sourceExam: "BCS",
    });
    expect(rows[0].options).toEqual(["ক", "খ"]);
  });

  it("returns all questions when no paths are given", async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([{ id: 1 } as never]);

    await getQuestions({ limit: 10 });
    const call = vi.mocked(prisma.question.findMany).mock.calls[0][0];
    expect(call?.where).toEqual({});
  });
});

describe("getQuestions subject resolution (ecosystem-scoped)", () => {
  it("scopes the subject lookup by ecosystemId when provided", async () => {
    vi.mocked(prisma.subject.findFirst).mockResolvedValue({ id: 9, nameBn: "সাধারণ জ্ঞান" } as never);
    vi.mocked(prisma.question.findMany).mockResolvedValue([]);
    vi.mocked(prisma.question.count).mockResolvedValue(0);

    await getQuestions({ subject: "সাধারণ জ্ঞান", ecosystemId: 2, limit: 21 });

    expect(vi.mocked(prisma.subject.findFirst)).toHaveBeenCalledWith({
      where: { nameBn: "সাধারণ জ্ঞান", ecosystemId: 2 },
    });
    const call = vi.mocked(prisma.question.findMany).mock.calls[0][0];
    expect(call?.where).toEqual({
      AND: [{ subjectId: 9 }, { ecosystemId: 2 }],
    });
  });

  it("falls back to a name-only lookup when no ecosystemId is given", async () => {
    vi.mocked(prisma.subject.findFirst).mockResolvedValue({ id: 3 } as never);
    vi.mocked(prisma.question.findMany).mockResolvedValue([]);

    await getQuestions({ subject: "বাংলা", paths: ["ভাষা/পরিভাষা"], limit: 51 });

    expect(vi.mocked(prisma.subject.findFirst)).toHaveBeenCalledWith({
      where: { nameBn: "বাংলা" },
    });
  });
});

describe("getQuestions paperId filter (exam library)", () => {
  it("adds the paperId equality condition when set", async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([]);

    await getQuestions({ paperId: 99 });

    const call = vi.mocked(prisma.question.findMany).mock.calls[0][0];
    expect(call?.where).toEqual({ AND: [{ paperId: 99 }] });
  });

  it("maps exam-library linkage fields into the QuestionDTO", async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      {
        id: 9,
        subjectId: 1,
        subject: { nameBn: "বাংলা ভাষা ও সাহিত্য" },
        topic: "",
        subtopic: "",
        question: "প্রশ্ন?",
        options: ["ক", "খ", "গ", "ঘ"],
        correctAnswer: "ক",
        explanation: "",
        difficulty: "MEDIUM",
        year: 2024,
        sourceExam: "৫০তম বিসিএস",
        bcsTerm: "50th",
        paperId: 42,
        examId: 3,
        questionNumber: 7,
      },
    ] as never);

    const rows = await getQuestions({ paperId: 42 });
    expect(rows[0]).toMatchObject({
      paperId: 42,
      examId: 3,
      questionNumber: 7,
      bcsTerm: "50th",
    });
  });
});

describe("getQuestions Bangla union (BCS pool shared into Bank Bangla)", () => {
  const BANK_BN = "০১_বাংলা_ভাষা_ও_সাহিত্য";
  const BCS_LEAF = "01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/বানান";

  beforeEach(async () => {
    const { clearBanglaSubjectsCache, clearBanglaLeafPathsCache } = await import(
      "~backend/services/bangla-union"
    );
    clearBanglaSubjectsCache();
    clearBanglaLeafPathsCache();
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "বাংলা ভাষা ও সাহিত্য" },
      { id: 7, nameBn: BANK_BN },
    ] as never);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([
      { subjectId: 1, path: BCS_LEAF },
    ] as never);
  });

  it("spans both Bangla subjects and drops the ecosystem fence", async () => {
    vi.mocked(prisma.subject.findFirst).mockResolvedValue({ id: 7, nameBn: BANK_BN } as never);
    vi.mocked(prisma.question.findMany).mockResolvedValue([]);
    vi.mocked(prisma.question.count).mockResolvedValue(0);

    await getQuestions({
      subject: BANK_BN,
      paths: [`${BANK_BN}/ভাষা`],
      ecosystemId: 2,
      limit: 50,
    });

    const call = vi.mocked(prisma.question.findMany).mock.calls[0][0];
    const and = call?.where as { AND: Record<string, unknown>[] };
    // subjectId spans both Bangla subjects…
    expect(and.AND).toContainEqual({ subjectId: { in: [1, 7] } });
    // …and no ecosystemId fence remains (rows live in two ecosystems)…
    expect(JSON.stringify(and)).not.toContain("ecosystemId");
    // …while the path OR covers the Bank node AND the mapped BCS leaf.
    const or = and.AND.find((c) => "OR" in c) as { OR: Record<string, unknown>[] };
    expect(or.OR).toContainEqual({ path: { in: expect.arrayContaining([BCS_LEAF]) } });
  });

  it("stays single-subject for non-Bangla subjects", async () => {
    vi.mocked(prisma.subject.findFirst).mockResolvedValue({ id: 9, nameBn: "সাধারণ জ্ঞান" } as never);
    vi.mocked(prisma.question.findMany).mockResolvedValue([]);
    vi.mocked(prisma.question.count).mockResolvedValue(0);

    await getQuestions({ subject: "সাধারণ জ্ঞান", ecosystemId: 2, limit: 20 });

    const call = vi.mocked(prisma.question.findMany).mock.calls[0][0];
    expect(call?.where).toEqual({
      AND: [{ subjectId: 9 }, { ecosystemId: 2 }],
    });
  });
});

describe("getSpotlightQuestions (Home rotating MCQ, DB-only)", () => {
  function spotlightRow(id: number, subjectId: number) {
    return {
      id,
      subjectId,
      ecosystemId: 1,
      subject: { nameBn: subjectId === 1 ? "বাংলা" : "English" },
      topic: "টি",
      subtopic: "",
      question: `প্রশ্ন ${id}?`,
      options: ["ক", "খ", "গ", "ঘ"],
      correctAnswer: "ক",
      explanation: "",
      difficulty: "MEDIUM",
      year: null,
      sourceExam: "BCS",
      bcsTerm: null,
      questionType: "SINGLE_CHOICE",
      correctAnswers: [],
      statements: [],
      media: [],
      paperId: null,
      examId: null,
      questionNumber: null,
      rawMath: false,
    };
  }

  beforeEach(() => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }] as never);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([
      { subjectId: 1, _count: { _all: 10 } },
      { subjectId: 2, _count: { _all: 10 } },
    ] as never);
    vi.mocked(prisma.question.count).mockResolvedValue(10);
    let nextId = 1;
    vi.mocked(prisma.question.findMany).mockImplementation((async (args: never) => {
      const { where, take } = args as { where?: { subjectId?: number }; take?: number };
      const n = Math.max(1, take ?? 1);
      const rows = [];
      for (let k = 0; k < n; k++) rows.push(spotlightRow(nextId++, where?.subjectId ?? 1));
      return rows as never;
    }) as never);
  });

  it("cycles across all subjects (round-robin, no subject repeats back-to-back)", async () => {
    const qs = await getSpotlightQuestions({ ecosystemId: 1, count: 4 });
    expect(qs).toHaveLength(4);
    const subjectIds = qs.map((q) => q.subjectId);
    expect(new Set(subjectIds)).toEqual(new Set([1, 2]));
    // Strict alternation: consecutive questions never share a subject.
    for (let i = 1; i < subjectIds.length; i++) {
      expect(subjectIds[i]).not.toBe(subjectIds[i - 1]);
    }
  });

  it("excludes already-shown ids", async () => {
    await getSpotlightQuestions({ ecosystemId: 1, count: 2, excludeIds: [5, 9] });
    const calls = vi.mocked(prisma.question.findMany).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const where = (call[0] as { where?: { id?: { notIn?: number[] } } }).where;
      expect(where?.id?.notIn).toEqual(expect.arrayContaining([5, 9]));
    }
  });

  it("returns [] when no subjects exist", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([]);
    const qs = await getSpotlightQuestions({ ecosystemId: 99, count: 4 });
    expect(qs).toEqual([]);
  });
});