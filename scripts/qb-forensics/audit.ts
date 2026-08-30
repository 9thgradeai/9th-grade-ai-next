/**
 * scripts/qb-forensics/audit.ts
 * ----------------------------------------------------------------------------
 * Read-only DB scan: pulls every Question row and classifies it. Also emits a
 * changelog-friendly shape. No writes; all writes go through migrate.ts.
 * ----------------------------------------------------------------------------
 */

import { PrismaClient } from "@prisma/client";
import type { AuditReport, ClassifiedRecord, QuestionRecord } from "./issues";
import { classifyRecord } from "./classify";

export async function scanDatabase(prisma: PrismaClient): Promise<ClassifiedRecord[]> {
  const rows = await prisma.question.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      subjectId: true,
      topic: true,
      subtopic: true,
      path: true,
      question: true,
      options: true,
      correctAnswer: true,
      explanation: true,
    },
  });

  return rows.map((r) => {
    const rec: QuestionRecord = {
      id: r.id,
      subjectId: r.subjectId,
      topic: r.topic,
      subtopic: r.subtopic,
      path: r.path,
      question: r.question,
      options: Array.isArray(r.options) ? (r.options as unknown as string[]) : [String(r.options)],
      correctAnswer: r.correctAnswer,
      explanation: r.explanation,
    };
    return classifyRecord(rec);
  });
}

export function buildReport(records: ClassifiedRecord[]): AuditReport {
  const totals = {
    scanned: records.length,
    autoFixeable: 0,
    reviewRequired: 0,
    clean: 0,
  };
  const issueCounts: Record<string, number> = {};
  const confidenceCounts: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const perSubject: AuditReport["perSubject"] = {};

  for (const r of records) {
    const key = String(r.subjectId);
    perSubject[key] ??= { scanned: 0, review: 0, fixed: 0, clean: 0 };
    perSubject[key].scanned++;

    const needsReview = r.verdict === "REVIEW";
    const reviews = r.reviewReasons.length > 0;

    if (needsReview || reviews || r.candidates.length > 0) {
      totals.reviewRequired++;
      perSubject[key].review++;
    } else if (r.fixes.length > 0) {
      totals.autoFixeable++;
      perSubject[key].fixed++;
    } else {
      totals.clean++;
      perSubject[key].clean++;
    }

    for (const reason of r.reviewReasons) {
      const code = reason.startsWith("options") ? "OPTIONS" : reason.startsWith("correctAnswer") ? "ANSWER" : reason.startsWith("path") || reason.startsWith("topic") || reason.startsWith("subtopic") ? "TAXONOMY" : "TEXT";
      issueCounts[code] = (issueCounts[code] ?? 0) + 1;
    }
    for (const c of r.candidates) {
      confidenceCounts[c.confidence] = (confidenceCounts[c.confidence] ?? 0) + 1;
      issueCounts[c.code] = (issueCounts[c.code] ?? 0) + 1;
    }
    for (const f of r.fixes) {
      confidenceCounts[f.confidence] = (confidenceCounts[f.confidence] ?? 0) + 1;
    }
    for (const f of r.fixes) {
      const code = f.code.split("+")[0];
      issueCounts[code] = (issueCounts[code] ?? 0) + 1;
    }
  }

  const samples = records
    .filter((r) => r.verdict === "REVIEW" || r.fixes.length > 0)
    .slice(0, 60)
    .map((r) => ({
      ...r,
      changedFields: [...new Set(r.fixes.map((f) => f.field))],
    }));

  return {
    generatedAt: new Date().toISOString(),
    scope: "database",
    totals,
    issueCounts,
    confidenceCounts: confidenceCounts as AuditReport["confidenceCounts"],
    perSubject,
    samples,
  };
}