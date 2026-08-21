import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { getSubjectReports } from "~backend/services/analytics";
import { recomputeAndAward } from "~backend/repositories/progress.repository";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSubjectReports (DB-side aggregation via repository)", () => {
  it("joins subject catalog with attempt aggregates and computes scores", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { nameBn: "বাংলা ভাষা ও সাহিত্য" },
      { nameBn: "সাধারণ বিজ্ঞান" },
      { nameBn: "গাণিতিক যুক্তি" },
    ] as never);
    // Raw rows as Prisma would deserialize them.
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { subjectName: "বাংলা ভাষা ও সাহিত্য", attempted: 8, correct: 6 }, // 75%
      { subjectName: "গাণিতিক যুক্তি", attempted: 4, correct: 4 }, // 100%
    ] as never);

    const reports = await getSubjectReports("userA");

    expect(reports).toEqual([
      { name: "বাংলা ভাষা ও সাহিত্য", score: 75, attempted: 8, correct: 6 },
      { name: "সাধারণ বিজ্ঞান", score: 0, attempted: 0, correct: 0 },
      { name: "গাণিতিক যুক্তি", score: 100, attempted: 4, correct: 4 },
    ]);
    // The aggregation happens in the repository's parameterized raw SQL —
    // scoped to exactly one user.
    const rawArgs = vi.mocked(prisma.$queryRaw).mock.calls[0];
    expect(rawArgs.slice(1)).toEqual(["userA"]);
  });

  it("never fabricates numbers for untouched subjects", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([{ nameBn: "X" }] as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    expect(await getSubjectReports("userA")).toEqual([
      { name: "X", score: 0, attempted: 0, correct: 0 },
    ]);
  });
});

describe("recomputeAndAward (atomic progress upsert)", () => {
  it("issues ONE parameterized statement carrying user, points and exam increment", async () => {
    const db = { $executeRaw: vi.fn().mockResolvedValue(1) };
    await recomputeAndAward(db as unknown as typeof prisma, "u1", 30, 1);

    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const args = db.$executeRaw.mock.calls[0];
    expect(String(args[0])).toContain("UserProgress");
    expect(String(args[0])).toContain("ON CONFLICT");
    // Params: userId, pointsEarned, examsIncrement — each interpolated twice
    // (INSERT branch + ON CONFLICT UPDATE branch).
    expect(args.slice(1)).toEqual(["u1", 30, 1, "u1", 30, 1]);
  });
});
