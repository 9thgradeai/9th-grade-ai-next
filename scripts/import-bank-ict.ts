/**
 * scripts/import-bank-ict.ts
 * ----------------------------------------------------------------------------
 * Imports Bank ICT MCQ files (database/data/Bank/Questions/ICT/*.txt) into
 * the BANGLADESH_BANK "তথ্য ও যোগাযোগ প্রযুক্তি" subject ONLY. Never touches
 * BCS content.
 *
 * Two source formats:
 *   A. single-line: `12. Q… A) … B) … C) … D) … Ans: B | Speed Solution: …`
 *   B. multi-line : `12. Q…` then `A) …` … `D) …` then
 *      `Ans: B | Speed Solution: …`, optionally grouped under
 *      `Topic N:` / `Part N:` header lines (used for topic routing).
 *
 * Each file maps to taxonomy leaf/leaves under 05_ICT in bb-taxonomy.json.
 * Run: `npx tsx scripts/import-bank-ict.ts` (uses DATABASE_URL).
 * Idempotent: upserts by [subjectId, sourceKey].
 * ----------------------------------------------------------------------------
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";

const ICT_DIR = join(process.cwd(), "database", "data", "Bank", "Questions", "ICT");
const BB_ICT_NAMEBN = "তথ্য ও যোগাযোগ প্রযুক্তি";

const G = "05_ICT";
const T = {
  hardwareCpu: `${G}/01_Computer_Hardware_and_Architecture/CPU_ALU_Registers_Memory_Hierarchy_RAM_CMOS`,
  hardwarePeripherals: `${G}/01_Computer_Hardware_and_Architecture/Peripherals_Keyboards_Scanners_OCR`,
  osMain: `${G}/02_Software_and_OS/Operating_Systems_Windows_Linux_MacOS`,
  osSystemSw: `${G}/02_Software_and_OS/System_vs_Application_Software`,
  officeWord: `${G}/03_MS_Office_Suite/MS_Word_Shortcuts_Formatting_Mail_Merge`,
  officeExcel: `${G}/03_MS_Office_Suite/MS_Excel_Formulas_Cell_Addressing_Functions`,
  officePpt: `${G}/03_MS_Office_Suite/MS_PowerPoint_Transitions_Animations_Views`,
  netTopo: `${G}/04_Networking_and_Web/Network_Topologies_LAN_WAN_Wi-Fi_WiMAX`,
  netSec: `${G}/04_Networking_and_Web/Internet_Security_Firewalls_Dark_Web`,
};

export type IctRecord = {
  n: number;
  question: string;
  options: [string, string, string, string];
  answerLetter: "A" | "B" | "C" | "D";
  explanation: string;
  header: string;
};

export type ParsedIctFile = { file: string; records: IctRecord[]; skipped: string[] };

const Q_START = /^(\d+)\.\s+(.*\S)\s*$/;
const OPT_LINE = /^([A-D])\)\s+(.*\S)\s*$/;
// Tolerates source quirks: `**Ans: B**` markdown-bold markers and the
// one-off `Speed Layer:` typo (Network file Q43) for `Speed Solution:`.
const ANS_LINE = /^\*{0,2}Ans:\s*([A-D])\s*\*{0,2}\|\s*Speed\s+(?:Solution|Layer):\s*\*{0,2}(.*\S)?\s*\*{0,2}$/;
const ANS_INLINE = /\*{0,2}Ans:\s*([A-D])\b/;
const HEADER_LINE = /^(Topic|Part)\s+\d+\s*:\s*(.+?)\s*$/;
// Bare section titles without a Topic/Part prefix (e.g. "Mixed High-Yield …").
const BARE_HEADER_LINE = /^Mixed\s.+/;
const LETTERS = ["A", "B", "C", "D"] as const;

/** File-default topic for records before any header (e.g. the MS file opens with Word). */
export function defaultTopic(fileSlug: string): string {
  if (fileSlug === "ms-office") return T.officeWord;
  if (fileSlug === "os-translators") return T.osMain;
  if (fileSlug === "cpu-memory") return T.hardwareCpu;
  if (fileSlug === "cyber-security") return T.netSec;
  if (fileSlug === "input-output") return T.hardwarePeripherals;
  return T.netTopo; // network-topology
}

/** Route one record to its taxonomy topic path (file + section header). */
export function routeTopic(fileSlug: string, header: string): string {
  const h = header.toLowerCase();
  if (fileSlug === "ms-office") {
    if (!h) return T.officeWord;
    if (h.includes("word")) return T.officeWord;
    if (h.includes("excel")) return T.officeExcel;
    if (h.includes("powerpoint")) return T.officePpt;
    if (h.includes("system software") || h.includes("system software architecture")) return T.osSystemSw;
    return defaultTopic(fileSlug);
  }
  if (fileSlug === "os-translators") {
    if (/translator|open-source|open source|licens|proprietary/.test(h)) return T.osSystemSw;
    return T.osMain;
  }
  return defaultTopic(fileSlug);
}

export function fileSlug(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.includes("ms office")) return "ms-office";
  if (n.includes("cpu")) return "cpu-memory";
  if (n.includes("cyber")) return "cyber-security";
  if (n.includes("input")) return "input-output";
  if (n.includes("network")) return "network-topology";
  return "os-translators";
}

/**
 * Parse one ICT file (pure — unit-testable). Handles single-line records,
 * multi-line records, and Topic/Part headers in any mixture.
 */
export function parseIctFile(fileName: string, text: string): ParsedIctFile {
  const records: IctRecord[] = [];
  const skipped: string[] = [];
  let header = "";
  let pending: { n: number; qLines: string[]; opts: string[] } | null = null;

  const flushPending = (lineNo: number) => {
    if (pending) {
      skipped.push(`line ${lineNo}: incomplete record #${pending.n} (missing options/answer)`);
      pending = null;
    }
  };

  // Matches a full single-line record; options are split on ` X) ` boundaries.
  const trySingleLine = (line: string): IctRecord | null => {
    const m = line.match(/^(\d+)\.\s+(.*)$/);
    if (!m) return null;
    const [, nStr, rest] = m;
    const ansIdx = rest.search(ANS_INLINE);
    if (ansIdx < 0) return null;
    const head = rest.slice(0, ansIdx);
    const ansPart = rest.slice(ansIdx);
    const ans = ansPart.match(/^\*{0,2}Ans:\s*([A-D])\s*\*{0,2}\|\s*Speed\s+(?:Solution|Layer):\s*\*{0,2}(.*\S)?\s*\*{0,2}$/);
    if (!ans) return null;
    // Split options on letter markers, keeping the question text before `A)`.
    const parts = head.split(/\s+([A-D])\)\s+/);
    // parts[0] = question, then repeating (letter, text) pairs.
    if (parts.length < 9) return null;
    const letters = [parts[1], parts[3], parts[5], parts[7]];
    if (letters.join("") !== "ABCD") return null;
    const opts = [parts[2].trim(), parts[4].trim(), parts[6].trim(), parts[8].trim()];
    if (opts.some((o) => !o)) return null;
    return {
      n: Number(nStr),
      question: parts[0].trim(),
      options: opts as [string, string, string, string],
      answerLetter: ans[1] as IctRecord["answerLetter"],
      explanation: (ans[2] ?? "").trim(),
      header,
    };
  };

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trim();
    if (!line) return;
    const hm = line.match(HEADER_LINE);
    if (hm) {
      flushPending(lineNo);
      header = hm[2].trim();
      return;
    }
    if (BARE_HEADER_LINE.test(line)) {
      flushPending(lineNo);
      header = line;
      return;
    }
    const single = trySingleLine(line);
    if (single) {
      flushPending(lineNo);
      records.push(single);
      return;
    }
    const qm = line.match(Q_START);
    if (qm && !OPT_LINE.test(line) && !ANS_LINE.test(line)) {
      flushPending(lineNo);
      pending = { n: Number(qm[1]), qLines: [qm[2].trim()], opts: [] };
      return;
    }
    if (pending) {
      // Answer line reached. Options collected so far are already validated;
      // the answer line itself may also carry crammed options
      // (e.g. `B) … C) … D) … **Ans: B | Speed Solution:** …`). Never
      // re-split validated text (option prose can contain `X)` sequences
      // like `(like #define in C)`); only parse the remainder.
      if (ANS_INLINE.test(line)) {
        const ansAt = line.search(ANS_INLINE);
        const optText = line.slice(0, ansAt).trim();
        const ansM = line.slice(ansAt).match(/^\*{0,2}Ans:\s*([A-D])\s*\*{0,2}\|\s*Speed\s+(?:Solution|Layer):\s*\*{0,2}(.*\S)?\s*\*{0,2}$/);
        const opts = [...pending.opts];
        let ok = !!ansM;
        if (ok && optText) {
          // A leading `X)` has no preceding whitespace for the split
          // regex, so consume it explicitly before splitting the rest.
          const segs: string[] = [""];
          let rest = optText;
          const lead = rest.match(/^([A-D])\)\s+/);
          if (lead) {
            segs.push(lead[1]);
            rest = rest.slice(lead[0].length);
          }
          segs.push(...rest.split(/\s+([A-D])\)\s+/));
          const first = segs[0].trim();
          if (first) ok = false; // junk before the first marker
          else {
            for (let k = 1; k < segs.length && ok; k += 2) {
              const want = LETTERS[opts.length];
              const text = (segs[k + 1] ?? "").replace(/\*+$/, "").trim();
              if (segs[k] !== want || !text) ok = false;
              else opts.push(text);
            }
          }
        }
        if (ok && opts.length === 4 && LETTERS.includes(ansM![1] as (typeof LETTERS)[number])) {
          records.push({
            n: pending.n,
            question: pending.qLines.join(" "),
            options: opts as [string, string, string, string],
            answerLetter: ansM![1] as IctRecord["answerLetter"],
            explanation: (ansM![2] ?? "").trim(),
            header,
          });
        } else {
          skipped.push(`line ${lineNo}: garbled options/answer in record #${pending.n}`);
        }
        pending = null;
        return;
      }
      const om = line.match(OPT_LINE);
      if (om) {
        const want = LETTERS[pending.opts.length];
        if (om[1] !== want) {
          skipped.push(`line ${lineNo}: expected option ${want} in record #${pending.n}, got ${om[1]}`);
          pending = null;
          return;
        }
        pending.opts.push(om[2].trim());
        return;
      }
      const am = line.match(ANS_LINE);
      if (am) {
        if (pending.opts.length !== 4) {
          skipped.push(`line ${lineNo}: record #${pending.n} has ${pending.opts.length} options (need 4)`);
        } else {
          records.push({
            n: pending.n,
            question: pending.qLines.join(" "),
            options: pending.opts as [string, string, string, string],
            answerLetter: am[1] as IctRecord["answerLetter"],
            explanation: (am[2] ?? "").trim(),
            header,
          });
        }
        pending = null;
        return;
      }
      // Continuation of a wrapped question line (before any option arrived).
      if (pending.opts.length === 0) {
        pending.qLines.push(line);
        return;
      }
      skipped.push(`line ${lineNo}: unexpected line inside record #${pending.n}`);
      pending = null;
      return;
    }
    skipped.push(`line ${lineNo}: unrecognized: ${line.slice(0, 80)}`);
  });
  flushPending(lines.length + 1);
  return { file: fileName, records, skipped };
}

export type IctImportReport = {
  files: number;
  parsed: number;
  inserted: number;
  updated: number;
  skippedRecords: number;
  topics: Record<string, number>;
};

// ── Answer-position balancing ────────────────────────────────────
// Source files are heavily answer-biased (~65% B). Grading compares option
// TEXT (never letters), and explanations never reference positions, so the
// stored order can be rearranged freely. balanceOptions puts the correct
// text at `slot` and fills the rest with the distractors in seeded order.
// Callers assign slots round-robin over sourceKey-sorted rows → ~25% each,
// deterministic and reproducible on every rerun.

/** mulberry32 — tiny seeded PRNG (deterministic per question). */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let a = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const j = ((t ^ (t >>> 14)) >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function balanceOptions(
  options: [string, string, string, string],
  correctText: string,
  slot: number,
  seed: string,
): [string, string, string, string] {
  const correct = options.find((o) => o === correctText);
  if (correct === undefined) throw new Error("correctAnswer not found in options");
  // Remove exactly one occurrence of the correct text (duplicated option
  // texts stay with the distractors).
  const pool = [...options];
  pool.splice(pool.indexOf(correctText), 1);
  const shuffled = seededShuffle(pool, hashSeed(seed));
  const out = new Array<string>(4);
  out[slot % 4] = correctText;
  let d = 0;
  for (let i = 0; i < 4; i++) {
    if (out[i] === undefined) out[i] = shuffled[d++];
  }
  return out as [string, string, string, string];
}

export async function importBankIct(prisma: PrismaClient): Promise<IctImportReport> {
  const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bb) throw new Error("BANGLADESH_BANK ecosystem missing — run the seed first");
  const subject = await prisma.subject.findUnique({
    where: { ecosystemId_nameBn: { ecosystemId: bb.id, nameBn: BB_ICT_NAMEBN } },
  });
  if (!subject) throw new Error(`Bank ICT subject "${BB_ICT_NAMEBN}" missing — run seed-bb-subjects.ts first`);

  const topicRows = await prisma.topic.findMany({ where: { subjectId: subject.id }, select: { id: true, path: true } });
  const topicIdByPath = new Map(topicRows.map((t) => [t.path, t.id]));

  const files = readdirSync(ICT_DIR).filter((f) => f.endsWith(".txt")).sort();
  const report: IctImportReport = { files: files.length, parsed: 0, inserted: 0, updated: 0, skippedRecords: 0, topics: {} };

  type Op = {
    key: string;
    data: {
      ecosystemId: number;
      subjectId: number;
      topicId: number | null;
      topic: string;
      subtopic: string;
      path: string;
      question: string;
      options: [string, string, string, string];
      correctAnswer: string;
      explanation: string;
      difficulty: "MEDIUM";
      year: number | null;
      sourceExam: string;
      questionNumber: number;
    };
    topicPath: string;
  };
  const ops: Op[] = [];

  for (const file of files) {
    const slug = fileSlug(file);
    const parsed = parseIctFile(file, readFileSync(join(ICT_DIR, file), "utf8"));
    report.parsed += parsed.records.length;
    report.skippedRecords += parsed.skipped.length;
    for (const s of parsed.skipped) console.warn(`  [skip] ${file}: ${s}`);
    const seenText = new Set<string>();
    for (const r of parsed.records) {
      if (r.question.length < 3) {
        report.skippedRecords++;
        continue;
      }
      // Same-file text duplicates (e.g. repeated review questions): keep the
      // first occurrence so the bank never shows the same question twice.
      const textKey = r.question.trim().toLowerCase();
      if (seenText.has(textKey)) {
        report.skippedRecords++;
        console.warn(`  [skip] ${file}: duplicate of #${r.n} in-file: ${r.question.slice(0, 70)}`);
        continue;
      }
      seenText.add(textKey);
      const topicPath = routeTopic(slug, r.header);
      const answerText = r.options[LETTERS.indexOf(r.answerLetter)];
      ops.push({
        key: sourceKey(subject.id, "bank-ict", slug, r.n, r.question),
        data: {
          ecosystemId: bb.id,
          subjectId: subject.id,
          topicId: topicIdByPath.get(topicPath) ?? null,
          topic: topicPath.split("/").pop() ?? "",
          subtopic: r.header,
          path: topicPath,
          question: r.question,
          options: r.options,
          correctAnswer: answerText,
          explanation: r.explanation,
          difficulty: "MEDIUM" as const,
          year: null as number | null,
          sourceExam: `Bank ICT · ${slug}`,
          questionNumber: r.n,
        },
        topicPath,
      });
    }
    console.log(`  ✓ ${file}: ${parsed.records.length} parsed`);
  }

  // Balance answer positions: sourceKey-sorted round-robin → ~25% each.
  // Deterministic: identical input always yields identical stored order.
  const ordered = [...ops].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  ordered.forEach((o, i) => {
    o.data.options = balanceOptions(o.data.options, o.data.correctAnswer, i % 4, o.key);
  });

  // Batched writes: the pooler RTT makes per-row roundtrips infeasible at
  // this volume. One lookup + chunked createMany + one transaction of updates.
  const existing = await prisma.question.findMany({
    where: { subjectId: subject.id, sourceKey: { in: ops.map((o) => o.key) } },
    select: { sourceKey: true },
  });
  const existingKeys = new Set(existing.map((e) => e.sourceKey));
  const fresh = ops.filter((o) => !existingKeys.has(o.key));
  const stale = ops.filter((o) => existingKeys.has(o.key));
  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200);
    await prisma.question.createMany({
      data: chunk.map((o) => ({ sourceKey: o.key, ...o.data })),
    });
    report.inserted += chunk.length;
  }
  if (stale.length > 0) {
    await prisma.$transaction(
      stale.map((o) => prisma.question.update({ where: { subjectId_sourceKey: { subjectId: subject.id, sourceKey: o.key } }, data: o.data })),
    );
    report.updated += stale.length;
  }
  for (const o of ops) report.topics[o.topicPath] = (report.topics[o.topicPath] ?? 0) + 1;
  return report;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const report = await importBankIct(prisma);
    console.log(`\n✓ Done. files=${report.files} parsed=${report.parsed} inserted=${report.inserted} updated=${report.updated} skipped=${report.skippedRecords}`);
    for (const [t, c] of Object.entries(report.topics)) console.log(`    ${c} × ${t}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bank-ict.ts")) {
  main().catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  });
}
