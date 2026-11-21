// Client-side export helpers for the integrated Vocab note.
// TXT is plain text, DOCX uses the existing `docx` + `file-saver` deps,
// and the PDF button opens a print sheet (the browser writes the PDF).

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import type { Server } from "@/lib/types";

type VocabWord = Server.VocabWordDTO;

export function vocabNotesToText(words: VocabWord[], noteTexts?: Record<number, string>): string {
  return words
    .map((w) =>
      [
        w.word,
        `  Meaning: ${w.bengaliMeaning}`,
        `  Part of speech: ${w.partOfSpeech}`,
        `  Synonyms: ${(w.synonyms ?? []).join(", ") || "—"}`,
        `  Antonyms: ${(w.antonyms ?? []).join(", ") || "—"}`,
        `  Example: ${w.exampleSentence || "—"}`,
        w.mnemonic ? `  Mnemonic: ${w.mnemonic}` : null,
        noteTexts?.[w.id]?.trim() ? `  Note: ${noteTexts[w.id].trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function vocabNotesToHtml(words: VocabWord[], noteTexts?: Record<number, string>): string {
  const rows = words
    .map((w) => {
      const escape = (v: string) =>
        v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const field = (label: string, value: string) =>
        value ? `<p><b>${label}:</b> ${escape(value)}</p>` : "";
      return `<section style="margin-bottom:1.25rem;page-break-inside:avoid;">
        <h3 style="margin:0 0 .35rem">${escape(w.word)}</h3>
        ${field("Meaning", w.bengaliMeaning)}
        ${field("Part of speech", w.partOfSpeech)}
        ${field("Synonyms", (w.synonyms ?? []).join(", "))}
        ${field("Antonyms", (w.antonyms ?? []).join(", "))}
        ${field("Example", w.exampleSentence)}
        ${field("Mnemonic", w.mnemonic)}
        ${field("Note", noteTexts?.[w.id] ?? "")}
      </section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Vocab Notes</title>
    <style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;color:#111;line-height:1.5}
    h1{font-size:1.4rem}@media print{body{margin:0}}</style></head><body>
    <h1>Vocab Notes</h1><p style="color:#666;font-size:.85rem">9Th-Grade AI · ${words.length} words</p>${rows}</body></html>`;
}

/** Generate a real OOXML .docx study sheet (not an HTML file with a .doc name). */
export async function exportVocabNotesDocx(words: VocabWord[], noteTexts?: Record<number, string>): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({ text: "Vocab Notes", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: `9Th-Grade AI · ${words.length} words`, italics: true, size: 18 })],
    }),
    new Paragraph({ text: "" }),
  ];

  for (const w of words) {
    children.push(new Paragraph({ text: w.word, heading: HeadingLevel.HEADING_2 }));
    const lines = [
      `Meaning: ${w.bengaliMeaning}`,
      `Part of speech: ${w.partOfSpeech}`,
      `Synonyms: ${(w.synonyms ?? []).join(", ") || "—"}`,
      `Antonyms: ${(w.antonyms ?? []).join(", ") || "—"}`,
      `Example: ${w.exampleSentence || "—"}`,
    ];
    if (w.mnemonic) lines.push(`Mnemonic: ${w.mnemonic}`);
    if (noteTexts?.[w.id]?.trim()) lines.push(`Note: ${noteTexts[w.id].trim()}`);
    for (const line of lines) children.push(new Paragraph({ text: line }));
    children.push(new Paragraph({ text: "" }));
  }

  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  saveAs(blob, "vocab-notes.docx");
}
