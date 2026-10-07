"use client";

import { Fragment, useEffect, useMemo } from "react";
import katex from "katex";

const KATEX_CSS_HREF = "/vendor/katex.min.css";

let katexCssRequested = false;

/**
 * Loads KaTeX's stylesheet on first math render only. Previously it was a
 * global `@import` in globals.css — ~25KB render-blocking on every page
 * including the landing, which renders zero math (mobile Lighthouse tax).
 */
export function ensureKatexCss() {
  if (katexCssRequested || typeof document === "undefined") return;
  katexCssRequested = true;
  if (document.querySelector('link[data-katex-css]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = KATEX_CSS_HREF;
  link.dataset.katexCss = "true";
  document.head.appendChild(link);
}

export type MathError = { latex: string; message: string };

function renderLatex(latex: string, key: number, display: boolean, onError?: (e: MathError) => void) {
  try {
    const html = katex.renderToString(latex, {
      throwOnError: false,
      strict: false,
      trust: false,
      output: "html",
      displayMode: display,
    });
    // KaTeX with throwOnError:false renders errors as .katex-error spans.
    // Surface them for production diagnostics without breaking the user.
    const hasError = html.includes("katex-error");
    if (hasError && typeof window !== "undefined") {
      const msg = `KaTeX fallback for: ${latex.slice(0, 80)}`;
      if (process.env.NODE_ENV === "development") console.warn(`[MathText] ${msg}`);
      onError?.({ latex, message: msg });
    }
    return (
      <span
        key={key}
        className={display ? "math-display" : "math-inline"}
        data-math-error={hasError ? "true" : undefined}
        // KaTeX output is generated from our own canonical LaTeX
        // (escaping is done at ingestion time); trust:false keeps it to
        // safe HTML-only output. Prose itself is never innerHTML — React
        // escapes it.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    if (process.env.NODE_ENV === "development") console.warn(`[MathText] KaTeX threw for: ${latex.slice(0, 80)}`);
    onError?.({ latex, message: "katex-throw" });
    return <Fragment key={key}>{display ? `$$${latex}$$` : `$${latex}$`}</Fragment>;
  }
}

/**
 * Renders plain text with `$...$` inline and `$$...$$` display LaTeX spans
 * typeset by KaTeX (shared renderer — ALL question surfaces use this via
 * RichText → MathSpans → KaTeX; no page implements its own math parsing).
 *
 * Plain segments (no `$`) render byte-identical to the input string — React
 * escapes them, so there is no HTML injection surface. Malformed LaTeX falls
 * back to raw text via `throwOnError: false` and is flagged with
 * `data-math-error="true"` for production diagnostics.
 */
export function MathSpans({ text, onError }: { text: string; onError?: (e: MathError) => void }) {
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    // Display first, then inline. Unclosed trailing $ passes through as prose.
    const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    let last = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
      if (m[1] !== undefined) out.push(renderLatex(m[1], key++, true, onError));
      else out.push(renderLatex(m[2], key++, false, onError));
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
    return out;
    // onError is intentionally excluded: must stay referentially stable or
    // be omitted; re-renders are driven by text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return <>{nodes}</>;
}

/**
 * Drop-in math-aware text renderer for question-bank content.
 * Use wherever question / option / explanation strings are displayed.
 */
export default function MathText({
  text,
  className,
  onError,
}: {
  text: string;
  className?: string;
  onError?: (e: MathError) => void;
}) {
  useEffect(() => {
    if (text.includes("$")) ensureKatexCss();
  }, [text]);
  if (!text.includes("$")) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      <MathSpans text={text} onError={onError} />
    </span>
  );
}
