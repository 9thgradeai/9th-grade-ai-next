// @vitest-environment node
// Integration test: imported Bangla-grammar MCQs (scripts/import-bangla-vasha.ts)
// are readable through the REAL getQuestionsPage service — the exact read path
// behind GET /api/questions, which both the Practice tab and the Real Exam tab
// use to fetch subject-wise questions. Exists because unit tests mock Prisma,
// so they cannot prove the imported rows are actually served per-ecosystem.
// Skips when no DATABASE_URL is available or the database is unreachable.
// Instantiates its own PrismaClient because tests/setup.ts globally mocks
// ~backend/db.
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { getQuestionsPage } from "~backend/services/content";
import { isBanglaSubjectName } from "~backend/services/bangla-union";
import { prisma as mockedPrisma } from "~backend/db";

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

// The four sourceExam labels written by import-bangla-vasha.ts. বাগধারা routes
// to a standalone leaf (no taxonomy node); the rest hit existing ভাষা leaves.
const NEW_LABELS = ["সমাস", "বাগধারা", "বাক্য সংকোচন, এক কথায় প্রকাশ", "প্রকৃতি ও প্রত্যয়"];
const LEAF_OF: Record<string, string> = {
  সমাস: "সমাস",
  বাগধারা: "বাগধারা",
  "বাক্য সংকোচন, এক কথায় প্রকাশ": "বাক্য",
  "প্রকৃতি ও প্রত্যয়": "প্রত্যয়",
};

describe("import-bangla-vasha rows (real PostgreSQL read path)", () => {
  const prisma = new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    log: ["error"],
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // 120s: the first attempt opens a fresh PostgreSQL connection pool (later
  // attempts reuse it), which can exceed the 30s global testTimeout.
  it("serves each new file's MCQs through getQuestionsPage for BOTH ecosystems", { timeout: 120_000 }, async (ctx) => {
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

    // tests/setup.ts globally deep-mocks ~backend/db, so getQuestionsPage's
    // module-singleton prisma would otherwise resolve to vi.fn stubs. Point
    // the delegates this service touches at the REAL client (the setup mock's
    // `set` trap caches the assignment) so the query path genuinely hits
    // PostgreSQL. Only the methods getQuestionsPage/buildQuestionWhere call
    // are replaced.
    const real = prisma as unknown as Record<string, unknown>;
    const target = mockedPrisma as unknown as Record<string, unknown>;
    for (const key of ["question", "subject"]) {
      target[key] = real[key];
    }

    const ecosystems = await prisma.examEcosystem.findMany({
      where: { code: { in: ["BCS", "BANGLADESH_BANK"] } },
      select: { id: true, code: true },
    });
    expect(ecosystems.map((e) => e.code).sort()).toEqual(["BANGLADESH_BANK", "BCS"]);

    // Resolve each ecosystem's Bangla subject up front (also used to prove the
    // union spans both). `isBanglaSubjectName` — the same predicate the union
    // uses — excludes lookalikes such as "বাংলাদেশ বিষয়াবলি" that a naive
    // `contains: "বাংলা"` match would wrongly pick up.
    const subjectsByEco = new Map<number, { id: number; nameBn: string }>();
    for (const eco of ecosystems) {
      const candidates = await prisma.subject.findMany({
        where: { ecosystemId: eco.id },
        select: { id: true, nameBn: true },
      });
      const subject = candidates.find((s) => isBanglaSubjectName(s.nameBn)) ?? null;
      expect(subject, `Bangla subject missing for ${eco.code}`).toBeTruthy();
      if (subject) subjectsByEco.set(eco.id, subject);
    }

    // Absolute taxonomy root per Bangla subject (first path segment of any of
    // its rows) — the union matches sibling leaves by relative suffix, and the
    // own-side filter needs the own-side ABSOLUTE path, exactly as the client
    // sends it (topic-tree paths start at the subject root, no leading slash).
    const rootBySubject = new Map<number, string>();
    for (const subject of subjectsByEco.values()) {
      const sample = await prisma.question.findFirst({
        where: { subjectId: subject.id, path: { not: "" } },
        select: { path: true },
      });
      expect(sample?.path, `no rows to derive root path for subject ${subject.id}`).toBeTruthy();
      if (sample?.path) rootBySubject.set(subject.id, sample.path.split("/")[0]);
    }

    for (const label of NEW_LABELS) {
      const sourceExam = `Bangla Grammar · ${label}`;

      // Per-ecosystem row counts (what the import wrote).
      const perEco = new Map<number, number>();
      for (const eco of ecosystems) {
        const subject = subjectsByEco.get(eco.id)!;
        const count = await prisma.question.count({
          where: { subjectId: subject.id, sourceExam },
        });
        expect(count, `${eco.code}/${label} rows missing`).toBeGreaterThan(0);
        perEco.set(eco.id, count);
      }
      const sumBoth = [...perEco.values()].reduce((a, b) => a + b, 0);

      // The Practice/Real-Exam read path applies the Bangla union: for a Bangla
      // subject the ecosystem constraint is dropped and BOTH subjects are
      // queried (backend/services/bangla-union.ts). So one call, made from
      // either ecosystem's tab, serves the merged pool — this is what makes the
      // MCQs appear under both BCS and Bank. The union total must therefore
      // equal the sum across ecosystems, not just one side. The client passes
      // the selected node's absolute path on its OWN subject; the union maps it
      // onto the sibling by suffix — so we do the same here, per side.
      const unionTotalFrom = async (ecoId: number): Promise<number> => {
        const subject = subjectsByEco.get(ecoId)!;
        const leafPath = `${rootBySubject.get(subject.id)}/ভাষা/${LEAF_OF[label]}`;
        const { total, questions } = await getQuestionsPage({
          subject: subject.nameBn,
          paths: [leafPath],
          ecosystemId: ecoId,
          sourceExam,
          limit: 200,
        });
        // Every served row is a well-formed practice-pool MCQ, from either
        // ecosystem's subject.
        const servedSubjectIds = new Set([...subjectsByEco.values()].map((s) => s.id));
        for (const q of questions) {
          expect(servedSubjectIds.has(q.subjectId), `${label} stray subject`).toBe(true);
          expect(q.question.length).toBeGreaterThan(0);
          expect(q.options.length).toBeGreaterThanOrEqual(4);
          expect(q.options).toContain(q.correctAnswer);
          // Practice pool: must NOT be a PYQ row (paperId stays null).
          expect(q.paperId).toBeNull();
        }
        expect(questions.length, `${label} no rows served`).toBeGreaterThan(0);
        return total;
      };

      const fromFirst = ecosystems[0];
      const fromSecond = ecosystems[1];
      const totalFirst = await unionTotalFrom(fromFirst.id);
      expect(totalFirst, `${label} union total != sum of both ecosystems`)
        .toBe(sumBoth);
      // Symmetric: the other ecosystem's tab must serve the identical merged
      // pool (this is the "fetched on both BCS and Bank sections" guarantee).
      const totalSecond = await unionTotalFrom(fromSecond.id);
      expect(totalSecond, `${label} union asymmetric across ecosystems`)
        .toBe(totalFirst);
    }
  });
});
