/* Server-side KaTeX rendering for print/PDF surfaces.
 *
 * The exam PDF is produced by Chromium `setContent` on an about:blank page,
 * so external stylesheets and relative font URLs can never load. This module
 * renders `$...$` / `$$...$$` spans to KaTeX HTML exactly like the browser
 * renderer (frontend MathText) and inlines katex.min.css with every woff2
 * font embedded as a data URI — the output is fully self-contained. */
import "server-only";
import fs from "fs";
import path from "path";
import katex from "katex";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Same span shape as MathSpans (MathText.tsx): `$$…$$` first, then `$…$`. */
const MATH_SPAN_AT = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/y;

function renderSpan(raw: string): string {
  const display = raw.startsWith("$$");
  const tex = display ? raw.slice(2, -2) : raw.slice(1, -1);
  if (!tex.trim()) return escapeHtml(raw);
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      output: "html",
    });
  } catch {
    return escapeHtml(raw);
  }
}

/**
 * Escape prose and typeset math spans. Never throws: unparseable TeX falls
 * back to escaped literal text (same degradation as the browser renderer).
 */
export function renderMathHtml(raw: string): string {
  if (!raw || !raw.includes("$")) return escapeHtml(raw);
  let out = "";
  let buf = "";
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "$") {
      MATH_SPAN_AT.lastIndex = i;
      const m = MATH_SPAN_AT.exec(raw);
      if (m) {
        out += escapeHtml(buf);
        buf = "";
        out += renderSpan(m[0]);
        i = MATH_SPAN_AT.lastIndex - 1;
        continue;
      }
    }
    buf += raw[i];
  }
  return out + escapeHtml(buf);
}

let _katexCss: string | null = null;

/**
 * katex.min.css made self-contained: every `url(fonts/*.woff2)` is replaced
 * by a base64 data URI and the woff/ttf fallback sources are stripped
 * (Chromium on about:blank cannot fetch relative fonts). Cached per process.
 */
export function katexInlineCss(): string {
  if (_katexCss) return _katexCss;
  const cssPath = path.join(
    process.cwd(),
    "node_modules",
    "katex",
    "dist",
    "katex.min.css",
  );
  const fontsDir = path.join(path.dirname(cssPath), "fonts");
  let css = fs.readFileSync(cssPath, "utf8");
  css = css.replace(/url\(fonts\/([A-Za-z0-9_-]+\.woff2)\)/g, (_all, file) => {
    const b64 = fs.readFileSync(path.join(fontsDir, file)).toString("base64");
    return `url(data:font/woff2;base64,${b64})`;
  });
  // Drop unreachable woff/ttf fallbacks (format list already has woff2 first).
  css = css.replace(
    /,\s*url\(fonts\/[A-Za-z0-9_-]+\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g,
    "",
  );
  _katexCss = css;
  return _katexCss;
}
