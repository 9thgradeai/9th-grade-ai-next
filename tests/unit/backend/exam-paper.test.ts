import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { buildConfiguredPaper, getPaperReadiness } from "~backend/services/exam-paper";
import { BCS_PRELIMINARY_CONFIG } from "~backend/services/exam-config";
import { clearBanglaSubjectsCache } from "~backend/services/bangla-union";
import { AppError } from "~backend/errors";

type QRow = {
  id: number;
  subjectId: number;
  path: string;
  topic: string;
  subtopic: string;
  question: string;
  options: string[];
  difficulty: string;
  sourceExam: string;
  year: number | null;
};

const SUBJECTS = [
  { id: 601, nameBn: "বাংলা ভাষা ও সাহিত্য" },
  { id: 602, nameBn: "English Language and Literature" },
  { id: 603, nameBn: "বাংলাদেশ বিষয়াবলি" },
  { id: 604, nameBn: "আন্তর্জাতিক বিষয়াবলী" },
  { id: 605, nameBn: "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা" },
  { id: 606, nameBn: "সাধারণ বিজ্ঞান" },
  { id: 607, nameBn: "কম্পিউটার ও তথ্য প্রযুক্তি" },
  { id: 608, nameBn: "গাণিতিক যুক্তি" },
  { id: 609, nameBn: "মানসিক দক্ষতা" },
  { id: 610, nameBn: "নৈতিকতা, মূল্যবোধ ও সু-শাসন" },
];

function subjectIdForRoot(rootSegment: string): number {
  const cfg = BCS_PRELIMINARY_CONFIG.subjects.find((s) => s.rootSegment === rootSegment);
  const idx = BCS_PRELIMINARY_CONFIG.subjects.indexOf(cfg!);
  return 601 + idx;
}

/** Build a synthetic question bank: one leaf prefix per config leaf, 500 each. */
function buildQuestionBank(): QRow[] {
  const rows: QRow[] = [];
  let id = 1;
  for (const subject of BCS_PRELIMINARY_CONFIG.subjects) {
    const subjectId = subjectIdForRoot(subject.rootSegment);
    const leafPaths: string[] = [];
    const walk = (nodes: typeof subject.children) => {
      for (const n of nodes) {
        if (n.children.length === 0) leafPaths.push(...n.paths);
        else walk(n.children);
      }
    };
    walk(subject.children);
    for (const path of leafPaths) {
      for (let i = 0; i < 500; i++) {
        rows.push({
          id: id++,
          subjectId,
          path,
          topic: path.split("/").slice(-2)[0] ?? "",
          subtopic: "",
          question: `Q${id}`,
          options: ["a", "b", "c", "d"],
          difficulty: "MEDIUM",
          sourceExam: "BCS",
          year: null,
        });
      }
    }
  }
  return rows;
}

function installMockPrisma(
  bank: QRow[],
  extraSubjects: Array<{ id: number; nameBn: string }> = [],
) {
  vi.mocked(prisma.examEcosystem.findUnique).mockResolvedValue({
    id: 1,
    code: "BCS",
    nameBn: "বিসিএস",
    isActive: true,
    sortOrder: 0,
  } as never);
  vi.mocked(prisma.subject.findMany).mockResolvedValue(
    [...SUBJECTS, ...extraSubjects] as never,
  );
  vi.mocked(prisma.question.groupBy).mockResolvedValue(
    (() => {
      const map = new Map<string, { subjectId: number; path: string; _count: { _all: number } }>();
      for (const q of bank) {
        const key = `${q.subjectId}\u0000${q.path}`;
        const row = map.get(key);
        if (row) row._count._all += 1;
        else map.set(key, { subjectId: q.subjectId, path: q.path, _count: { _all: 1 } });
      }
      return [...map.values()];
    })() as never,
  );
  vi.mocked(prisma.question.findMany).mockImplementation((async (args: {
    where?: { subjectId?: number; path?: string; id?: { in: number[] } };
    select?: Record<string, boolean>;
  }) => {
    if (args?.select?.question === true) {
      const ids = new Set(args.where?.id?.in ?? []);
      return bank.filter((q) => ids.has(q.id));
    }
    return bank
      .filter(
        (q) =>
          q.subjectId === args?.where?.subjectId &&
          (args?.where?.path === undefined || q.path === args.where.path),
      )
      .map((q) => ({ id: q.id }));
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBanglaSubjectsCache();
  vi.mocked(prisma.question.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.question.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.subject.findMany).mockResolvedValue([] as never);
});

describe("buildConfiguredPaper", () => {
  it("assembles a full BCS mock paper of exactly 200 unique questions", async () => {
    installMockPrisma(buildQuestionBank());

    const paper = await buildConfiguredPaper({
      ecosystemCode: "BCS",
      mode: "mock",
      shuffleQuestions: false,
      seed: 7,
    });

    expect(paper.totalQuestions).toBe(200);
    expect(paper.questions).toHaveLength(200);
    expect(new Set(paper.questions.map((q) => q.id)).size).toBe(200);
    expect(paper.allocation.outcome).toBe("feasible");
    expect(paper.durationSec).toBe(120 * 60);
    expect(paper.configVersion).toBe(1);
    expect(paper.scoring.penaltyPerWrong).toBe(0.5);

    // Per-subject plan matches the official marks.
    const byId = new Map(paper.allocation.subjects.map((s) => [s.id, s.allocated]));
    expect(byId.get("bcs.bangla")).toBe(30);
    expect(byId.get("bcs.english")).toBe(30);
    expect(byId.get("bcs.international")).toBe(25);
    expect(byId.get("bcs.bangladesh")).toBe(25);
    expect(byId.get("bcs.science")).toBe(15);
  });

  it("is deterministic for a fixed seed", async () => {
    installMockPrisma(buildQuestionBank());
    const a = await buildConfiguredPaper({ ecosystemCode: "BCS", mode: "mock", seed: 42 });
    const b = await buildConfiguredPaper({ ecosystemCode: "BCS", mode: "mock", seed: 42 });
    expect(a.questions.map((q) => q.id)).toEqual(b.questions.map((q) => q.id));
  });

  it("fails explicitly with 422 when a full paper cannot be assembled", async () => {
    // No questions in the bank at all.
    installMockPrisma([]);
    await expect(
      buildConfiguredPaper({ ecosystemCode: "BCS", mode: "mock" }),
    ).rejects.toMatchObject({ statusCode: 422, code: "EXAM_PAPER_INFEASIBLE" });
  });

  it("builds a practice paper scoped to one subject", async () => {
    installMockPrisma(buildQuestionBank());
    const paper = await buildConfiguredPaper({
      ecosystemCode: "BCS",
      mode: "practice",
      selection: { subjects: [{ subjectId: "bcs.english" }], requested: 10 },
      shuffleQuestions: false,
      seed: 3,
    });
    expect(paper.allocation.subjects.map((s) => s.id)).toEqual(["bcs.english"]);
    expect(paper.totalQuestions).toBe(10);
    expect(paper.durationSec).toBe(10 * 30);
  });

  it("rejects an unknown ecosystem", async () => {
    await expect(
      buildConfiguredPaper({ ecosystemCode: "BCS", mode: "mock" }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("getPaperReadiness", () => {
  it("reports feasibility and per-subject capacity", async () => {
    installMockPrisma(buildQuestionBank());
    const r = await getPaperReadiness("BCS");
    expect(r?.feasible).toBe(true);
    expect(r?.required).toBe(200);
    expect(r?.subjects.find((s) => s.id === "bcs.science")?.capacity).toBeGreaterThanOrEqual(15);
  });

  it("reports infeasible with deficits when inventory is missing", async () => {
    installMockPrisma([]);
    const r = await getPaperReadiness("BCS");
    expect(r?.feasible).toBe(false);
    expect(r?.subjects.some((s) => s.deficit > 0)).toBe(true);
  });

  it("attributes union-sourced Bangla questions to the config subject (plan === paper)", async () => {
    const bank = buildQuestionBank();
    // Bangla is a cross-ecosystem shared pool (bangla-union): add a Bank Bangla
    // sibling holding rows at a taxonomy-relative suffix the BCS Bangla subject
    // also exposes, so those rows are eligible for the BCS paper.
    const bankBanglaId = 4958;
    const bankRoot = "০১_বাংলা_ভাষা_ও_সাহিত্য";
    const bangla = BCS_PRELIMINARY_CONFIG.subjects.find((s) => s.id === "bcs.bangla")!;
    const leaves: string[] = [];
    const walk = (nodes: typeof bangla.children) => {
      for (const n of nodes) {
        if (n.children.length === 0) leaves.push(...n.paths);
        else walk(n.children);
      }
    };
    walk(bangla.children);
    const suffix = leaves[0].slice(leaves[0].indexOf("/") + 1);
    const siblingPath = `${bankRoot}/${suffix}`;
    let id = 100_000;
    for (let i = 0; i < 400; i++) {
      bank.push({
        id: id++,
        subjectId: bankBanglaId,
        path: siblingPath,
        topic: suffix,
        subtopic: "",
        question: `S${i}`,
        options: ["a", "b", "c", "d"],
        difficulty: "MEDIUM",
        sourceExam: "BANK",
        year: null,
      });
    }

    installMockPrisma(bank, [{ id: bankBanglaId, nameBn: bankRoot }]);

    const paper = await buildConfiguredPaper({
      ecosystemCode: "BCS",
      mode: "mock",
      shuffleQuestions: false,
      seed: 3,
    });

    // The plan and the assembled paper MUST agree — union rows count toward the
    // config subject that bound them, not toward a phantom/empty subject.
    const planSum = paper.allocation.subjects.reduce((a, s) => a + s.allocated, 0);
    expect(paper.totalQuestions).toBe(200);
    expect(planSum).toBe(200);
    expect(paper.allocation.subjects.find((s) => s.id === "bcs.bangla")?.allocated).toBe(30);
    // No question resolves to a blank subject name.
    expect(paper.questions.every((q) => q.subject.length > 0)).toBe(true);
    // Union rows (Bank subjectId) are attributed to the BCS Bangla subject.
    for (const q of paper.questions.filter((q) => q.subjectId === bankBanglaId)) {
      expect(q.subject).toBe("বাংলা ভাষা ও সাহিত্য");
    }
  });
});
