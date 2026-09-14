import { NextResponse } from "next/server"
import PDFDocument from "pdfkit"
import { getUserIdFromRequest } from "~backend/services/user"
import { getRealExamQuestions } from "~backend/services/exam-history"
import { AppError, toHttpResponse } from "~backend/errors"
import {
  getRequestId,
  startTiming,
  applySecurityHeaders,
  assertSameOrigin,
} from "../../_middleware"

// pdfkit relies on Node streams/Buffer — pin the Node.js runtime so the route
// can never be scheduled on the Edge runtime (where the import would 500).
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Hard server-side deadline (under the client's 60s download timeout) so the
// route ALWAYS answers: a stall (DB/auth/compute) becomes a diagnosable 503
// naming the hung stage instead of an opaque client-side timeout.
const SERVER_DEADLINE_MS = 50_000

type RealExamExportRequest = {
  questions?: Array<{
    id?: number | null
    question?: string | null
    options?: Array<string | null> | null
    correctAnswer?: string | null
    explanation?: string | null
    subject?: string | null
    topic?: string | null
    subtopic?: string | null
    difficulty?: "EASY" | "MEDIUM" | "HARD" | string | null
    year?: number | null
    sourceExam?: string | null
    questionNumber?: number | null
  }> | null
  // Slim protocol for official papers: the server loads the questions itself
  // so the client uploads ~200 bytes instead of the full question JSON.
  paperId?: number | null
  title?: string | null
  examName?: string | null
  exportOptions?: {
    includeAnswers?: boolean
    includeExplanations?: boolean
    shuffleQuestions?: boolean
    questionsPerPage?: number
  } | null
  durationMin?: number | null
}

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"]

/** Coerce any value to a safe string for PDFKit (never throws on null/undefined). */
function safeStr(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  try {
    return String(value)
  } catch {
    return ""
  }
}

/**
 * Strip characters that can corrupt PDF string encoding or layout:
 * C0 controls (except \t \n), DEL, and lone UTF-16 surrogates. Caps length
 * so one pathological row can never blow up the document.
 */
function sanitizePdfText(value: unknown, maxLen = 2000): string {
  const s = safeStr(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s
}

/** Normalize one incoming question so downstream `.trim()` calls can never throw. */
function normalizeQuestion(
  q: NonNullable<RealExamExportRequest["questions"]>[number],
  index: number
) {
  const raw = (q !== null && typeof q === "object" ? q : {}) as NonNullable<
    RealExamExportRequest["questions"]
  >[number]
  const options = Array.isArray(raw.options)
    ? raw.options
        .filter((o): o is string => typeof o === "string" && o.trim() !== "")
        .map((o) => sanitizePdfText(o))
        .filter((o) => o !== "")
    : []
  return {
    id: typeof raw.id === "number" ? raw.id : index + 1,
    question: sanitizePdfText(raw.question).trim() || `Question ${index + 1}`,
    options,
    correctAnswer: sanitizePdfText(raw.correctAnswer).trim(),
    explanation: sanitizePdfText(raw.explanation).trim(),
    subject: sanitizePdfText(raw.subject, 200).trim(),
    topic: sanitizePdfText(raw.topic, 200).trim(),
    subtopic: sanitizePdfText(raw.subtopic, 200).trim(),
    difficulty: sanitizePdfText(raw.difficulty, 20).trim(),
    year: typeof raw.year === "number" ? raw.year : null,
    sourceExam: sanitizePdfText(raw.sourceExam, 200).trim(),
    questionNumber: typeof raw.questionNumber === "number" ? raw.questionNumber : null,
  }
}

type NormalizedQuestion = ReturnType<typeof normalizeQuestion>

/** Resolve the printable answer label without ever throwing on missing data. */
function answerLabelFor(q: NormalizedQuestion): string {
  if (!q.correctAnswer) return "—"
  const idx = q.options.findIndex((opt) => opt.trim() === q.correctAnswer)
  return idx >= 0 ? (OPTION_LABELS[idx] ?? q.correctAnswer) : q.correctAnswer
}

function shuffleArray<T>(array: T[], seed: number): T[] {
  const rng = mulberry32(seed)
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function drawTextWithWrap(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: { font?: string; fontSize?: number; lineGap?: number } = {}
): number {
  const { font = "Helvetica", fontSize = 10, lineGap = 2 } = options
  const safe = safeStr(text)
  doc.font(font).fontSize(fontSize)
  const lines = doc.widthOfString(safe) > maxWidth ? wrapText(doc, safe, maxWidth) : [safe]

  let currentY = y
  for (const line of lines) {
    doc.text(line, x, currentY, { width: maxWidth, align: "left" })
    currentY += doc.currentLineHeight() + lineGap
  }
  return currentY
}

function wrapText(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string[] {
  const safe = safeStr(text)
  if (!safe) return [""]
  // Standard PDF fonts (Helvetica) carry no Bengali glyphs, so widthOfString
  // returns 0 for Bengali runs. Fall back to a character-count wrap so long
  // Bengali questions/options still break across lines instead of overflowing.
  const probe = doc.widthOfString(safe)
  if (probe === 0) {
    const approxCharsPerLine = 85
    const out: string[] = []
    for (let i = 0; i < safe.length; i += approxCharsPerLine) {
      out.push(safe.slice(i, i + approxCharsPerLine))
    }
    return out.length > 0 ? out : [""]
  }
  const words = safe.split(" ")
  const lines: string[] = []
  let currentLine = ""

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    // A single word wider than the column (or unmeasurable) still gets its own
    // line instead of looping forever.
    if (doc.widthOfString(testLine) > maxWidth) {
      if (currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        lines.push(word)
      }
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines
}

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  const getTime = startTiming()
  // Tracks how far the export got — attached to timeout errors and logs so a
  // stall names its stage (auth / parse / load-paper / render / finalize).
  let stage = "start"
  const mark = (s: string) => {
    stage = s
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new AppError(503, "PDF export is taking too long. Please try again.", "EXPORT_TIMEOUT")
      )
    }, SERVER_DEADLINE_MS)
  })

  try {
    const res = await Promise.race([runExport(request, requestId, getTime, mark), deadline])
    clearTimeout(timeoutId)
    return res
  } catch (err) {
    clearTimeout(timeoutId)
    // Always log server-side (host logs) with the request id and stage so a
    // failure can be traced to its cause instead of surfacing as a mystery.
    console.error(
      `[real-exam-export] [${requestId}] failed at stage "${stage}" after ${getTime()}ms:`,
      err instanceof Error ? (err.stack ?? err.message) : err
    )
    if (err instanceof AppError && err.code === "EXPORT_TIMEOUT") {
      const res = NextResponse.json(
        { error: err.message, code: err.code, stage },
        { status: err.statusCode }
      )
      res.headers.set("X-Request-Id", requestId)
      res.headers.set("X-Response-Time", getTime() + "ms")
      applySecurityHeaders(res)
      return res
    }
    const res = toHttpResponse(err)
    res.headers.set("X-Request-Id", requestId)
    res.headers.set("X-Response-Time", getTime() + "ms")
    applySecurityHeaders(res)
    return res
  }
}

async function runExport(
  request: Request,
  requestId: string,
  getTime: () => number,
  mark: (stage: string) => void
) {
  // No local catch: the POST wrapper owns the deadline, stage logging, and
  // error normalization so every failure path behaves identically.
  assertSameOrigin(request)

  mark("auth")
  const userId = await getUserIdFromRequest(request)
  if (!userId) {
    throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED")
  }

  mark("parse")
  let body: RealExamExportRequest
  try {
    body = (await request.json()) as RealExamExportRequest
  } catch {
    throw new AppError(400, "Invalid request body", "VALIDATION_ERROR")
  }
  const rawQuestions = Array.isArray(body?.questions) ? body.questions : []
  const paperId =
    typeof body?.paperId === "number" && Number.isInteger(body.paperId) && body.paperId > 0
      ? body.paperId
      : null

  let questions: NormalizedQuestion[]
  if (rawQuestions.length > 0) {
    if (rawQuestions.length > 200) {
      throw new AppError(400, "Too many questions (max 200).", "VALIDATION_ERROR")
    }
    questions = rawQuestions.map((q, i) => normalizeQuestion(q ?? {}, i))
  } else if (paperId !== null) {
    // Slim protocol: load official-paper questions server-side.
    mark("load-paper")
    const rows = await getRealExamQuestions(paperId)
    if (rows.length === 0) {
      throw new AppError(404, "No questions found for this paper.", "NOT_FOUND")
    }
    questions = rows.slice(0, 200).map((q, i) => normalizeQuestion(q, i))
  } else {
    throw new AppError(400, "No questions provided", "VALIDATION_ERROR")
  }

  const title = sanitizePdfText(body?.title, 200).trim() || "Real Exam Question Paper"
  const examName = sanitizePdfText(body?.examName, 200).trim()
  const exportOptions = {
    includeAnswers: body?.exportOptions?.includeAnswers === true,
    includeExplanations: body?.exportOptions?.includeExplanations === true,
    shuffleQuestions: body?.exportOptions?.shuffleQuestions === true,
  }
  const durationMin =
    typeof body?.durationMin === "number" &&
    Number.isFinite(body.durationMin) &&
    body.durationMin > 0
      ? Math.round(body.durationMin)
      : 60

  // Prepare questions based on export options
  let processedQuestions = [...questions]
  if (exportOptions.shuffleQuestions) {
    processedQuestions = shuffleArray(processedQuestions, Date.now())
  }

  // Create PDF document
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: title,
      Author: "9Th-Grade AI",
      Subject: examName,
      Keywords: "BCS, Exam, Practice, Bangladesh",
    },
  })

  // Collect PDF chunks
  const chunks: Buffer[] = []
  doc.on("data", (chunk: Buffer) => chunks.push(chunk))

  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
  })

  // ============ HEADER PAGE ============
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#1a1a2e")
  doc.text(title, { align: "center" })
  doc.moveDown(0.5)

  doc.font("Helvetica").fontSize(12).fillColor("#4a4a6a")
  doc.text(examName, { align: "center" })
  doc.moveDown(0.5)

  doc.font("Helvetica").fontSize(10).fillColor("#666666")
  doc.text(`Duration: ${durationMin} minutes`, { align: "center" })
  doc.text(`Total Questions: ${processedQuestions.length}`, { align: "center" })
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    { align: "center" }
  )
  doc.moveDown(1)

  // Separator line
  doc.strokeColor("#e0e0e0").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke()
  doc.moveDown(1)

  // ============ INSTRUCTIONS ============
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#1a1a2e")
  doc.text("Instructions", { underline: true })
  doc.moveDown(0.5)

  doc.font("Helvetica").fontSize(10).fillColor("#333333")
  const instructions = [
    "1. This is a practice exam paper for offline practice.",
    "2. Mark your answers on a separate answer sheet.",
    "3. Time limit: " + durationMin + " minutes.",
    "4. Scoring: Correct +1, Wrong -0.5, Unanswered 0 (BCS standard).",
    exportOptions.includeAnswers
      ? "5. Answer key is provided at the end."
      : "5. Answer key is NOT included (for self-assessment).",
    exportOptions.includeExplanations
      ? "6. Explanations are provided for each question."
      : "6. Explanations are NOT included.",
  ]
  for (const inst of instructions) {
    doc.text(inst, { indent: 20 })
    doc.moveDown(0.3)
  }
  doc.moveDown(1)

  // Separator
  doc.strokeColor("#e0e0e0").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke()
  doc.moveDown(1)

  // ============ QUESTIONS ============
  // Each question renders in isolation: one malformed row can never abort
  // the whole export — it is skipped and counted instead.
  mark("render")
  const pageWidth = doc.page.width - 100 // margins
  const contentWidth = pageWidth - 40 // indent
  let renderedCount = 0
  const skipped: number[] = []
  const renderedQuestions: NormalizedQuestion[] = []

  const renderQuestion = (q: NormalizedQuestion, i: number) => {
    const qNum = i + 1

    // Check if we need a new page (keep at least 100px for question)
    if (doc.y > doc.page.height - 150) {
      doc.addPage()
    }

    // Question number and metadata
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1a1a2e")
    doc.text(`Q${qNum}.`, { continued: true })
    doc.font("Helvetica").fontSize(11)
    doc.text(` ${q.question}`)

    // Subject/Topic tags
    doc.moveDown(0.3)
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#888888")
    const metaParts = []
    if (q.subject) metaParts.push(q.subject)
    if (q.topic) metaParts.push(q.topic)
    if (q.subtopic && q.subtopic !== q.topic) metaParts.push(q.subtopic)
    if (q.difficulty) metaParts.push(`Difficulty: ${q.difficulty}`)
    if (q.year) metaParts.push(`Year: ${q.year}`)
    if (q.sourceExam) metaParts.push(`Source: ${q.sourceExam}`)
    if (metaParts.length > 0) {
      doc.text(metaParts.join(" | "), { indent: 20 })
    }

    doc.moveDown(0.5)

    // Options (already filtered to non-empty strings by normalizeQuestion)
    for (let j = 0; j < q.options.length; j++) {
      const option = q.options[j]

      doc.font("Helvetica").fontSize(10).fillColor("#333333")
      const optionText = `${OPTION_LABELS[j] ?? j + 1}. ${option}`
      drawTextWithWrap(doc, optionText, 70, doc.y, contentWidth - 20, { fontSize: 10, lineGap: 1 })
      doc.moveDown(0.2)
    }

    // Answer and explanation (if enabled)
    if (exportOptions.includeAnswers || exportOptions.includeExplanations) {
      doc.moveDown(0.3)
      if (exportOptions.includeAnswers) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#27ae60")
        doc.text(`Answer: ${answerLabelFor(q)}`, { indent: 20 })
      }

      if (exportOptions.includeExplanations && q.explanation !== "") {
        doc.moveDown(0.2)
        doc.font("Helvetica-Oblique").fontSize(9).fillColor("#2c3e50")
        doc.text("Explanation:", { indent: 20, continued: true })
        doc.font("Helvetica").fontSize(9)
        drawTextWithWrap(doc, q.explanation, 90, doc.y, contentWidth - 40, {
          fontSize: 9,
          lineGap: 1,
        })
      }
    }

    doc.moveDown(0.8)

    // Separator between questions
    if (i < processedQuestions.length - 1) {
      doc.strokeColor("#f0f0f0").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke()
      doc.moveDown(0.5)
    }
  }

  for (let i = 0; i < processedQuestions.length; i++) {
    try {
      renderQuestion(processedQuestions[i], renderedQuestions.length)
      renderedQuestions.push(processedQuestions[i])
      renderedCount += 1
    } catch (questionErr) {
      skipped.push(i + 1)
      console.error(
        `[real-exam-export] [${requestId}] skipped unrenderable question #${i + 1}:`,
        questionErr instanceof Error ? questionErr.message : questionErr
      )
    }
  }

  if (renderedCount === 0) {
    throw new AppError(400, "No renderable questions provided", "VALIDATION_ERROR")
  }

  // ============ ANSWER KEY (if not inline) ============
  if (exportOptions.includeAnswers && !exportOptions.includeExplanations) {
    doc.addPage()
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#1a1a2e")
    doc.text("Answer Key", { align: "center", underline: true })
    doc.moveDown(1)

    doc.font("Helvetica").fontSize(10).fillColor("#333333")
    for (let i = 0; i < renderedQuestions.length; i++) {
      doc.text(`Q${i + 1}: ${answerLabelFor(renderedQuestions[i])}`, { indent: 20 })
      if ((i + 1) % 3 === 0) doc.moveDown(0.5)
    }
  }

  // Finalize PDF
  mark("finalize")
  doc.end()
  const pdfBuffer = await pdfPromise
  mark("respond")

  // Return PDF as download (filename is ASCII-safe: Bengali titles sanitize to
  // underscores, so fall back to a stable name when nothing ASCII remains).
  const safeFileBase =
    title
      .replace(/[^a-z0-9]/gi, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "real-exam-paper"
  const res = new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFileBase}.pdf"`,
      "Content-Length": pdfBuffer.length.toString(),
      "X-Request-Id": requestId,
      "X-Response-Time": getTime() + "ms",
    },
  })
  applySecurityHeaders(res)
  if (skipped.length > 0) {
    console.warn(
      `[real-exam-export] [${requestId}] exported ${renderedCount}/${processedQuestions.length} questions, skipped rows: ${skipped.join(",")}`
    )
  }
  return res
}
