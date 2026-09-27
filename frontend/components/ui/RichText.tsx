"use client";

import { Fragment } from "react";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Highlights case-insensitive matches of `query` inside plain text. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
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
 * Renders question-bank text with inline **bold** / *italic* markers.
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
