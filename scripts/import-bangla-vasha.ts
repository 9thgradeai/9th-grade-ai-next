/**
 * scripts/import-bangla-vasha.ts
 * ----------------------------------------------------------------------------
 * One-shot import: seeds Bangla grammar MCQs from the four raw dumps under
 *   database/data/ques/বাংলা ভাষা ও সাহিত্য/বাংলা ভাষা/
 * into BOTH ecosystems (BCS + Bangladesh Bank) so the Practice tab AND the
 * Real Exam custom-paper builder both draw them (subject-wise pool) for each
 * ecosystem. Rows are practice-pool (paperId NULL, examId NULL) — the same
 * seam every prior grammar import uses (see import-bangla-grammar.ts).
 *
 * Source files are read as-is — this script never modifies them. Each record
 * is single-line:
 *   NN. <question> ক. <o1> খ. <o2> গ. <o3> ঘ. <o4> [ঙ. <o5>] উত্তর: <key>. <text> ব্যাখ্যা: <exp>
 *
 * Topic routing (taxonomy leaf per file; path drives Practice filtering):
 *   Questions(সমাস).txt                        → ভাষা/সমাস
 *   Questions(প্রকৃতি ও প্রত্যয়).txt            → ভাষা/প্রত্যয়
 *   Questions(বাক্য সংকোচন, এক কথায় প্রকাশ).txt → ভাষা/বাক্য (subtopic per file)
 *   Questions(বাগধারা).txt                      → ভাষা/বাগধারা (STANDALONE — no
 *     taxonomy leaf; same precedent as উপসর্গ/কারক/প্রয়োগ-অপপ্রয়োগ; visible at
 *     subject and ভাষা-group level via prefix matching).
 *
 * Parsing reuses the STRICT parseLine from import-bangla-grammar.ts, then
 * applies three narrow, provably-safe repairs for the exact defects observed
 * in these files (never force-fits — every repair still requires the answer
 * LETTER to point at the option it resolves to, and the resolved text must
 * equal / prefix / contain-match the pointed-to option):
 *   1. Latin option-marker typo: "K."/"C."/"X." in place of ক./খ./গ./ঘ.
 *      → map by POSITION to the Bangla letter, then re-parse.
 *   2. Answer remainder ≠ option but is a PREFIX of the pointed-to option
 *      (e.g. truncated answer "অ" for option "অসম্ভব বস্তু বা অসাধ্য সাধন").
 *   3. Answer remainder CONTAINS the pointed-to option as a substring but is
 *      not equal (e.g. option "বাঘ + ইনি (ঈনী)" vs remainder
 *      "বাঘ + ইনি (ঈনী) [স্ত্রীবাচক তদ্ধিত প্রত্যয়]").
 * Any record that cannot be resolved by strict parse OR these repairs is
 * reported (REJECT/skip) and NOT imported — never fabricated.
 *
 * Safety (mirrors seed-questions.ts / import-bangla-grammar.ts):
 *   - every record passes the shared import gate (scanMca); REJECTs reported.
 *   - upsert by (subjectId, sourceKey); global mcaSignature registry skips
 *     rows whose content already exists anywhere in the database.
 *   - DRY RUN by default; pass --yes to write.
 *
 * Run:  npx tsx scripts/import-bangla-vasha.ts --yes
 * ----------------------------------------------------------------------------
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";
import { parseLine } from "./import-bangla-grammar";

const VASHA_DIR = join(
  process.cwd(),
  "database",
  "data",
  "ques",
  "বাংলা ভাষা ও সাহিত্য",
  "বাংলা ভাষা",
);

type FileRoute = {
  file: string;
  label: string;
  leaf: string;
  subtopic: string;
};

const ROUTES: FileRoute[] = [
  { file: "Questions(সমাস).txt", label: "সমাস", leaf: "সমাস", subtopic: "সমাস" },
  { file: "Questions(প্রকৃতি ও প্রত্যয়).txt", label: "প্রকৃতি ও প্রত্যয়", leaf: "প্রত্যয়", subtopic: "প্রকৃতি ও প্রত্যয়" },
  { file: "Questions(বাক্য সংকোচন, এক কথায় প্রকাশ).txt", label: "বাক্য সংকোচন, এক কথায় প্রকাশ", leaf: "বাক্য", subtopic: "বাক্য সংকোচন, এক কথায় প্রকাশ" },
  { file: "Questions(বাগধারা).txt", label: "বাগধারা", leaf: "বাগধারা", subtopic: "বাগধারা" },
];

const LETTERS = ["ক", "খ", "গ", "ঘ", "ঙ"] as const;

type Parsed = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

// ── Repair 1: Latin option-marker typo → positional Bangla letter ──────────
// The marker scan is positional (ক=1st, খ=2nd, …). A stray Latin "K."/"C."/
// "X." where a Bangla marker belongs is repaired by substituting the Bangla
// letter at that POSITION, then re-running the strict parser. This is safe:
// it only fires when the strict parse failed, and the strict parse still has
// to confirm the full কখগঘ(ঙ) sequence afterwards.
function repairLatinMarkers(line: string): string | null {
  const markerRe = /([A-Za-zকখগঘঙ])\s*([.)])\s*/g;
  let out = "";
  let last = 0;
  let pos = 0;
  let changed = false;
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(line)) !== null) {
    // Skip a ")" marker that sits inside parentheses (option TEXT, not marker).
    if (m[2] === ")") {
      let depth = 0;
      for (let i = 0; i < m.index; i++) {
        const ch = line[i];
        if (ch === "(") depth += 1;
        else if (ch === ")") depth = Math.max(0, depth - 1);
      }
      if (depth > 0) continue;
    }
    const ch = m[1];
    const isLatin = /^[A-Za-z]$/.test(ch);
    const isBangla = "কখগঘঙ".includes(ch);
    if (!isLatin && !isBangla) continue;
    if (isLatin) {
      const expected = LETTERS[pos];
      if (expected === undefined) return null;
      out += line.slice(last, m.index) + expected + m[2] + " ";
      changed = true;
    } else {
      out += line.slice(last, m.index) + m[0];
    }
    last = m.index + m[0].length;
    pos += 1;
  }
  if (!changed) return null;
  out += line.slice(last);
  return out.trim();
}

// ── Repair 2 & 3: answer-remainder containment (prefix / substring) ────────
// The strict parser resolves a letter answer only when the remainder is empty
// or exactly equals the pointed-to option. These two repairs accept a
// remainder that is a strict PREFIX of, or CONTAINS, the pointed-to option —
// still keyed off the answer LETTER, so the option identity is never guessed.
function resolveByContainment(
  options: string[],
  answerRaw: string,
): string | null {
  const letter = answerRaw.charAt(0);
  const idx = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
  if (idx < 0 || idx >= options.length) return null;
  const opt = options[idx];
  const rest = answerRaw.slice(1).replace(/^[।.:)\s]+/, "").trim();
  if (rest === "") return opt; // strict parser already handles; belt-and-braces
  // Normalize whitespace for a robust containment check (no case concerns in Bangla).
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const nOpt = norm(opt);
  const nRest = norm(rest);
  if (nOpt.startsWith(nRest) || nRest.includes(nOpt)) return opt;
  return null;
}

/** Strict-first parse with narrow, safe repairs. Returns null when the record
 * cannot be resolved (caller reports + skips). Exported for unit tests. */
export function parseLineTolerant(line: string): Parsed | { skip: string } | null {
  const strict = parseLine(line);
  if (strict !== null && !("skip" in strict)) return strict;

  // Repair 1: Latin marker typo → retry strict.
  const repaired = repairLatinMarkers(line);
  if (repaired) {
    const again = parseLine(repaired);
    if (again !== null && !("skip" in again)) return again;
  }

  // Repairs 2 & 3: re-derive question/options, then containment-resolve the
  // answer. Reuse the strict parser on a doctored line where the answer is
  // replaced by just its LETTER (empty remainder), so option extraction and
  // the MCA gate stay identical — only the answer-resolution step is relaxed.
  const ansM = line.match(/(উত্তর\s*:|Ans\.\s*|Answer\s*:)/i);
  if (!ansM || ansM.index === undefined) return strict; // report original skip
  // Split off the explanation BEFORE the containment check — the strict parser
  // does the same internally, and "… ব্যাখ্যা: …" must never be read as part
  // of the answer remainder.
  const tail = line.slice(ansM.index + ansM[0].length);
  const explIdx = tail.search(/ব্যাখ্যা\s*:|Explanation\s*:/i);
  const answerRaw = (explIdx >= 0 ? tail.slice(0, explIdx) : tail).trim();
  const letter = answerRaw.charAt(0);
  const idx = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
  if (idx < 0) return strict; // no letter to key off — report original skip
  const doctored =
    line.slice(0, ansM.index + ansM[0].length) + " " + letter + ".";
  const base = parseLine(doctored);
  if (base === null || "skip" in base) return strict; // report original skip
  const resolved = resolveByContainment(base.options, answerRaw);
  if (resolved === null) return strict; // report original skip
  return {
    question: base.question,
    options: base.options,
    correctAnswer: resolved,
    explanation: base.explanation,
  };
}

export async function importBanglaVasha(
  prisma: PrismaClient,
  opts?: { dryRun?: boolean },
): Promise<{ inserted: number; updated: number; skipped: number; rejected: number }> {
  const dryRun = opts?.dryRun ?? !process.argv.includes("--yes");
  const report = { inserted: 0, updated: 0, skipped: 0, rejected: 0 };

  const bcs = await prisma.examEcosystem.findUnique({ where: { code: "BCS" } });
  const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bcs || !bb) throw new Error("BCS / BANGLADESH_BANK ecosystem missing");

  const bcsSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bcs.id, nameBn: "বাংলা ভাষা ও সাহিত্য" },
  });
  const bbSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bb.id, nameBn: "০১_বাংলা_ভাষা_ও_সাহিত্য" },
  });
  if (!bcsSubject || !bbSubject) throw new Error("Bangla subject missing in BCS/Bank");

  const targets = [
    { eco: bcs, subject: bcsSubject, root: "01_বাংলা_ভাষা_ও_সাহিত্য" },
    { eco: bb, subject: bbSubject, root: "০১_বাংলা_ভাষা_ও_সাহিত্য" },
  ];

  // topicId lookup per subject.
  const topicIdBySubjectPath = new Map<number, Map<string, number>>();
  for (const t of targets) {
    const rows = await prisma.topic.findMany({
      where: { subjectId: t.subject.id },
      select: { id: true, path: true },
    });
    topicIdBySubjectPath.set(t.subject.id, new Map(rows.map((r) => [r.path, r.id])));
  }

  // Global duplicate identity over all live rows (one bulk read). Scoped per
  // ecosystem: the same MCQ intentionally lives in BOTH ecosystems.
  const globalSigs = new Set<string>();
  const existingForDedup = await prisma.question.findMany({
    select: { ecosystemId: true, question: true, correctAnswer: true, explanation: true },
  });
  for (const r of existingForDedup) {
    globalSigs.add(
      `${r.ecosystemId}|` +
        mcaSignature({ question: r.question, options: [], correctAnswer: r.correctAnswer, explanation: r.explanation }),
    );
  }

  // Existing sourceKeys per target subject (one bulk read each).
  const existingBySubject = new Map<number, Map<string, number>>();
  for (const t of targets) {
    const rows = await prisma.question.findMany({
      where: { subjectId: t.subject.id },
      select: { id: true, sourceKey: true },
    });
    existingBySubject.set(t.subject.id, new Map(rows.map((r) => [r.sourceKey, r.id])));
  }

  type Op =
    | { kind: "update"; id: number; data: Record<string, unknown> }
    | { kind: "create"; data: Record<string, unknown> };
  const ops: Op[] = [];

  for (const route of ROUTES) {
    const text = readFileSync(join(VASHA_DIR, route.file), "utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let parsed = 0;
    for (const line of lines) {
      // Title/header lines carry no record — ignore silently.
      if (!/^[০-৯0-9]+\s*\./.test(line)) {
        console.log(`  [title] ${route.file}: ignoring header — ${line.slice(0, 50)}`);
        continue;
      }
      const p = parseLineTolerant(line);
      if (p === null) {
        report.skipped += 1;
        console.warn(`  [skip] ${route.file}: no 4-option block — ${line.slice(0, 70)}`);
        continue;
      }
      if ("skip" in p) {
        report.skipped += 1;
        console.warn(`  [skip] ${route.file}: ${p.skip} — ${line.slice(0, 70)}`);
        continue;
      }
      const gate = scanMca({
        question: p.question,
        options: p.options,
        correctAnswer: p.correctAnswer,
        explanation: p.explanation,
      });
      if (gate.verdict === "REJECT") {
        report.rejected += 1;
        console.warn(
          `  [reject] ${route.file}: ${gate.fatal.map((f) => `${f.code}@${f.field}`).join(",")} — ${p.question.slice(0, 60)}`,
        );
        continue;
      }
      const q = {
        question: gate.normalized.question,
        options: gate.normalized.options,
        correctAnswer: gate.normalized.correctAnswer ?? "",
        explanation: gate.normalized.explanation,
      };
      parsed += 1;

      for (const t of targets) {
        const path = `${t.root}/ভাষা/${route.leaf}`;
        const key = sourceKey(t.subject.id, path, q.question);
        const existingId = existingBySubject.get(t.subject.id)?.get(key);
        const data = {
          topicId: topicIdBySubjectPath.get(t.subject.id)?.get(path) ?? null,
          path,
          topic: "ভাষা",
          subtopic: route.subtopic,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
        };
        if (existingId !== undefined) {
          ops.push({ kind: "update", id: existingId, data });
          report.updated += 1;
          continue;
        }
        const sig =
          `${t.eco.id}|` +
          mcaSignature({
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
          });
        if (globalSigs.has(sig)) {
          report.skipped += 1;
          continue;
        }
        globalSigs.add(sig);
        ops.push({
          kind: "create",
          data: {
            ecosystemId: t.eco.id,
            subjectId: t.subject.id,
            sourceKey: key,
            ...data,
            difficulty: "MEDIUM",
            sourceExam: `Bangla Grammar · ${route.label}`,
            year: null,
          },
        });
        report.inserted += 1;
      }
    }
    console.log(`✓ ${route.file}: ${lines.length} lines → ${parsed} gated-IN (×2 ecosystems)`);
  }

  if (!dryRun && ops.length > 0) {
    // Same stem can repeat with different options — sourceKey collides, so
    // keep the FIRST occurrence per key (mirrors seed-questions.ts).
    const seenKeys = new Set<string>();
    const deduped = ops.filter((o) => {
      const d = (o as { data: Record<string, unknown> }).data;
      const k = `${d.subjectId as number}|${d.sourceKey as string}`;
      if (o.kind === "update") return true;
      if (seenKeys.has(k)) {
        report.skipped += 1;
        report.inserted -= 1;
        return false;
      }
      seenKeys.add(k);
      return true;
    });
    const creates = deduped.filter((o) => o.kind === "create").map((o) => (o as { data: Record<string, unknown> }).data);
    const updates = deduped.filter((o) => o.kind === "update") as Array<{ kind: "update"; id: number; data: Record<string, unknown> }>;
    console.log(`writing ${creates.length} creates + ${updates.length} updates...`);
    if (creates.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < creates.length; i += CHUNK) {
        await prisma.question.createMany({ data: creates.slice(i, i + CHUNK) as never });
        console.log(`  created ${Math.min(i + CHUNK, creates.length)}/${creates.length}`);
      }
    }
    const CHUNK = 50;
    for (let i = 0; i < updates.length; i += CHUNK) {
      await Promise.all(
        updates.slice(i, i + CHUNK).map((u) => prisma.question.update({ where: { id: u.id }, data: u.data })),
      );
      console.log(`  updated ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
    }
  }

  if (!dryRun) {
    // Refresh questionCount on touched leaves + ancestors (counts are strings).
    for (const t of targets) {
      const touched = new Set<string>();
      for (const route of ROUTES) {
        const leaf = `${t.root}/ভাষা/${route.leaf}`;
        touched.add(leaf);
        const segs = leaf.split("/");
        let acc = "";
        for (const seg of segs) {
          acc = acc ? `${acc}/${seg}` : seg;
          touched.add(acc);
        }
      }
      const allCounts = await prisma.question.groupBy({
        by: ["path"],
        where: { subjectId: t.subject.id },
        _count: { _all: true },
      });
      const byPath = new Map(allCounts.map((r) => [r.path, r._count._all]));
      for (const path of touched) {
        let total = 0;
        for (const [p, c] of byPath) {
          if (p === path || p.startsWith(path + "/")) total += c;
        }
        const id = topicIdBySubjectPath.get(t.subject.id)?.get(path);
        if (id !== undefined) {
          await prisma.topic.update({ where: { id }, data: { questionCount: total } });
        }
      }
      console.log(`✓ questionCount refreshed (subject ${t.subject.id})`);
    }
  }

  console.log(
    `${dryRun ? "DRY RUN" : "DONE"}: inserted=${report.inserted} updated=${report.updated} skipped=${report.skipped} rejected=${report.rejected}`,
  );
  return report;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await importBanglaVasha(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bangla-vasha.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
