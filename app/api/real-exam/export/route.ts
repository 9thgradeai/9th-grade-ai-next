import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

type RealExamExportRequest = {
  questions: Array<{
    id: number;
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    subject: string;
    topic: string;
    subtopic: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    year?: number | null;
    sourceExam?: string;
    questionNumber?: number | null;
  }>;
  title: string;
  examName: string;
  exportOptions: {
    includeAnswers: boolean;
    includeExplanations: boolean;
    shuffleQuestions: boolean;
    questionsPerPage?: number;
  };
  durationMin: number;
};

function shuffleArray<T>(array: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawTextWithWrap(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: { font?: string; fontSize?: number; lineGap?: number } = {}
): number {
  const { font = "Helvetica", fontSize = 10, lineGap = 2 } = options;
  doc.font(font).fontSize(fontSize);
  const lines = doc.widthOfString(text) > maxWidth
    ? wrapText(doc, text, maxWidth)
    : [text];

  let currentY = y;
  for (const line of lines) {
    doc.text(line, x, currentY, { width: maxWidth, align: "left" });
    currentY += doc.currentLineHeight() + lineGap;
  }
  return currentY;
}

function wrapText(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (doc.widthOfString(testLine) > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        lines.push(word);
      }
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const body = await request.json() as RealExamExportRequest;
    const { questions, title, examName, exportOptions, durationMin } = body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      throw new AppError(400, "No questions provided", "VALIDATION_ERROR");
    }
    if (questions.length > 200) {
      throw new AppError(400, "Too many questions (max 200).", "VALIDATION_ERROR");
    }

    // Prepare questions based on export options
    let processedQuestions = [...questions];
    if (exportOptions.shuffleQuestions) {
      processedQuestions = shuffleArray(processedQuestions, Date.now());
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
    });

    // Collect PDF chunks
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    // ============ HEADER PAGE ============
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#1a1a2e");
    doc.text(title, { align: "center" });
    doc.moveDown(0.5);

    doc.font("Helvetica").fontSize(12).fillColor("#4a4a6a");
    doc.text(examName, { align: "center" });
    doc.moveDown(0.5);

    doc.font("Helvetica").fontSize(10).fillColor("#666666");
    doc.text(`Duration: ${durationMin} minutes`, { align: "center" });
    doc.text(`Total Questions: ${processedQuestions.length}`, { align: "center" });
    doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" });
    doc.moveDown(1);

    // Separator line
    doc.strokeColor("#e0e0e0").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // ============ INSTRUCTIONS ============
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#1a1a2e");
    doc.text("Instructions", { underline: true });
    doc.moveDown(0.5);

    doc.font("Helvetica").fontSize(10).fillColor("#333333");
    const instructions = [
      "1. This is a practice exam paper for offline practice.",
      "2. Mark your answers on a separate answer sheet.",
      "3. Time limit: " + durationMin + " minutes.",
      "4. Scoring: Correct +1, Wrong -0.5, Unanswered 0 (BCS standard).",
      exportOptions.includeAnswers ? "5. Answer key is provided at the end." : "5. Answer key is NOT included (for self-assessment).",
      exportOptions.includeExplanations ? "6. Explanations are provided for each question." : "6. Explanations are NOT included.",
    ];
    for (const inst of instructions) {
      doc.text(inst, { indent: 20 });
      doc.moveDown(0.3);
    }
    doc.moveDown(1);

    // Separator
    doc.strokeColor("#e0e0e0").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // ============ QUESTIONS ============
    const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
    const pageWidth = doc.page.width - 100; // margins
    const contentWidth = pageWidth - 40; // indent

    for (let i = 0; i < processedQuestions.length; i++) {
      const q = processedQuestions[i];
      const qNum = i + 1;

      // Check if we need a new page (keep at least 100px for question)
      if (doc.y > doc.page.height - 150) {
        doc.addPage();
      }

      // Question number and metadata
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1a1a2e");
      doc.text(`Q${qNum}.`, { continued: true });
      doc.font("Helvetica").fontSize(11);
      doc.text(` ${q.question}`);

      // Subject/Topic tags
      doc.moveDown(0.3);
      doc.font("Helvetica-Oblique").fontSize(8).fillColor("#888888");
      const metaParts = [];
      if (q.subject) metaParts.push(q.subject);
      if (q.topic) metaParts.push(q.topic);
      if (q.subtopic && q.subtopic !== q.topic) metaParts.push(q.subtopic);
      if (q.difficulty) metaParts.push(`Difficulty: ${q.difficulty}`);
      if (q.year) metaParts.push(`Year: ${q.year}`);
      if (q.sourceExam) metaParts.push(`Source: ${q.sourceExam}`);
      if (metaParts.length > 0) {
        doc.text(metaParts.join(" | "), { indent: 20 });
      }

      doc.moveDown(0.5);

      // Options
      for (let j = 0; j < q.options.length; j++) {
        const option = q.options[j];
        if (!option || option.trim() === "") continue;

        doc.font("Helvetica").fontSize(10).fillColor("#333333");
        const optionText = `${OPTION_LABELS[j]}. ${option}`;
        drawTextWithWrap(doc, optionText, 70, doc.y, contentWidth - 20, { fontSize: 10, lineGap: 1 });
        doc.moveDown(0.2);
      }

      // Answer and explanation (if enabled)
      if (exportOptions.includeAnswers || exportOptions.includeExplanations) {
        doc.moveDown(0.3);
        if (exportOptions.includeAnswers) {
          doc.font("Helvetica-Bold").fontSize(10).fillColor("#27ae60");
          const answerIdx = q.options.findIndex((opt) => opt.trim() === q.correctAnswer.trim());
          const answerLabel = answerIdx >= 0 ? OPTION_LABELS[answerIdx] : q.correctAnswer;
          doc.text(`Answer: ${answerLabel}`, { indent: 20 });
        }

        if (exportOptions.includeExplanations && q.explanation && q.explanation.trim() !== "") {
          doc.moveDown(0.2);
          doc.font("Helvetica-Oblique").fontSize(9).fillColor("#2c3e50");
          doc.text("Explanation:", { indent: 20, continued: true });
          doc.font("Helvetica").fontSize(9);
          drawTextWithWrap(doc, q.explanation, 90, doc.y, contentWidth - 40, { fontSize: 9, lineGap: 1 });
        }
      }

      doc.moveDown(0.8);

      // Separator between questions
      if (i < processedQuestions.length - 1) {
        doc.strokeColor("#f0f0f0").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
      }
    }

    // ============ ANSWER KEY (if not inline) ============
    if (exportOptions.includeAnswers && !exportOptions.includeExplanations) {
      doc.addPage();
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#1a1a2e");
      doc.text("Answer Key", { align: "center", underline: true });
      doc.moveDown(1);

      doc.font("Helvetica").fontSize(10).fillColor("#333333");
      for (let i = 0; i < processedQuestions.length; i++) {
        const q = processedQuestions[i];
        const answerIdx = q.options.findIndex((opt) => opt.trim() === q.correctAnswer.trim());
        const answerLabel = answerIdx >= 0 ? OPTION_LABELS[answerIdx] : q.correctAnswer;
        doc.text(`Q${i + 1}: ${answerLabel}`, { indent: 20 });
        if ((i + 1) % 3 === 0) doc.moveDown(0.5);
      }
    }

    // Finalize PDF
    doc.end();
    const pdfBuffer = await pdfPromise;

    // Return PDF as download
    const res = new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${title.replace(/[^a-z0-9]/gi, "_")}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
        "X-Request-Id": requestId,
        "X-Response-Time": getTime() + "ms",
      },
    });
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}