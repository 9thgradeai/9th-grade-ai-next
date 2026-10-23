/**
 * scripts/import-bank-ict-v2.ts
 * ----------------------------------------------------------------------------
 * Imports the 5 new Bank ICT MCQ files in database/data/Bank/ICT/
 *   Questions(...).txt  (200 MCQs each, 1000 total)
 * into the BANGLADESH_BANK "05_ICT" subject ONLY (practice pool:
 * paperId NULL). Never touches BCS content.
 *
 * Source format (4 logical lines per record, Modern-ICT file merges the
 * last two onto one line):
 *   `N. <question stem>`
 *   `A. <opt> B. <opt> C. <opt> D. <opt>`
 *   `Correct Answer: X. <repeated option text>[ Explanation: ...]`
 *   `Explanation: ...`
 * Records are grouped under `Section ...:` headers (used for topic routing).
 *
 * Grading compares option TEXT (backend/services/exam-submission.ts), so
 * correctAnswer is taken from options[letterIndex] verbatim — the repeated
 * text on the Correct Answer line sometimes differs by a trailing period.
 *
 * Run: `npx tsx scripts/import-bank-ict-v2.ts` (needs DATABASE_URL).
 * Idempotent: upserts by [subjectId, sourceKey]; namespace "bank-ict-v2" is
 * distinct from the legacy import-bank-ict.ts ("bank-ict") so numbering
 * overlaps (both sets use 1–200) never collide.
 * ----------------------------------------------------------------------------
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca } from "./qb-forensics/import-gate";
import { balanceOptions } from "./import-bank-ict";

const ICT_DIR = join(process.cwd(), "database", "data", "Bank", "ICT");
const BB_ICT_NAMEBN = "05_ICT";

const P = {
  osMain: "05_ICT/02_Software_and_OS/Operating_Systems_Windows_Linux_MacOS",
  osSysApp:
    "05_ICT/02_Software_and_OS/System_vs_Application_Software",
  osUtil:
    "05_ICT/02_Software_and_OS/Utility_Software_Antivirus_Compression",
  word: "05_ICT/03_MS_Office_Suite/MS_Word_Shortcuts_Formatting_Mail_Merge",
  excel:
    "05_ICT/03_MS_Office_Suite/MS_Excel_Formulas_Cell_Addressing_Functions",
  ppt: "05_ICT/03_MS_Office_Suite/MS_PowerPoint_Transitions_Animations_Views",
  netTopo:
    "05_ICT/04_Networking_and_Web/Network_Topologies_LAN_WAN_Wi-Fi_WiMAX",
  netProto:
    "05_ICT/04_Networking_and_Web/Protocols_SMTP_POP3_FTP_TCP_IP",
  netWww:
    "05_ICT/04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing",
  netSec:
    "05_ICT/04_Networking_and_Web/Internet_Security_Firewalls_Dark_Web",
  ai: "05_ICT/05_Emerging_Tech_and_Number_Systems/Artificial_Intelligence_Chatbots_Prolog",
  // The 2026-10-22 Bank taxonomy revision has no `06_Database_and_Information_
  // Systems` group and no `Digital_Bangladesh_…` leaf any more — those
  // sections fold onto the closest surviving node (information systems and
  // e-commerce / e-governance live with the web & cloud leaf).
  dbParent: "05_ICT/04_Networking_and_Web",
  dbFund: "05_ICT/04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing",
  dbSql: "05_ICT/04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing",
  dbIs: "05_ICT/04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing",
  emergingDig: "05_ICT/04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing",
};

export type V2Record = {
  n: number;
  question: string;
  options: [string, string, string, string];
  answerLetter: "A" | "B" | "C" | "D";
  explanation: string;
  header: string;
};

const SECTION_LINE = /^Section\s+\S+\s*:\s*(.+?)\s*$/;
const Q_START = /^(\d+)\.\s+(.*\S)\s*$/;
const CA_LINE = /^Correct Answer:\s*([A-D])\.\s*(.*\S)?\s*$/;
const EXPL_LINE = /^Explanation:\s*(.*\S)?\s*$/;
const LETTERS = ["A", "B", "C", "D"] as const;

/** Windows-style paths (`C:\Reports\…`) trip the LaTeX import gate and
 *  break KaTeX rendering. Forward slashes display identically. */
export function sanitizePaths(s: string): string {
  return /[A-Za-z]:\\/.test(s) ? s.replace(/\\/g, "/") : s;
}

export function fileSlugV2(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.includes("internet") || n.includes("networking")) return "internet-networking-web";
  if (n.includes("cybersecurity")) return "cybersecurity-data-protection";
  if (n.includes("database")) return "database-information-systems";
  if (n.includes("modern")) return "modern-ict-digital-bangladesh";
  return "os-application-software";
}

/** Split an options block (`A. … B. … C. … D. …`, possibly multi-line) into 4 texts. */
export function splitOptions(block: string): [string, string, string, string] | null {
  const t = block.replace(/\s+/g, " ").trim();
  if (!/^A\.\s+/.test(t)) return null;
  const parts = t.split(/\s+([B-D])\.\s+/);
  // parts[0] = "A. <optA>"; parts[1..] = letter,text pairs
  const first = parts[0].replace(/^A\.\s+/, "").trim();
  if (parts.length !== 7) return null;
  if (parts[1] !== "B" || parts[3] !== "C" || parts[5] !== "D") return null;
  const opts = [first, parts[2].trim(), parts[4].trim(), parts[6].trim()];
  if (opts.some((o) => !o)) return null;
  return opts as [string, string, string, string];
}

export function parseV2File(fileName: string, text: string): { records: V2Record[]; skipped: string[] } {
  const records: V2Record[] = [];
  const skipped: string[] = [];
  let header = "";
  // State machine over logical lines.
  let q: { n: number; stem: string } | null = null;
  let optBlock: string[] = [];

  const reset = () => {
    q = null;
    optBlock = [];
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const line = raw.trim().replace(/^\uFEFF/, "");
    if (!line) continue;
    const sm = line.match(SECTION_LINE);
    if (sm) {
      if (q) skipped.push(`line ${lineNo}: incomplete record #${q.n} before new section`);
      reset();
      header = sm[1].trim();
      continue;
    }
    const qm = line.match(Q_START);
    // A question start is a line like `12. ...` that is NOT an options line
    // (options lines start `A. ` — ambiguous with `A.`? No: Q_START needs
    // leading digits, so no clash) and NOT a Correct Answer/Explanation line.
    if (qm && !CA_LINE.test(line) && !EXPL_LINE.test(line) && !q) {
      q = { n: Number(qm[1]), stem: qm[2].trim() };
      optBlock = [];
      continue;
    }
    if (q && optBlock.length === 0 && CA_LINE.test(line)) {
      // Options missing entirely (shouldn't happen) — skip record.
      skipped.push(`line ${lineNo}: record #${q.n} has no options block`);
      reset();
      continue;
    }
    if (q) {
      // A new question start means the previous record never got its
      // Correct Answer line — report and start fresh.
      if (qm) {
        skipped.push(`line ${lineNo}: incomplete record #${q.n} (missing Correct Answer)`);
        q = { n: Number(qm[1]), stem: qm[2].trim() };
        optBlock = [];
        continue;
      }
      const ca = line.match(CA_LINE);
      if (ca) {
        const opts = splitOptions(optBlock.join(" "));
        if (!opts) {
          skipped.push(`line ${lineNo}: record #${q.n} options unparseable: ${optBlock.join(" ").slice(0, 80)}`);
          reset();
          continue;
        }
        let expl = "";
        let rest = (ca[2] ?? "").trim();
        const exIdx = rest.search(/Explanation:\s*/);
        if (exIdx >= 0) {
          expl = rest.slice(exIdx).replace(/^Explanation:\s*/, "").trim();
          rest = rest.slice(0, exIdx).trim();
        }
        // Explanation may continue on following Explanation: line(s).
        records.push({
          n: q.n,
          question: q.stem,
          options: opts,
          answerLetter: ca[1] as V2Record["answerLetter"],
          explanation: expl,
          header,
        });
        reset();
        continue;
      }
      // Accumulate options block lines (options may wrap).
      optBlock.push(line);
      continue;
    }
    // Standalone Explanation: line → attach to the most recent record that
    // is still awaiting its explanation (Modern-ICT combined lines aside,
    // the normal files put Explanation on its own line AFTER the record was
    // already pushed with empty explanation).
    const em = line.match(EXPL_LINE);
    if (em) {
      const last = records[records.length - 1];
      if (last && !last.explanation) {
        // Collect continuation lines: handled inline below — here just the first.
        last.explanation = (em[1] ?? "").trim();
      } else if (last) {
        last.explanation += " " + ((em[1] ?? "").trim());
      } else {
        skipped.push(`line ${lineNo}: orphan explanation`);
      }
      continue;
    }
    // Continuation of an explanation (wrapped line): append to last record
    // when it looks like prose rather than a new record start.
    const last = records[records.length - 1];
    if (last && last.explanation && !Q_START.test(line) && !SECTION_LINE.test(line)) {
      last.explanation += " " + line;
      continue;
    }
    skipped.push(`line ${lineNo}: unrecognized: ${line.slice(0, 80)}`);
  }
  if (q) skipped.push(`line ${lines.length + 1}: incomplete record #${q.n} at EOF`);
  return { records, skipped };
}

export function routeTopicV2(slug: string, header: string): string {
  const h = header.toLowerCase();
  switch (slug) {
    case "internet-networking-web":
      if (/ip address|mac address|dns|dhcp|url/.test(h)) return P.netProto;
      if (/http|https|tcp|udp|ftp|smtp|pop3|imap|protocol/.test(h)) return P.netProto;
      if (/browser|search engine|website|webpage|upload|download|bandwidth|wi-fi|bluetooth|hotspot/.test(h))
        return P.netWww;
      return P.netTopo;
    case "cybersecurity-data-protection":
      if (/antivirus|firewall|security control/.test(h)) return P.osUtil;
      return P.netSec;
    case "database-information-systems":
      if (/sql|query/.test(h)) return P.dbSql;
      if (/data, information|information system|warehousing|mining|analytical/.test(h)) return P.dbIs;
      return P.dbFund;
    case "modern-ict-digital-bangladesh":
      if (/cloud|iaas|paas|saas/.test(h)) return P.netWww;
      if (/e-commerce|e-governance|digital signature|electronic transaction|institution|initiative|law/.test(h))
        return P.emergingDig;
      return P.ai;
    default: {
      // os-application-software
      if (/microsoft word|word/.test(h) && !/excel|powerpoint/.test(h)) return P.word;
      if (/excel|formulas|cell/.test(h)) return P.excel;
      if (/powerpoint|presentation/.test(h)) return P.ppt;
      if (/shortcut/.test(h)) return P.word;
      if (/file extension|file format|integrated application/.test(h)) return P.osSysApp;
      return P.osMain;
    }
  }
}

export type V2Report = {
  files: number;
  parsed: number;
  inserted: number;
  updated: number;
  skippedRecords: number;
  topics: Record<string, number>;
};

export async function importBankIctV2(prisma: PrismaClient): Promise<V2Report> {
  const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bb) throw new Error("BANGLADESH_BANK ecosystem missing — run the seed first");
  const subject = await prisma.subject.findUnique({
    where: { ecosystemId_nameBn: { ecosystemId: bb.id, nameBn: BB_ICT_NAMEBN } },
  });
  if (!subject) throw new Error(`Bank ICT subject "${BB_ICT_NAMEBN}" missing — run seed-bb-subjects.ts first`);

  // Every target now exists in bb-taxonomy.json — nothing to create.

  const topicRows = await prisma.topic.findMany({
    where: { subjectId: subject.id },
    select: { id: true, path: true },
  });
  const topicIdByPath = new Map(topicRows.map((t) => [t.path, t.id]));

  const files = readdirSync(ICT_DIR).filter((f) => f.endsWith(".txt")).sort();
  const report: V2Report = { files: files.length, parsed: 0, inserted: 0, updated: 0, skippedRecords: 0, topics: {} };

  type Op = {
    key: string;
    topicPath: string;
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
  };
  const ops: Op[] = [];

  for (const file of files) {
    const slug = fileSlugV2(file);
    const { records, skipped } = parseV2File(file, readFileSync(join(ICT_DIR, file), "utf8"));
    report.parsed += records.length;
    report.skippedRecords += skipped.length;
    for (const s of skipped) console.warn(`  [skip] ${file}: ${s}`);
    const seenText = new Set<string>();
    for (const r of records) {
      if (r.question.length < 3) {
        report.skippedRecords++;
        continue;
      }
      const textKey = r.question.trim().toLowerCase() + "\n" + r.options.join("\n");
      if (seenText.has(textKey)) {
        report.skippedRecords++;
        console.warn(`  [skip] ${file}: duplicate of #${r.n} in-file: ${r.question.slice(0, 70)}`);
        continue;
      }
      seenText.add(textKey);
      const topicPath = routeTopicV2(slug, r.header);
      const answerText = r.options[LETTERS.indexOf(r.answerLetter)];
      const gate = scanMca({
        question: sanitizePaths(r.question),
        options: r.options.map(sanitizePaths) as [string, string, string, string],
        correctAnswer: sanitizePaths(answerText),
        explanation: sanitizePaths(r.explanation),
      });
      if (gate.verdict === "REJECT") {
        report.skippedRecords++;
        console.warn(`  [reject] ${file} #${r.n}: ${gate.fatal.map((f) => `${f.code}@${f.field}`).join(", ")}`);
        continue;
      }
      const norm = gate.normalized;
      ops.push({
        key: sourceKey(subject.id, "bank-ict-v2", slug, r.n, r.question),
        topicPath,
        data: {
          ecosystemId: bb.id,
          subjectId: subject.id,
          topicId: topicIdByPath.get(topicPath) ?? null,
          topic: topicPath.split("/").pop() ?? "",
          subtopic: r.header,
          path: topicPath,
          question: norm.question ?? r.question,
          options: (norm.options ?? r.options) as [string, string, string, string],
          correctAnswer: norm.correctAnswer ?? answerText,
          explanation: norm.explanation ?? r.explanation,
          difficulty: "MEDIUM" as const,
          year: null as number | null,
          sourceExam: `Bank ICT · ${slug}`,
          questionNumber: r.n,
        },
      });
    }
    console.log(`  ✓ ${file}: ${records.length} parsed`);
  }

  // Balance answer positions: sourceKey-sorted round-robin → ~25% each.
  const ordered = [...ops].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  ordered.forEach((o, i) => {
    o.data.options = balanceOptions(o.data.options, o.data.correctAnswer, i % 4, o.key);
  });

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
      stale.map((o) =>
        prisma.question.update({
          where: { subjectId_sourceKey: { subjectId: subject.id, sourceKey: o.key } },
          data: o.data,
        }),
      ),
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
    const report = await importBankIctV2(prisma);
    console.log(
      `\n✓ Done. files=${report.files} parsed=${report.parsed} inserted=${report.inserted} updated=${report.updated} skipped=${report.skippedRecords}`,
    );
    for (const [t, c] of Object.entries(report.topics)) console.log(`    ${c} × ${t}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bank-ict-v2.ts")) {
  main().catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  });
}
