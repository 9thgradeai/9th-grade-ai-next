"use client";

// Lightweight, dependency-free Markdown renderer for AI responses.
//
// Renders the subset of Markdown the AI models emit — bold, italic, inline
// code, fenced code blocks, ATX headings, bullet/numbered lists, blockquotes,
// links and horizontal rules — while aggressively cleaning the decorative
// asterisk noise (stray `**`, `****` separators, empty emphasis) that makes
// raw responses look broken.

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

type Block =
  | { type: "paragraph"; content: string }
  | { type: "heading"; level: number; content: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; content: string }
  | { type: "code"; lang: string; code: string }
  | { type: "hr" };

// Lines that are only stray decoration (1–2 stars/dashes/underscores).
const JUNK_LINE = /^\s*[*_\-]{1,2}\s*$/;
// Standard thematic break (3+ stars/dashes/underscores).
const HR_LINE = /^\s*[*_\-]{3,}\s*$/;
const FENCE = /^```([\w-]*)\s*$/;
const HEADING = /^(#{1,4})\s+(.+)$/;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^\s*[-*]\s+(.+)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.+)$/;

function cleanInline(raw: string): string {
  // Remove empty emphasis like `** **`, `* *`, `**  **`.
  return raw.replace(/(^|[\s,.;:()])[*]{1,2}\s+[*]{1,2}(?=[\s,.;:()]|$)/g, "$1 ");
}

function tokenize(text: string): Block[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""));

  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }
    if (JUNK_LINE.test(line)) {
      i++;
      continue;
    }
    if (HR_LINE.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const lang = fence[1];
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: "code", lang, code: code.join("\n") });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, content: heading[2] });
      i++;
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      const quoted: string[] = [quote[1]];
      i++;
      while (i < lines.length) {
        const q = lines[i].match(QUOTE);
        if (!q) break;
        quoted.push(q[1]);
        i++;
      }
      blocks.push({ type: "quote", content: quoted.join(" ") });
      continue;
    }

    const bullet = line.match(BULLET);
    if (bullet) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(BULLET);
        if (!m) break;
        items.push(m[1]);
        i++;
        while (
          i < lines.length &&
          lines[i].trim() &&
          !BULLET.test(lines[i]) &&
          !NUMBERED.test(lines[i]) &&
          !HEADING.test(lines[i]) &&
          !FENCE.test(lines[i]) &&
          !QUOTE.test(lines[i])
        ) {
          items[items.length - 1] += " " + lines[i].trim();
          i++;
        }
      }
      blocks.push({ type: "ul", items: items.map(cleanInline) });
      continue;
    }

    const numbered = line.match(NUMBERED);
    if (numbered) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(NUMBERED);
        if (!m) break;
        items.push(m[1]);
        i++;
        while (
          i < lines.length &&
          lines[i].trim() &&
          !BULLET.test(lines[i]) &&
          !NUMBERED.test(lines[i]) &&
          !HEADING.test(lines[i]) &&
          !FENCE.test(lines[i]) &&
          !QUOTE.test(lines[i])
        ) {
          items[items.length - 1] += " " + lines[i].trim();
          i++;
        }
      }
      blocks.push({ type: "ol", items: items.map(cleanInline) });
      continue;
    }

    // Paragraph — gather consecutive non-empty, non-block lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !JUNK_LINE.test(lines[i]) &&
      !HR_LINE.test(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", content: cleanInline(para.join("\n")) });
  }

  return blocks;
}

function findRun(text: string, from: number, ch: string, run: number): number {
  for (let j = from; j <= text.length - run; j++) {
    if (
      text[j] === ch &&
      text.slice(j, j + run) === ch.repeat(run) &&
      (j + run >= text.length || text[j + run] !== ch)
    ) {
      return j;
    }
  }
  return -1;
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const buf: string[] = [];
  let i = 0;
  let token = 0;

  const flush = () => {
    if (buf.length > 0) {
      nodes.push(<Fragment key={`${keyBase}-t${token++}`}>{buf.join("")}</Fragment>);
      buf.length = 0;
    }
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\" && i + 1 < text.length) {
      buf.push(text[i + 1]);
      i += 2;
      continue;
    }

    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        nodes.push(
          <code
            key={`${keyBase}-c${token++}`}
            className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[0.85em] text-emerald-300"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }

    if (ch === "[") {
      const close = text.indexOf("](", i + 1);
      if (close !== -1) {
        const paren = text.indexOf(")", close + 2);
        const url = paren !== -1 ? text.slice(close + 2, paren) : "";
        if (paren !== -1 && url.length > 0 && !/\s/.test(url)) {
          flush();
          nodes.push(
            <a
              key={`${keyBase}-a${token++}`}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-emerald-400 underline decoration-emerald-500/40 underline-offset-2"
            >
              {renderInline(text.slice(i + 1, close), `${keyBase}-l${token}`)}
            </a>,
          );
          i = paren + 1;
          continue;
        }
      }
    }

    if (ch === "*") {
      let run = 0;
      while (text[i + run] === "*") run++;
      if (run >= 1 && run <= 3) {
        const close = findRun(text, i + run, "*", run);
        if (close !== -1) {
          const inner = text.slice(i + run, close);
          flush();
          const content = renderInline(inner, `${keyBase}-e${token}`);
          const key = `${keyBase}-e${token++}`;
          if (run === 3) nodes.push(<strong key={key}><em>{content}</em></strong>);
          else if (run === 2) nodes.push(<strong key={key}>{content}</strong>);
          else nodes.push(<em key={key}>{content}</em>);
          i = close + run;
          continue;
        }
      }
    }

    if (ch === "_") {
      let run = 0;
      while (text[i + run] === "_") run++;
      if (run >= 1 && run <= 2) {
        const close = findRun(text, i + run, "_", run);
        if (close !== -1) {
          const inner = text.slice(i + run, close);
          flush();
          const content = renderInline(inner, `${keyBase}-u${token}`);
          const key = `${keyBase}-u${token++}`;
          if (run === 2) nodes.push(<strong key={key}>{content}</strong>);
          else nodes.push(<em key={key}>{content}</em>);
          i = close + run;
          continue;
        }
      }
    }

    if (ch === "~") {
      const end = text.indexOf("~~", i + 2);
      if (end !== -1) {
        flush();
        nodes.push(<del key={`${keyBase}-s${token++}`}>{renderInline(text.slice(i + 2, end), `${keyBase}-d${token}`)}</del>);
        i = end + 2;
        continue;
      }
    }

    buf.push(ch);
    i++;
  }

  flush();
  return nodes;
}

const HEADING_CLASS: Record<number, string> = {
  1: "mt-4 mb-2 text-[15px] font-bold text-zinc-100",
  2: "mt-4 mb-2 text-[15px] font-bold text-zinc-100",
  3: "mt-3 mb-1.5 text-sm font-semibold text-zinc-100",
  4: "mt-3 mb-1.5 text-sm font-semibold text-zinc-100",
};

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[#26304a] bg-[#0b1020]">
      <div className="flex items-center justify-between border-b border-[#26304a] bg-[#0d1424] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#7a8aa8]">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-[#7a8aa8] transition-colors hover:text-emerald-300"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed text-[#e6edf7]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case "paragraph":
      return (
        <p key={index} className="my-1.5 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
          {renderInline(block.content, `p${index}`)}
        </p>
      );
    case "heading":
      return (
        <p key={index} className={HEADING_CLASS[block.level]}>
          {renderInline(block.content, `h${index}`)}
        </p>
      );
    case "ul":
      return (
        <ul key={index} className="my-2 space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} className="relative pl-1">
              <span className="absolute -left-4 top-0 h-1.5 w-1.5 rounded-full bg-emerald-500/70" aria-hidden="true" />
              {renderInline(item, `u${index}-${itemIndex}`)}
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={index} className="my-2 space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} className="list-decimal pl-1 marker:text-emerald-500/80">
              {renderInline(item, `o${index}-${itemIndex}`)}
            </li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote key={index} className="my-2 border-l-2 border-emerald-500/40 pl-3 text-sm leading-relaxed text-zinc-400 italic">
          {renderInline(block.content, `q${index}`)}
        </blockquote>
      );
    case "code":
      return <CodeBlock key={index} lang={block.lang} code={block.code} />;
    case "hr":
      return <hr key={index} className="my-3 border-zinc-700/60" />;
    default:
      return null;
  }
}

export default function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = useMemo(() => tokenize(text), [text]);
  return <div className={className}>{blocks.map(renderBlock)}</div>;
}