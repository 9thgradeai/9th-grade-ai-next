/**
 * scripts/import-bank-english-v2.ts
 * ----------------------------------------------------------------------------
 * Imports the 8 new Bank English MCQ files in
 * database/data/Bank/English/untitled folder/Questions(...).txt
 * into the BANGLADESH_BANK "02_English_Language_and_Literature" subject ONLY
 * (practice pool: paperId NULL). Never touches BCS content.
 *
 * Source format (per record):
 *   `N. <stem>` [+ extra stem lines: split sentences, blank sentences]
 *   `A. <opt> B. <opt> C. <opt> D. <opt>`
 *   `Correct Answer: X. <repeated option text>[ Explanation: ...]`
 *   [`Explanation: ...`]
 * Two error-detection records answer "Correct Answer: No error." — the
 * source's own verdict is surfaced as option E ("No error."), the standard
 * format for this genre, so the question stays gradeable. Nothing else is
 * ever added or reworded.
 * Records are grouped under `Section ...:` headers, refined by bare
 * sub-header prose lines (e.g. "Compound subjects and special expressions").
 *
 * Content fidelity: these files are Unicode-optimized (curly quotes, em
 * dashes, ___ blanks). The shared import gate is ACCEPT-only here — it must
 * never rewrite a field (verified: scanMca is identity on this corpus) and
 * REJECTs are reported, never force-imported. Answer letters are kept AS-IS
 * (same convention as scripts/import-bank-english.ts — no rebalancing).
 * Grading compares option TEXT, so correctAnswer is options[letterIndex]
 * verbatim (the repeated text on the answer line sometimes differs by a
 * trailing period).
 *
 * Run: `npx tsx scripts/import-bank-english-v2.ts` (needs DATABASE_URL).
 * Idempotent: upserts by [subjectId, sourceKey]; namespace "bank-english-v2"
 * never collides with the legacy md pipeline ("bank-english:<slug>").
 * Cross-corpus duplicates (same MCQ already imported from .md) are skipped
 * via mcaSignature, matching the legacy importer.
 * ----------------------------------------------------------------------------
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { sourceKey } from "./seed-keys";
import { classifyCorrections, classifyPartsOfSpeech } from "./bank-taxonomy-mapping";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";

const ENG_DIR = join(process.cwd(), "database", "data", "Bank", "English", "untitled folder");
const BB_ENG_NAMEBN = "02_English_Language_and_Literature";

const R = "02_English_Language_and_Literature";
const P = {
  wv: `${R}/PART-I_Language/Words_Vocabulary`,
  wvSyn: `${R}/PART-I_Language/Words_Vocabulary/Synonyms_and_Antonyms`,
  wvSpell: `${R}/PART-I_Language/Words_Vocabulary/Spellings`,
  wvOws: `${R}/PART-I_Language/Words_Vocabulary/One-Word_Substitutions`,
  idMean: `${R}/PART-I_Language/Idioms_and_Phrases/Meanings_of_Idioms`,
  idIdent: `${R}/PART-I_Language/Idioms_and_Phrases/Identifying_Phrases`,
  pos: `${R}/PART-I_Language/Parts_of_Speech`,
  posAdj: `${R}/PART-I_Language/Parts_of_Speech/Adjective_and_Adverb`,
  posNoun: `${R}/PART-I_Language/Parts_of_Speech/Noun_Pronoun_Determiner_Gender_Number`,
  posPhv: `${R}/PART-I_Language/Parts_of_Speech/Phrasal_Verb`,
  posPrep: `${R}/PART-I_Language/Parts_of_Speech/Preposition`,
  posVerb: `${R}/PART-I_Language/Parts_of_Speech/Verb_Transitive_Intransitive_Non-finite_Gerund_Participle`,
  corr: `${R}/PART-I_Language/Corrections_and_Agreement`,
  corrPar: `${R}/PART-I_Language/Corrections_and_Agreement/Parallelism_and_Modifiers`,
  corrSva: `${R}/PART-I_Language/Corrections_and_Agreement/Subject-Verb_Agreement`,
  corrTense: `${R}/PART-I_Language/Corrections_and_Agreement/Tense_and_Structure_Errors`,
  voice: `${R}/PART-I_Language/Sentences_and_Transformations/Active_and_Passive_Voice`,
  narr: `${R}/PART-I_Language/Sentences_and_Transformations/Direct_and_Indirect_Narration`,
};

export type EnRecord = {
  n: number;
  question: string;
  // 4 options normally; 5 when the source answers "No error." (error-
  // detection genre) — the 5th option carries the source's own answer text.
  options: string[];
  answerLetter: "A" | "B" | "C" | "D" | "E";
  explanation: string;
  header: string;
  subheader: string;
  /** True when the source answered "No error." and option E was surfaced. */
  noErrorAdded?: boolean;
};

const SECTION_LINE = /^Section\s+\S+\s*:\s*(.+?)\s*$/;
const Q_START = /^(\d+)\.\s+(.*\S)\s*$/;
const OPTS_START = /^A\.\s+/;
const CA_LINE = /^Correct Answer:\s*([A-D])\.\s*(.*\S)?\s*$/;
// Error-detection questions whose answer is "no error" (no option is wrong).
const NOERROR_LINE = /^Correct Answer:\s*No error\.?\s*(Explanation:\s*(.*\S)?\s*)?$/i;
const EXPL_LINE = /^Explanation:\s*(.*\S)?\s*$/;
const LETTERS = ["A", "B", "C", "D", "E"] as const;
// A stray prose line ending in terminal punctuation (right after an
// explanation) is a wrapped explanation continuation; bare topic phrases
// ("Compound subjects and special expressions") are sub-headers.
const EXPL_WRAP_END = /[.!?”']$/;

export function fileSlugEn(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.includes("idioms")) return "idioms-phrasal-verbs";
  if (n.includes("parts of speech")) return "pos-tense-sequence";
  if (n.includes("preposition")) return "prepositions";
  if (n.includes("sentence correction")) return "sentence-correction-error-detection";
  if (n.includes("spelling")) return "spelling-appropriate-words";
  if (n.includes("subject")) return "sva-right-forms";
  if (n.includes("synonym")) return "synonyms-antonyms";
  return "vocab-collocations";
}

/** Split an options block (`A. … B. … C. … D. …`, possibly multi-line). */
export function splitOptionsEn(block: string): string[] | null {
  const t = block.replace(/\s+/g, " ").trim();
  if (!OPTS_START.test(t)) return null;
  const parts = t.split(/\s+([B-D])\.\s+/);
  if (parts.length !== 7) return null;
  if (parts[1] !== "B" || parts[3] !== "C" || parts[5] !== "D") return null;
  const opts = [parts[0].replace(/^A\.\s+/, "").trim(), parts[2].trim(), parts[4].trim(), parts[6].trim()];
  if (opts.some((o) => !o)) return null;
  return opts;
}

export function parseEnFile(fileName: string, text: string): { records: EnRecord[]; skipped: string[] } {
  const records: EnRecord[] = [];
  const skipped: string[] = [];
  let header = "";
  let subheader = "";
  let q: { n: number; stemLines: string[] } | null = null;
  let optBlock: string[] = [];
  let prevWasExplanation = false;

  const reset = () => {
    q = null;
    optBlock = [];
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim().replace(/^\uFEFF/, "");
    if (!line) continue;
    const sm = line.match(SECTION_LINE);
    if (sm) {
      if (q) skipped.push(`line ${lineNo}: incomplete record #${q.n} before new section`);
      reset();
      header = sm[1].trim();
      subheader = "";
      prevWasExplanation = false;
      continue;
    }
    const qm = line.match(Q_START);
    if (qm && !CA_LINE.test(line) && !EXPL_LINE.test(line) && !q) {
      q = { n: Number(qm[1]), stemLines: [qm[2].trim()] };
      optBlock = [];
      prevWasExplanation = false;
      continue;
    }
    if (q && optBlock.length === 0 && CA_LINE.test(line)) {
      skipped.push(`line ${lineNo}: record #${q.n} has no options block`);
      reset();
      prevWasExplanation = false;
      continue;
    }
    if (q) {
      if (qm) {
        skipped.push(`line ${lineNo}: incomplete record #${q.n} (missing Correct Answer)`);
        q = { n: Number(qm[1]), stemLines: [qm[2].trim()] };
        optBlock = [];
        prevWasExplanation = false;
        continue;
      }
      const ca = line.match(CA_LINE);
      const caNo = !ca ? line.match(NOERROR_LINE) : null;
      if (ca || caNo) {
        const opts = splitOptionsEn(optBlock.join(" "));
        if (!opts) {
          skipped.push(`line ${lineNo}: record #${q.n} options unparseable: ${optBlock.join(" ").slice(0, 80)}`);
          reset();
          prevWasExplanation = false;
          continue;
        }
        let expl = "";
        if (ca) {
          const rest = (ca[2] ?? "").trim();
          const exIdx = rest.search(/Explanation:\s*/);
          if (exIdx >= 0) expl = rest.slice(exIdx).replace(/^Explanation:\s*/, "").trim();
        } else {
          const m = caNo![0].match(/Explanation:\s*(.*\S)?\s*$/i);
          expl = (m?.[1] ?? "").trim();
          // Surface the source's own "No error" verdict as a 5th option so
          // the question stays gradeable (standard error-detection format).
          opts.push("No error");
        }
        records.push({
          n: q.n,
          question: q.stemLines.join(" "),
          options: opts,
          answerLetter: (ca ? ca[1] : "E") as EnRecord["answerLetter"],
          explanation: expl,
          header,
          subheader,
          ...(caNo ? { noErrorAdded: true as const } : {}),
        });
        reset();
        prevWasExplanation = true;
        continue;
      }
      if (OPTS_START.test(line)) optBlock = [line];
      else if (optBlock.length > 0) optBlock.push(line);
      else q.stemLines.push(line);
      prevWasExplanation = false;
      continue;
    }
    const em = line.match(EXPL_LINE);
    if (em) {
      const last = records[records.length - 1];
      if (last && !last.explanation) last.explanation = (em[1] ?? "").trim();
      else if (last) last.explanation += " " + ((em[1] ?? "").trim());
      else skipped.push(`line ${lineNo}: orphan explanation`);
      prevWasExplanation = true;
      continue;
    }
    // Stray prose: wrapped explanation continuation vs sub-header.
    const last = records[records.length - 1];
    if (prevWasExplanation && last && last.explanation && EXPL_WRAP_END.test(line)) {
      last.explanation += " " + line;
    } else {
      subheader = line;
    }
    prevWasExplanation = false;
  }
  if (q) skipped.push(`line ${lines.length + 1}: incomplete record #${q.n} at EOF`);
  return { records, skipped };
}

export function routeTopicEn(slug: string, header = "", subheader = "", question = ""): string {
  const h = `${header ?? ""} ${subheader ?? ""}`.toLowerCase();
  const q = (question ?? "").toLowerCase();
  // Mixed transformation sections (sentence-correction §7 holds both voice
  // and narration stems): route per question by stem cue. Scoped to this
  // slug — "passive" also occurs as ordinary vocabulary elsewhere.
  if (slug === "sentence-correction-error-detection") {
    const stemSaysVoice = /passive|active voice|change the voice/.test(q);
    const stemSaysNarration = /indirect speech|direct speech|reported speech|narrat/.test(q) && !/change the voice/.test(q);
    if (stemSaysVoice && !stemSaysNarration) return P.voice;
    if (stemSaysNarration && !stemSaysVoice) return P.narr;
  }
  switch (slug) {
    case "idioms-phrasal-verbs":
      if (/phrasal/.test(h)) return P.posPhv;
      return P.idMean;
    case "pos-tense-sequence":
      if (/sequence of tenses|tense/.test(h)) return P.corrTense;
      if (/adjective|adverb|comparison|modifier/.test(h)) return P.posAdj;
      if (/noun|pronoun|determiner|article|gender|number/.test(h)) return P.posNoun;
      if (/verb|participle|gerund|infinitive/.test(h)) return P.posVerb;
      // Fallback: classify the parts-of-speech question onto its leaf.
      return `${R}/PART-I_Language/${classifyPartsOfSpeech(question)}`;
    case "prepositions":
      if (/error detection|sentence completion|exam-level/.test(h)) {
        return `${R}/PART-I_Language/Corrections_and_Agreement/${classifyCorrections(question)}`;
      }
      return P.posPrep;
    case "sentence-correction-error-detection": {
      if (/narration|reported speech|indirect speech|direct speech/.test(h)) return P.narr;
      if (/voice|passive|active/.test(h)) return P.voice;
      if (/subject[–-]verb|agreement|sentence structure/.test(h)) return P.corrSva;
      if (/tense|verb form|conditional/.test(h)) return P.corrTense;
      if (/article|determiner|pronoun/.test(h)) return P.posNoun;
      if (/preposition|conjunction/.test(h)) return P.posPrep;
      if (/parallelism|gerund|infinitive|verb pattern/.test(h)) return P.corrPar;
      if (/modifier|adjective|adverb|comparison/.test(h)) return P.posAdj;
      if (/word choice|redundan|idiomatic|formal english/.test(h)) return P.idMean;
      return `${R}/PART-I_Language/Corrections_and_Agreement/${classifyCorrections(question)}`;
    }
    case "spelling-appropriate-words":
      if (/spell/.test(h)) return P.wvSpell;
      return P.wvOws;
    case "sva-right-forms":
      if (/infinitive|gerund|participle/.test((subheader ?? "").toLowerCase())) return P.posVerb;
      if (/right forms|tense|sequence|modal|conditional|subjunctive|verb pattern|error-sensitive|phrasal verbs and contextual/.test(h))
        return P.corrTense;
      return P.corrSva;
    case "synonyms-antonyms":
      return P.wvSyn;
    default: {
      // vocab-collocations
      if (/phrasal/.test(h)) return P.posPhv;
      if (/idiom/.test(h)) return P.idMean;
      if (/synonym|antonym/.test(h)) return P.wvSyn;
      if (/confusing words|correct usage/.test(h)) return P.wvOws;
      return P.wv;
    }
  }
}

export type EnImportReport = {
  files: number;
  parsed: number;
  inserted: number;
  updated: number;
  skippedRecords: number;
  duplicates: number;
  rejected: number;
  topics: Record<string, number>;
};

export async function importBankEnglishV2(prisma: PrismaClient): Promise<EnImportReport> {
  const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bb) throw new Error("BANGLADESH_BANK ecosystem missing — run the seed first");
  const subject = await prisma.subject.findFirst({
    where: { ecosystemId: bb.id, nameBn: BB_ENG_NAMEBN },
  });
  if (!subject) throw new Error(`Bank English subject "${BB_ENG_NAMEBN}" missing — run seed-bb-subjects.ts first`);

  const topicRows = await prisma.topic.findMany({ where: { subjectId: subject.id }, select: { id: true, path: true } });
  const topicIdByPath = new Map(topicRows.map((t) => [t.path, t.id]));

  // Cross-corpus dedup: the legacy .md pipeline may already hold the same
  // MCQ (e.g. classic synonym rows). Signatures are computed on
  // gate-normalized values — the DB already stores normalized text.
  const globalSigs = new Set<string>();
  const existingForDedup = await prisma.question.findMany({
    where: { subjectId: subject.id },
    select: { question: true, correctAnswer: true, explanation: true },
  });
  for (const r of existingForDedup) {
    globalSigs.add(mcaSignature({ question: r.question, options: [], correctAnswer: r.correctAnswer, explanation: r.explanation }));
  }

  const files = readdirSync(ENG_DIR).filter((f) => f.endsWith(".txt")).sort();
  const report: EnImportReport = { files: files.length, parsed: 0, inserted: 0, updated: 0, skippedRecords: 0, duplicates: 0, rejected: 0, topics: {} };

  type Op = { key: string; topicPath: string; data: Prisma.QuestionUncheckedCreateInput };
  const ops: Op[] = [];

  for (const file of files) {
    const slug = fileSlugEn(file);
    const { records, skipped } = parseEnFile(file, readFileSync(join(ENG_DIR, file), "utf8"));
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
      const topicPath = routeTopicEn(slug, r.header, r.subheader, r.question);
      if (!topicIdByPath.has(topicPath)) {
        report.skippedRecords++;
        console.warn(`  [skip] ${file} #${r.n}: unknown taxonomy path ${topicPath}`);
        continue;
      }
      if (r.options.length !== 4 && !(r.options.length === 5 && r.noErrorAdded)) {
        report.skippedRecords++;
        console.warn(`  [skip] ${file} #${r.n}: ${r.options.length} options`);
        continue;
      }
      if (r.noErrorAdded) console.log(`  [no-error] ${file} #${r.n}: option E "No error" surfaced from source verdict`);
      const answerText = r.options[LETTERS.indexOf(r.answerLetter)];
      const gate = scanMca({
        question: r.question,
        options: r.options,
        correctAnswer: answerText,
        explanation: r.explanation,
      });
      if (gate.verdict === "REJECT") {
        report.rejected++;
        console.warn(`  [reject] ${file} #${r.n}: ${gate.fatal.map((f) => `${f.code}@${f.field}`).join(", ")}`);
        continue;
      }
      const norm = gate.normalized;
      const nq = (norm.question ?? r.question) as string;
      const nopts = ((norm.options ?? r.options) as string[]);
      const nans = (norm.correctAnswer ?? answerText) as string;
      const nexp = (norm.explanation ?? r.explanation) as string;
      if (nq !== r.question || nans !== answerText || nexp !== r.explanation || JSON.stringify(nopts) !== JSON.stringify(r.options)) {
        report.skippedRecords++;
        console.warn(`  [skip] ${file} #${r.n}: gate rewrote Unicode-optimized text (fidelity hold)`);
        continue;
      }
      const sig = mcaSignature({ question: nq, options: nopts, correctAnswer: nans, explanation: nexp });
      if (globalSigs.has(sig)) {
        report.duplicates++;
        continue;
      }
      globalSigs.add(sig);
      ops.push({
        key: sourceKey(subject.id, "bank-english-v2", slug, r.n, r.question),
        topicPath,
        data: {
          ecosystemId: bb.id,
          subjectId: subject.id,
          topicId: topicIdByPath.get(topicPath) ?? null,
          topic: topicPath.split("/").pop() ?? "",
          subtopic: r.subheader ? `${r.header} — ${r.subheader}` : r.header,
          path: topicPath,
          question: nq,
          options: nopts,
          correctAnswer: nans,
          explanation: nexp,
          difficulty: "MEDIUM",
          year: null,
          sourceExam: `Bank English · ${slug}`,
          questionNumber: r.n,
        },
      });
    }
    console.log(`  ✓ ${file}: ${records.length} parsed`);
  }

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
    const chunkSize = 50;
    for (let i = 0; i < stale.length; i += chunkSize) {
      const chunk = stale.slice(i, i + chunkSize);
      await prisma.$transaction(
        chunk.map((o) =>
          prisma.question.update({
            where: { subjectId_sourceKey: { subjectId: subject.id, sourceKey: o.key } },
            data: o.data,
          }),
        ),
      );
      report.updated += chunk.length;
    }
  }
  for (const o of ops) report.topics[o.topicPath] = (report.topics[o.topicPath] ?? 0) + 1;
  if (report.inserted > 0 || report.updated > 0) {
    // Practice selection tree caches counts — bust it so the new pool shows
    // up. Lazy import: query-cache pulls `server-only`, which throws under
    // plain tsx (see tests/mocks/server-only.ts for the vitest shim).
    try {
      const { QueryCache } = await import("../backend/infrastructure/cache/query-cache");
      await QueryCache.invalidateExamTree().catch(() => {});
    } catch {
      /* tsx context — TTL expiry surfaces the rows instead */
    }
  }
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
    const report = await importBankEnglishV2(prisma);
    console.log(
      `\n✓ Done. files=${report.files} parsed=${report.parsed} inserted=${report.inserted} updated=${report.updated} skipped=${report.skippedRecords} duplicates=${report.duplicates} rejected=${report.rejected}`,
    );
    for (const [t, c] of Object.entries(report.topics)) console.log(`    ${c} × ${t}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bank-english-v2.ts")) {
  main().catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  });
}
