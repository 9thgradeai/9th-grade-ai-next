/**
 * Import the six Financial & Banking Knowledge MCQ source files into the Bank
 * Practice subject `06_Financial & Banking Knowledge`.
 *
 * Usage:
 *   npx tsx scripts/import-bank-financial-knowledge.ts            # dry run
 *   npx tsx scripts/import-bank-financial-knowledge.ts --yes      # write
 *   npx tsx scripts/import-bank-financial-knowledge.ts --yes --report=path.json
 *
 * Design notes:
 *   - Every record passes the shared import gate (`scanMca`) before it can be
 *     written. Gate-normalized content is what gets stored.
 *   - Dedup uses the gate's `dupSignature` against the whole database, plus a
 *     stem+answer signature so the same MCQ with a paraphrase explanation is
 *     not imported twice.
 *   - `sourceKey(subjectId, file, questionNumber)` makes reruns idempotent.
 *   - Questions are routed onto the existing `06_Financial_Knowledge` topic
 *     tree so the Practice tab's topic counts include them.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import {
  scanMca,
  dupSignature,
  normalizeField,
  type GateIssue,
} from "./qb-forensics/import-gate";

const DIR = join(process.cwd(), "database", "data", "Bank", "Financial & Banking Knowledge");
const ECOSYSTEM_CODE = "BANGLADESH_BANK";
const SUBJECT_NAME_BN = "06_Financial & Banking Knowledge";
const ROOT = "06_Financial_Knowledge";

const T = {
  bank: `${ROOT}/01_Bangladesh_Bank_Framework`,
  core: `${ROOT}/01_Bangladesh_Bank_Framework/Core_Functions_and_Monetary_Policy`,
  regs: `${ROOT}/01_Bangladesh_Bank_Framework/Banking_Regulations_and_Paid-up_Capital_Guidelines`,
  inclusion: `${ROOT}/01_Bangladesh_Bank_Framework/Financial_Inclusion_and_Digital_Banking`,
  payment: `${ROOT}/02_Payment_and_Settlement_Systems`,
  rtgs: `${ROOT}/02_Payment_and_Settlement_Systems/RTGS_Real_Time_Gross_Settlement`,
  beftn: `${ROOT}/02_Payment_and_Settlement_Systems/BEFTN_and_NPSB`,
  mfs: `${ROOT}/02_Payment_and_Settlement_Systems/MFS_and_FinTech_Regulations`,
  macro: `${ROOT}/03_Macroeconomics_and_Indicators`,
  inflation: `${ROOT}/03_Macroeconomics_and_Indicators/Inflation_GDP_Targets_and_Five_Year_Plans`,
  interest: `${ROOT}/03_Macroeconomics_and_Indicators/Interest_Rate_Benchmarks_SOFR`,
  exchange: `${ROOT}/03_Macroeconomics_and_Indicators/Exchange_Rates_and_Remittance_Flows`,
  commerce: `${ROOT}/04_Banking_Commerce_and_Taxation`,
  commercial: `${ROOT}/04_Banking_Commerce_and_Taxation/Commercial_Banking_Operations`,
  capital: `${ROOT}/04_Banking_Commerce_and_Taxation/Capital_Markets_BSEC_and_CMSF`,
  trade: `${ROOT}/04_Banking_Commerce_and_Taxation/International_Trade_Finance_LCs_and_Brent_Index`,
} as const;

const FILES = [
  {
    file: "Questions(Payment Systems and Digital Banking).txt",
    label: "Payment Systems and Digital Banking",
  },
  {
    file: "Questions(Commercial Banking and Operations).txt",
    label: "Commercial Banking and Operations",
  },
  {
    file: "Questions(Bangladesh Bank Monetary Policy & Central Banking ).txt",
    label: "Bangladesh Bank Monetary Policy & Central Banking",
  },
  {
    file: "Questions(Bangladesh Banking System and Institutions).txt",
    label: "Bangladesh Banking System and Institutions",
  },
  {
    file: "Questions(Bangladesh Bank & Banking Laws).txt",
    label: "Bangladesh Bank & Banking Laws",
  },
  {
    file: "Questions(All Banking Terms, Full Forms & Monetary Policy Rates).txt",
    label: "All Banking Terms, Full Forms & Monetary Policy Rates",
  },
] as const;

type FileSpec = (typeof FILES)[number];

// The source's All-Banking-Terms file has a web-page figure/UI block pasted
// into the middle of Q33's record. These lines are not part of the explanation.
const JUNK_LINES = [
  /^give feedback$/i,
  /^policy type$/i,
  /^policy strength$/i,
  /^demand \(md \/ ad\)$/i,
  /^supply \(ms \/ sras\)$/i,
  /^long-run supply \(lras\)$/i,
  /^money market$/i,
  /^ad[-–]as$/i,
  /^\d{6,}\s*[a-z]/i,
  /^expansionarycontractionary$/i,
  /^less money raises the interest rate/i,
];

const QUESTION_RE = /^(\d+)\.\s+(.+)$/;
const OPTION_LINE_RE = /^([A-D])\.\s+(.*)$/;
const ANSWER_RE = /^Correct Answer\s*:\s*([A-D])(?:[.)])?\s*(.*)$/i;
const EXPLANATION_RE = /^Explanation\s*:\s*(.*)$/i;
const INLINE_MARKER_RE = /(?:^|\s)([A-D])\.\s+/g;

type Parsed = {
  file: string;
  fileLabel: string;
  qNumber: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  section: string;
  warnings: string[];
};

type ParsedRecord = {
  record: Parsed | null;
  nextIndex: number;
  errors: string[];
  artifacts: string[];
  unattached: string[];
};

function isQuestionStart(line: string): boolean {
  return QUESTION_RE.test(line.trim());
}

/**
 * The Monetary Policy source uses a handful of LaTeX fragments inside prose.
 * The shared gate's canonical pass turns `\(...\)` into `$...$` but leaves an
 * unescaped `%` in the span, which KaTeX reads as a comment and rejects. These
 * are simple arithmetic statements, so flatten them to plain Unicode math
 * before the gate. This is source normalization, not a gate bypass: the gate
 * still validates every resulting field.
 */
function normalizeSourceMath(s: string): string {
  return s
    .replace(/\\boxed\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\([%_&$#])/g, "$1")
    .replace(/\\\(|\\\)|\\\[|\\\]/g, " ")
    .replace(/\\approx/g, "≈")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\cdot/g, "·")
    .replace(/\\le(q)?\b/g, "≤")
    .replace(/\\ge(q)?\b/g, "≥")
    .replace(/\\neq\b/g, "≠")
    .replace(/\\pm\b/g, "±")
    .replace(/\s+/g, " ")
    .trim();
}

function isJunk(line: string): boolean {
  return JUNK_LINES.some((re) => re.test(line.trim()));
}

function isLikelySectionTitle(line: string): boolean {
  const t = line.trim();
  if (!t || isJunk(t)) return false;
  if (/^(Batch|Section|Part|Questions)\b/i.test(t)) return true;
  const words = t.split(/\s+/).length;
  return (
    words <= 8 &&
    t.length <= 95 &&
    !/[.!?।]$/.test(t) &&
    !/[=+×÷≈\\$]/.test(t)
  );
}

function nextNonEmpty(lines: string[], from: number): number | null {
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim()) return i;
  }
  return null;
}

function isSectionHeaderAt(lines: string[], index: number): boolean {
  const line = lines[index].trim();
  if (!isLikelySectionTitle(line)) return false;
  const next = nextNonEmpty(lines, index + 1);
  return next !== null && isQuestionStart(lines[next]);
}

/** Return a clean A–D option list from a one-line option block, or null. */
function parseInlineOptions(line: string): string[] | null {
  const marks: Array<{ letter: string; start: number; end: number }> = [];
  INLINE_MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_MARKER_RE.exec(line)) !== null) {
    marks.push({
      letter: m[1],
      start: m.index + (m[0].startsWith(" ") ? 1 : 0),
      end: INLINE_MARKER_RE.lastIndex,
    });
  }
  for (let i = 0; i + 3 < marks.length; i++) {
    if (marks.slice(i, i + 4).map((x) => x.letter).join("") !== "ABCD") continue;
    const seq = marks.slice(i, i + 4);
    const options = seq.map((mark, j) =>
      line
        .slice(mark.end, j + 1 < seq.length ? seq[j + 1].start : line.length)
        .trim(),
    );
    if (options.every((o) => o.length > 0)) return options;
  }
  return null;
}

/**
 * Try to append one explanation continuation line. A complete sentence is only
 * continued when the next line starts like prose/math; this is what keeps the
 * pasted diagram block from being welded onto Q33's explanation.
 */
const CONTINUATION_CUE =
  /^(the|this|that|these|those|it|they|do|does|did|however|therefore|thus|hence|for|remember|note|where|using|calculated|required|actual|expected|nominal|corridor|spread|if|when|because|but|and|also|in|a|an|as|at|by|with|on|from|to|since|although|while|despite|under|after|before|alternatively|conversely|similarly|overall|here|=|\+|-|×|÷|≈|\\|\()/i;

function canContinueExplanation(previous: string, next: string): boolean {
  if (!previous) return true;
  if (!/[.!?।]$/.test(previous.trim())) return true;
  if (/[:;,\-–—]$/.test(previous.trim())) return true;
  return CONTINUATION_CUE.test(next.trim());
}

function parseAt(
  lines: string[],
  start: number,
  spec: FileSpec,
  lastSection: string,
): ParsedRecord {
  const errors: string[] = [];
  const artifacts: string[] = [];
  const unattached: string[] = [];
  const first = lines[start].trim();
  const qm = first.match(QUESTION_RE);
  if (!qm) {
    return { record: null, nextIndex: start + 1, errors: ["not a question start"], artifacts, unattached };
  }
  const qNumber = Number(qm[1]);
  const question = qm[2].trim();
  let i = start + 1;

  let optStart = nextNonEmpty(lines, i);
  if (optStart === null) {
    return { record: null, nextIndex: lines.length, errors: ["question has no options"], artifacts, unattached };
  }
  const firstOpt = lines[optStart].trim();
  let options: string[];
  const inline = parseInlineOptions(firstOpt);
  if (inline) {
    options = inline;
    i = optStart + 1;
  } else {
    options = [];
    const letters = ["A", "B", "C", "D"];
    let cursor = optStart;
    for (const letter of letters) {
      const idx = nextNonEmpty(lines, cursor);
      if (idx === null) {
        errors.push(`missing option ${letter}`);
        break;
      }
      const om = lines[idx].trim().match(OPTION_LINE_RE);
      if (!om || om[1] !== letter) {
        errors.push(`expected option ${letter}, found ${lines[idx].trim().slice(0, 60)}`);
        break;
      }
      options.push(om[2].trim());
      cursor = idx + 1;
    }
    if (options.length !== 4) {
      const next = nextNonEmpty(lines, start + 1);
      return {
        record: null,
        nextIndex: next ?? start + 1,
        errors: errors.length ? errors : ["option block did not parse"],
        artifacts,
        unattached,
      };
    }
    i = cursor;
  }

  const ansIdx = nextNonEmpty(lines, i);
  if (ansIdx === null) {
    return { record: null, nextIndex: lines.length, errors: ["missing Correct Answer line"], artifacts, unattached };
  }
  const am = lines[ansIdx].trim().match(ANSWER_RE);
  if (!am) {
    return {
      record: null,
      nextIndex: ansIdx,
      errors: [`expected Correct Answer line, found ${lines[ansIdx].trim().slice(0, 80)}`],
      artifacts,
      unattached,
    };
  }
  const answerLetter = am[1].toUpperCase();
  const answerText = am[2].trim();
  const answerIndex = ["A", "B", "C", "D"].indexOf(answerLetter);
  if (answerIndex < 0 || answerIndex >= options.length) {
    return {
      record: null,
      nextIndex: ansIdx + 1,
      errors: [`answer letter ${answerLetter} has no matching option`],
      artifacts,
      unattached,
    };
  }
  const warnings: string[] = [];
  const normalizedAnswerText = normalizeField(answerText)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const normalizedOption = normalizeField(options[answerIndex])
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (normalizedAnswerText && normalizedAnswerText !== normalizedOption) {
    warnings.push(
      `answer text differs from option ${answerLetter} (using the option text by letter)`,
    );
  }
  const correctAnswer = options[answerIndex];

  const expIdx = nextNonEmpty(lines, ansIdx + 1);
  if (expIdx === null) {
    return { record: null, nextIndex: lines.length, errors: ["missing Explanation line"], artifacts, unattached };
  }
  const em = lines[expIdx].trim().match(EXPLANATION_RE);
  if (!em) {
    return {
      record: null,
      nextIndex: expIdx,
      errors: [`expected Explanation line, found ${lines[expIdx].trim().slice(0, 80)}`],
      artifacts,
      unattached,
    };
  }
  let explanation = em[1].trim();
  i = expIdx + 1;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      i++;
      continue;
    }
    if (isQuestionStart(line)) break;
    if (isJunk(line)) {
      artifacts.push(line);
      i++;
      continue;
    }
    if (isSectionHeaderAt(lines, i)) {
      // A title between records is not part of this explanation.
      i++;
      continue;
    }
    if (canContinueExplanation(explanation, line)) {
      explanation += `${explanation ? " " : ""}${line}`;
      i++;
      continue;
    }
    // Unattached non-record line (diagram/UI residue or a swallowed header).
    unattached.push(line);
    i++;
  }

  return {
    record: {
      file: spec.file,
      fileLabel: spec.label,
      qNumber,
      question,
      options,
      correctAnswer,
      explanation,
      section: lastSection,
      warnings,
    },
    nextIndex: i,
    errors,
    artifacts,
    unattached,
  };
}

// ── Routing ─────────────────────────────────────────────────────────────────

function has(re: RegExp, text: string): boolean {
  return re.test(text);
}

function routePayment(text: string, section: string): string {
  if (has(/\bRTGS\b|real[- ]time gross/i, text)) return T.rtgs;
  if (has(/\bMFS\b|mobile financial|mobile wallet|agent banking|fintech|digital wallet|e-money|e-KYC|\bbKash\b|\bNagad\b|financial inclusion|\bDFS\b/i, text)) return T.mfs;
  if (has(/\bBEFTN\b|\bNPSB\b|\bBACPS\b|automated clearing|cheque|clearing|settlement|\bACH\b/i, text)) return T.beftn;
  if (has(/Questions 26.45|mobile financial services and agent banking/i, section)) return T.mfs;
  if (has(/Questions 1.25|payment systems|clearing, settlement/i, section)) return T.beftn;
  return T.payment;
}

function routeTerms(text: string, section: string): string {
  const sec = section.toLowerCase();

  if (/section a\b/.test(sec)) {
    if (has(/\bBEFTN\b|\bBACPS\b|\bRTGS\b|\bNPSB\b|\bMFS\b|\bQR\b|\bPOS\b|\bATM\b|\bPIN\b|\bOTP\b|\bEFT\b|\bP2P\b|payment/i, text)) {
      return routePayment(text, section);
    }
    if (has(/KYC|AML|CFT|BFIU|STR\b|PEP\b|EDD\b|UBO\b|money laundering|due diligence/i, text)) return T.regs;
    return T.commercial;
  }

  if (/section b\b/.test(sec)) {
    if (has(/repo|SDF|SLF|SOFR|policy rate|interest|basis point|CRR|SLR|OMO|open.market|money supply|multiplier|corridor|liquidity|DOMMR|BOFR/i, text)) {
      return T.interest;
    }
    return T.core;
  }

  if (/section c\b/.test(sec)) return routePayment(text, section);

  if (/section d\b/.test(sec)) {
    if (has(/RBS\b|ICAAP|RWA\b|supervis|Basel|capital adequacy|regulatory/i, text)) return T.regs;
    return T.commercial;
  }

  if (/section e\b/.test(sec)) {
    if (has(/IPO|DSE|CSE|BSEC|NAV|EPS|P\/E|OTC|T-bill|T-bond|\bCP\b|\bCD\b|capital market|stock|securities/i, text)) {
      return T.capital;
    }
    if (has(/\bLC\b|LCAF|trade finance|letter of credit|SWIFT|\bTT\b|correspondent|nostro|vostro/i, text)) return T.trade;
    if (has(/\bFX\b|foreign exchange|\bBOP\b|\bFDI\b|IMF|IDA|IFC|MIGA|ADB|AIIB|exchange rate/i, text)) return T.exchange;
    return T.capital;
  }

  if (/section f\b/.test(sec)) {
    if (has(/financial inclusion|MFI\b|CMSME|DFS\b|microfinance|inclusion/i, text)) return T.inclusion;
    return T.bank;
  }

  if (/section g\b/.test(sec)) {
    if (has(/cheque|negotiable|MICR|CTS\b/i, text)) return T.beftn;
    if (has(/\bLC\b|letter of credit|trade finance/i, text)) return T.trade;
    if (has(/AML|CFT|money laundering|law/i, text)) return T.regs;
    return T.commercial;
  }

  if (/section h\b/.test(sec)) return T.commercial;
  if (/section i\b/.test(sec)) return T.interest;
  return T.commercial;
}

function routeRecord(record: Parsed): string {
  const text = `${record.question} ${record.explanation}`;
  const sec = record.section;

  if (record.file.includes("Payment Systems")) {
    return routePayment(text, sec);
  }

  if (record.file.includes("Commercial Banking")) {
    if (/section 2|cheques and negotiable/i.test(sec)) return T.beftn;
    if (/section 5|letters of credit/i.test(sec)) return T.trade;
    if (/section 4|remittance/i.test(sec)) {
      if (has(/foreign|international|abroad|SWIFT|exchange|remittance from/i, text)) return T.exchange;
      return T.beftn;
    }
    if (/section 6|bank guarantees/i.test(sec)) {
      if (has(/\bLC\b|letter of credit|import|export/i, text)) return T.trade;
      return T.commercial;
    }
    return T.commercial;
  }

  if (record.file.includes("Monetary Policy")) {
    if (has(/exchange rate|foreign exchange|foreign-exchange|reserve|remittance|devaluation|depreciation|appreciation|current account|capital account/i, text)) {
      return T.exchange;
    }
    if (has(/inflation|CPI|consumer price|\bGDP\b|five[- ]year|deflation|disinflation|output gap|aggregate demand|aggregate supply|expectations/i, text)) {
      return T.inflation;
    }
    if (has(/repo|SDF|SLF|SOFR|policy rate|interest|basis point|CRR|SLR|OMO|open.market|money supply|reserve money|broad money|narrow money|multiplier|corridor|liquidity|call money|DOMMR|BOFR|sterili[sz]/i, text)) {
      return T.interest;
    }
    if (has(/Bangladesh Bank.*(function|institution|responsible|established|governor|board|department|banker to government|currency|note|credit information)/i, text)) {
      return T.core;
    }
    return T.macro;
  }

  if (record.file.includes("Banking System")) {
    if (/Questions 1.20|establishment and functions/i.test(sec)) return T.core;
    if (/Questions 21.40|types of banks/i.test(sec)) return T.bank;
    if (/Questions 41.60|laws, regulators/i.test(sec)) return T.regs;
    if (/Questions 61.80|governance/i.test(sec)) return T.regs;
    if (has(/digital|financial inclusion|\bMFS\b|agent banking|\bDFS\b|mobile|fintech/i, text)) return T.inclusion;
    if (has(/capital|paid-up|licen[cs]|regulat|supervis|governance|risk|Basel|\bCAR\b|AML|BFIU|money laundering|terrorist/i, text)) return T.regs;
    if (has(/central bank|Bangladesh Bank|monetary policy|currency|banknote|foreign-exchange reserve|banker to the government|payment system|credit information/i, text)) return T.core;
    return T.bank;
  }

  if (record.file.includes("Banking Laws")) {
    if (has(/payment system|settlement|negotiable|cheque|deposit protection|electronic fund|payment and settlement/i, text)) return T.payment;
    if (has(/securities|stock exchange|BSEC|capital market|IPO|mutual fund/i, text)) return T.capital;
    if (has(/foreign exchange|offshore|remittance|external/i, text)) return T.exchange;
    return T.regs;
  }

  return routeTerms(text, sec);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function stemAnswerSig(question: string, correctAnswer: string): string {
  const norm = (s: string) =>
    normalizeField(s)
      .toLowerCase()
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, "")
      .replace(/[^\p{L}\p{N}\u0980-\u09FF]+/gu, " ")
      .trim();
  return `${norm(question)}|${norm(correctAnswer)}`;
}

function fatalSummary(issues: GateIssue[]): string {
  return [...new Set(issues.map((i) => i.code))].join(",");
}

function issueSnippet(issues: GateIssue[]): string {
  return issues.find((i) => i.fatal && i.snippet)?.snippet ?? "";
}

function sectionLabel(section: string, fallback: string): string {
  const s = section.replace(/^(Batch|Section|Part|Questions)\s+\d+[^:]*:\s*/i, "").trim();
  return (s || fallback).slice(0, 120);
}

async function invalidateExamTreeAcrossProcesses(): Promise<string> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return "no REDIS_URL — exam tree expires on its 5-min TTL";
  try {
    const Redis = (await import("ioredis")).default;
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      retryStrategy: () => undefined,
    });
    client.on("error", () => undefined);
    try {
      await client.connect();
      let cursor = "0";
      let removed = 0;
      do {
        const [next, keys] = await client.scan(cursor, "MATCH", "qcache:exam:selection-tree*", "COUNT", 100);
        cursor = next;
        if (keys.length > 0) removed += await client.del(...keys);
      } while (cursor !== "0");
      return `removed ${removed} exam-tree cache key(s) from redis`;
    } finally {
      client.disconnect();
    }
  } catch (e) {
    return `redis invalidation skipped (${e instanceof Error ? e.message : String(e)})`;
  }
}

type FileStat = {
  file: string;
  parsed: number;
  accepted: number;
  inserted: number;
  updated: number;
  duplicates: number;
  rejected: number;
  artifacts: number;
  unattached: number;
  warnings: number;
};

async function main() {
  const apply = process.argv.includes("--yes");
  const reportPath = process.argv.find((a) => a.startsWith("--report="))?.split("=")[1];
  const prisma = new PrismaClient();

  try {
    const ecosystem = await prisma.examEcosystem.findUnique({ where: { code: ECOSYSTEM_CODE } });
    if (!ecosystem) throw new Error(`ecosystem ${ECOSYSTEM_CODE} not found`);
    const subject = await prisma.subject.findFirst({
      where: { ecosystemId: ecosystem.id, nameBn: SUBJECT_NAME_BN },
    });
    if (!subject) throw new Error(`subject ${SUBJECT_NAME_BN} not found in ${ECOSYSTEM_CODE}`);

    const topics = await prisma.topic.findMany({ where: { subjectId: subject.id } });
    const topicByPath = new Map(topics.map((t) => [t.path, t]));
    const knownPaths = new Set(topicByPath.keys());
    for (const path of Object.values(T)) {
      if (!knownPaths.has(path)) throw new Error(`taxonomy path missing: ${path}`);
    }

    // Existing rows: exact duplicate signature + stem/answer signature, global.
    const existingRows = await prisma.question.findMany({
      select: {
        id: true,
        subjectId: true,
        question: true,
        correctAnswer: true,
        explanation: true,
      },
    });
    const existingExact = new Map<string, number>();
    const existingStemAnswer = new Map<string, number>();
    for (const q of existingRows) {
      const sig = dupSignature(q.question, q.correctAnswer, q.explanation);
      if (!existingExact.has(sig)) existingExact.set(sig, q.id);
      const ss = stemAnswerSig(q.question, q.correctAnswer);
      if (!existingStemAnswer.has(ss)) existingStemAnswer.set(ss, q.id);
    }

    const existingSourceKeys = new Set(
      (
        await prisma.question.findMany({
          where: { subjectId: subject.id },
          select: { sourceKey: true },
        })
      ).map((q) => q.sourceKey),
    );

    const batchExact = new Map<string, string>();
    const batchStemAnswer = new Map<string, string>();
    const stats = new Map<string, FileStat>();
    const rejectReasons = new Map<string, number>();
    const rejectedSamples: Array<{ file: string; qNumber: number; codes: string; snippet: string }> = [];
    const duplicateSamples: Array<{ file: string; qNumber: number; kind: string; of: string }> = [];
    const artifactSamples: Array<{ file: string; qNumber: number; line: string }> = [];
    const unattachedSamples: Array<{ file: string; qNumber: number; line: string }> = [];
    const answerMismatches: Array<{ file: string; qNumber: number; warning: string }> = [];
    const topicCounts = new Map<string, number>();
    const warningsByCode = new Map<string, number>();
    const accepted: Array<Parsed & { path: string; key: string; normalized: { question: string; options: string[]; correctAnswer: string; explanation: string } }> = [];

    for (const spec of FILES) {
      const stat: FileStat = {
        file: spec.file,
        parsed: 0,
        accepted: 0,
        inserted: 0,
        updated: 0,
        duplicates: 0,
        rejected: 0,
        artifacts: 0,
        unattached: 0,
        warnings: 0,
      };
      stats.set(spec.file, stat);

      const text = readFileSync(join(DIR, spec.file), "utf8").replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).map((l) => l.replace(/\u00A0/g, " "));

      let i = 0;
      let lastSection = "";
      let expectedQ = 1;
      while (i < lines.length) {
        const raw = lines[i];
        const line = raw.trim();
        if (!line) {
          i++;
          continue;
        }
        if (isQuestionStart(line)) {
          const parsed = parseAt(lines, i, spec, lastSection);
          stat.artifacts += parsed.artifacts.length;
          stat.unattached += parsed.unattached.length;
          const qNo = Number(line.match(QUESTION_RE)?.[1] ?? 0);
          for (const lineText of parsed.artifacts) {
            artifactSamples.push({ file: spec.file, qNumber: qNo, line: lineText.slice(0, 160) });
          }
          for (const lineText of parsed.unattached) {
            unattachedSamples.push({ file: spec.file, qNumber: qNo, line: lineText.slice(0, 160) });
          }
          if (!parsed.record) {
            stat.rejected++;
            const key = parsed.errors[0] ?? "parse error";
            rejectReasons.set(`parse: ${key}`, (rejectReasons.get(`parse: ${key}`) ?? 0) + 1);
            rejectedSamples.push({
              file: spec.file,
              qNumber: Number(line.match(QUESTION_RE)?.[1] ?? 0),
              codes: `PARSE: ${parsed.errors.join("; ")}`,
              snippet: line.slice(0, 100),
            });
            i = Math.max(parsed.nextIndex, i + 1);
            continue;
          }
          stat.parsed++;
          {
            const rec = parsed.record;
            if (rec.qNumber !== expectedQ) {
              rejectedSamples.push({
                file: spec.file,
                qNumber: rec.qNumber,
                codes: `SEQUENCE: expected ${expectedQ}, found ${rec.qNumber}`,
                snippet: rec.question.slice(0, 100),
              });
            }
            expectedQ = rec.qNumber + 1;

            const gate = scanMca({
              question: normalizeSourceMath(rec.question),
              options: rec.options.map(normalizeSourceMath),
              correctAnswer: normalizeSourceMath(rec.correctAnswer),
              explanation: normalizeSourceMath(rec.explanation),
            });
            if (gate.verdict === "REJECT") {
              stat.rejected++;
              const codes = fatalSummary(gate.fatal);
              rejectReasons.set(`gate: ${codes}`, (rejectReasons.get(`gate: ${codes}`) ?? 0) + 1);
              rejectedSamples.push({
                file: spec.file,
                qNumber: rec.qNumber,
                codes: codes || "GATE_REJECT",
                snippet: issueSnippet(gate.fatal) || rec.question.slice(0, 100),
              });
              i = parsed.nextIndex;
              continue;
            }
            for (const issue of gate.issues) {
              if (!issue.fatal) {
                warningsByCode.set(issue.code, (warningsByCode.get(issue.code) ?? 0) + 1);
                stat.warnings++;
              }
            }
            const n = gate.normalized;
            const normalized = {
              question: n.question,
              options: n.options,
              correctAnswer: n.correctAnswer ?? "",
              explanation: n.explanation,
            };

            const exact = dupSignature(
              normalized.question,
              normalized.correctAnswer,
              normalized.explanation,
            );
            const ss = stemAnswerSig(normalized.question, normalized.correctAnswer);
            const exactOf = existingExact.get(exact) ?? batchExact.get(exact);
            const ssOf = existingStemAnswer.get(ss) ?? batchStemAnswer.get(ss);
            if (exactOf !== undefined) {
              stat.duplicates++;
              duplicateSamples.push({
                file: spec.file,
                qNumber: rec.qNumber,
                kind: "exact",
                of: `question#${exactOf}`,
              });
              i = parsed.nextIndex;
              continue;
            }
            if (ssOf !== undefined) {
              stat.duplicates++;
              duplicateSamples.push({
                file: spec.file,
                qNumber: rec.qNumber,
                kind: "same-stem+answer",
                of: String(ssOf),
              });
              i = parsed.nextIndex;
              continue;
            }

            const path = routeRecord(rec);
            if (!knownPaths.has(path)) {
              stat.rejected++;
              rejectReasons.set("route: unknown topic path", (rejectReasons.get("route: unknown topic path") ?? 0) + 1);
              rejectedSamples.push({
                file: spec.file,
                qNumber: rec.qNumber,
                codes: `ROUTE: unknown path ${path}`,
                snippet: rec.question.slice(0, 100),
              });
              i = parsed.nextIndex;
              continue;
            }

            const key = sourceKey(subject.id, "financial-banking-knowledge", rec.file, rec.qNumber);
            stat.accepted++;
            topicCounts.set(path, (topicCounts.get(path) ?? 0) + 1);
            batchExact.set(exact, `${spec.label}#${rec.qNumber}`);
            batchStemAnswer.set(ss, `${spec.label}#${rec.qNumber}`);
            if (rec.warnings.length > 0) {
              for (const w of rec.warnings) {
                answerMismatches.push({ file: spec.file, qNumber: rec.qNumber, warning: w });
              }
            }
            accepted.push({ ...rec, path, key, normalized });
          }
          i = parsed.nextIndex;
          continue;
        }
        if (!isJunk(line) && isLikelySectionTitle(line)) lastSection = line;
        i++;
      }

      // Fix source keys that already exist (rerun) later; here we only tally.
      const existingForKey = accepted.filter((a) => a.file === spec.file && existingSourceKeys.has(a.key)).length;
      stat.updated = existingForKey;
      stat.inserted = stat.accepted - existingForKey;
    }

    // ── Write phase ─────────────────────────────────────────────────────────
    const updates: Array<{ key: string; data: Record<string, unknown> }> = [];
    const creates: Array<Record<string, unknown>> = [];
    for (const rec of accepted) {
      const topic = topicByPath.get(rec.path)!;
      const data = {
        ecosystemId: ecosystem.id,
        subjectId: subject.id,
        topicId: topic.id,
        path: rec.path,
        topic: topic.name,
        subtopic: sectionLabel(rec.section, rec.fileLabel),
        question: rec.normalized.question,
        options: rec.normalized.options,
        correctAnswer: rec.normalized.correctAnswer,
        explanation: rec.normalized.explanation,
        questionType: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        sourceExam: "Bank Financial Knowledge",
        questionNumber: rec.qNumber,
        sourceKey: rec.key,
      };
      if (existingSourceKeys.has(rec.key)) {
        updates.push({ key: rec.key, data });
      } else {
        creates.push(data);
      }
    }

    if (apply) {
      const CHUNK = 200;
      for (let i = 0; i < creates.length; i += CHUNK) {
        await prisma.question.createMany({ data: creates.slice(i, i + CHUNK) as never });
      }
      for (const u of updates) {
        await prisma.question.update({
          where: { subjectId_sourceKey: { subjectId: subject.id, sourceKey: u.key } },
          data: u.data as never,
        });
      }

      // Refresh Topic.questionCount (subtree totals) for this subject.
      const countRows = await prisma.question.groupBy({
        by: ["path"],
        where: { subjectId: subject.id },
        _count: { _all: true },
      });
      const totals = new Map<string, number>();
      for (const row of countRows) {
        const segs = row.path.split("/");
        let acc = "";
        for (const seg of segs) {
          acc = acc ? `${acc}/${seg}` : seg;
          totals.set(acc, (totals.get(acc) ?? 0) + row._count._all);
        }
      }
      for (const t of topics) {
        await prisma.topic.update({
          where: { id: t.id },
          data: { questionCount: totals.get(t.path) ?? 0 },
        });
      }
    }

    // ── Post-import verification ────────────────────────────────────────────
    const totalNow = await prisma.question.count({ where: { subjectId: subject.id } });
    const directByPath = await prisma.question.groupBy({
      by: ["path"],
      where: { subjectId: subject.id },
      _count: { _all: true },
    });
    const subtree = new Map<string, number>();
    for (const row of directByPath) {
      const segs = row.path.split("/");
      let acc = "";
      for (const seg of segs) {
        acc = acc ? `${acc}/${seg}` : seg;
        subtree.set(acc, (subtree.get(acc) ?? 0) + row._count._all);
      }
    }

    const report = {
      mode: apply ? "apply" : "dry-run",
      subject: { id: subject.id, nameBn: subject.nameBn, nameEn: subject.nameEn, ecosystemId: ecosystem.id },
      sourceFiles: FILES.map((f) => f.file),
      excludedFile: "Questions(Credit, Lending and Risk Management).txt",
      totals: {
        parsed: [...stats.values()].reduce((a, s) => a + s.parsed, 0),
        accepted: [...stats.values()].reduce((a, s) => a + s.accepted, 0),
        inserted: [...stats.values()].reduce((a, s) => a + s.inserted, 0),
        updated: [...stats.values()].reduce((a, s) => a + s.updated, 0),
        duplicates: [...stats.values()].reduce((a, s) => a + s.duplicates, 0),
        rejected: [...stats.values()].reduce((a, s) => a + s.rejected, 0),
        artifacts: [...stats.values()].reduce((a, s) => a + s.artifacts, 0),
        unattached: [...stats.values()].reduce((a, s) => a + s.unattached, 0),
        warnings: [...stats.values()].reduce((a, s) => a + s.warnings, 0),
      },
      perFile: [...stats.values()],
      rejectReasons: [...rejectReasons.entries()].sort((a, b) => b[1] - a[1]),
      rejectedSamples: rejectedSamples.slice(0, 30),
      duplicateSamples: duplicateSamples.slice(0, 30),
      artifactSamples,
      unattachedSamples,
      answerMismatches: answerMismatches.slice(0, 20),
      warningsByCode: [...warningsByCode.entries()].sort((a, b) => b[1] - a[1]),
      routedTopics: [...topicCounts.entries()].sort((a, b) => b[1] - a[1]),
      postImport: {
        totalQuestions: totalNow,
        projectedTotal: apply ? totalNow : totalNow + creates.length,
        byPath: [...subtree.entries()]
          .filter(([, n]) => n > 0)
          .sort((a, b) => a[0].localeCompare(b[0])),
      },
      cache: apply ? await invalidateExamTreeAcrossProcesses() : "dry-run — cache untouched",
    };

    if (reportPath) {
      const { writeFileSync } = await import("fs");
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\nReport written to ${reportPath}`);
    }

    console.log(`\n${apply ? "APPLIED" : "DRY RUN"} — subject ${subject.id} (${subject.nameBn})`);
    for (const s of report.perFile) {
      console.log(
        `  ${s.file}\n    parsed=${s.parsed} accepted=${s.accepted} insert=${s.inserted} update=${s.updated} dup=${s.duplicates} reject=${s.rejected} artifacts=${s.artifacts} unattached=${s.unattached} warnings=${s.warnings}`,
      );
    }
    console.log("  TOTALS", report.totals);
    if (report.rejectReasons.length) {
      console.log("  Reject reasons:");
      for (const [k, v] of report.rejectReasons) console.log(`    ${v} × ${k}`);
    }
    if (report.rejectedSamples.length) {
      console.log("  Reject samples:");
      for (const r of report.rejectedSamples) {
        console.log(`    ${r.file} Q${r.qNumber}: ${r.codes} — ${r.snippet}`);
      }
    }
    if (report.duplicateSamples.length) {
      console.log("  Duplicate samples:");
      for (const d of report.duplicateSamples) {
        console.log(`    ${d.file} Q${d.qNumber}: ${d.kind} of ${d.of}`);
      }
    }
    if (report.warningsByCode.length) console.log("  Non-fatal gate warnings:", report.warningsByCode);
    console.log("  Topic routing:");
    for (const [p, n] of report.routedTopics) console.log(`    ${n} × ${p}`);
    console.log("  Post-import subject total:", report.postImport.totalQuestions);
    if (report.postImport.byPath.length) {
      console.log("  Subtree counts:");
      for (const [p, n] of report.postImport.byPath) console.log(`    ${n} × ${p}`);
    }
    console.log("  Cache:", report.cache);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
