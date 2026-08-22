import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { evaluateBadgesForEvent } from "~backend/services/badges";

beforeEach(() => {
  vi.clearAllMocks();
  // Streak evaluation queries distinct active days; default to none.
  vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
  // Default: no badges unlocked yet.
  vi.mocked(prisma.badge.findUnique).mockImplementation(async ({ where }: never) => {
    const names = ["Quiz Beginner", "3-Day Streak", "Week Warrior", "Mock Master", "Flashcard Pro"];
    const name = (where as { name: string }).name;
    return names.includes(name) ? { id: names.indexOf(name) + 1, name } : null;
  });
  vi.mocked(prisma.userBadge.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);
});

describe("evaluateBadgesForEvent (achievement awarding)", () => {
  it("awards Quiz Beginner on the first daily quiz completion", async () => {
    await evaluateBadgesForEvent({
      name: "DAILY_QUIZ_COMPLETED",
      userId: "u1",
      quizId: 1,
      score: 10,
    });

    expect(prisma.userBadge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", badgeId: 1 }),
      }),
    );
  });

  it("awards Mock Master when ≥5 questions and ≥80% correct", async () => {
    await evaluateBadgesForEvent({
      name: "EXAM_COMPLETED",
      userId: "u1",
      correct: 8,
      wrong: 2,
      finalScore: 7,
    });

    const created = vi.mocked(prisma.userBadge.create).mock.calls.map(
      (c) => (c[0] as { data: { badgeId: number } }).data.badgeId,
    );
    expect(created).toContain(4); // Mock Master
  });

  it("does not award Mock Master below the accuracy threshold", async () => {
    await evaluateBadgesForEvent({
      name: "EXAM_COMPLETED",
      userId: "u1",
      correct: 6,
      wrong: 4,
      finalScore: 4,
    });

    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });

  it("does not award Mock Master on very short exams", async () => {
    await evaluateBadgesForEvent({
      name: "EXAM_COMPLETED",
      userId: "u1",
      correct: 2,
      wrong: 0,
      finalScore: 2,
    });

    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });

  it("does not double-award an already-unlocked badge", async () => {
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue({ id: 1 } as never);

    await evaluateBadgesForEvent({
      name: "DAILY_QUIZ_COMPLETED",
      userId: "u1",
      quizId: 1,
      score: 10,
    });

    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });

  it("awards Flashcard Pro at 100 lifetime reviews", async () => {
    vi.mocked(prisma.flashcardReview.count).mockResolvedValue(100);

    await evaluateBadgesForEvent({
      name: "FLASHCARD_REVIEWED",
      userId: "u1",
      flashcardId: 5,
      rating: 2,
    });

    const created = vi.mocked(prisma.userBadge.create).mock.calls.map(
      (c) => (c[0] as { data: { badgeId: number } }).data.badgeId,
    );
    expect(created).toContain(5); // Flashcard Pro
  });

  it("ignores unknown badge catalog entries without throwing", async () => {
    vi.mocked(prisma.badge.findUnique).mockResolvedValue(null);

    await expect(
      evaluateBadgesForEvent({
        name: "DAILY_QUIZ_COMPLETED",
        userId: "u1",
        quizId: 1,
        score: 10,
      }),
    ).resolves.toBeUndefined();

    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });
});
