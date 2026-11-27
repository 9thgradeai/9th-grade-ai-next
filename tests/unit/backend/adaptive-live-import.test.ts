import { describe, expect, it, vi } from "vitest";

import { createLiveQuestionImportService } from "~backend/services/adaptive-exam/live-question-import";
import { getSeedProfile } from "~backend/services/adaptive-exam/profile-seeds";
import type { HistoricalQuestionRecord } from "~backend/services/adaptive-exam/contracts";

const NOW = "2026-11-28T00:00:00.000Z";
const PROFILE_ID = "BCS_PRELIMINARY" as never;

function row(id: string, claimed: "A" | "B" | null) {
  return {
    id,
    family: "BCS",
    organization: "BPSC",
    recruitmentPost: "BCS",
    examinationName: "BCS Preliminary",
    examYear: 2024,
    examDate: null,
    stage: "PRELIMINARY",
    paperSet: null,
    subjectId: "bangla",
    subjectName: "Bangla",
    topicPath: "bangla/sahitya",
    subtopicPath: null,
    originalLanguage: "bn",
    questionText: `question ${id}`,
    options: { A: "ক", B: "খ", C: "গ", D: "ঘ" },
    claimedAnswer: claimed,
    verifiedAnswer: null,
    explanation: null,
    verification: claimed ? "SOURCE_CLAIMED" : "UNVERIFIED",
    explanationOrigin: "none",
    provenance: { sourceType: "PYQ", sourceFile: "live-bank" },
    classification: { status: "unclassified" },
    duplicateGroupId: null,
    originalSourceText: `source ${id}`,
    normalizedText: `question ${id}`,
    eligibleForPyq: false,
    importBatchId: "batch-1",
    contentHash: `hash-${id}`,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
}

function client(batchStatus: string, rows: ReturnType<typeof row>[]) {
  const updates = vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
    id: where.id,
    ...data,
  }));
  return {
    updates,
    prisma: {
      historicalImportBatch: {
        findUnique: vi.fn(async () => ({
          id: "batch-1",
          status: batchStatus,
          createdAt: new Date(NOW),
          sourceRef: "live-question-bank:BCS_PRELIMINARY",
        })),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "batch-1", ...data })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "batch-1", ...data })),
      },
      historicalQuestion: {
        create: vi.fn(async () => ({})),
        findMany: vi.fn(async () => rows),
        count: vi.fn(async () => rows.length),
        update: updates,
        deleteMany: vi.fn(async () => ({ count: rows.length })),
      },
      question: { findMany: vi.fn(async () => []) },
    } as never,
  };
}

function service(prisma: never, verifyDecision: "accept" | "reject" = "accept") {
  return createLiveQuestionImportService({
    client: prisma,
    clock: { now: () => NOW },
    requestId: "test-request",
    verification: {
      async verify(input) {
        return verifyDecision === "accept"
          ? {
              accepted: true,
              correctOption: input.claimedOption,
              reason: "independent agreement",
              method: "independent-solver" as const,
              confidence: 0.9,
            }
          : {
              accepted: false,
              reason: "independent solver disagrees",
              method: "independent-solver" as const,
              confidence: 0.9,
            };
      },
    },
  });
}

describe("admin live-question verification gate", () => {
  it("upgrades only independently agreed claims and marks disagreements as disputed", async () => {
    const { prisma, updates } = client("PREVIEW", [
      row("q1", "A"),
      row("q2", "B"),
      row("q3", null),
    ]);
    const result = await service(prisma, "accept").verifyBatch("batch-1", PROFILE_ID);

    expect(result).toMatchObject({ accepted: 2, rejected: 0, skipped: 1 });
    expect(result.decisions.map((decision) => decision.status)).toEqual([
      "CROSS_CHECKED",
      "CROSS_CHECKED",
      "UNVERIFIED",
    ]);
    const q1 = updates.mock.calls.find(([call]) => call.where.id === "q1")?.[0].data;
    const q3 = updates.mock.calls.find(([call]) => call.where.id === "q3")?.[0].data;
    expect(q1).toMatchObject({ verification: "CROSS_CHECKED", verifiedAnswer: "A", eligibleForPyq: true });
    expect(q3).toMatchObject({ verification: "UNVERIFIED", verifiedAnswer: null, eligibleForPyq: false });
  });

  it("makes a rejected claim ineligible for PYQ use", async () => {
    const { prisma, updates } = client("PREVIEW", [row("q1", "A")]);
    const result = await service(prisma, "reject").verifyBatch("batch-1", PROFILE_ID);
    expect(result).toMatchObject({ accepted: 0, rejected: 1 });
    expect(updates.mock.calls[0][0].data).toMatchObject({
      verification: "DISPUTED",
      verifiedAnswer: null,
      eligibleForPyq: false,
    });
  });

  it("refuses to verify a batch that is not in preview", async () => {
    const { prisma } = client("IMPORTED", []);
    await expect(service(prisma).verifyBatch("batch-1", PROFILE_ID)).rejects.toThrow(/preview/i);
  });

  it("keeps verified eligibility untouched when importing an approved batch", async () => {
    const { prisma, updates } = client("APPROVED", [row("q1", "A"), row("q2", "B")]);
    const ctx = { userId: "admin-1", requestId: "r", ports: {} as never };
    const importService = service(prisma);
    const report = await importService.importBatch("batch-1", ctx);
    expect(report.totals.imported).toBe(2);
    expect(updates).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eligibleForPyq: false }),
    }));
  });

  it("stages live-bank rows as source-claimed and PYQ-ineligible", async () => {
    const profile = getSeedProfile("BCS_PRELIMINARY");
    if (!profile) throw new Error("missing seed profile");
    const { prisma } = client("PREVIEW", []);
    const record: HistoricalQuestionRecord = {
      id: "live-1",
      family: "BCS",
      organization: "BPSC",
      recruitmentPost: "BCS",
      examinationName: "BCS Preliminary",
      stage: "PRELIMINARY",
      subjectId: "bangla",
      subjectName: "Bangla",
      topicPath: "bangla/sahitya",
      originalLanguage: "bn",
      questionText: "কে লিখেছেন?",
      options: { A: "ক", B: "খ", C: "গ", D: "ঘ" },
      claimedAnswer: "A",
      verification: "SOURCE_CLAIMED",
      explanationOrigin: "none",
      provenance: { sourceType: "PYQ", sourceFile: "live-bank" },
      classification: { status: "unclassified" },
      originalSourceText: "source",
      normalizedText: "কে লিখেছেন?",
      eligibleForPyq: false,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const importService = createLiveQuestionImportService({
      client: prisma,
      clock: { now: () => NOW },
      requestId: "r",
      bridge: { read: vi.fn(async () => ({ records: [record], issues: [] })) },
    });
    const preview = await importService.preview(profile, { limit: 1 });
    expect(preview.records[0].claimedAnswer).toBe("A");
    expect(preview.records[0].verification).toBe("SOURCE_CLAIMED");
    expect(preview.records[0].eligibleForPyq).toBe(false);
  });
});
