/**
 * scripts/import-bangla-grammar.ts
 * ----------------------------------------------------------------------------
 * One-shot import: seeds Bangla Grammar MCQs from the four raw dumps under
 *   database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা/Bangla Grammar /
 * into BOTH ecosystems (BCS + Bangladesh Bank) so the Practice tab's Bangla
 * Grammar subject shows them under each section.
 *
 * Source files are read as-is (unicode-optimized already) — this script never
 * modifies them. Each record is single-line:
 *   NN. <question> ক. <o1> খ. <o2> গ. <o3> ঘ. <o4> [ঙ. <o5>] Ans. <key>. <text> ব্যাখ্যা: <exp>
 *
 * Topic routing (taxonomy leaf per file; path drives Practice filtering):
 *   Questions(বাক্য সংকোচন).txt → ভাষা/বাক্য            (subtopic "বাক্য সংকোচন")
 *   Questions(বাংলা বানান).txt   → ভাষা/বানান_ও_বাক্য_শুদ্ধি
 *   Questions(বিপরীত শব্দ).txt   → ভাষা/বিপরীতার্থক_শব্দ
 *   Questions(Terminology).txt    → ভাষা/পরিভাষা
 *
 * Safety (mirrors seed-questions.ts):
 *   - every record passes the shared import gate (scanMca) — REJECTs are
 *     reported and skipped, never fabricated (e.g. parenthesised answers,
 *     unresolvable letters).
 *   - upsert by (subjectId, sourceKey); the global mcaSignature registry skips
 *     rows whose content already exists anywhere in the database.
 *   - DRY RUN by default; pass --yes to write.
 *
 * Run:  npx tsx scripts/import-bangla-grammar.ts --yes
 * ----------------------------------------------------------------------------
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";

const GRAMMAR_DIR = join(
  process.cwd(),
  "database",
  "data",
  "ques",
  "বাংলা ভাষা ও সাহিত্য",
  "ভাষা",
  "Bangla Grammar ",
);

type FileRoute = {
  file: string;
  label: string;
  leaf: string;
  subtopic: string;
};

const ROUTES: FileRoute[] = [
  { file: "Questions(বাক্য সংকোচন).txt", label: "বাক্য সংকোচন", leaf: "বাক্য", subtopic: "বাক্য সংকোচন" },
  { file: "Questions(বাংলা বানান).txt", label: "বাংলা বানান", leaf: "বানান_ও_বাক্য_শুদ্ধি", subtopic: "বানান_ও_বাক্য_শুদ্ধি" },
  { file: "Questions(বিপরীত শব্দ).txt", label: "বিপরীত শব্দ", leaf: "বিপরীতার্থক_শব্দ", subtopic: "বিপরীতার্থক_শব্দ" },
  { file: "Questions(Terminology).txt", label: "Terminology", leaf: "পরিভাষা", subtopic: "পরিভাষা" },
];

const LETTERS = ["ক", "খ", "গ", "ঘ", "ঙ"] as const;

type Parsed = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

function stripLeadingNumber(text: string): string {
  return text.replace(/^\s*[০-৯0-9]+\s*\.\s*/, "").trim();
}

/** Parse one raw single-line record. Returns null when the record cannot be
 * resolved strictly (caller reports + skips it). Exported for unit tests. */
export function parseLine(line: string): Parsed | { skip: string } | null {
  const explIdx = line.search(/ব্যাখ্যা\s*:|Explanation\s*:/i);
  let explanation = "";
  let body = line;
  if (explIdx >= 0) {
    const m = line.slice(explIdx).match(/^(ব্যাখ্যা\s*:|Explanation\s*:)/i);
    explanation = line.slice(explIdx + (m?.[0].length ?? 0)).trim();
    body = line.slice(0, explIdx);
  }
  const ansM = body.match(/(উত্তর\s*:|Ans\.\s*|Answer\s*:)/i);
  if (!ansM || ansM.index === undefined) return null;
  const answerRaw = body.slice(ansM.index + ansM[0].length).trim();
  const qAndOpts = body.slice(0, ansM.index);

  // Locate option markers ক/খ/গ/ঘ (+ optional ঙ) in order.
  const markerRe = /([কখগঘঙ])\s*[.)]\s*/g;
  const marks: Array<{ letter: string; index: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(qAndOpts)) !== null) {
    marks.push({ letter: m[1], index: m.index, end: m.index + m[0].length });
  }
  const seq = marks.map((x) => x.letter).join("");
  if (seq !== "কখগঘ" && seq !== "কখগঘঙ") return null;

  const question = stripLeadingNumber(qAndOpts.slice(0, marks[0].index).trim());
  const options = marks.map((mk, i) =>
    (i + 1 < marks.length ? qAndOpts.slice(mk.end, marks[i + 1].index) : qAndOpts.slice(mk.end)).trim(),
  );
  if (!question || options.some((o) => !o)) return null;

  // Strict answer resolution: full-text match, or letter whose remainder is
  // empty or exactly the pointed-to option. Never guessed.
  if (options.includes(answerRaw)) {
    return { question, options, correctAnswer: answerRaw, explanation };
  }
  const letter = answerRaw.charAt(0);
  const idx = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
  if (idx < 0 || idx >= options.length) {
    return { skip: `unresolvable answer "${answerRaw.slice(0, 40)}"` };
  }
  const rest = answerRaw.slice(1).replace(/^[।.:)\s]+/, "").trim();
  if (rest === "" || rest === options[idx]) {
    return { question, options, correctAnswer: options[idx], explanation };
  }
  // Source-note parenthetical: "Ans. খ. বিতত (নোটের উত্তরমালা অনুযায়ী)" —
  // the letter + head text match the option; the trailing "(…)" is only a
  // provenance remark. Strip it and re-compare (still strict: head must equal
  // the pointed-to option, otherwise the record is skipped, never guessed).
  const head = rest.replace(/\s*\([^()]*\)[\s।.]*$/, "").trim();
  if (head !== rest && head === options[idx]) {
    return { question, options, correctAnswer: options[idx], explanation };
  }
  return { skip: `answer remainder ≠ option (letter ${letter})` };
}

export async function importBanglaGrammar(
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
    const rows = await prisma.topic.findMany({ where: { subjectId: t.subject.id }, select: { id: true, path: true } });
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
    const text = readFileSync(join(GRAMMAR_DIR, route.file), "utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let parsed = 0;
    for (const line of lines) {
      const p = parseLine(line);
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
    // Same stem can repeat with different options (e.g. "কোনটি শুদ্ধ বানান?")
    // — sourceKey collides, so keep the FIRST occurrence per key (mirrors
    // seed-questions.ts), never violating the (subjectId, sourceKey) unique.
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
          await prisma.topic.update({ where: { id }, data: { questionCount: String(total) } });
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
    await importBanglaGrammar(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bangla-grammar.ts")) {
  main().catch((e) => {
    console.error("Import failed:", e);
    process.exit(1);
  });
}
