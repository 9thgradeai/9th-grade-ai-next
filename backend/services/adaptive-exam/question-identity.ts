// backend/services/adaptive-exam/question-identity.ts
// Shared question normalisation and fingerprints for global duplicate control.
// No source text is stored in the exposure table — only irreversible hashes.

import "server-only";

import type {
  OptionKey,
  QuestionFingerprint,
  QuestionIdentityService,
  QuestionOptions,
} from "./contracts";
import { sha256 } from "./hash";

const INVISIBLE = /[\u200B-\u200D\uFEFF]/g;
const BENGALI_DIGITS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

/** Canonical question text: whitespace/Unicode/digit normalised, lowercased. */
export function normalizeQuestionIdentity(text: string): string {
  let out = String(text ?? "").replace(INVISIBLE, "");
  for (const [bengali, arabic] of Object.entries(BENGALI_DIGITS)) {
    out = out.split(bengali).join(arabic);
  }
  return out.replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizedOptions(options: QuestionOptions): string[] {
  return (Object.keys(options) as OptionKey[])
    .sort()
    .map((key) => normalizeQuestionIdentity(String(options[key] ?? "")));
}

/** L1 — exact normalized text + option-aware hash. */
export function exactHash(text: string, options: QuestionOptions): string {
  return sha256(JSON.stringify({
    text: normalizeQuestionIdentity(text),
    options: normalizedOptions(options),
  }));
}

/** L2 — order-independent token shingle hash for near-duplicate detection. */
export function nearHash(text: string, options: QuestionOptions): string {
  const tokens = normalizeQuestionIdentity(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
  const shingles: string[] = [];
  for (let i = 0; i < Math.max(1, tokens.length - 1); i += 1) {
    shingles.push(`${tokens[i]}|${tokens[i + 1] ?? ""}`);
  }
  return sha256(JSON.stringify({
    shingles: [...new Set(shingles)].sort(),
    optionCount: normalizedOptions(options).filter(Boolean).length,
  }));
}

/** L3 — numbers and quoted entities replaced so structural repeats are caught. */
export function templateHash(text: string, options: QuestionOptions): string {
  const template = (value: string) =>
    normalizeQuestionIdentity(value)
      .replace(/\b\d+(?:[.,]\d+)?\b/g, "<n>")
      .replace(/"[^"]+"/g, "<entity>")
      .replace(/\b(?:who|what|which|where|when|why|how|কেন|কী|কোন|কোথায়|কখন)\b/gu, "<q>");
  return sha256(JSON.stringify({
    text: template(text),
    options: normalizedOptions(options).map(template),
  }));
}

/** L4 — coarse concept key (used only for per-paper overlap caps). */
export function conceptKey(text: string, subjectId: string, topicPath: string): string {
  const significant = normalizeQuestionIdentity(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3 && !/^\d+$/.test(token))
    .slice(0, 12)
    .sort();
  return sha256(JSON.stringify({ subjectId, topicPath, tokens: significant }));
}

export function createQuestionIdentityService(): QuestionIdentityService {
  return {
    fingerprint(questionText: string, options: QuestionOptions): QuestionFingerprint {
      return {
        fingerprint: exactHash(questionText, options),
        exactHash: exactHash(questionText, options),
        nearHash: nearHash(questionText, options),
        templateHash: templateHash(questionText, options),
      };
    },
  };
}
