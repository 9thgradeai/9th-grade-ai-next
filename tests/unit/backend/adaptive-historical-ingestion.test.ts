import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AdaptiveExecutionContext,
  AuditEvent,
  ExamAuditService,
} from "~backend/services/adaptive-exam/contracts";
import {
  dedupeParsedRecords,
  parseBankSoGeneralSource,
  parseUttoronSource,
} from "~backend/services/adaptive-exam/historical-content";
import {
  createHistoricalIngestionService,
  type HistoricalIngestionService,
} from "~backend/services/adaptive-exam/historical-ingestion";
import { createInMemoryHistoricalImportStore } from "~backend/services/adaptive-exam/historical-import-store";
import { createFileSystemHistoricalSourceReader } from "~backend/services/adaptive-exam/historical-source-reader";
import { getHistoricalSource, listHistoricalSources } from "~backend/services/adaptive-exam/historical-sources";

const NOW = "2026-11-22T00:00:00.000Z";
const tempDirs: string[] = [];

function mustSource(id: string) {
  const source = getHistoricalSource(id);
  if (!source) throw new Error(`Missing source ${id}`);
  return source;
}

function executionContext(userId = "admin-1"): AdaptiveExecutionContext {
  return {
    userId,
    requestId: "req-historical",
    ports: {} as AdaptiveExecutionContext["ports"],
  };
}

function fakeReader(textById: Record<string, string>) {
  return {
    async read(source: { id: string; filePath: string }) {
      const text = textById[source.id] ?? "";
      return {
        text,
        sha256: "a".repeat(64),
        byteSize: Buffer.byteLength(text),
        retrievedAt: NOW,
      };
    },
  };
}

function createService(
  textById: Record<string, string>,
  options: { audit?: ExamAuditService; defaultSourceId?: string } = {},
): HistoricalIngestionService {
  return createHistoricalIngestionService({
    store: createInMemoryHistoricalImportStore(),
    reader: fakeReader(textById),
    clock: { now: () => NOW },
    requestId: "req-historical",
    audit: options.audit,
    defaultSourceId: options.defaultSourceId,
  });
}

function auditSpy(): { audit: ExamAuditService; events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  const audit: ExamAuditService = {
    async record(event) {
      events.push(event);
    },
    async query() {
      return events;
    },
  };
  return { audit, events };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("historical source catalogue", () => {
  it("exposes only explicit repository sources", () => {
    const all = listHistoricalSources();
    expect(all).toHaveLength(7);
    expect(all.every((source) => source.filePath.startsWith("database/data/"))).toBe(true);
    expect(mustSource("uttoron:bcs-preliminary").reviewScope).toBe("DISCOVERY_ONLY");
    expect(mustSource("bb-so-general:2019").reviewScope).toBe("PENDING_VERIFICATION");
  });

  it("never resolves traversal strings as source refs", async () => {
    const service = createService({});
    expect(await service.discover("../etc/passwd")).toEqual([]);
    expect(await service.discover("https://example.com/questions.txt")).toEqual([]);
  });

  it("refuses to preview discovery-only BCS data", async () => {
    const service = createService({});
    await expect(
      service.createPreviewBatch("uttoron:bcs-preliminary", executionContext()),
    ).rejects.toMatchObject({ adaptiveCode: "ADAPTIVE_HISTORICAL_SCOPE_INVALID" });
  });
});

describe("UTTORON JSON parsing", () => {
  const source = mustSource("uttoron:bcs-preliminary");

  const payload = {
    metadata: { total_questions: 99 },
    exams: [
      {
        slug: "50th_bcs",
        date: "2026-01-30",
        set_code: "সেট- A",
        total_questions: 100,
      },
    ],
    questions: [
      {
        question_number: 1,
        subject_id: "2",
        question: "Choose the correct word.",
        option_a: "alpha",
        option_b: "beta",
        option_c: "gamma",
        option_d: "delta",
        correct_answer: "B",
        solve_note: "Historical explanation.",
        exam_slug: "50th_bcs",
      },
      {
        question_number: 2,
        subject_id: "2",
        question: "Blank answer row.",
        option_a: "one",
        option_b: "two",
        option_c: "three",
        option_d: "four",
        correct_answer: "",
        exam_slug: "50th_bcs",
      },
      {
        question_number: 3,
        subject_id: "2",
        question: "Missing option row.",
        option_a: "one",
        option_b: "two",
        option_c: "three",
        option_d: "",
        correct_answer: "A",
        exam_slug: "50th_bcs",
      },
    ],
  };

  it("preserves claims, omits guesses and counts from the array, not metadata", () => {
    const outcome = parseUttoronSource(JSON.stringify(payload), source, NOW);
    expect(outcome.records).toHaveLength(2);
    expect(outcome.issues.some((issue) => issue.reason.includes("missing"))).toBe(true);

    const [first, second] = outcome.records;
    expect(first.record.claimedAnswer).toBe("B");
    expect(first.record.verifiedAnswer).toBeUndefined();
    expect(first.record.verification).toBe("SOURCE_CLAIMED");
    expect(first.record.eligibleForPyq).toBe(false);
    expect(first.record.classification.status).toBe("unclassified");
    expect(first.record.classification.difficulty).toBeUndefined();
    expect(first.record.subjectId).toBe("bcs.english");
    expect(first.record.examYear).toBe(2026);
    expect(first.record.paperSet).toBe("সেট- A");
    expect(first.record.explanationOrigin).toBe("historical");
    expect(first.record.originalSourceText).toContain("Choose the correct word.");

    expect(second.record.claimedAnswer).toBeUndefined();
    expect(second.record.verification).toBe("UNVERIFIED");
  });
});

describe("Bank Senior Officer text parsing", () => {
  const source = mustSource("bb-so-general:2019");

  it("parses a single-line record with a source-claimed answer", () => {
    const text =
      "1. Choose the correct option. A. one | B. two | C. three | D. four Ans. b. two ব্যাখ্যা: reason";
    const outcome = parseBankSoGeneralSource(text, source, NOW);
    expect(outcome.records).toHaveLength(1);
    const record = outcome.records[0].record;
    expect(record.questionText).toBe("Choose the correct option.");
    expect(record.options).toEqual({ A: "one", B: "two", C: "three", D: "four" });
    expect(record.claimedAnswer).toBe("B");
    expect(record.verification).toBe("SOURCE_CLAIMED");
    expect(record.explanation).toBe("reason");
    expect(record.eligibleForPyq).toBe(false);
  });

  it("marks explicit source caveats as disputed and keeps the section mapping", () => {
    const text = [
      "■ English Section",
      "১. কোনটি সঠিক?",
      "ক. এক | খ. দুই | গ. তিন | ঘ. চার",
      "Ans. খ. দুই (Note mismatch in source text)",
      "ব্যাখ্যা: কারণ",
    ].join("\n");
    const outcome = parseBankSoGeneralSource(text, source, NOW);
    expect(outcome.records).toHaveLength(1);
    const record = outcome.records[0].record;
    expect(record.subjectId).toBe("bank.english");
    expect(record.claimedAnswer).toBe("B");
    expect(record.verification).toBe("DISPUTED");
    expect(record.eligibleForPyq).toBe(false);
  });

  it("does not invent an answer when the source supplies none", () => {
    const text = "1. Pick one A. a | B. b | C. c | D. d Ans. Note (সঠিক উত্তর নেই)";
    const outcome = parseBankSoGeneralSource(text, source, NOW);
    expect(outcome.records).toHaveLength(1);
    expect(outcome.records[0].record.claimedAnswer).toBeUndefined();
    expect(outcome.records[0].record.verification).toBe("UNVERIFIED");
  });

  it("flags repeated normalised questions without deleting them", () => {
    const text = [
      "1. Same question? A. one | B. two | C. three | D. four Ans. a. one",
      "2.   Same   question? A. one | B. two | C. three | D. four Ans. a. one",
    ].join("\n");
    const parsed = parseBankSoGeneralSource(text, source, NOW);
    const deduped = dedupeParsedRecords(parsed.records);
    expect(deduped.records).toHaveLength(2);
    expect(deduped.duplicateCount).toBe(1);
    expect(deduped.records[0].record.duplicateGroupId).toBe(
      deduped.records[1].record.duplicateGroupId,
    );
  });
});

describe("ingestion lifecycle", () => {
  const sourceId = "bb-so-general:2019";
  const text =
    "1. Lifecycle question A. one | B. two | C. three | D. four Ans. b. two ব্যাখ্যা: reason";

  it("keeps preview rows non-imported until approval, then supports rollback", async () => {
    const { audit, events } = auditSpy();
    const service = createService({ [sourceId]: text }, { audit });

    const batchId = await service.createPreviewBatch(sourceId, executionContext());
    const preview = await service.preview(batchId);
    expect(preview.totals.parsed).toBe(1);
    expect(preview.totals.imported).toBe(0);
    expect(preview.totals.unverified).toBe(1);
    expect(preview.exceptions.some((issue) => issue.reason.includes("No record is PYQ-eligible"))).toBe(true);

    await expect(service.importBatch(batchId, executionContext())).rejects.toMatchObject({
      adaptiveCode: "ADAPTIVE_IMPORT_CONFLICT",
    });
    await service.approve(batchId, executionContext());
    const imported = await service.importBatch(batchId, executionContext());
    expect(imported.totals.imported).toBe(1);
    expect(events.some((event) => event.name === "HISTORICAL_IMPORT_APPROVED")).toBe(true);

    const rolledBack = await service.rollback(batchId, executionContext());
    expect((await service.getBatch(batchId))?.status).toBe("ROLLED_BACK");
    expect(rolledBack.totals.imported).toBe(0);
    expect(events.some((event) => event.name === "HISTORICAL_IMPORT_ROLLED_BACK")).toBe(true);
  });

  it("requires an authenticated actor for approval and import", async () => {
    const service = createService({ [sourceId]: text });
    const batchId = await service.createPreviewBatch(sourceId, executionContext());
    await expect(service.approve(batchId, executionContext(""))).rejects.toMatchObject({
      adaptiveCode: "ADAPTIVE_UNAUTHORIZED",
    });
    await service.approve(batchId, executionContext());
    await expect(service.importBatch(batchId, executionContext(""))).rejects.toMatchObject({
      adaptiveCode: "ADAPTIVE_UNAUTHORIZED",
    });
  });

  it("never reports a claimed answer as independently verified", async () => {
    const service = createService({ [sourceId]: text }, { defaultSourceId: sourceId });
    const records = await service.parse(text);
    expect(records[0].claimedAnswer).toBe("B");
    expect(await service.extractAnswer(records[0])).toBe("B");
    expect(await service.verify(records[0])).toBe("SOURCE_CLAIMED");
    const classified = await service.classify(records[0]);
    expect(classified.classification.difficulty).toBeUndefined();
  });
});

describe("filesystem source reader", () => {
  it("hashes configured files and rejects paths outside the root", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "adaptive-history-"));
    tempDirs.push(dir);
    await writeFile(path.join(dir, "safe.txt"), "safe content", "utf8");
    const reader = createFileSystemHistoricalSourceReader({ rootDir: dir, now: () => NOW });
    const safe = { ...mustSource("bb-so-general:2019"), filePath: "safe.txt" };
    const content = await reader.read(safe);
    expect(content.text).toBe("safe content");
    expect(content.sha256).toHaveLength(64);

    const escaping = { ...safe, filePath: "../outside.txt" };
    await expect(reader.read(escaping)).rejects.toThrow(/escapes the configured root/);
  });
});
