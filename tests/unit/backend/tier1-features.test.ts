import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { getWeakTopics } from "~backend/services/analytics";
import { getWrongAnswerNotebook, getLeaderboard } from "~backend/services/content";
import { getDailyQuizHistory } from "~backend/services/activity";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getWeakTopics (weak-topic report)", () => {
  it("ranks low-accuracy topics first and drops thin/strong topics", async () => {
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([
      { subjectName: "বাংলা", topic: "নাতিহ", attempted: 10, correct: 3 }, // 30%
      { subjectName: "বিজ্ঞান", topic: "জীবন", attempted: 2, correct: 1 }, // <3 attempts -> dropped
      { subjectName: "গণিত", topic: "বীজ", attempted: 5, correct: 5 }, // 100% -> not weak
      { subjectName: "ইতিহাস", topic: "মুক্তি", attempted: 4, correct: 2 }, // 50%
    ] as never);

    const topics = await getWeakTopics("u1", { minAttempts: 3, limit: 8 });

    expect(topics).toEqual([
      { subject: "বাংলা", topic: "নাতিহ", attempted: 10, correct: 3, score: 30 },
      { subject: "ইতিহাস", topic: "মুক্তি", attempted: 4, correct: 2, score: 50 },
      { subject: "গণিত", topic: "বীজ", attempted: 5, correct: 5, score: 100 },
    ]);
    expect(vi.mocked(prisma.$queryRaw).mock.calls[0].slice(1)).toEqual(["u1"]);
  });

  it("returns nothing when the user has no attempts", async () => {
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([] as never);
    expect(await getWeakTopics("u1")).toEqual([]);
  });
});

describe("getWrongAnswerNotebook (ভুলের নোটবুক)", () => {
  it("keeps only questions whose LATEST attempt was wrong", async () => {
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([
      { questionId: 5, correct: false },
      { questionId: 7, correct: true }, // most-recent correct -> excluded
    ] as never);
    vi.spyOn(prisma.question, "findMany").mockResolvedValue([
      {
        id: 5, subjectId: 1, subject: { nameBn: "বাংলা" }, topic: "নাতিহ", subtopic: "",
        question: "q5", options: ["a", "b"], correctAnswer: "a", explanation: "e",
        difficulty: "EASY", year: null, sourceExam: "",
      },
    ] as never);
    vi.spyOn(prisma.question, "count").mockResolvedValue(1);

    const res = await getWrongAnswerNotebook("u1", { page: 1, limit: 20 });

    expect(res.total).toBe(1);
    expect(res.questions.map((q) => q.id)).toEqual([5]);
  });

  it("returns an empty notebook when there are no wrong attempts", async () => {
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([
      { questionId: 9, correct: true },
    ] as never);
    const res = await getWrongAnswerNotebook("u1");
    expect(res.total).toBe(0);
    expect(res.questions).toEqual([]);
    expect(prisma.question.findMany).not.toHaveBeenCalled();
  });
});

describe("getLeaderboard (points-ranked)", () => {
  it("ranks entries by points and computes the caller's rank", async () => {
    // Streaks are server-authoritative (computed from the attempt log), not the
    // never-written UserProgress.streak column. With no attempts mocked the
    // computed streak is 0 for every entry.
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([] as never);
    vi.spyOn(prisma.userProgress, "findUnique").mockResolvedValue({ points: 50 } as never);
    vi.spyOn(prisma.userProgress, "findMany").mockResolvedValue([
      { points: 200, streak: 5, user: { name: "A", handle: "a" } },
      { points: 50, streak: 2, user: { name: "Me", handle: "me" } },
      { points: 10, streak: 1, user: { name: "B", handle: "b" } },
    ] as never);
    // One user has strictly more points than the caller -> caller is rank 2.
    vi.spyOn(prisma.userProgress, "count").mockResolvedValue(1);

    const board = await getLeaderboard("me");

    expect(board.entries).toEqual([
      { rank: 1, name: "A", points: 200, streak: 0 },
      { rank: 2, name: "Me", points: 50, streak: 0 },
      { rank: 3, name: "B", points: 10, streak: 0 },
    ]);
    expect(board.me).toEqual({ rank: 2, points: 50 });
  });

  it("still returns entries when the caller has no progress row", async () => {
    vi.spyOn(prisma.userProgress, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.userProgress, "findMany").mockResolvedValue([
      { points: 5, streak: 0, user: { name: "X", handle: "x" } },
    ] as never);
    const board = await getLeaderboard("ghost");
    expect(board.entries).toHaveLength(1);
    expect(board.me).toBeNull();
  });
});

describe("getDailyQuizHistory", () => {
  it("returns completed daily quizzes newest-first with stringified dates", async () => {
    vi.spyOn(prisma.dailyQuizParticipation, "findMany").mockResolvedValue([
      {
        quizId: 1, score: 80, correct: 4, total: 5,
        completedAt: new Date("2026-01-01T10:00:00Z"),
        dailyQuiz: { date: new Date("2026-01-01T00:00:00Z") },
      },
    ] as never);

    const history = await getDailyQuizHistory("u1");

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ quizId: 1, score: 80, correct: 4, total: 5 });
    expect(typeof history[0].date).toBe("string");
    expect(typeof history[0].completedAt).toBe("string");
  });
});
