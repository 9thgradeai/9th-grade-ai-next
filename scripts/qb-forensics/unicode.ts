/**
 * scripts/qb-forensics/unicode.ts
 * ----------------------------------------------------------------------------
 * Pure Unicode helpers for the question-bank forensic audit.
 *
 * These functions are side-effect free and fully testable. They implement the
 * deterministic, meaning-preserving subset of normalization that is safe to
 * apply automatically (HIGH confidence). Anything that would require guessing
 * the original intent lives in `bangla.ts` (de-shape candidates) and is only
 * ever emitted to the review queue.
 * ----------------------------------------------------------------------------
 */

export const REPLACEMENT_CHAR = "\uFFFD";

/**
 * Zero-width / invisible / control characters that indicate corruption or
 * unwanted artifacts. NOTE: ZWJ (U+200D) and ZWNJ (U+200C) are deliberately
 * EXCLUDED — they are legitimate and semantically meaningful in Bangla
 * conjuncts (e.g. র‍্যান, ক্ত ছ) and must never be stripped or flagged.
 */
export const CONTROL_MASK =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF\u200B\u2060\u00AD]/;

/** U+00A0 / U+1680 / U+2028 / U+2029 / U+202F / U+205F / U+3000 treated as regular spaces. */
export const EXTRA_SPACE = /[\u00A0\u1680\u2028\u2029\u202F\u205F\u3000\u2027]/g;

export function hasReplacementChar(s: string): boolean {
  return s.includes(REPLACEMENT_CHAR);
}

/** Detect non-space whitespace characters that should be normalized to U+0020. */
export function hasNonStandardSpace(s: string): boolean {
  return EXTRA_SPACE.test(s);
}

export function hasControlChars(s: string): boolean {
  return CONTROL_MASK.test(s);
}

/** True when a ZWJ (U+200D) / ZWNJ (U+200C) is present. These are LEGITIMATE in Bangla (e.g. র^্যস্), we never strip them. */
export function hasJoiners(s: string): boolean {
  return /[\u200C\u200D]/.test(s);
}

export function isNfc(s: string): boolean {
  return s.normalize("NFC") === s;
}

/**
 * Deterministic character-level cleanups that never change meaning:
 *  - remove BOM / ZWSP / ZWJ-only-artifact at boundaries
 *  - normalize NBSP-like codepoints to U+0020
 *  - strip tabs/CRs in favour of single spaces (content is single-line)
 * Returns a NEW string (original is unchanged).
 */
export function nfc(s: string): string {
  if (s.normalize("NFC") !== s) return s.normalize("NFC");
  return s;
}

export function normalizeSpaces(s: string): string {
  let out = s.replace(EXTRA_SPACE, " ");
  out = out.replace(/[\t\r\f\v]+/g, " ");
  return out;
}

/** Eliminate leading/trailing whitespace inside a field. */
export function trimField(s: string): string {
  return normalizeSpaces(s).trim();
}

/**
 * Collapse runs of 2+ spaces inside prose to a single space.
 * Safe here: no field in this question bank uses indentation, alignment
 * padding, or multi-space content structure (confirmed by audit).
 */
export function collapseSpaces(s: string): string {
  return s.replace(/[ ]{2,}/g, " ");
}

export function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, "");
}

/** Decode a literal, single-escaped HTML entity (only known-safe ones). */
const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

/** Decode *literal* HTML entities only where the replacement is lossless (e.g. &amp; -> &). */
export function decodeHtmlEntities(s: string): { out: string; changed: boolean } {
  const re = /&(amp|lt|gt|quot|apos|#39|nbsp);/g;
  let count = 0;
  const out = s.replace(re, (m) => {
    const rep = HTML_ENTITY_MAP[m];
    count++;
    return rep;
  });
  // Every regex match is a known entity, so a decode only changes output if
  // the source contained at least one entity token.
  return { out, changed: count > 0 && out !== s };
}

/** Literal backslash-n / backslash-t sequences rendered as text ("\\n"). */
export function decodeLiteralEscapes(s: string): { out: string; changed: boolean } {
  let changed = false;
  const out = s.replace(/\\n/g, () => {
    changed = true;
    return "\n";
  }).replace(/\\t/g, () => {
    changed = true;
    return " ";
  });
  return { out, changed };
}

/**
 * Full deterministic normalization pipeline (order matters):
 *   1. strip BOM
 *   2. normalize weird whitespace codepoints -> U+0020
 *   3. NFC normalize (composes ে + া -> ো, é, etc.)
 *   4. collapse 2+ spaces
 *   5. trim
 * Keeps ZWJ/ZWNJ untouched. Returns the normalized string.
 */
export function normalizeText(s: string): string {
  let out = stripBom(s);
  out = normalizeSpaces(out);
  out = nfc(out);
  out = collapseSpaces(out);
  return out.trim();
}