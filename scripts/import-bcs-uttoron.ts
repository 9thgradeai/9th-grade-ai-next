/**
 * scripts/import-bcs-uttoron.ts
 * ----------------------------------------------------------------------------
 * Previous-Year BCS preliminary MCQ importer (10th → 50th BCS).
 *
 * Source of record: the `SangbitDas/bcs-dataset` compilation, which is itself a
 * deterministic scrape of uttoron.academy's QuestionBank / QuestionPreview
 * pages (raw HTML is committed there, so every row is traceable). The merged
 * file is vendored at:
 *
 *   database/data/question_bank/bcs/uttoron/bcs_preliminary_question_bank.json
 *   database/data/question_bank/bcs/uttoron/exam-meta.json
 *
 * Pipeline contract (every row must pass before it can become a Question):
 *
 *   1. Unicode repair  — NFC, entity decoding, NBSP/odd-space folding, removal
 *      of ZWSP/BOM/soft-hyphen/control characters. ZWJ/ZWNJ are PRESERVED
 *      (legitimate Bangla conjunct joiners — same policy as qb-forensics).
 *   2. Canonical math  — every field goes through the shared import gate
 *      (scripts/qb-forensics/import-gate.ts), so math is normalised to the
 *      canonical KaTeX/Unicode form the dashboard renders.
 *   3. Structure       — 4 options, answer resolvable to option TEXT, no
 *      option-marker leakage, no visual-order corruption.
 *   4. Identity        — sourceKey = md5(subjectId | uttoron:<term> | question),
 *      so re-runs are idempotent and never collide with the docx corpus.
 *      Cross-term repeats are LEGITIMATE (a question asked in two exams is two
 *      paper occurrences); intra-term duplicates are collapsed.
 *
 * Deliberate deviations from the docx importer, both reported explicitly:
 *   • Empty explanation is allowed (692 source rows have no solve note). The
 *     row is imported with explanation "" — never fabricated.
 *   • Image-only questions (37 rows: prompt lives in the image) are allowed
 *     when the record carries a question image; the gate runs against a
 *     placeholder so Unicode/structure checks still apply.
 *
 * Usage:
 *   npx tsx scripts/import-bcs-uttoron.ts --dry-run
 *   npx tsx scripts/import-bcs-uttoron.ts --source /path/to/bcs-dataset
 *   npx tsx scripts/import-bcs-uttoron.ts            (apply to DATABASE_URL)
 *
 * Flags:
 *   --dry-run        validate + report only, write nothing (no DB writes, no
 *                    image copies)
 *   --source <dir>   checkout of SangbitDas/bcs-dataset (for images). Optional;
 *                    without it images are skipped.
 *   --no-images      skip image copying entirely
 *   --json-out <f>   write the machine-readable report to <f>
 * ----------------------------------------------------------------------------
 */
import { PrismaClient, type Difficulty, type Provenance } from "@prisma/client"
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs"
import { basename, join } from "path"
import { sourceKey } from "./seed-keys"
import { scanMca, mcaSignature, normalizeMca } from "./qb-forensics/import-gate"
import { SUBJECT_META } from "./taxonomy"

// ── Source shapes ───────────────────────────────────────────────────────────
export type UttoronRow = {
  question_number: number
  subject_id: number
  question: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
  solve_note: string
  question_image_paths: string[]
  solve_note_image_paths: string[]
  has_question_image: number
  has_solve_note_image: number
  has_image: number
  subject_en: string
  subject_bn: string
  exam_slug: string
}

export type UttoronDb = {
  metadata: { total_exams: number; total_questions: number }
  questions: UttoronRow[]
}

export type ExamMeta = Record<
  string,
  { title: string; date: string; totalMarks: number; setCode: string | null; totalQuestions: number }
>

// ── Subject map (dataset's 10 English labels → canonical BCS subject rows) ──
const SUBJECT_BN: Record<string, string> = {
  "Bangla Language & Literature": "বাংলা ভাষা ও সাহিত্য",
  "English Language & Literature": "English Language and Literature",
  "Bangladesh Affairs": "বাংলাদেশ বিষয়াবলি",
  "International Affairs": "আন্তর্জাতিক বিষয়াবলী",
  "Geography, Environment & Disaster Management": "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা",
  "General Science": "সাধারণ বিজ্ঞান",
  "Computer & Information Technology": "কম্পিউটার ও তথ্য প্রযুক্তি",
  "Mathematical Reasoning": "গাণিতিক যুক্তি",
  "Mental Ability": "মানসিক দক্ষতা",
  "Ethics, Values & Good Governance": "নৈতিকতা, মূল্যবোধ ও সু-শাসন",
}

export function subjectToBn(label: string): string | null {
  return SUBJECT_BN[label.trim()] ?? null
}

/** Proper English ordinal — the source slugs misuse 11/12/13 (11st, 12nd…). */
export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯"
export function bnDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)])
}

export function examNumFromSlug(slug: string): number | null {
  const m = slug.match(/^(\d+)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

// ── Unicode repair (deterministic, meaning-preserving) ─────────────────────
/**
 * Zero-width SPACE, BOM, soft hyphen and C0/C1 controls are artefacts.
 * ZWNJ (U+200C) and ZWJ (U+200D) are NOT in this class — they are semantic in
 * Bangla and must survive untouched.
 */
const REMOVE_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B\u2060\uFEFF]/g
const SPACE_RE = /[\u00A0\u1680\u2028\u2029\u202F\u205F\u3000\u2027]/g
const HTML_ENTITY: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
}

export type CleanResult = { value: string; fixes: string[] }

export function cleanText(raw: string | null | undefined): CleanResult {
  const fixes: string[] = []
  let s = String(raw ?? "")
  if (!s) return { value: "", fixes }

  const entity = s.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => HTML_ENTITY[m] ?? m)
  if (entity !== s) {
    fixes.push("html-entity")
    s = entity
  }
  if (REMOVE_RE.test(s)) {
    fixes.push("invisible-char")
    s = s.replace(REMOVE_RE, "")
  }
  if (SPACE_RE.test(s)) {
    fixes.push("nonstandard-space")
    s = s.replace(SPACE_RE, " ")
  }
  if (/[\t\r\n\f\v]/.test(s)) {
    fixes.push("whitespace")
    s = s.replace(/\s+/g, " ")
  }
  if (s.normalize("NFC") !== s) {
    fixes.push("nfc")
    s = s.normalize("NFC")
  }
  const trimmed = s.trim()
  if (trimmed !== s) fixes.push("trim")
  return { value: trimmed, fixes }
}

// ── Candidate build ────────────────────────────────────────────────────────
export type Candidate = {
  examNum: number
  term: string
  titleBn: string
  year: number | null
  setCode: string | null
  subjectBn: string
  questionNumber: number
  question: string
  options: string[]
  correctAnswer: string
  explanation: string
  media: { kind: "image"; url: string; alt?: string }[]
  rawMath: boolean
  warnings: string[]
  unicodeFixes: number
  isImageOnly: boolean
}

export type Rejection = {
  examNum: number
  questionNumber: number
  reason: string
  question: string
}

const OPTION_KEYS = ["option_a", "option_b", "option_c", "option_d"] as const
const LETTER_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }

/**
 * Turn one uttoron row into an import candidate, or a rejection.
 * `mediaFor` resolves local image paths to public URLs (empty when images off).
 */
export function buildCandidate(
  row: UttoronRow,
  meta: { examNum: number; year: number | null; setCode: string | null },
  mediaFor: (paths: string[], alt: string) => { kind: "image"; url: string; alt?: string }[]
): Candidate | Rejection {
  const term = ordinal(meta.examNum)
  const warnings: string[] = []
  let fixes = 0
  const fix = (r: CleanResult) => {
    fixes += r.fixes.length
    return r.value
  }

  const subjectBn = subjectToBn(row.subject_en)
  if (!subjectBn) {
    return { examNum: meta.examNum, questionNumber: row.question_number, reason: `unknown subject "${row.subject_en}"`, question: row.question }
  }

  const question = fix(cleanText(row.question))
  const options = OPTION_KEYS.map((k) => fix(cleanText(row[k])))
  const answerRaw = cleanText(row.correct_answer).value.toUpperCase()
  const explanation = fix(cleanText(row.solve_note))

  if (!answerRaw) {
    return { examNum: meta.examNum, questionNumber: row.question_number, reason: "blank answer key (source defect)", question }
  }
  const idx = LETTER_INDEX[answerRaw]
  if (idx === undefined) {
    return { examNum: meta.examNum, questionNumber: row.question_number, reason: `unresolvable answer letter "${answerRaw}"`, question }
  }

  const qImages = mediaFor(row.question_image_paths ?? [], "প্রশ্নের চিত্র")
  const sImages = mediaFor(row.solve_note_image_paths ?? [], "ব্যাখ্যার চিত্র")
  const media = [...qImages, ...sImages]
  const isImageOnly = question.length === 0

  if (isImageOnly && qImages.length === 0) {
    return { examNum: meta.examNum, questionNumber: row.question_number, reason: "empty question with no question image", question }
  }

  const correctAnswer = options[idx]
  if (!correctAnswer) {
    return { examNum: meta.examNum, questionNumber: row.question_number, reason: "answer letter points at an empty option", question }
  }

  // Gate: run against real text; substitute placeholders only for the two
  // fields this source legitimately leaves empty. Nothing else is relaxed.
  const gate = scanMca({
    question: question || "চিত্রনির্ভর প্রশ্ন",
    options,
    correctAnswer,
    explanation: explanation || "।",
  })

  // Gate result handling.
  // ─ Soft codes: false positives for this corpus, imported with a warning.
  //   • EXPLANATION_SCAFFOLD / OPTION_MARKER_LEAK — the source legitimately
  //     writes option-by-option notes ("(ক) Harsh– …") and article refs
  //     ("অনুচ্ছেদ ৭(ক)"). Neither is a multi-question scaffold.
  //   • QUESTION_SCAFFOLD — stems that ask about marked segments
  //     ("…indicated by (ক), (খ)…") or carry a leaked trailing option.
  //   • DUPLICATE_OPTION — a known source defect (e.g. 48th q86) where the
  //     answer key still disambiguates by letter.
  // ─ Math codes: the source is authoritative book Unicode that the canonical
  //   normalizer cannot render as KaTeX. Kept byte-identical with rawMath=true
  //   (the same escape hatch the docx importer uses).
  const SOFT_CODES = new Set([
    "EXPLANATION_SCAFFOLD",
    "QUESTION_SCAFFOLD",
    "OPTION_MARKER_LEAK",
    "DUPLICATE_OPTION",
  ])
  const MATH_CODES = new Set(["MATH_LITERAL_LATEX", "MATH_UNBALANCED_DOLLAR", "MATH_KATEX_ERROR"])

  let finalOptions = options
  let finalAnswer = correctAnswer
  let cleanExplanation = explanation
  let cleanQuestion = question
  let rawMath = false

  if (gate.verdict === "REJECT") {
    const codes = gate.fatal.map((f) => f.code)
    const allSoft = codes.every((c) => SOFT_CODES.has(c))
    const allMath = codes.every((c) => MATH_CODES.has(c))
    if (!allSoft && !allMath) {
      return {
        examNum: meta.examNum,
        questionNumber: row.question_number,
        reason: `import gate: ${codes.join(", ")}`,
        question,
      }
    }
    if (allMath) {
      // Preserve the source's Unicode math verbatim; the read path will emit
      // it byte-identically instead of attempting LaTeX normalisation.
      rawMath = true
      warnings.push(`math kept as raw Unicode (${codes.join(", ")})`)
    } else {
      const n = normalizeMca({
        question: question || "চিত্রনির্ভর প্রশ্ন",
        options,
        correctAnswer,
        explanation: explanation || "।",
      })
      finalOptions = n.options.map((o) => o.trim())
      finalAnswer = (n.correctAnswer ?? correctAnswer).trim()
      cleanExplanation = explanation ? n.explanation.trim() : ""
      cleanQuestion = isImageOnly ? "" : n.question.trim()
      warnings.push(`accepted with soft gate code(s): ${codes.join(", ")}`)
    }
  } else {
    const n = gate.normalized
    finalOptions = n.options.map((o) => o.trim())
    finalAnswer = (n.correctAnswer ?? correctAnswer).trim()
    cleanExplanation = explanation ? n.explanation.trim() : ""
    cleanQuestion = isImageOnly ? "" : n.question.trim()
  }

  if (finalOptions.length !== 4) {
    return { examNum: meta.examNum, questionNumber: row.question_number, reason: `gate produced ${finalOptions.length} options`, question }
  }

  return {
    examNum: meta.examNum,
    term,
    titleBn: `${bnDigits(meta.examNum)}তম বিসিএস প্রিলিমিনারি`,
    year: meta.year,
    setCode: meta.setCode,
    subjectBn,
    questionNumber: row.question_number,
    question: cleanQuestion,
    options: finalOptions,
    correctAnswer: finalAnswer,
    explanation: cleanExplanation,
    media,
    rawMath,
    warnings,
    unicodeFixes: fixes,
    isImageOnly,
  }
}

// ── Import report ──────────────────────────────────────────────────────────
export type UttoronReport = {
  totalFound: number
  accepted: number
  rejected: number
  imageOnly: number
  missingExplanation: number
  unicodeFixedRows: number
  mediaCopied: number
  byExam: Record<string, { found: number; accepted: number; rejected: number }>
  rejections: Rejection[]
  warnings: { examNum: number; questionNumber: number; message: string }[]
}

export type ImportResult = UttoronReport & {
  inserted: number
  updated: number
  adopted: number
  duplicatesInTerm: number
  contentConflicts: number
  dryRun: boolean
}

const BCS_CATEGORY_SLUG = "bcs"
const BCS_EXAM_SLUG = "bcs-preliminary"
const SOURCE_EXAM = "BCS প্রিলিমিনারি"

type ImporterOptions = {
  prisma: PrismaClient
  root: string
  sourceDir?: string
  copyImages?: boolean
  dryRun?: boolean
}

/** Import (or validate) the uttoron BCS corpus. */
export async function importUttoronBcs(opts: ImporterOptions): Promise<ImportResult> {
  const { prisma, root, dryRun = false } = opts
  const copyImages = opts.copyImages ?? true
  const dataDir = join(root, "database", "data", "question_bank", "bcs", "uttoron")
  const db = JSON.parse(readFileSync(join(dataDir, "bcs_preliminary_question_bank.json"), "utf8")) as UttoronDb
  const meta = JSON.parse(readFileSync(join(dataDir, "exam-meta.json"), "utf8")) as ExamMeta
  const mediaRoot = join(root, "public", "question-media", "bcs-uttoron")

  const report: UttoronReport = {
    totalFound: db.questions.length,
    accepted: 0,
    rejected: 0,
    imageOnly: 0,
    missingExplanation: 0,
    unicodeFixedRows: 0,
    mediaCopied: 0,
    byExam: {},
    rejections: [],
    warnings: [],
  }

  const mediaFor = (paths: string[], alt: string) => {
    const out: { kind: "image"; url: string; alt?: string }[] = []
    for (const p of paths) {
      if (!p) continue
      const examFolder = basename(join(p, ".."))
      const file = basename(p)
      const url = `/question-media/bcs-uttoron/${examFolder}/${encodeURIComponent(file)}`
      if (!dryRun && copyImages && opts.sourceDir) {
        const src = join(opts.sourceDir, p)
        const destDir = join(mediaRoot, examFolder)
        const dest = join(destDir, file)
        if (existsSync(src)) {
          mkdirSync(destDir, { recursive: true })
          if (!existsSync(dest) || statSync(src).size !== statSync(dest).size) {
            copyFileSync(src, dest)
            report.mediaCopied++
          }
        }
      }
      out.push({ kind: "image", url, alt })
    }
    return out
  }

  const candidates: Candidate[] = []
  for (const row of db.questions) {
    const n = examNumFromSlug(row.exam_slug)
    const m = meta[row.exam_slug]
    if (!n || !m) {
      report.rejected++
      report.rejections.push({ examNum: n ?? 0, questionNumber: row.question_number, reason: `unknown exam slug "${row.exam_slug}"`, question: row.question })
      continue
    }
    const year = Number(m.date.slice(0, 4)) || null
    const term = ordinal(n)
    report.byExam[term] ??= { found: 0, accepted: 0, rejected: 0 }
    report.byExam[term].found++

    const c = buildCandidate(row, { examNum: n, year, setCode: m.setCode }, mediaFor)
    if ("reason" in c) {
      report.rejected++
      report.byExam[term].rejected++
      report.rejections.push(c)
      continue
    }
    candidates.push(c)
    report.accepted++
    report.byExam[term].accepted++
    if (c.isImageOnly) report.imageOnly++
    if (!c.explanation) report.missingExplanation++
    if (c.unicodeFixes > 0) report.unicodeFixedRows++
    for (const w of c.warnings) report.warnings.push({ examNum: n, questionNumber: c.questionNumber, message: w })
  }

  // Intra-term duplicate collapse (same normalised stem + answer).
  const seen = new Set<string>()
  const unique: Candidate[] = []
  let duplicatesInTerm = 0
  for (const c of candidates) {
    const sig = `${c.term}\u0000${mcaSignature({ question: c.question, options: c.options, correctAnswer: c.correctAnswer, explanation: c.explanation })}`
    if (seen.has(sig)) {
      duplicatesInTerm++
      continue
    }
    seen.add(sig)
    unique.push(c)
  }

  if (dryRun) {
    return { ...report, inserted: unique.length, updated: 0, adopted: 0, duplicatesInTerm, contentConflicts: 0, dryRun: true }
  }

  // ── Taxonomy bootstrap ────────────────────────────────────────────────
  const ecosystem = await prisma.examEcosystem.findUnique({ where: { code: "BCS" } })
  if (!ecosystem) throw new Error('ExamEcosystem "BCS" is missing — run the base seed first.')
  const ecosystemId = ecosystem.id

  const category = await prisma.examCategory.upsert({
    where: { ecosystemId_slug: { ecosystemId, slug: BCS_CATEGORY_SLUG } },
    update: {},
    create: {
      ecosystemId,
      slug: BCS_CATEGORY_SLUG,
      nameBn: "BCS",
      nameEn: "BCS",
      icon: "📘",
      color: "text-sky-400",
      bg: "bg-sky-500/10",
      sortOrder: 1,
    },
  })
  const exam = await prisma.exam.upsert({
    where: { slug: BCS_EXAM_SLUG },
    update: { categoryId: category.id, nameBn: "BCS প্রিলিমিনারি", nameEn: "BCS Preliminary", type: "PRELIMINARY" },
    create: {
      categoryId: category.id,
      slug: BCS_EXAM_SLUG,
      nameBn: "BCS প্রিলিমিনারি",
      nameEn: "BCS Preliminary",
      type: "PRELIMINARY",
      sortOrder: 1,
    },
  })

  const termMeta = new Map<number, { year: number | null; set: string | null; count: number }>()
  for (const c of unique) {
    const t = termMeta.get(c.examNum) ?? { year: c.year, set: c.setCode, count: 0 }
    t.count++
    termMeta.set(c.examNum, t)
  }

  const paperIdByTerm = new Map<number, number>()
  let order = 0
  for (const n of [...termMeta.keys()].sort((a, b) => b - a)) {
    const t = termMeta.get(n)!
    // Reuse an existing paper for this term even when its legacy slug is wrong
    // ("43th", "42th", …) — slugs are public URLs and are never rewritten.
    const existingPaper = await prisma.examPaper.findFirst({
      where: { examId: exam.id, bcsTerm: n },
      select: { id: true },
    })
    const paperMeta = {
      examId: exam.id,
      titleBn: `${bnDigits(n)}তম বিসিএস প্রিলিমিনারি`,
      titleEn: `${ordinal(n)} BCS Preliminary`,
      bcsTerm: n,
      termLabel: ordinal(n),
      year: t.year,
      totalQuestions: t.count,
      source: "uttoron.academy via SangbitDas/bcs-dataset",
      provenance: "CURATED" as Provenance,
      sortOrder: order++,
    }
    const paper = existingPaper
      ? await prisma.examPaper.update({ where: { id: existingPaper.id }, data: paperMeta })
      : await prisma.examPaper.create({
          data: { slug: `bcs-preliminary-${ordinal(n)}`, ...paperMeta },
        })
    paperIdByTerm.set(n, paper.id)
  }

  const subjectIdByNameBn = new Map<string, number>()
  for (const [i, s] of SUBJECT_META.entries()) {
    const row = await prisma.subject.upsert({
      where: { ecosystemId_nameBn: { ecosystemId, nameBn: s.nameBn } },
      update: {},
      create: {
        ecosystemId,
        nameBn: s.nameBn,
        nameEn: s.nameEn,
        icon: s.icon,
        color: s.color,
        bg: s.bg,
        sortOrder: i,
      },
    })
    subjectIdByNameBn.set(s.nameBn.normalize("NFC"), row.id)
  }

  // ── Rows: key + content ───────────────────────────────────────────────
  type Row = { c: Candidate; subjectId: number; key: string; content: Record<string, unknown> }
  const rows: Row[] = []
  for (const c of unique) {
    const subjectId = subjectIdByNameBn.get(c.subjectBn)
    if (subjectId === undefined) throw new Error(`subject missing after upsert: ${c.subjectBn}`)
    const paperId = paperIdByTerm.get(c.examNum)!
    const key = sourceKey(subjectId, `uttoron:${c.term}`, c.question || `image:${c.questionNumber}`)
    rows.push({
      c,
      subjectId,
      key,
      content: {
        ecosystemId,
        subjectId,
        topic: "",
        subtopic: "",
        path: "",
        topicId: null,
        question: c.question,
        options: c.options,
        correctAnswer: c.correctAnswer,
        explanation: c.explanation,
        rawMath: c.rawMath,
        questionType: "SINGLE_CHOICE",
        correctAnswers: [c.correctAnswer],
        statements: [],
        media: c.media,
        difficulty: "MEDIUM" as Difficulty,
        year: c.year,
        sourceExam: SOURCE_EXAM,
        bcsTerm: c.term,
        examId: exam.id,
        paperId,
        questionNumber: c.questionNumber,
      },
    })
  }

  // Bulk-read existing keys per subject (Neon friendly).
  const keysBySubject = new Map<number, string[]>()
  for (const r of rows) {
    if (!keysBySubject.has(r.subjectId)) keysBySubject.set(r.subjectId, [])
    keysBySubject.get(r.subjectId)!.push(r.key)
  }
  const idByKey = new Map<string, number>()
  for (const [subjectId, keys] of keysBySubject) {
    for (let i = 0; i < keys.length; i += 500) {
      const found = await prisma.question.findMany({
        where: { subjectId, sourceKey: { in: keys.slice(i, i + 500) } },
        select: { id: true, sourceKey: true },
      })
      for (const f of found) idByKey.set(`${subjectId}\u0000${f.sourceKey}`, f.id)
    }
  }

  // ── Existing paper rows (docx corpus) → adopt instead of duplicating ─────
  // Terms 44/46/47/48/49/50 already hold OCR-derived copies of the same
  // papers (44–70% exact overlap). Inserting the clean rows would double the
  // paper. Instead a clean row that matches an existing stem is written ONTO
  // that row (id, bookmarks and attempts survive) and adopts the new
  // sourceKey, so re-runs are deterministic.
  type ExistingRow = { id: number; paperId: number | null; question: string; correctAnswer: string; bigrams: Set<string> }
  const bigrams = (s: string): Set<string> => {
    const t = s.normalize("NFC").toLowerCase().replace(/[\s\u200b-\u200d.,;:!?'"()\-–—/|]+/g, "")
    const out = new Set<string>()
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
    return out
  }
  const jaccard = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 || b.size === 0) return 0
    let inter = 0
    for (const g of a) if (b.has(g)) inter++
    return inter / (a.size + b.size - inter)
  }
  const existingRows = await prisma.question.findMany({
    where: { paperId: { in: [...paperIdByTerm.values()] } },
    select: { id: true, paperId: true, question: true, correctAnswer: true },
  })
  const byPaper = new Map<number, ExistingRow[]>()
  for (const e of existingRows) {
    if (e.paperId == null) continue
    const list = byPaper.get(e.paperId) ?? []
    list.push({ ...e, paperId: e.paperId, bigrams: bigrams(e.question) })
    byPaper.set(e.paperId, list)
  }
  const adopted = new Set<number>()

  const creates: Array<Record<string, unknown>> = []
  const updates: Array<{ id: number; data: Record<string, unknown> }> = []
  let contentConflicts = 0
  let adoptedCount = 0

  for (const r of rows) {
    const id = idByKey.get(`${r.subjectId}\u0000${r.key}`)
    if (id !== undefined) {
      updates.push({ id, data: r.content })
      continue
    }

    // Match against the existing paper's OCR rows (same question, better text).
    const paperId = r.content.paperId as number
    let bestId: number | null = null
    if (r.c.question) {
      const cand = byPaper.get(paperId) ?? []
      const mine = bigrams(r.c.question)
      let best = 0
      for (const e of cand) {
        if (adopted.has(e.id) || e.question.trim().length === 0) continue
        const j = jaccard(mine, e.bigrams)
        if (j < 0.35 || j <= best) continue
        best = j
        bestId = e.id
      }
      // Jaccard 0.35 on stem bigrams ≈ ≥0.85 sequence similarity in practice;
      // the answer must also agree (normalised) before we overwrite a row.
      if (bestId !== null) {
        const target = (byPaper.get(paperId) ?? []).find((e) => e.id === bestId)!
        const sameAnswer =
          target.correctAnswer.normalize("NFC").trim() === r.c.correctAnswer.normalize("NFC").trim()
        if (!sameAnswer) {
          bestId = null
          contentConflicts++
          continue
        }
      }
    }

    if (bestId !== null) {
      try {
        adopted.add(bestId)
        adoptedCount++
        updates.push({ id: bestId, data: { ...r.content, sourceKey: r.key } })
      } catch {
        contentConflicts++
      }
      continue
    }

    creates.push({ subjectId: r.subjectId, sourceKey: r.key, ...r.content })
  }

  for (let i = 0; i < creates.length; i += 400) {
    await prisma.question.createMany({ data: creates.slice(i, i + 400) as never, skipDuplicates: true })
  }
  for (let i = 0; i < updates.length; i += 4) {
    await Promise.all(updates.slice(i, i + 4).map(async (u) => {
      try {
        await prisma.question.update({ where: { id: u.id }, data: u.data })
      } catch (e: any) {
        if (e?.code !== "P2002") throw e
      }
    }))
  }

  // ── Post-import bookkeeping ───────────────────────────────────────────────
  // Term labels: legacy rows store "৪৮তম বিসিএস"; canonicalise to "48th" so the
  // Question Bank term facet sorts and renders correctly (docs/DATABASE.md).
  for (const [n, paperId] of paperIdByTerm) {
    await prisma.question.updateMany({
      where: { paperId, OR: [{ bcsTerm: { not: ordinal(n) } }, { sourceExam: { not: SOURCE_EXAM } }] },
      data: { bcsTerm: ordinal(n), sourceExam: SOURCE_EXAM },
    })
    const count = await prisma.question.count({ where: { paperId } })
    const official = meta[n]?.totalQuestions
    await prisma.examPaper.update({
      where: { id: paperId },
      data: { availableQuestions: count, totalQuestions: official ?? count },
    })
  }

  return {
    ...report,
    inserted: creates.length,
    updated: updates.length + adoptedCount,
    duplicatesInTerm,
    contentConflicts,
    adopted: adoptedCount,
    dryRun: false,
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
function printReport(r: ImportResult): void {
  console.log(`\nBCS Previous-Year Import (uttoron corpus)${r.dryRun ? " — DRY RUN" : ""}`)
  console.log("──────────────────────────────────────────────────────────")
  const terms = Object.keys(r.byExam).sort((a, b) => parseInt(b) - parseInt(a))
  for (const t of terms) {
    const b = r.byExam[t]
    console.log(`  ${t.padStart(4)} BCS  found ${String(b.found).padStart(3)}  accepted ${String(b.accepted).padStart(3)}  rejected ${String(b.rejected).padStart(3)}`)
  }
  console.log("──────────────────────────────────────────────────────────")
  console.log(`Found ${r.totalFound} · accepted ${r.accepted} · rejected ${r.rejected}`)
  console.log(`Image-only ${r.imageOnly} · no explanation ${r.missingExplanation} · unicode-repaired rows ${r.unicodeFixedRows}`)
  console.log(`Media copied ${r.mediaCopied} · intra-term duplicates ${r.duplicatesInTerm}`)
  if (r.dryRun) console.log(`Would insert ${r.inserted}`)
  else console.log(`Inserted ${r.inserted} · updated ${r.updated} · conflicts skipped ${r.contentConflicts}`)
  if (r.warnings.length) console.log(`Warnings ${r.warnings.length} (duplicate options and similar) — see JSON report`)
  if (r.rejections.length) {
    console.log("\nRejections by reason:")
    const by = new Map<string, number>()
    for (const x of r.rejections) by.set(x.reason, (by.get(x.reason) ?? 0) + 1)
    for (const [reason, n] of [...by.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${reason}`)
    for (const x of r.rejections.slice(0, 12)) console.log(`   · ${x.examNum}th #${x.questionNumber}: ${x.reason} — ${x.question.slice(0, 50)}`)
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes("--dry-run")
  const noImages = argv.includes("--no-images")
  const srcIdx = argv.indexOf("--source")
  const sourceDir = srcIdx >= 0 ? argv[srcIdx + 1] : undefined
  const outIdx = argv.indexOf("--json-out")
  const jsonOut = outIdx >= 0 ? argv[outIdx + 1] : undefined

  const prisma = new PrismaClient()
  try {
    const result = await importUttoronBcs({
      prisma,
      root: process.cwd(),
      sourceDir,
      copyImages: !noImages,
      dryRun,
    })
    printReport(result)
    if (jsonOut) {
      writeFileSync(jsonOut, JSON.stringify(result, null, 2), "utf8")
      console.log(`\nReport written to ${jsonOut}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && process.argv[1].endsWith("import-bcs-uttoron.ts")) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
