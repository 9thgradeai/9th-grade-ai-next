import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import {
  gradeSm2,
  submitFlashcardReview,
  type Sm2State,
} from "~backend/services/flashcards";
import { getStudyPlan } from "~backend/services/content";
import { toggleStudyTask } from "~backend/services/user";

const FRESH: Sm2State = { interval: 1, easeFactor: 2.5, repetitions: 0, lapses: 0 };
const DAY = 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("gradeSm2 (pure SM-2 transitions)", () => {
  it("first 'good' review schedules +1 day", () => {
    const g = gradeSm2(FRESH, 2);
    expect(g.repetitions).toBe(1);
    expect(g.interval).toBe(1);
    expect(g.nextReview.getTime()).toBeGreaterThanOrEqual(Date.now() + 1 * DAY - 1000);
  });

  it("second 'good' review jumps to 6 days", () => {
    const g = gradeSm2({ ...FRESH, repetitions: 1 }, 2);
    expect(g.interval).toBe(6);
    expect(g.repetitions).toBe(2);
  });

  it("later reviews multiply by ease factor", () => {
    const g = gradeSm2({ interval: 6, easeFactor: 2.5, repetitions: 2, lapses: 0 }, 2);
    expect(g.interval).toBe(15); // round(6 * 2.5)
  });

  it("'easy' grows the ease factor, 'hard' shrinks it", () => {
    const easy = gradeSm2(FRESH, 3);
    const hard = gradeSm2(FRESH, 1);
    expect(easy.easeFactor).toBeGreaterThan(2.5);
    expect(hard.easeFactor).toBeLessThan(2.5);
    expect(hard.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("'again' resets to 1 day, increments lapses, floors ease at 1.3", () => {
    let s: Sm2State = { interval: 15, easeFactor: 2.5, repetitions: 3, lapses: 0 };
    for (let i = 0; i < 20; i++) {
      s = gradeSm2(s, 0);
      expect(s.easeFactor).toBeGreaterThanOrEqual(1.3);
    }
    expect(s.interval).toBe(1);
    expect(s.repetitions).toBe(0);
    expect(s.lapses).toBe(20);
  });
});

describe("submitFlashcardReview (per-user state + audit row)", () => {
  function txSpies() {
    return {
      flashcardUserState: prisma.flashcardUserState,
      flashcardReview: prisma.flashcardReview,
    };
  }

  beforeEach(() => {
    vi.mocked(prisma.flashcard.findUnique).mockResolvedValue({ id: 42 } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (t: ReturnType<typeof txSpies>) => Promise<unknown>)(txSpies()),
    );
    vi.mocked(prisma.flashcardUserState.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.flashcardReview.create).mockResolvedValue({} as never);
  });

  it("creates fresh SM-2 state and a review log row for a first review", async () => {
    vi.mocked(prisma.flashcardUserState.findUnique).mockResolvedValue(null);

    await submitFlashcardReview("userA", 42, 2);

    expect(prisma.flashcardUserState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_flashcardId: { userId: "userA", flashcardId: 42 } },
        create: expect.objectContaining({
          userId: "userA",
          flashcardId: 42,
          repetitions: 1,
          lastRating: 2,
        }),
        update: expect.objectContaining({ repetitions: 1, nextReview: expect.any(Date) }),
      }),
    );
    expect(prisma.flashcardReview.create).toHaveBeenCalledWith({
      data: { userId: "userA", flashcardId: 42, rating: 2 },
    });
  });

  it("continues from existing per-user state, never another user's", async () => {
    vi.mocked(prisma.flashcardUserState.findUnique).mockResolvedValue({
      id: 9,
      userId: "userA",
      flashcardId: 42,
      interval: 6,
      easeFactor: 2.5,
      repetitions: 2,
      lapses: 0,
      lastRating: 2,
      nextReview: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const out = await submitFlashcardReview("userA", 42, 2);

    expect(out.interval).toBe(15); // round(6 * 2.5) — continued, not restarted
    expect(prisma.flashcardUserState.findUnique).toHaveBeenCalledWith({
      where: { userId_flashcardId: { userId: "userA", flashcardId: 42 } },
    });
  });

  it("404s on an unknown card without any writes", async () => {
    vi.mocked(prisma.flashcard.findUnique).mockResolvedValue(null);
    await expect(submitFlashcardReview("userA", 999, 2)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.flashcardUserState.upsert).not.toHaveBeenCalled();
    expect(prisma.flashcardReview.create).not.toHaveBeenCalled();
  });
});

describe("getStudyPlan (templates visible, completion per-user)", () => {
  it("returns template tasks with completed flags from the user's completions", async () => {
    vi.mocked(prisma.studyPlanDay.findMany).mockResolvedValue([
      {
        id: 1,
        day: "Day 1",
        date: "2026-08-22",
        totalMinutes: 60,
        focusAreas: [],
        sourceKey: "k",
        tasks: [
          { id: 101, dayId: 1, userId: null, title: "T1", subject: "", duration: 30, priority: "HIGH", description: "", completed: false, createdAt: new Date() },
          { id: 102, dayId: 1, userId: null, title: "T2", subject: "", duration: 30, priority: "LOW", description: "", completed: false, createdAt: new Date() },
        ],
      },
    ] as never);
    vi.mocked(prisma.studyTaskCompletion.findMany).mockResolvedValue([
      { taskId: 102 },
    ] as never);

    const tasks = await getStudyPlan("userA");
    expect(tasks.map((t) => [t.id, t.completed])).toEqual([
      [101, false],
      [102, true],
    ]);
  });
});

describe("toggleStudyTask (completion-table based)", () => {
  beforeEach(() => {
    vi.mocked(prisma.studyTask.findUnique).mockResolvedValue({ id: 101 } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (t: Pick<typeof prisma, "studyTaskCompletion">) => Promise<unknown>)(
        { studyTaskCompletion: prisma.studyTaskCompletion },
      ),
    );
  });

  it("marks a template task complete for this user only", async () => {
    vi.mocked(prisma.studyTaskCompletion.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.studyTaskCompletion.create).mockResolvedValue({} as never);

    const out = await toggleStudyTask("userA", 101);
    expect(out.completed).toBe(true);
    expect(prisma.studyTaskCompletion.create).toHaveBeenCalledWith({
      data: { userId: "userA", taskId: 101 },
    });
    // The shared row's legacy flag is never written.
    expect(vi.mocked(prisma.studyTask.update)).not.toHaveBeenCalled();
  });

  it("un-toggles by deleting the completion row", async () => {
    vi.mocked(prisma.studyTaskCompletion.findUnique).mockResolvedValue({
      id: 7,
      userId: "userA",
      taskId: 101,
      completedAt: new Date(),
    } as never);
    vi.mocked(prisma.studyTaskCompletion.delete).mockResolvedValue({} as never);

    const out = await toggleStudyTask("userA", 101);
    expect(out.completed).toBe(false);
    expect(prisma.studyTaskCompletion.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it("404s when the task does not exist", async () => {
    vi.mocked(prisma.studyTask.findUnique).mockResolvedValue(null);
    await expect(toggleStudyTask("userA", 999)).rejects.toMatchObject({ statusCode: 404 });
  });
});
