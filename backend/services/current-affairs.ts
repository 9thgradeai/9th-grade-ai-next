// Daily Current Affairs persistence + orchestration.
// Route handlers must delegate here — no business logic in app/.

import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "~backend/db";
import {
  generateDailyCurrentAffairs,
  type CurrentAffairsOutput,
} from "~backend/ai/current-affairs";

export type CurrentAffairsCitationDTO = {
  id: string;
  publisher: string;
  articleTitle: string;
  sourceUrl: string;
  publishedAt: string | null;
};

export type CurrentAffairsMcqDTO = {
  id: string;
  question: string;
  options: string[];
  correctOption: number;
  explanation: string | null;
  explanationBn: string | null;
  relevantExam: string;
};

export type CurrentAffairsNoteDTO = {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  title: string;
  summary: string | null;
  contentJson: Prisma.JsonValue;
  status: string;
  source: string;
  citations: CurrentAffairsCitationDTO[];
  mcqs: CurrentAffairsMcqDTO[];
};

export type CurrentAffairsLatestDTO = {
  note: CurrentAffairsNoteDTO | null;
  userNote: { customContentJson: Prisma.JsonValue; updatedAt: string } | null;
};

/** Normalize any timestamp to 00:00 UTC of its calendar day so the
 *  per-day @unique constraint on DailyCurrentAffairsNote.date holds. */
export function normalizeDay(input: Date | string): Date {
  const d = typeof input === "string" ? new Date(`${input}T00:00:00.000Z`) : new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function toDayString(day: Date): string {
  return day.toISOString().slice(0, 10);
}

// ── TipTap JSON AST conversion ──────────────────────────
// The agent returns structured sections/facts; the note editor
// (TipTap) needs a doc AST. Facts carry a 〔n〕 citation marker
// that maps to the citation drawer.
function toTipTapDoc(output: CurrentAffairsOutput): Prisma.JsonObject {
  const content: Prisma.JsonObject[] = [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: output.title }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: output.summary }],
    },
  ];

  for (const section of output.sections) {
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: section.heading }],
    });
    for (const fact of section.facts) {
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: `${fact.text} 〔${fact.citation}〕` }],
      });
    }
  }

  return { type: "doc", content };
}

export type PublishResult = { note: CurrentAffairsNoteDTO; generated: boolean };

// ── Publish (idempotent per day) ────────────────────────
/**
 * Generate and persist the daily note. Idempotent: if a note
 * already exists for the calendar day, it is returned untouched
 * with `generated: false`. Mutations never run when the agent is
 * unconfigured — the cron caller surfaces the error instead of
 * persisting synthetic data.
 */
export async function publishDailyNote(day: Date): Promise<PublishResult> {
  const normalized = normalizeDay(day);

  const existing = await prisma.dailyCurrentAffairsNote.findUnique({
    where: { date: normalized },
    select: { id: true },
  });
  if (existing) {
    return { note: await getNoteById(existing.id), generated: false };
  }

  const output = await generateDailyCurrentAffairs(normalized);
  const contentJson = toTipTapDoc(output);

  try {
    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.dailyCurrentAffairsNote.create({
        data: {
          date: normalized,
          title: output.title,
          summary: output.summary,
          contentJson,
          source: "agent",
        },
      });

      await tx.sourceCitation.createMany({
        data: output.citations.map((c) => ({
          dailyNoteId: created.id,
          publisher: c.publisher,
          articleTitle: c.articleTitle,
          sourceUrl: c.sourceUrl,
          publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
        })),
      });

      await tx.examMcq.createMany({
        data: output.mcqs.map((m) => ({
          dailyNoteId: created.id,
          question: m.question,
          options: m.options,
          correctOption: m.correctOption,
          explanation: m.explanation,
          explanationBn: m.explanationBn,
          relevantExam: m.relevantExam,
        })),
      });

      return created;
    });

    return { note: await getNoteById(note.id), generated: true };
  } catch (err) {
    // Concurrent cron runs race on the @unique date — treat as
    // already-published and serve the winner's note.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.dailyCurrentAffairsNote.findUnique({
        where: { date: normalized },
        select: { id: true },
      });
      if (winner) {
        return { note: await getNoteById(winner.id), generated: false };
      }
    }
    throw err;
  }
}

/** Fetch a full note (with citations + MCQs) by id. */
async function getNoteById(id: string): Promise<CurrentAffairsNoteDTO> {
  const note = await prisma.dailyCurrentAffairsNote.findUniqueOrThrow({
    where: { id },
    include: {
      citations: { orderBy: { createdAt: "asc" } },
      mcqs: { orderBy: { createdAt: "asc" } },
    },
  });
  return toNoteDTO(note);
}

// ── Read path ───────────────────────────────────────────
function toNoteDTO(
  note:
    | {
        id: string;
        date: Date;
        title: string;
        summary: string | null;
        contentJson: Prisma.JsonValue;
        status: string;
        source: string;
        citations: Array<{
          id: string;
          publisher: string;
          articleTitle: string;
          sourceUrl: string;
          publishedAt: Date | null;
        }>;
        mcqs: Array<{
          id: string;
          question: string;
          options: string[];
          correctOption: number;
          explanation: string | null;
          explanationBn: string | null;
          relevantExam: string;
        }>;
      },
): CurrentAffairsNoteDTO {
  return {
    id: note.id,
    date: toDayString(note.date),
    title: note.title,
    summary: note.summary,
    contentJson: note.contentJson,
    status: note.status,
    source: note.source,
    citations: note.citations.map((c) => ({
      id: c.id,
      publisher: c.publisher,
      articleTitle: c.articleTitle,
      sourceUrl: c.sourceUrl,
      publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
    })),
    mcqs: note.mcqs.map((m) => ({
      id: m.id,
      question: m.question,
      options: m.options,
      correctOption: m.correctOption,
      explanation: m.explanation,
      explanationBn: m.explanationBn,
      relevantExam: m.relevantExam,
    })),
  };
}

/**
 * Fetch the note for a day (default: today). Returns null when no
 * note exists yet. When a userId is supplied, their customized
 * version (if saved) is included.
 */
export async function getLatestNote(
  day: Date,
  userId?: string,
): Promise<CurrentAffairsLatestDTO> {
  const normalized = normalizeDay(day);

  const note = await prisma.dailyCurrentAffairsNote.findUnique({
    where: { date: normalized },
    include: {
      citations: { orderBy: { createdAt: "asc" } },
      mcqs: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!note) return { note: null, userNote: null };

  let userNote: CurrentAffairsLatestDTO["userNote"] = null;
  if (userId) {
    const saved = await prisma.userCustomizedNote.findUnique({
      where: { userId_dailyNoteId: { userId, dailyNoteId: note.id } },
    });
    if (saved) {
      userNote = {
        customContentJson: saved.customContentJson,
        updatedAt: saved.updatedAt.toISOString(),
      };
    }
  }

  return { note: toNoteDTO(note), userNote };
}

/** Most recent published note (for "latest" deep-links). */
export async function getMostRecentNote(
  userId?: string,
): Promise<CurrentAffairsLatestDTO> {
  const note = await prisma.dailyCurrentAffairsNote.findFirst({
    orderBy: { date: "desc" },
    include: {
      citations: { orderBy: { createdAt: "asc" } },
      mcqs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!note) return { note: null, userNote: null };

  let userNote: CurrentAffairsLatestDTO["userNote"] = null;
  if (userId) {
    const saved = await prisma.userCustomizedNote.findUnique({
      where: { userId_dailyNoteId: { userId, dailyNoteId: note.id } },
    });
    if (saved) {
      userNote = {
        customContentJson: saved.customContentJson,
        updatedAt: saved.updatedAt.toISOString(),
      };
    }
  }

  return { note: toNoteDTO(note), userNote };
}

// ── User customized notes ───────────────────────────────
export async function upsertUserNote(
  userId: string,
  dailyNoteId: string,
  customContentJson: Prisma.InputJsonValue,
): Promise<{ updatedAt: string }> {
  // Validate the note exists first — FK cascade would otherwise
  // silently succeed on any note id.
  const note = await prisma.dailyCurrentAffairsNote.findUnique({
    where: { id: dailyNoteId },
    select: { id: true },
  });
  if (!note) {
    throw new Error("DailyCurrentAffairsNote not found");
  }

  const saved = await prisma.userCustomizedNote.upsert({
    where: {
      userId_dailyNoteId: { userId, dailyNoteId },
    },
    create: { userId, dailyNoteId, customContentJson },
    update: { customContentJson },
  });

  return { updatedAt: saved.updatedAt.toISOString() };
}

// ── PDF export (server-side, pdfkit — already a dependency) ──
export function buildNoteMarkdown(note: CurrentAffairsNoteDTO): string {
  const lines: string[] = [
    `# ${note.title}`,
    ``,
    `_${note.date} · 9Th-Grade AI Daily Current Affairs_`,
    ``,
  ];
  if (note.summary) lines.push(note.summary, ``);

  const doc = note.contentJson as { content?: Array<{ type: string; attrs?: { level?: number }; content?: Array<{ text?: string }> }> };
  for (const block of doc.content ?? []) {
    if (block.type === "heading") {
      const level = block.attrs?.level === 1 ? "#" : "##";
      const text = block.content?.map((c) => c.text ?? "").join("") ?? "";
      lines.push(`${level} ${text}`, ``);
    } else if (block.type === "paragraph") {
      lines.push(block.content?.map((c) => c.text ?? "").join("") ?? "", ``);
    }
  }

  if (note.citations.length > 0) {
    lines.push(`## Sources`, ``);
    note.citations.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.publisher} — "${c.articleTitle}" (${c.sourceUrl})`);
    });
    lines.push(``);
  }

  if (note.mcqs.length > 0) {
    lines.push(`## Practice MCQs`, ``);
    note.mcqs.forEach((m, i) => {
      lines.push(`${i + 1}. ${m.question} [${m.relevantExam}]`);
      m.options.forEach((o, j) => lines.push(`   ${String.fromCharCode(65 + j)}. ${o}`));
      lines.push(`   Answer: ${String.fromCharCode(65 + m.correctOption)}`);
      if (m.explanation) lines.push(`   ${m.explanation}`);
      lines.push(``);
    });
  }

  return lines.join("\n");
}

/** Render the note as a printable study sheet (PDF buffer).
 *  Uses pdfkit — already a dependency — so no client-side
 *  html2pdf bundle ships to the browser. */
export async function buildNotePdf(note: CurrentAffairsNoteDTO): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];

  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  const primary = "#10b981"; // dashboard primary (emerald)
  doc.fontSize(20).fillColor(primary).text(note.title, { underline: false });
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor("#666").text(`${note.date} · 9Th-Grade AI — Daily Current Affairs`);
  doc.moveDown();

  if (note.summary) {
    doc.fontSize(11).fillColor("#111").text(note.summary);
    doc.moveDown();
  }

  const docJson = note.contentJson as { content?: Array<{ type: string; attrs?: { level?: number }; content?: Array<{ text?: string }> }> };
  for (const block of docJson.content ?? []) {
    const text = block.content?.map((c) => c.text ?? "").join("") ?? "";
    if (!text) continue;
    if (block.type === "heading") {
      doc.moveDown(0.6);
      doc.fontSize(block.attrs?.level === 1 ? 15 : 12.5).fillColor("#0f172a").text(text);
      doc.moveDown(0.2);
    } else {
      doc.fontSize(10.5).fillColor("#1f2937").text(text, { align: "justify" });
    }
  }

  if (note.citations.length > 0) {
    doc.addPage();
    doc.fontSize(13).fillColor("#0f172a").text("Sources", { underline: true });
    doc.moveDown(0.3);
    note.citations.forEach((c, i) => {
      doc.fontSize(10).fillColor("#1f2937").text(`${i + 1}. ${c.publisher} — "${c.articleTitle}"`, { continued: true });
      doc.fillColor(primary).text(` ${c.sourceUrl}`);
      doc.moveDown(0.2);
    });
  }

  if (note.mcqs.length > 0) {
    doc.addPage();
    doc.fontSize(13).fillColor("#0f172a").text("Practice MCQs", { underline: true });
    doc.moveDown(0.3);
    note.mcqs.forEach((m, i) => {
      doc.fontSize(10.5).fillColor("#111").text(`${i + 1}. ${m.question}  [${m.relevantExam}]`);
      m.options.forEach((o, j) => {
        doc.fontSize(10).fillColor("#374151").text(`   ${String.fromCharCode(65 + j)}. ${o}`, { indent: 12 });
      });
      doc.moveDown(0.2);
    });
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
