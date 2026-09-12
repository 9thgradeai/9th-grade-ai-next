/**
 * scripts/qb-forensics/parse-flat.ts
 * ----------------------------------------------------------------------------
 * Mirror of the question-line parser used by scripts/seed-questions.ts, kept
 * dependency-free (no Prisma) so the forensic toolchain can parse the exact
 * same files without a DB connection.
 *
 * PARITY CONTRACT: seed-questions.ts owns the reference implementation. A
 * unit test (tests/qb-forensics/parity.test.ts) feeds both parsers the same
 * corpus and asserts equal output, so any drift in the seeder fails loudly.
 * ----------------------------------------------------------------------------
 */

const BANGLA_MARKERS = ["ক.", "খ.", "গ.", "ঘ."];
const LATIN_MARKERS = ["A.", "B.", "C.", "D."];

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ParsedQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export function stripLeadingNumber(text: string): string {
  return text.replace(/^\s*[০-৯0-9]+\s*\.\s*/, "").trim();
}

export function matchOptionBlock(
  body: string,
): { markers: string[]; match: RegExpMatchArray } | null {
  for (const markers of [BANGLA_MARKERS, LATIN_MARKERS]) {
    const re = new RegExp(
      `${esc(markers[0])} (.*) ${esc(markers[1])} (.*) ${esc(markers[2])} (.*) ${esc(markers[3])} (.*)$`,
    );
    const match = body.match(re);
    if (match) return { markers, match };
  }
  return null;
}

export const OPTION_LETTERS = ["ক", "খ", "গ", "ঘ"];

export function optionLetterForIndex(idx: number): string {
  return OPTION_LETTERS[idx] ?? "";
}

/**
 * Resolve a letter-answer to its option text ONLY when the answer unambiguously
 * points at exactly one option:
 *   • a bare letter ("উত্তর: খ", "Ans. গ।" — no remainder)
 *   • a letter whose remainder is exactly one of the options
 *     ("উত্তর: খ. সংক্ষেপণ", "Ans. ঘ. নতুনদিল্লি")
 * Anything else (multi-answer "ক,গ", ambiguous "খ বা ঘ. …", an answer whose
 * text contradicts its letter, or a letter not from the option set) returns
 * null so the RAW answer is kept and the import gate's ANSWER_MISMATCH rejects
 * it. The answer is never silently forced onto a wrong option.
 */
export function resolveAnswerToOption(answerRaw: string, options: string[]): string | null {
  if (!answerRaw) return null;
  if (options.includes(answerRaw)) return answerRaw;

  const LETTER_TO_IDX: Record<string, number> = {
    "ক": 0, "খ": 1, "গ": 2, "ঘ": 3,
    "a": 0, "b": 1, "c": 2, "d": 3,
  };
  const head = answerRaw.trim();
  const letter = head.charAt(0).toLowerCase();
  if (!(letter in LETTER_TO_IDX)) return null;
  const idx = LETTER_TO_IDX[letter];
  const rest = head.replace(/^./u, "").replace(/^[।.]:?\s*/, "");
  if (rest === "" || rest === options[idx]) return options[idx];
  return null;
}

/** The reference line parser (logic mirrors seed-questions.ts parseQuestionLine). */
export function parseQuestionLine(line: string): ParsedQuestion | null {
  const explanationIdx = line.indexOf("ব্যাখ্যা:");
  let explanation = "";
  let body = line;
  if (explanationIdx >= 0) {
    explanation = line.slice(explanationIdx + "ব্যাখ্যা:".length).trim();
    body = line.slice(0, explanationIdx);
  }

  // Answer marker: "উত্তর:" (canonical bank format) or "Ans." (English-keyed
  // folder files). Case-insensitive so "ans." works too.
  const answerMarker = /(উত্তর\s*:)|(ans\.)/i;
  const m = answerMarker.exec(body);
  let answerRaw = "";
  let qAndOpts = body;
  if (m) {
    answerRaw = body.slice(m.index + m[0].length).trim();
    qAndOpts = body.slice(0, m.index);
  }

  const opt = matchOptionBlock(qAndOpts);
  if (!opt) return null;
  const { match } = opt;

  const questionText = stripLeadingNumber(qAndOpts.slice(0, match.index));

  const options = [match[1], match[2], match[3], match[4]].map((s) => s.trim());

  const correctAnswer = resolveAnswerToOption(answerRaw, options) ?? answerRaw;

  if (!questionText || options.length < 2) return null;

  return { question: questionText, options, correctAnswer, explanation };
}

/** Re-serialize a parsed question back into the single-line flat format. */
export function serializeQuestionLine(
  question: string,
  options: string[],
  correctAnswer: string,
  explanation: string,
): string {
  const idx = options.findIndex((o) => o === correctAnswer);
  const letter = idx >= 0 ? `${OPTION_LETTERS[idx]}. ` : "";
  const parts: string[] = [];
  parts.push(question.trim());
  for (let i = 0; i < 4; i++) {
    parts.push(`${OPTION_LETTERS[i]}. ${options[i] ?? ""}`);
  }
  parts.push(`উত্তর: ${letter}${correctAnswer}`);
  parts.push(`ব্যাখ্যা: ${explanation}`);
  return parts.join(" ");
}

const HEADER_RE = /^[০-৯0-9]+\.\s+/;

/** A parsed flat-file section: [header, ...question lines]. */
export interface FlatSection {
  header: string;
  lines: string[];
}

/** Split the master flat file into subject sections (mirrors seed-questions.ts). */
export function splitSections(raw: string): FlatSection[] {
  const lines = raw.split(/\r?\n/);
  const sections: FlatSection[] = [];
  let current: FlatSection | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isHeader = !trimmed.includes("উত্তর:") && HEADER_RE.test(trimmed);
    if (isHeader && !trimmed.includes("ক.")) {
      if (current) sections.push(current);
      current = { header: stripLeadingNumber(trimmed), lines: [] };
    } else if (current) {
      current.lines.push(trimmed);
    }
  }
  if (current) sections.push(current);
  return sections;
}

/** Split a plain folder file into its question lines (same handling as the seeder). */
export function splitFolderFile(raw: string): string[] {
  return raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function isFileNameQuestion(file: string): boolean {
  return /\.txt$/i.test(file);
}