/**
 * scripts/qb-audit/duplicate-detect.ts
 * ----------------------------------------------------------------------------
 * Phase 7: Duplicate / near-duplicate detection.
 * Uses normalized string comparison, token similarity, and Jaccard index.
 * ----------------------------------------------------------------------------
 */

import type { QuestionRecord, DuplicateGroup } from "./types";

function normalizeForComparison(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/[^\w\u0980-\u09FF\u09C0-\u09CD]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  const normalized = normalizeForComparison(s);
  const tokens = new Set(normalized.split(" ").filter(Boolean));
  return tokens;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function questionSignature(r: QuestionRecord): string {
  const parts = [
    normalizeForComparison(r.question),
    ...r.options.map(normalizeForComparison),
    normalizeForComparison(r.correctAnswer),
  ];
  return parts.join("|");
}

export function detectDuplicates(records: QuestionRecord[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];

  // ── Exact duplicates (same normalized signature) ──────────────────────
  const sigMap = new Map<string, QuestionRecord[]>();
  for (const r of records) {
    const sig = questionSignature(r);
    const existing = sigMap.get(sig) ?? [];
    existing.push(r);
    sigMap.set(sig, existing);
  }

  for (const [sig, recs] of sigMap) {
    if (recs.length > 1) {
      void sig;
      groups.push({
        type: "EXACT",
        records: recs,
        similarity: 1.0,
      });
    }
  }

  // ── Normalized duplicates (same after whitespace/Unicode normalization) ─
  const normMap = new Map<string, QuestionRecord[]>();
  for (const r of records) {
    const norm = normalizeForComparison(r.question);
    const existing = normMap.get(norm) ?? [];
    existing.push(r);
    normMap.set(norm, existing);
  }

  const exactIds = new Set(groups.flatMap((g) => g.records.map((r) => r.id)));

  for (const [, recs] of normMap) {
    if (recs.length > 1) {
      const ungrouped = recs.filter((r) => !exactIds.has(r.id));
      if (ungrouped.length > 1) {
        groups.push({
          type: "NORMALIZED",
          records: ungrouped,
          similarity: 0.95,
        });
      }
    }
  }

  // ── Near duplicates (Jaccard > 0.7 on option+question tokens) ─────────
  // Only check records that aren't already in exact/normalized groups
  const groupedIds = new Set(groups.flatMap((g) => g.records.map((r) => r.id)));
  const ungrouped = records.filter((r) => !groupedIds.has(r.id));

  // Build token index for efficient comparison
  const tokenSets = ungrouped.map((r) => ({
    record: r,
    tokens: tokenize(
      [r.question, ...r.options, r.correctAnswer].join(" ")
    ),
  }));

  // Compare in batches (O(n²) but acceptable for ~2000 records)
  const nearDupPairs = new Set<string>();
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const sim = jaccardSimilarity(tokenSets[i].tokens, tokenSets[j].tokens);
      if (sim > 0.7 && sim < 1.0) {
        const key = [tokenSets[i].record.id, tokenSets[j].record.id].sort().join("-");
        if (!nearDupPairs.has(key)) {
          nearDupPairs.add(key);
          groups.push({
            type: "NEAR",
            records: [tokenSets[i].record, tokenSets[j].record],
            similarity: Math.round(sim * 100) / 100,
          });
        }
      }
    }
  }

  return groups;
}
