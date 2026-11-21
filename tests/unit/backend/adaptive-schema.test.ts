import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const schema = readFileSync(
  resolve(process.cwd(), "database/prisma/schema.prisma"),
  "utf8",
);

const ADAPTIVE_MODELS = [
  "AdaptiveExamProfile",
  "HistoricalImportBatch",
  "HistoricalImportIssue",
  "HistoricalQuestion",
  "HistoricalAnalyticsSnapshot",
  "AdaptiveBlueprint",
  "AdaptivePaperSnapshot",
  "AdaptiveAnswerKey",
  "CandidatePerformanceSnapshot",
  "AdaptiveExamSession",
  "AdaptiveScoreReport",
  "AdaptiveAuditEvent",
] as const;

function modelBlock(name: string): string {
  const match = schema.match(
    new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) throw new Error(`Prisma model ${name} not found`);
  return match[1];
}

/** Remove line comments so comment prose cannot satisfy a field assertion. */
function codeOnly(block: string): string {
  return block.replace(/\/\/.*$/gm, "");
}

/**
 * Scalar columns only. Prisma relation fields (e.g. the one-to-one back-link
 * `answerKey AdaptiveAnswerKey?`) create no column and cannot leak a value
 * unless a caller explicitly includes them; DTO exposure is guarded by the
 * contract tests in adaptive-contracts.test.ts.
 */
function scalarColumns(block: string): string {
  return codeOnly(block)
    .split("\n")
    .filter((line) =>
      /\b(String|Int|BigInt|Boolean|DateTime|Json|Float|Decimal|Bytes)\b/.test(line),
    )
    .join("\n");
}

describe("adaptive persistence schema", () => {
  it("declares all twelve additive models", () => {
    for (const name of ADAPTIVE_MODELS) {
      expect(schema).toMatch(new RegExp(`model\\s+${name}\\s*\\{`));
    }
  });

  it("gives every new model an explicit index (FKs are not auto-indexed)", () => {
    for (const name of ADAPTIVE_MODELS) {
      expect(modelBlock(name), `${name} has no @@index`).toMatch(/@@index\(/);
    }
  });

  it("keeps the candidate paper table free of any answer-bearing column", () => {
    const paper = scalarColumns(modelBlock("AdaptivePaperSnapshot"));
    expect(paper).toMatch(/questions\s+Json/);
    expect(paper).toMatch(/contentHash\s+String/);
    expect(paper).not.toMatch(/answer/i);
    expect(paper).not.toMatch(/correct/i);
    expect(paper).not.toMatch(/explanation/i);

    // The only answer reference is the server-side one-to-one back-relation,
    // never a scalar column on the paper itself.
    const key = modelBlock("AdaptiveAnswerKey");
    expect(key).toMatch(/paperId\s+String\s+@unique/);
  });

  it("stores the answer key in a separate, paper-bound table", () => {
    const key = modelBlock("AdaptiveAnswerKey");
    expect(key).toMatch(/paperId\s+String\s+@unique/);
    expect(key).toMatch(/paper\s+AdaptivePaperSnapshot\s+@relation/);
    expect(key).toMatch(/contentHash\s+String/);
    expect(key).toMatch(/entries\s+Json/);
    expect(key).toMatch(/onDelete:\s*Restrict/);
  });

  it("versions and hashes profile and blueprint snapshots", () => {
    const profile = modelBlock("AdaptiveExamProfile");
    expect(profile).toMatch(/@@unique\(\[profileId,\s*version\]\)/);
    expect(profile).toMatch(/contentHash\s+String/);
    expect(profile).toMatch(/verificationStatus\s+String/);

    const blueprint = modelBlock("AdaptiveBlueprint");
    expect(blueprint).toMatch(/profileSnapshot\s+AdaptiveExamProfile\s+@relation/);
    expect(blueprint).toMatch(/candidateAdaptation\s+Json/);
    expect(blueprint).toMatch(/dataSufficiency\s+Json/);
    expect(blueprint).toMatch(/contentHash\s+String/);
    expect(blueprint).toMatch(/onDelete:\s*Restrict/);
  });

  it("separates historical source claims from verified answers", () => {
    const history = modelBlock("HistoricalQuestion");
    expect(history).toMatch(/claimedAnswer\s+String\?/);
    expect(history).toMatch(/verifiedAnswer\s+String\?/);
    expect(history).toMatch(/originalSourceText\s+String\s+@db\.Text/);
    expect(history).toMatch(/normalizedText\s+String\s+@db\.Text/);
    expect(history).toMatch(/eligibleForPyq\s+Boolean/);
    expect(history).toMatch(/verification\s+String/);
    expect(history).not.toMatch(/@@unique\(\[claimedAnswer/);

    const batch = modelBlock("HistoricalImportBatch");
    expect(batch).toMatch(/fileHash\s+String\?/);
    expect(batch).toMatch(/report\s+Json/);
    const issue = modelBlock("HistoricalImportIssue");
    expect(issue).toMatch(/preservedRef\s+String/);
  });

  it("makes the session timer, idempotency and concurrency server-owned", () => {
    const session = modelBlock("AdaptiveExamSession");
    expect(session).toMatch(/expiresAt\s+DateTime/);
    expect(session).toMatch(/version\s+Int\s+@default\(1\)/);
    expect(session).toMatch(/@@unique\(\[userId,\s*idempotencyKey\]\)/);
    expect(session).toMatch(/legacyAttemptId\s+Int\?/);
    // Soft link: no relation declaration on the legacy id.
    expect(codeOnly(session)).not.toMatch(/legacyAttemptId[^\n]*@relation/);
    expect(session).toMatch(/@@index\(\[expiresAt\]\)/);
  });

  it("pins scores to the immutable paper and profile used at start", () => {
    const report = modelBlock("AdaptiveScoreReport");
    expect(report).toMatch(/attemptId\s+String\s+@unique/);
    expect(report).toMatch(/paperId\s+String/);
    expect(report).toMatch(/profileVersion\s+Int/);
    expect(report).toMatch(/score\s+Json/);
    expect(report).toMatch(/report\s+Json/);
    expect(report).toMatch(/contentHash\s+String/);
  });

  it("has an append-only audit table with redacted metadata", () => {
    const audit = modelBlock("AdaptiveAuditEvent");
    expect(audit).toMatch(/requestId\s+String/);
    expect(audit).toMatch(/correlationId\s+String\?/);
    expect(audit).toMatch(/entityType\s+String/);
    expect(audit).toMatch(/metadata\s+Json/);
    expect(audit).toMatch(/@@index\(\[name,\s*occurredAt\]\)/);
    expect(audit).toMatch(/@@index\(\[requestId\]\)/);
  });

  it("leaves the syllabus-driven pipeline and live question table untouched", () => {
    const question = codeOnly(modelBlock("Question"));
    expect(question).toMatch(/correctAnswer\s+String/);
    expect(question).not.toMatch(/verifiedAnswer/);
    expect(question).not.toMatch(/provenance/);

    const attempt = codeOnly(modelBlock("ExamAttempt"));
    expect(attempt).not.toMatch(/profileId/);
    expect(attempt).not.toMatch(/blueprintId/);
    expect(attempt).toMatch(/idempotencyKey/);
  });

  it("declares the User back-relations needed by the new user-owned tables", () => {
    const user = modelBlock("User");
    expect(user).toMatch(/adaptiveExamSessions\s+AdaptiveExamSession\[\]/);
    expect(user).toMatch(/candidateSnapshots\s+CandidatePerformanceSnapshot\[\]/);
  });
});
