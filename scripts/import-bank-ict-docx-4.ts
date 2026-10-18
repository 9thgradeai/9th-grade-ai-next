/**
 * scripts/import-bank-ict-docx-4.ts
 * ----------------------------------------------------------------------------
 * Verbatim import of 4 Bank ICT .docx files (unicode-optimized source):
 *   Questions(Computer Fundamentals and Hardware).docx
 *   Questions(Number System-Data Representation).docx
 *   Questions(Modern ICT and Digital Bangladesh).docx
 *   Questions(Operating Systems and Application Software).docx
 * into BANGLADESH_BANK "05_ICT" ONLY (practice pool, paperId NULL).
 *
 * Verbatim contract (per user request):
 *   - NO math normalization / import gate — stored text is byte-identical to
 *     the document (OMML subscript/superscript converted to Unicode chars).
 *   - NO answer-position balancing — options stay in document order.
 *   - rawMath=true so the read path bypasses the LaTeX normalizer.
 *
 * Source format per paragraph:
 *   `Section ...:` header
 *   `N. <stem>`
 *   `A. <o1> B. <o2> C. <o3> D. <o4>`
 *   `Correct Answer: X. <text>`
 *   `Explanation: ...`
 *
 * Run: `npx tsx scripts/import-bank-ict-docx-4.ts` (needs DATABASE_URL).
 * Idempotent: upserts by [subjectId, sourceKey], namespace "bank-ict-docx".
 * ----------------------------------------------------------------------------
 */
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { sourceKey } from "./seed-keys";

const FILES = [
  "Questions(Computer Fundamentals and Hardware).docx",
  "Questions(Number System-Data Representation).docx",
  "Questions(Modern ICT and Digital Bangladesh).docx",
  "Questions(Operating Systems and Application Software).docx",
] as const;
const ICT_DIR = `${process.cwd()}/database/data/Bank/ICT`;

const SUB = {
  cpu: "05_ICT/01_Computer_Hardware_and_Architecture/CPU_ALU_Registers_Memory_Hierarchy_RAM_CMOS",
  periph:
    "05_ICT/01_Computer_Hardware_and_Architecture/Peripherals_Keyboards_Scanners_OCR",
  storage:
    "05_ICT/01_Computer_Hardware_and_Architecture/Storage_Devices_HDD_SSD_Optical",
  osMain: "05_ICT/02_Software_and_OS/Operating_Systems_Windows_Linux_MacOS",
  osSysApp: "05_ICT/02_Software_and_OS/System_vs_Application_Software",
  osUtil: "05_ICT/02_Software_and_OS/Utility_Software_Antivirus_Compression",
  word: "05_ICT/03_MS_Office_Suite/MS_Word_Shortcuts_Formatting_Mail_Merge",
  excel: "05_ICT/03_MS_Office_Suite/MS_Excel_Formulas_Cell_Addressing_Functions",
  ppt: "05_ICT/03_MS_Office_Suite/MS_PowerPoint_Transitions_Animations_Views",
  num: "05_ICT/05_Emerging_Tech_and_Number_Systems/Binary_Decimal_Hexadecimal_Conversions",
  ai: "05_ICT/05_Emerging_Tech_and_Number_Systems/Artificial_Intelligence_Chatbots_Prolog",
  emergingDig:
    "05_ICT/05_Emerging_Tech_and_Number_Systems/Digital_Bangladesh_Ecommerce_Egovernance_Law",
  netWww: "05_ICT/04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing",
} as const;

const SUB_MAP: Record<string, string> = {
  "computer-fundamentals-hardware": SUB.cpu,
  "number-system": SUB.num,
  "modern-ict": SUB.ai,
  os: SUB.osMain,
};

export function fileSlugDocx(f: string): string {
  const n = f.toLowerCase();
  if (n.includes("fundamentals") || n.includes("hardware")) return "computer-fundamentals-hardware";
  if (n.includes("number system")) return "number-system";
  if (n.includes("modern ict")) return "modern-ict";
  return "os";
}

export function routeTopicDocx(slug: string, header: string): string {
  const h = header.toLowerCase();
  if (slug === "computer-fundamentals-hardware") {
    if (/input|output|keyboard|mouse|scanner|printer|ocr|omr|peripheral/.test(h)) return SUB.periph;
    if (/storage|memory|hdd|ssd|optical|ram|rom|cache|hard disk/.test(h)) return SUB.storage;
    return SUB.cpu;
  }
  if (slug === "modern-ict") {
    if (/cloud|iaas|paas|saas|web/.test(h)) return SUB.netWww;
    if (/digital bangladesh|e-commerce|e-governance|e-government|law|policy|vision|union digital|sheikh|initiative|service/.test(h))
      return SUB.emergingDig;
    return SUB.ai;
  }
  if (slug === "os") {
    if (/microsoft word|ms word|\bword\b/.test(h) && !/excel|powerpoint|password/.test(h)) return SUB.word;
    if (/excel|spreadsheet|cell|formula/.test(h)) return SUB.excel;
    if (/powerpoint|presentation/.test(h)) return SUB.ppt;
    if (/antivirus|utility|compression|backup/.test(h)) return SUB.osUtil;
    if (/application|package|software type|license|open-source|proprietary|translator|compiler|language/.test(h))
      return SUB.osSysApp;
    return SUB.osMain;
  }
  return SUB_MAP[slug] ?? SUB.cpu;
}

// ── OMML → Unicode ──────────────────────────────────────────
const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", a: "ᵃ", b: "ᵇ", c: "ᶜ",
  d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ", o: "ᵒ", p: "ᵖ",
  r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
};
const SUBS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ",
  k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};
const uni = (s: string, m: Record<string, string>) => [...s].map((c) => m[c] ?? c).join("");
const innerText = (frag: string) =>
  [...frag.matchAll(/<(?:w:t|m:t)[^>]*>([\s\S]*?)<\/(?:w:t|m:t)>/g)]
    .map((x) => x[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"))
    .join("");

function omathToUnicode(p: string): string {
  // subscript: <m:sSub>...<m:e>base</m:e><m:sub>sub</m:sub></m:sSub>
  // subscript: <m:sSub>...<m:e>base</m:e><m:sub>sub</m:sub></m:sSub>
  // NOTE: the base may also sit in a sibling <m:r> BEFORE the sSub block
  // (e.g. 101 + sSub(e=0, sub=2) = 1010₂) — either way the block itself
  // renders as innerText(e) + subscript(innerText(sub)).
  // The replacement is wrapped in <w:t> so innerText() below picks it up.
  p = p.replace(/<m:sSub>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/g,
    (_, b, s) => `<w:t xml:space="preserve">${innerText(b) + uni(innerText(s), SUBS)}</w:t>`);
  // superscript: <m:sSup>...<m:e>base</m:e><m:sup>sup</m:sup></m:sSup>
  p = p.replace(/<m:sSup>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/g,
    (_, b, s) => `<w:t xml:space="preserve">${innerText(b) + uni(innerText(s), SUP)}</w:t>`);
  // Any remaining bare <m:oMath> runs (plain symbols): keep their text.
  p = p.replace(/<m:oMath>([\s\S]*?)<\/m:oMath>/g, (_, b) => `<w:t xml:space="preserve">${innerText(b)}</w:t>`);
  return p;
}

export function extractParagraphs(docxPath: string): string[] {
  const xml = execSync(`unzip -p "${docxPath}" word/document.xml`, { maxBuffer: 256 * 1024 * 1024 }).toString("utf8");
  const paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) ?? [];
  const out: string[] = [];
  for (const p of paras) {
    const withUni = omathToUnicode(p);
    const t = innerText(withUni).replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  return out;
}

// ── Parse ───────────────────────────────────────────────────
export type DocxRecord = {
  n: number; question: string; options: [string, string, string, string];
  answerLetter: "A" | "B" | "C" | "D"; explanation: string; header: string;
};

const SECTION = /^Section\s+\S+\s*:\s*(.+?)\s*$/i;
const Q_START = /^(\d{1,3})\.\s+(.*\S)\s*$/;
const CA = /^Correct Answer:\s*([A-D])\.\s*(.*\S)?\s*$/;
const EXPL = /^Explanation:\s*(.*\S)?\s*$/;

export function splitOptions(block: string): [string, string, string, string] | null {
  const t = block.replace(/\s+/g, " ").trim();
  if (!/^A\.\s+/.test(t)) return null;
  const parts = t.split(/\s+([B-D])\.\s+/);
  if (parts.length !== 7 || parts[1] !== "B" || parts[3] !== "C" || parts[5] !== "D") return null;
  const opts = [parts[0].replace(/^A\.\s+/, "").trim(), parts[2].trim(), parts[4].trim(), parts[6].trim()];
  if (opts.some((o) => !o)) return null;
  return opts as [string, string, string, string];
}

export function parseDocxParagraphs(paras: string[]): { records: DocxRecord[]; skipped: string[] } {
  const records: DocxRecord[] = [];
  const skipped: string[] = [];
  let header = "";
  let q: { n: number; stem: string } | null = null;
  let optBlock: string[] = [];
  for (let i = 0; i < paras.length; i++) {
    const line = paras[i].replace(/^\uFEFF/, "");
    const lineNo = i + 1;
    const sm = line.match(SECTION);
    if (sm) {
      if (q) skipped.push(`para ${lineNo}: incomplete record #${q.n} before new section`);
      q = null; optBlock = [];
      header = sm[1].trim();
      continue;
    }
    if (/^Part\s+[A-Z]\s*[—–-]\s*/.test(line)) {
      if (q) skipped.push(`para ${lineNo}: incomplete record #${q.n} before new part`);
      q = null; optBlock = [];
      header = line;
      continue;
    }
    const qm = line.match(Q_START);
    if (qm && !CA.test(line) && !EXPL.test(line) && !q) {
      q = { n: Number(qm[1]), stem: qm[2].trim() };
      optBlock = [];
      continue;
    }
    if (q) {
      if (qm) {
        skipped.push(`para ${lineNo}: incomplete record #${q.n} (missing Correct Answer)`);
        q = { n: Number(qm[1]), stem: qm[2].trim() };
        optBlock = [];
        continue;
      }
      const ca = line.match(CA);
      if (ca) {
        const opts = splitOptions(optBlock.join(" "));
        if (!opts) {
          skipped.push(`para ${lineNo}: record #${q.n} options unparseable: ${optBlock.join(" ").slice(0, 80)}`);
          q = null; optBlock = [];
          continue;
        }
        // The Correct Answer line repeats the option text ("B. Vacuum tubes");
        // correctAnswer already carries it verbatim, so it is NOT part of the
        // explanation — only the standalone Explanation: paragraph(s) are.
        records.push({
          n: q.n, question: q.stem, options: opts,
          answerLetter: ca[1] as DocxRecord["answerLetter"],
          explanation: "", header,
        });
        q = null; optBlock = [];
        continue;
      }
      optBlock.push(line);
      continue;
    }
    const em = line.match(EXPL);
    if (em) {
      const last = records[records.length - 1];
      if (last && !last.explanation) last.explanation = (em[1] ?? "").trim();
      else if (last) last.explanation += " " + ((em[1] ?? "").trim());
      else skipped.push(`para ${lineNo}: orphan explanation`);
      continue;
    }
    const last = records[records.length - 1];
    if (last && last.explanation && !Q_START.test(line)) {
      last.explanation += " " + line;
      continue;
    }
    skipped.push(`para ${lineNo}: unrecognized: ${line.slice(0, 80)}`);
  }
  if (q) skipped.push(`para end: incomplete record #${q.n} at EOF`);
  return { records, skipped };
}

// ── Import ──────────────────────────────────────────────────
export async function importBankIctDocx4(prisma: PrismaClient) {
  const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bb) throw new Error("BANGLADESH_BANK ecosystem missing");
  const subject = await prisma.subject.findUnique({
    where: { ecosystemId_nameBn: { ecosystemId: bb.id, nameBn: "05_ICT" } },
  });
  if (!subject) throw new Error('Bank ICT subject "05_ICT" missing');

  // Emerging/Digital leaf (created by v2 importer; ensure here too).
  const digParent = await prisma.topic.findUnique({
    where: { subjectId_path: { subjectId: subject.id, path: "05_ICT/05_Emerging_Tech_and_Number_Systems" } },
  });
  await prisma.topic.upsert({
    where: { subjectId_path: { subjectId: subject.id, path: SUB.emergingDig } },
    update: {},
    create: {
      subjectId: subject.id, name: "Digital_Bangladesh_Ecommerce_Egovernance_Law",
      slug: "Digital_Bangladesh_Ecommerce_Egovernance_Law", path: SUB.emergingDig,
      depth: 3, parentId: digParent?.id ?? null, sortOrder: 63,
    },
  });

  const topicRows = await prisma.topic.findMany({ where: { subjectId: subject.id }, select: { id: true, path: true } });
  const topicIdByPath = new Map(topicRows.map((t) => [t.path, t.id]));

  const report = { files: 0, parsed: 0, inserted: 0, updated: 0, skipped: 0, topics: {} as Record<string, number> };
  type Op = { key: string; topicPath: string; data: Record<string, unknown> };
  const ops: Op[] = [];

  for (const file of FILES) {
    const slug = fileSlugDocx(file);
    const paras = extractParagraphs(`${ICT_DIR}/${file}`);
    const { records, skipped } = parseDocxParagraphs(paras);
    report.files++;
    report.parsed += records.length;
    report.skipped += skipped.length;
    for (const s of skipped) console.warn(`  [skip] ${file}: ${s}`);
    const seen = new Set<string>();
    for (const r of records) {
      if (r.question.length < 3) { report.skipped++; continue; }
      const tk = r.question.trim().toLowerCase() + "\n" + r.options.join("\n");
      if (seen.has(tk)) { report.skipped++; console.warn(`  [skip] ${file}: duplicate #${r.n}`); continue; }
      seen.add(tk);
      if (r.options.length !== 4) { report.skipped++; console.warn(`  [skip] ${file} #${r.n}: not 4 options`); continue; }
      const topicPath = routeTopicDocx(slug, r.header);
      const answerText = r.options["ABCD".indexOf(r.answerLetter)];
      if (!answerText) { report.skipped++; console.warn(`  [skip] ${file} #${r.n}: bad answer letter`); continue; }
      ops.push({
        key: sourceKey(subject.id, "bank-ict-docx", slug, r.n, r.question),
        topicPath,
        data: {
          ecosystemId: bb.id, subjectId: subject.id,
          topicId: topicIdByPath.get(topicPath) ?? null,
          topic: topicPath.split("/").pop() ?? "", subtopic: r.header, path: topicPath,
          question: r.question, options: r.options, correctAnswer: answerText,
          explanation: r.explanation, rawMath: true, difficulty: "MEDIUM" as const,
          year: null as number | null, sourceExam: `Bank ICT · ${slug}`, questionNumber: r.n,
        },
      });
    }
    console.log(`  ✓ ${file}: ${records.length} parsed`);
  }

  const existing = await prisma.question.findMany({
    where: { subjectId: subject.id, sourceKey: { in: ops.map((o) => o.key) } },
    select: { sourceKey: true },
  });
  const exKeys = new Set(existing.map((e) => e.sourceKey));
  const fresh = ops.filter((o) => !exKeys.has(o.key));
  const stale = ops.filter((o) => exKeys.has(o.key));
  for (let i = 0; i < fresh.length; i += 200) {
    await prisma.question.createMany({ data: fresh.slice(i, i + 200).map((o) => ({ sourceKey: o.key, ...o.data }) as never) });
    report.inserted += Math.min(200, fresh.length - i);
  }
  if (stale.length > 0) {
    await prisma.$transaction(
      stale.map((o) =>
        prisma.question.update({
          where: { subjectId_sourceKey: { subjectId: subject.id, sourceKey: o.key } },
          data: o.data as never,
        }),
      ),
    );
    report.updated += stale.length;
  }
  for (const o of ops) report.topics[o.topicPath] = (report.topics[o.topicPath] ?? 0) + 1;
  return report;
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required"); process.exit(1); }
  const prisma = new PrismaClient();
  try {
    const r = await importBankIctDocx4(prisma);
    console.log(`\n✓ Done. files=${r.files} parsed=${r.parsed} inserted=${r.inserted} updated=${r.updated} skipped=${r.skipped}`);
    for (const [t, c] of Object.entries(r.topics)) console.log(`    ${c} × ${t}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bank-ict-docx-4.ts")) {
  main().catch((e) => { console.error("Failed:", e); process.exit(1); });
}
