import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { getQuestions } from "~backend/services/content";

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