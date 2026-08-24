// @vitest-environment node
// Integration test: runs the REAL recomputeAndAward upsert against a real
// PostgreSQL database. Exists because $executeRaw is mocked in unit tests,
// which is how an invalid `agg` reference inside ON CONFLICT DO UPDATE
// reached production unnoticed. Skips when no DATABASE_URL is available or
// the database is unreachable (e.g. CI without a Postgres service).
// Instantiates its own PrismaClient because tests/setup.ts globally mocks
// ~backend/db.
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { recomputeAndAward } from "~backend/repositories/progress.repository";

function loadDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const raw = readFileSync(resolve(__dirname, "../../.env.local"), "utf8");
    const match = raw.match(/^DATABASE_URL="([^"]+)"/m);
    if (match) process.env.DATABASE_URL = match[1];
  } catch {
    // no .env.local — stay skipped
  }
  return process.env.DATABASE_URL;
}

const databaseUrl = loadDatabaseUrl();

describe("recomputeAndAward (real PostgreSQL)", () => {
  const prisma = new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    log: ["error"],
  });
  let userId = "";

  afterAll(async () => {
    if (userId) {
      await prisma.userProgress.deleteMany({ where: { userId } });
      await prisma.questionAttempt.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("inserts on first call, then upserts (conflict path) without SQL errors", async (ctx) => {
    if (!databaseUrl) {
      ctx.skip();
      return;
    }
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      ctx.skip();
      return;
    }

    const user = await prisma.user.create({
      data: {
        name: "Progress Integration",
        email: `progress-integration-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
        handle: `progress-int-${Date.now()}`,
        passwordHash: await hash("x", 10),
      },
      select: { id: true },
    });
    userId = user.id;

    await prisma.questionAttempt.createMany({
      data: [
        { userId, questionId: null, subjectName: "s", topic: "t", correct: true, source: "practice" },
        { userId, questionId: null, subjectName: "s", topic: "t", correct: true, source: "practice" },
        { userId, questionId: null, subjectName: "s", topic: "t", correct: false, source: "practice" },
      ],
    });

    await recomputeAndAward(prisma, userId, 20, 0);

    let row = await prisma.userProgress.findUniqueOrThrow({ where: { userId } });
    expect(row).toMatchObject({ points: 20, questionsAnswered: 3, accuracy: 67, examsAttempted: 0 });

    // Second call exercises the ON CONFLICT DO UPDATE path.
    await prisma.questionAttempt.createMany({
      data: [{ userId, questionId: null, subjectName: "s", topic: "t", correct: true, source: "exam" }],
    });
    await recomputeAndAward(prisma, userId, 5, 1);

    row = await prisma.userProgress.findUniqueOrThrow({ where: { userId } });
    expect(row).toMatchObject({ points: 25, questionsAnswered: 4, accuracy: 75, examsAttempted: 1 });
  });
});
