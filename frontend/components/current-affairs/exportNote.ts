// Client-side export helpers for the daily current-affairs note.
// Markdown conversion (Notion/Obsidian) and DOCX generation
// (docx + file-saver). PDF is server-side — see
// /api/current-affairs/export.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import { saveAs } from "file-saver";

type TipTapNode = {
  type: string;
  attrs?: { level?: number; href?: string };
  marks?: Array<{ type: string }>;
  content?: TipTapNode[];
  text?: string;
};

/** Flatten a TipTap doc AST into { level?, text } blocks. */
export function docToBlocks(
  doc: unknown,
): Array<{ level?: number; text: string }> {
  const root = doc as TipTapNode | null;
  if (!root || root.type !== "doc" || !Array.isArray(root.content)) return [];

  const blocks: Array<{ level?: number; text: string }> = [];
  for (const node of root.content) {
    const text = nodeText(node);
    if (!text) continue;
    if (node.type === "heading") {
      blocks.push({ level: node.attrs?.level ?? 2, text });
    } else {
      blocks.push({ text });
    }
  }
  return blocks;
}

function nodeText(node: TipTapNode): string {
  if (node.text) return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(nodeText).join("");
}

/** TipTap doc → GitHub-flavored markdown. */
export function docToMarkdown(
  title: string,
  date: string,
  doc: unknown,
  citations: Array<{ publisher: string; articleTitle: string; sourceUrl: string }>,
  mcqs: Array<{
    question: string;
    options: string[];
    correctOption: number;
    explanation: string | null;
    relevantExam: string;
  }>,
): string {
  const lines: string[] = [`# ${title}`, ``, `_${date} · 9Th-Grade AI Daily Current Affairs_`, ``];

  for (const block of docToBlocks(doc)) {
    if (block.level === 1) lines.push(`# ${block.text}`, ``);
    else if (block.level === 2) lines.push(`## ${block.text}`, ``);
    else lines.push(block.text, ``);
  }

  if (citations.length > 0) {
    lines.push(`## Sources`, ``);
    citations.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.publisher} — "${c.articleTitle}" (${c.sourceUrl})`);
    });
    lines.push(``);
  }

  if (mcqs.length > 0) {
    lines.push(`## Practice MCQs`, ``);
    mcqs.forEach((m, i) => {
      lines.push(`${i + 1}. ${m.question} [${m.relevantExam}]`);
      m.options.forEach((o, j) => lines.push(`   ${String.fromCharCode(65 + j)}. ${o}`));
      lines.push(`   Answer: ${String.fromCharCode(65 + m.correctOption)}`);
      if (m.explanation) lines.push(`   ${m.explanation}`);
      lines.push(``);
    });
  }

  return lines.join("\n");
}

/** Copy markdown to the clipboard (Notion/Obsidian workflow). */
export async function copyMarkdownToClipboard(markdown: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(markdown);
    return true;
  } catch {
    // Clipboard API unavailable (permissions/non-secure context) —
    // fall back to the legacy execCommand path.
    try {
      const ta = document.createElement("textarea");
      ta.value = markdown;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Export the note as a .docx study sheet (docx + file-saver). */
export async function exportNoteDocx(
  title: string,
  date: string,
  doc: unknown,
  citations: Array<{ publisher: string; articleTitle: string; sourceUrl: string }>,
  mcqs: Array<{
    question: string;
    options: string[];
    correctOption: number;
    explanation: string | null;
    relevantExam: string;
  }>,
): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [new TextRun({ text: `${date} · 9Th-Grade AI — Daily Current Affairs`, italics: true, size: 16 })],
    }),
    new Paragraph({ text: "" }),
  ];

  for (const block of docToBlocks(doc)) {
    children.push(
      block.level === 1
        ? new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1 })
        : block.level === 2
          ? new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2 })
          : new Paragraph({ text: block.text }),
    );
  }

  if (citations.length > 0) {
    children.push(new Paragraph({ text: "Sources", heading: HeadingLevel.HEADING_2 }));
    citations.forEach((c, i) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${i + 1}. ${c.publisher} — "${c.articleTitle}" ` }),
            new TextRun({ text: c.sourceUrl, color: "10B981", underline: {} }),
          ],
        }),
      );
    });
  }

  if (mcqs.length > 0) {
    children.push(new Paragraph({ text: "Practice MCQs", heading: HeadingLevel.HEADING_2 }));
    mcqs.forEach((m, i) => {
      children.push(new Paragraph({ text: `${i + 1}. ${m.question} [${m.relevantExam}]` }));
      m.options.forEach((o, j) => {
        children.push(
          new Paragraph({
            text: `   ${String.fromCharCode(65 + j)}. ${o}`,
            indent: { left: 240 },
          }),
        );
      });
      if (m.explanation) {
        children.push(new Paragraph({ text: `   Answer: ${String.fromCharCode(65 + m.correctOption)} — ${m.explanation}` }));
      }
    });
  }

  const docxDoc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(docxDoc);
  saveAs(blob, `current-affairs-${date}.docx`);
}
