"use client";

import { Fragment, useMemo } from "react";
import katex from "katex";

function renderLatex(latex: string, key: number) {
  try {
    const html = katex.renderToString(latex, {
      throwOnError: false,
      strict: false,
      trust: false,
      output: "html",
    });
    return (
      <span
        key={key}
        className="math-inline"
        // KaTeX output is generated from our own LaTeX (escaping is done at
        // import time); trust:false keeps it to safe HTML-only output.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <Fragment key={key}>{`$${latex}$`}</Fragment>;
  }
}

/**
 * Renders plain text with inline `$...$` LaTeX spans typeset by KaTeX.
 *
 * Plain segments (no `$`) render byte-identical to the input string — React
 * escapes them, so there is no HTML injection surface. Malformed LaTeX falls
 * back to raw text via `throwOnError: false`.
 */
export function MathSpans({ text }: { text: string }) {
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    const re = /\$[^$]+\$/g;
    let last = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
      out.push(renderLatex(m[0].slice(1, -1), key++));
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
    return out;
  }, [text]);
  return <>{nodes}</>;
}

/**
 * Drop-in math-aware text renderer for question-bank content.
 * Use wherever question / option / explanation strings are displayed.
 */
export default function MathText({ text, className }: { text: string; className?: string }) {
  if (!text.includes("$")) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      <MathSpans text={text} />
    </span>
  );
}
