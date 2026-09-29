"use client";

import { Fragment } from "react";
import { MathSpans } from "@/components/ui/MathText";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Highlights case-insensitive matches of `query` inside plain text. Math
 * spans ($...$ inline, $$...$$ display) are typeset by KaTeX; highlight
 * matches never split LaTeX. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (text.includes("$")) {
    if (!trimmed) return <MathSpans text={text} />;
    // Highlight only outside math spans so LaTeX commands stay intact.
    // Display ($$...$$) alternation comes first so it is never split into
    // stray "$" prose nodes around an inline span.
    const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
    return (
      <>
        {parts.map((part, i) =>
          /^(\$\$[\s\S]+\$\$|\$[^$]+\$)$/.test(part) ? (
            <MathSpans key={i} text={part} />
          ) : (
            <Fragment key={i}>
              {part.split(new RegExp(`(${escapeRegExp(trimmed)})`, "ig")).map((p, j) =>
                p.toLowerCase() === trimmed.toLowerCase() ? (
                  <mark key={j} className="bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] rounded-sm px-0.5">
                    {p}
                  </mark>
                ) : (
                  <span key={j}>{p}</span>
                ),
              )}
            </Fragment>
          ),
        )}
      </>
    );
  }
  if (!trimmed) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark key={i} className="bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const TOKEN_RE = /(\*\*\*.+?\*\*\*|\*\*.+?\*\*|\*[^*\n]+?\*)/g;

/**
 * Truncate to `max` chars WITHOUT ever splitting a `$...$` math span: an
 * unterminated `$` opens a span that would render as raw code, so the cut is
 * pulled back to the last `$`. Appends `…` when truncation happens.
 */
export function truncateMathSafe(text: string, max = 60): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  if (((cut.match(/\$/g) ?? []).length) % 2 === 1) {
    cut = cut.slice(0, cut.lastIndexOf("$"));
  }
  return cut.trimEnd() + "…";
}

/**
 * Renders question-bank text with inline **bold** / *italic* markers and
 * `$...$` LaTeX math (KaTeX, book-exact fractions/roots/scripts).
 *
 * Imported MCQs carry markdown-style emphasis (converted from the source
 * .docx bold/italic runs). Plain strings render unchanged; unmatched `*`
 * characters pass through literally. React escapes all text — no HTML
 * injection surface. Optional `query` highlights search matches.
 */
export default function RichText({
  text,
  query,
  className,
}: {
  text: string;
  query?: string;
  className?: string;
}) {
  const q = query ?? "";
  const tokens = text.split(TOKEN_RE);
  return (
    <span className={className}>
      {tokens.map((tok, i) => {
        if (tok.startsWith("***") && tok.endsWith("***") && tok.length > 6) {
          return (
            <Fragment key={i}>
              <strong><em><Highlighted text={tok.slice(3, -3)} query={q} /></em></strong>
            </Fragment>
          );
        }
        if (tok.startsWith("**") && tok.endsWith("**") && tok.length > 4) {
          return (
            <Fragment key={i}>
              <strong><Highlighted text={tok.slice(2, -2)} query={q} /></strong>
            </Fragment>
          );
        }
        if (tok.startsWith("*") && tok.endsWith("*") && tok.length > 2) {
          return (
            <Fragment key={i}>
              <em><Highlighted text={tok.slice(1, -1)} query={q} /></em>
            </Fragment>
          );
        }
        return (
          <Fragment key={i}>
            <Highlighted text={tok} query={q} />
          </Fragment>
        );
      })}
    </span>
  );
}
