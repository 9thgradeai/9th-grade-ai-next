/**
 * scripts/seed-intl-affairs.ts
 * One-off import for 10 International Affairs MCQ dumps under
 *   database/data/ques/04_আন্তর্জাতিক_বিষয়াবলি/
 * Subject: আন্তর্জাতিক বিষয়াবলী (BCS ecosystem). Powers the Practice tab via
 * GET /api/questions?subject=আন্তর্জাতিক বিষয়াবলী.
 *
 * File → taxonomy leaf mapping (folder names do not all match taxonomy, and
 * files are multi-line blocks, so the standard seeder skips them):
 *   ০২_আন্তর্জাতিক_নিরাপত্তা_ও_আন্তরাষ্ট্রীয়_ক্ষমতা_সম্পর্ক/
 *     Questions(NATO).txt                                → …/NATO
 *     Questions(অন্যান্য_নিরাপত্তা_জোট_ও_বাহিনী).txt      → …/অন্যান্য_নিরাপত্তা_জোট_ও_বাহিনী
 *     Questions(আন্তর্জাতিক_গুরুত্বপূর্ণ_অঞ্চল_সীমারেখা).txt → …/আন্তর্জাতিক_গুরুত্বপূর্ণ_অঞ্চল_সীমারেখা
 *     Questions(আন্তর্জাতিক_চুক্তি_সংক্রান্ত_সনদ).txt     → …/আন্তর্জাতিক_চুক্তি_সংক্রান্ত_সনদ
 *     Questions(আন্তর্জাতিক_বিভিন্ন_গেরিলা_বিদ্রোহী_সংগঠন).txt → …/আন্তর্জাতিক_বিভিন্ন_গেরিলা_বিদ্রোহী_সংগঠন
 *     Questions(রাষ্ট্র_ও_সরকার).txt                      → …/রাষ্ট্র_ও_সরকার
 *   আন্তর্জাতিক পরিবেশগত ইস্যু ও কূটনীতি/
 *     Questions(পরিবেশ বিষয়ক শীর্ষ সম্মেলন).txt          → …/পরিবেশ_বিষয়ক_চুক্তি_ও_সম্মেলন
 *     Questions(পরিবেশ চুক্তি _ প্রোটোকল).txt             → …/পরিবেশ_বিষয়ক_চুক্তি_ও_সম্মেলন
 *     Questions(পরিবেশ কনভেনশনসমূহ).txt                   → …/পরিবেশ_বিষয়ক_চুক্তি_ও_সম্মেলন
 *     Questions(আন্তর্জাতিক পরিবেশগত ইস্যু ও কূটনীতি ).txt → …/পরিবেশগত_বিভিন্ন_ইস্যু
 *   ০৫_আন্তর্জাতিক_সংগঠনসমূহ_এবং_বৈশ্বিক_অর্থনৈতিক_প্রতিষ্ঠানাদি/
 *     Questions(Economic Organizations).txt               → …/আন্তর্জাতিক_বিভিন্ন_অর্থনৈতিক_সংস্থাসমূহ
 *     Questions(Regional Organizations).txt               → …/আঞ্চলিক_সহযোগিতা_সংগঠন_ও_জোট
 *     Questions(আঞ্চলিক সহযোগিতা সংগঠন ও জোট).txt         → …/আঞ্চলিক_সহযোগিতা_সংগঠন_ও_জোট
 *   বিশ্বের_সাম্প্রতিক_ও_চলমান_ঘটনাপ্রবাহ/
 *     Questions(বিশ্বের সাম্প্রতিক ও চলমান ঘটনাপ্রবাহ).txt → ০৩ group path (no single
 *       leaf fits mixed 2026 current-affairs; chapter-level tagging, subtopic "")
 *   বৈশ্বিক_ইতিহাস_আঞ্চলিক_ও_আন্তর্জাতিক_ব্যবস্থা_ভূ-রাজনীতি/
 *     Questions(আঞ্চলিক_ও_আন্তর্জাতিক_ব্যবস্থা).txt        → ০১/আঞ্চলিক_ও_আন্তর্জাতিক_ব্যবস্থা
 *     Questions(যুদ্ধ_ও_বিপ্লবসমূহ).txt                    → ০১/যুদ্ধ_ও_বিপ্লবসমূহ
 *     Questions[প্রণালি (Straits)].txt                    → ০২/আন্তর্জাতিক_গুরুত্বপূর্ণ_অঞ্চল_সীমারেখা
 *       (straits = strategic maritime demarcations; sits in the ০১ folder
 *       but belongs to the ০২ leaf — folder is not taxonomy)
 *   ০২ batch-3:
 *     Questions(অস্ত্র-সম্পর্কিত … ও অস্ত্র নিয়ন্ত্রণ).txt → ০২/আন্তর্জাতিক_চুক্তি_সংক্রান্ত_সনদ
 *     Questions( শীতল যুদ্ধ … কৌশলভিত্তিক).txt             → ০১/বৈশ্বিক_ইতিহাস
 *       (Cold War doctrines/policies are global-history content; no ০২ leaf
 *       fits — folder is not taxonomy)
 *
 * Parsing mirrors seed-questions.ts (option/answer logic) + the block-join
 * approach of seed-math-comb-perm.ts. Gate REJECTs only for
 * missing-explanation are kept with explanation="" (never invented);
 * book-Unicode math rows keep rawMath=true verbatim. All other fatal codes
 * skip. Idempotent: upsert by (subjectId, sourceKey).
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";
import { resolveAnswerToOption } from "./qb-forensics/parse-flat";

const SUBJECT_BN = "আন্তর্জাতিক বিষয়াবলী";
const QUES_DIR = join(process.cwd(), "database", "data", "ques", "04_আন্তর্জাতিক_বিষয়াবলি");

const SEC02 = "০২_আন্তর্জাতিক_নিরাপত্তা_ও_আন্তরাষ্ট্রীয়_ক্ষমতা_সম্পর্ক";
const SEC04 = "০৪_আন্তর্জাতিক_পরিবেশগত_ইস্যু_ও_কূটনীতি";
const SEC05 = "০৫_আন্তর্জাতিক_সংগঠনসমূহ_এবং_বৈশ্বিক_অর্থনৈতিক_প্রতিষ্ঠানাদি";
const SEC03 = "০৩_বিশ্বের_সাম্প্রতিক_ও_চলমান_ঘটনাপ্রবাহ";
const SEC01 = "০১_বৈশ্বিক_ইতিহাস_আঞ্চলিক_ও_আন্তর্জাতিক_ব্যবস্থা_ভূ-রাজনীতি";
const P = (sec: string, leaf: string) => `04_আন্তর্জাতিক_বিষয়াবলি/${sec}/${leaf}`;

type Spec = { dir: string; file: string; path: string; topic: string; subtopic: string };

const SPECS: Spec[] = [
  { dir: SEC02, file: "Questions(NATO).txt", path: P(SEC02, "NATO"), topic: SEC02, subtopic: "NATO" },
  { dir: SEC02, file: "Questions(অন্যান্য_নিরাপত্তা_জোট_ও_বাহিনী).txt", path: P(SEC02, "অন্যান্য_নিরাপত্তা_জোট_ও_বাহিনী"), topic: SEC02, subtopic: "অন্যান্য_নিরাপত্তা_জোট_ও_বাহিনী" },
  { dir: SEC02, file: "Questions(আন্তর্জাতিক_গুরুত্বপূর্ণ_অঞ্চল_সীমারেখা).txt", path: P(SEC02, "আন্তর্জাতিক_গুরুত্বপূর্ণ_অঞ্চল_সীমারেখা"), topic: SEC02, subtopic: "আন্তর্জাতিক_গুরুত্বপূর্ণ_অঞ্চল_সীমারেখা" },
  { dir: SEC02, file: "Questions(আন্তর্জাতিক_চুক্তি_সংক্রান্ত_সনদ).txt", path: P(SEC02, "আন্তর্জাতিক_চুক্তি_সংক্রান্ত_সনদ"), topic: SEC02, subtopic: "আন্তর্জাতিক_চুক্তি_সংক্রান্ত_সনদ" },
  { dir: SEC02, file: "Questions(আন্তর্জাতিক_বিভিন্ন_গেরিলা_বিদ্রোহী_সংগঠন).txt", path: P(SEC02, "আন্তর্জাতিক_বিভিন্ন_গেরিলা_বিদ্রোহী_সংগঠন"), topic: SEC02, subtopic: "আন্তর্জাতিক_বিভিন্ন_গেরিলা_বিদ্রোহী_সংগঠন" },
  { dir: SEC02, file: "Questions(রাষ্ট্র_ও_সরকার).txt", path: P(SEC02, "রাষ্ট্র_ও_সরকার"), topic: SEC02, subtopic: "রাষ্ট্র_ও_সরকার" },
  { dir: "আন্তর্জাতিক পরিবেশগত ইস্যু ও কূটনীতি", file: "Questions(পরিবেশ বিষয়ক শীর্ষ সম্মেলন).txt", path: P(SEC04, "পরিবেশ_বিষয়ক_চুক্তি_ও_সম্মেলন"), topic: SEC04, subtopic: "পরিবেশ_বিষয়ক_চুক্তি_ও_সম্মেলন" },
  { dir: "আন্তর্জাতিক পরিবেশগত ইস্যু ও কূটনীতি", file: "Questions(পরিবেশ চুক্তি _ প্রোটোকল).txt", path: P(SEC04, "পরিবেশ_বিষয়ক_চুক্তি_ও_সম্মেলন"), topic: SEC04, subtopic: "পরিবেশ_বিষয়ক_চুক্তি_ও_সম্মেলন" },
  { dir: "আন্তর্জাতিক পরিবেশগত ইস্যু ও কূটনীতি", file: "Questions(পরিবেশ কনভেনশনসমূহ).txt", path: P(SEC04, "পরিবেশ_বিষয়ক_চুক্তি_ও_সম্মেলন"), topic: SEC04, subtopic: "পরিবেশ_বিষয়ক_চুক্তি_ও_সম্মেলন" },
  { dir: "আন্তর্জাতিক পরিবেশগত ইস্যু ও কূটনীতি", file: "Questions(আন্তর্জাতিক পরিবেশগত ইস্যু ও কূটনীতি ).txt", path: P(SEC04, "পরিবেশগত_বিভিন্ন_ইস্যু"), topic: SEC04, subtopic: "পরিবেশগত_বিভিন্ন_ইস্যু" },
  { dir: SEC05, file: "Questions(Economic Organizations).txt", path: P(SEC05, "আন্তর্জাতিক_বিভিন্ন_অর্থনৈতিক_সংস্থাসমূহ"), topic: SEC05, subtopic: "আন্তর্জাতিক_বিভিন্ন_অর্থনৈতিক_সংস্থাসমূহ" },
  { dir: SEC05, file: "Questions(Regional Organizations).txt", path: P(SEC05, "আঞ্চলিক_সহযোগিতা_সংগঠন_ও_জোট"), topic: SEC05, subtopic: "আঞ্চলিক_সহযোগিতা_সংগঠন_ও_জোট" },
  { dir: SEC05, file: "Questions(আঞ্চলিক সহযোগিতা সংগঠন ও জোট).txt", path: P(SEC05, "আঞ্চলিক_সহযোগিতা_সংগঠন_ও_জোট"), topic: SEC05, subtopic: "আঞ্চলিক_সহযোগিতা_সংগঠন_ও_জোট" },
  { dir: "বিশ্বের_সাম্প্রতিক_ও_চলমান_ঘটনাপ্রবাহ", file: "Questions(বিশ্বের সাম্প্রতিক ও চলমান ঘটনাপ্রবাহ).txt", path: `04_আন্তর্জাতিক_বিষয়াবলি/${SEC03}`, topic: SEC03, subtopic: "" },
  { dir: "বৈশ্বিক_ইতিহাস_আঞ্চলিক_ও_আন্তর্জাতিক_ব্যবস্থা_ভূ-রাজনীতি", file: "Questions(আঞ্চলিক_ও_আন্তর্জাতিক_ব্যবস্থা).txt", path: P(SEC01, "আঞ্চলিক_ও_আন্তর্জাতিক_ব্যবস্থা"), topic: SEC01, subtopic: "আঞ্চলিক_ও_আন্তর্জাতিক_ব্যবস্থা" },
  { dir: "বৈশ্বিক_ইতিহাস_আঞ্চলিক_ও_আন্তর্জাতিক_ব্যবস্থা_ভূ-রাজনীতি", file: "Questions(যুদ্ধ_ও_বিপ্লবসমূহ).txt", path: P(SEC01, "যুদ্ধ_ও_বিপ্লবসমূহ"), topic: SEC01, subtopic: "যুদ্ধ_ও_বিপ্লবসমূহ" },
  { dir: "বৈশ্বিক_ইতিহাস_আঞ্চলিক_ও_আন্তর্জাতিক_ব্যবস্থা_ভূ-রাজনীতি", file: "Questions[প্রণালি (Straits)].txt", path: P(SEC02, "আন্তর্জাতিক_গুরুত্বপূর্ণ_অঞ্চল_সীমারেখা"), topic: SEC02, subtopic: "আন্তর্জাতিক_গুরুত্বপূর্ণ_অঞ্চল_সীমারেখা" },
  { dir: SEC02, file: "Questions(অস্ত্র-সম্পর্কিত আন্তর্জাতিক চুক্তি, পারমাণবিক অস্ত্রধারী দেশ ও অস্ত্র নিয়ন্ত্রণ).txt", path: P(SEC02, "আন্তর্জাতিক_চুক্তি_সংক্রান্ত_সনদ"), topic: SEC02, subtopic: "আন্তর্জাতিক_চুক্তি_সংক্রান্ত_সনদ" },
  { dir: SEC02, file: "Questions( শীতল যুদ্ধ (Cold War)_ মতবাদ, নীতি ও কৌশলভিত্তিক).txt", path: P(SEC01, "বৈশ্বিক_ইতিহাস"), topic: SEC01, subtopic: "বৈশ্বিক_ইতিহাস" },
];

/** Resolve a file inside a directory by NFC-normalised name (Bengali file
 *  names on disk may use a different Unicode composition than source). */
function resolveFile(dir: string, name: string): string {
  const want = name.normalize("NFC");
  for (const entry of readdirSync(dir)) {
    if (entry.normalize("NFC") === want) return join(dir, entry);
  }
  return join(dir, name);
}
const BANGLA = ["ক.", "খ.", "গ.", "ঘ."];
const LATIN = ["A.", "B.", "C.", "D."];

function matchOptions(body: string) {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const markers of [BANGLA, LATIN]) {
    const re = new RegExp(
      `${esc(markers[0])}(.*)${esc(markers[1])}(.*)${esc(markers[2])}(.*)${esc(markers[3])}(.*)$`,
    );
    const m = body.match(re);
    if (m) return m;
  }
  return null;
}

const NUM_START = /^\s*[০-৯0-9]+\.\s*/u;
const HAS_ANSWER = /(উত্তর\s*:)|(ans\.)/i;

/** Join raw lines into question blocks. A numbered line starts a new block
 *  only when the current buffer already holds an answer marker (guards
 *  against numbered continuation lines inside explanations). */
function toBlocks(raw: string): string[] {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  const blocks: string[] = [];
  let cur = "";
  for (const ln of lines) {
    const t = ln.trim();
    if (!t || /^\(End of file/i.test(t)) continue;
    if (NUM_START.test(t) && (cur === "" || HAS_ANSWER.test(cur))) {
      if (cur) blocks.push(cur);
      cur = t;
    } else if (cur) {
      cur += " " + t;
    }
  }
  if (cur) blocks.push(cur);
  return blocks.filter((b) => HAS_ANSWER.test(b));
}

function stripNum(t: string) {
  return t.replace(/^\s*[০-৯0-9]+\s*\.\s*/, "").trim();
}

function parseBlock(block: string) {
  let explanation = "";
  let body = block;
  const bi = block.indexOf("ব্যাখ্যা:");
  const ei = block.indexOf("Explanation:");
  if (bi >= 0) {
    explanation = block.slice(bi + "ব্যাখ্যা:".length).trim();
    body = block.slice(0, bi);
  } else if (ei >= 0) {
    explanation = block.slice(ei + "Explanation:".length).trim();
    body = block.slice(0, ei);
  }
  body = body.replace(/\*\s*উত্তর\s*:/u, "উত্তর:");

  const m = /(উত্তর\s*:)|(ans\.\s)|(Answer\s*:)/i.exec(body);
  let answerRaw = "";
  let qAndOpts = body;
  if (m) {
    answerRaw = body.slice(m.index + m[0].length).trim().split("*")[0].trim();
    qAndOpts = body.slice(0, m.index);
  }
  const opt = matchOptions(qAndOpts);
  if (!opt) return null;
  const question = stripNum(qAndOpts.slice(0, opt.index));
  const options = [opt[1], opt[2], opt[3], opt[4]].map((s) => s.trim()).filter(Boolean);
  if (options.length < 4 || !question) return null;
  const correctAnswer = resolveAnswerToOption(answerRaw, options) ?? answerRaw;
  if (!options.includes(correctAnswer)) return null;
  return { question, options, correctAnswer, explanation };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const subject = await prisma.subject.findFirst({
      where: { nameBn: SUBJECT_BN, ecosystemId: 1 },
    });
    if (!subject) throw new Error(`Subject not found: ${SUBJECT_BN}`);
    const topics = await prisma.topic.findMany({
      where: { subjectId: subject.id, path: { in: SPECS.map((s) => s.path) } },
    });
    const topicIdByPath = new Map(topics.map((t) => [t.path, t.id]));
    const missing = SPECS.filter((s) => !topicIdByPath.has(s.path));
    if (missing.length > 0) throw new Error(`Missing topics: ${missing.map((m) => m.path).join(", ")}`);

    const existing = await prisma.question.findMany({
      where: { subjectId: subject.id },
      select: { question: true, correctAnswer: true, explanation: true },
    });
    const sigs = new Set(
      existing.map((r) =>
        mcaSignature({ question: r.question, options: [], correctAnswer: r.correctAnswer, explanation: r.explanation }),
      ),
    );

    let inserted = 0, updated = 0, rejected = 0, dupes = 0, rawMathCount = 0;
    const rejectReasons: Record<string, number> = {};
    for (const spec of SPECS) {
      console.log(`… ${spec.file}: reading + parsing`);
      const raw = readFileSync(resolveFile(join(QUES_DIR, spec.dir), spec.file), "utf8");
      const blocks = toBlocks(raw);
      type Cand = { key: string; sig: string; data: Record<string, unknown>; rawMath: boolean };
      const cands = new Map<string, Cand>();
      for (const b of blocks) {
        const p = parseBlock(b);
        if (!p) { rejected++; rejectReasons["UNPARSEABLE"] = (rejectReasons["UNPARSEABLE"] ?? 0) + 1; continue; }
        const gate = scanMca({ question: p.question, options: p.options, correctAnswer: p.correctAnswer, explanation: p.explanation });
        let q = p.question, opts = p.options, ans = p.correctAnswer, expl = p.explanation;
        let useRawMath = false;
        if (gate.verdict === "REJECT") {
          const codes = new Set(gate.fatal.map((f) => f.code));
          const keepable = [...codes].every((c) => c === "MATH_LITERAL_LATEX" || c === "EMPTY_EXPLANATION");
          if (!keepable) {
            rejected++;
            const k = [...codes].join(",");
            rejectReasons[k] = (rejectReasons[k] ?? 0) + 1;
            continue;
          }
          useRawMath = codes.has("MATH_LITERAL_LATEX");
        } else {
          q = gate.normalized.question;
          opts = gate.normalized.options;
          ans = gate.normalized.correctAnswer ?? "";
          expl = gate.normalized.explanation;
        }
        const key = sourceKey(subject.id, spec.path, q);
        if (cands.has(key)) continue; // same-file repeat: keep first
        cands.set(key, {
          key,
          sig: mcaSignature({ question: q, options: opts, correctAnswer: ans, explanation: expl }),
          data: {
            topicId: topicIdByPath.get(spec.path) ?? null,
            path: spec.path,
            topic: spec.topic,
            subtopic: spec.subtopic,
            question: q,
            options: opts,
            correctAnswer: ans,
            explanation: expl,
            rawMath: useRawMath,
          },
          rawMath: useRawMath,
        });
      }
      // Batched sync: one lookup + one createMany + chunked updates per file.
      const keys = [...cands.keys()];
      const rows = await prisma.question.findMany({
        where: { subjectId: subject.id, sourceKey: { in: keys } },
        select: { id: true, sourceKey: true },
      });
      const idByKey = new Map(rows.map((r) => [r.sourceKey, r.id]));
      const creates: Record<string, unknown>[] = [];
      const updates: { id: number; data: Record<string, unknown> }[] = [];
      let ins = 0, upd = 0;
      for (const c of cands.values()) {
        const id = idByKey.get(c.key);
        if (id !== undefined) {
          updates.push({ id, data: c.data });
        } else {
          if (sigs.has(c.sig)) { dupes++; continue; }
          sigs.add(c.sig);
          creates.push({ subjectId: subject.id, ecosystemId: 1, sourceKey: c.key, difficulty: "MEDIUM", sourceExam: "BCS", ...c.data });
          if (c.rawMath) rawMathCount++;
        }
      }
      const CHUNK = 200;
      for (let i = 0; i < creates.length; i += CHUNK) {
        await prisma.question.createMany({ data: creates.slice(i, i + CHUNK) as never });
        ins += Math.min(CHUNK, creates.length - i);
      }
      // Limited-concurrency updates: the DB is remote (high latency), so wide
      // fan-out exhausts the connection pool (P2024). 5 at a time is safe.
      const UCHUNK = 5;
      for (let i = 0; i < updates.length; i += UCHUNK) {
        await Promise.all(updates.slice(i, i + UCHUNK).map((u) => prisma.question.update({ where: { id: u.id }, data: u.data })));
        upd += Math.min(UCHUNK, updates.length - i);
      }
      inserted += ins; updated += upd;
      console.log(`${spec.file}: ${blocks.length} blocks → +${ins} new, ${upd} refreshed`);
    }
    console.log(`Done. inserted=${inserted} updated=${updated} rejected=${rejected} dupes=${dupes} rawMath=${rawMathCount}`);
    console.log("reject breakdown:", JSON.stringify(rejectReasons));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
