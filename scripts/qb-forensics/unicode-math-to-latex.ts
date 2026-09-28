/**
 * scripts/qb-forensics/unicode-math-to-latex.ts
 * ----------------------------------------------------------------------------
 * Migrates legacy linearized math (Unicode superscripts/subscripts, √(...),
 * (num)/(den), caret-powers, log-subscripts) to inline LaTeX ($...$) so the
 * KaTeX renderer can typeset book-exact fractions / roots / scripts.
 *
 * Pure + idempotent: segments already inside $...$ are left untouched, and
 * plain Bengali/English prose without a math trigger passes through byte-
 * identical (NFC-normalized). Only the math span itself is wrapped — the
 * surrounding sentence stays raw text.
 * ----------------------------------------------------------------------------
 */

// Superscript Unicode → ASCII source.
const SUP_MAP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-", "⁽": "(", "⁾": ")",
  "ˣ": "x", "ⁿ": "n", "ᵐ": "m", "ⁱ": "i", "ᵃ": "a",
  "ᵇ": "b", "ᶜ": "c", "ᵈ": "d", "ᵉ": "e", "ᶠ": "f",
  "ᵍ": "g", "ʰ": "h", "ʲ": "j", "ᵏ": "k", "ˡ": "l",
  "ᵒ": "o", "ᵖ": "p", "ʳ": "r", "ˢ": "s", "ᵗ": "t",
  "ᵘ": "u", "ᵛ": "v", "ʷ": "w", "ʸ": "y", "ᶻ": "z",
  "₊": "+", "₋": "-", "₍": "(", "₎": ")",
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "ₐ": "a", "ₑ": "e", "ₓ": "x", "ₙ": "n", "ₒ": "o",
  "ᵣ": "r", "ᵤ": "u", "ₖ": "k", "ₗ": "l", "ₘ": "m",
  "ₚ": "p", "ₛ": "s", "ₜ": "t", "ₕ": "h", "ⱼ": "j",
  "⁄": "/", "／": "/",
  // U+141F CANADIAN SYLLABICS FINAL ACUTE — used as "/" in "2¹ᐟ²" style
  // vulgar-fraction runs in the Bank Indices docx body text.
  "ᐟ": "/",
};
// U+207A–207F leftovers that SUP_MAP misses (e.g. U+207F ⁿ is covered above,
// but be exhaustive for the superscript block + common modifier letters).
const SUP_EXTRA: Record<string, string> = {
  "⁎": "*", "‧": ".", "⋅": "\\cdot ",
};
const SUB_MAP: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "₊": "+", "₋": "-", "₍": "(", "₎": ")",
  "ₐ": "a", "ₑ": "e", "ₓ": "x", "ₙ": "n", "ₒ": "o",
  "ᵢ": "i", "ᵣ": "r", "ᵤ": "u", "ₖ": "k", "ₗ": "l",
  "ₘ": "m", "ₚ": "p", "ₛ": "s", "ₜ": "t", "ₕ": "h",
  "ⱼ": "j",
};

const SUP_CHARS = Object.keys({ ...SUP_MAP, ...SUP_EXTRA }).join("");
const SUB_CHARS = Object.keys(SUB_MAP).join("");
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

// Escape for character classes.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

/** Split out existing $...$ spans so migration never double-wraps. */
function splitLatex(s: string): { latex: boolean; text: string }[] {
  const parts: { latex: boolean; text: string }[] = [];
  const re = /\$[^$]*\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push({ latex: false, text: s.slice(last, m.index) });
    parts.push({ latex: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ latex: false, text: s.slice(last) });
  return parts;
}

/** Minimal LaTeX escaping for raw (non-math-command) text inside $...$. */
function latexEscapeRaw(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash ")
    .replace(/([%&#_{}])/g, "\\$1")
    .replace(/\*/g, "\\times ")
    .replace(/×/g, "\\times ");
}

function supToAscii(run: string): string {
  return [...run].map((c) => SUP_MAP[c] ?? SUP_EXTRA[c] ?? c).join("");
}

function subToAscii(run: string): string {
  return [...run].map((c) => SUB_MAP[c] ?? c).join("");
}

/**
 * Convert raw Unicode math runs to BARE LaTeX fragments (no $...$ wrapper)
 * for use INSIDE a span that is already being built — e.g. the base of
 * "(xᵃ/xᵇ)ᵃ⁺ᵇ" becomes "(x^{a}/x^{b})". Iterates to a fixpoint (nested
 * runs); each iteration strictly consumes script glyphs so it terminates.
 * Real LaTeX (^{}, _{}, \commands) contains no raw script glyphs and passes
 * through untouched — making this safe to run on existing $...$ spans to
 * thaw previously frozen runs.
 */
export function convertInnerBare(s: string): string {
  let out = s;
  for (let iter = 0; iter < 5; iter++) {
    const before = out;
    // log with raw subscript → \log_{s} (bare; caller adds $ as needed).
    out = out.replace(
      new RegExp(`log([${esc(SUB_CHARS)}]{1,4})([0-9a-zA-Z${BN_DIGITS}]+)`, "g"),
      (_m, sub, rest) => `\\log_{${subToAscii(sub)}}{${rest}}`,
    );
    // √(body) / √X → \sqrt{...} (bare).
    out = out.replace(/√\(([^)$]{1,120})\)/g, (_m, b) => `\\sqrt{${b.trim()}}`);
    out = out.replace(/√([0-90-9a-zA-Z০-৯]{1,12})/g, (_m, b) => `\\sqrt{${b}}`);
    // Base + superscript run → base^{sup} (bare). Guard is intentionally
    // looser than the prose pass: this runs on paren-group bases already
    // bound to math (or inside $...$ spans), where footnote protection
    // would freeze legitimate runs like the ᵃ in "(xᵃ/xᵇ)ᵃ⁺ᵇ".
    out = out.replace(
      new RegExp(`(\\([^()$]{1,60}\\)|[0-9a-zA-Z${BN_DIGITS}\\]।]+)([${esc(SUP_CHARS)}]{1,12})`, "g"),
      (m, base, run) => {
        if ([...run].every((c) => c in SUB_MAP)) return m;
        return `${base}^{${supToAscii(run)}}`;
      },
    );
    // Base + subscript run → base_{sub} (bare), with upright \log.
    // Same loose guard as above: math context, not prose.
    out = out.replace(
      new RegExp(`([a-zA-Z${BN_DIGITS}]+)([${esc(SUB_CHARS)}]{1,6})`, "g"),
      (m, base, run, offset, full) => {
        const before = full.slice(Math.max(0, offset - 1), offset);
        if (before === "{") return m;
        const b = /^[Ll]og$/.test(base) ? `\\${base}` : base;
        return `${b}_{${subToAscii(run)}}`;
      },
    );
    // Dangling ")ˣ" inside spans → bare )^{x} (caller fuses $$ pairs).
    out = out.replace(
      new RegExp(`(\\))([${esc(SUP_CHARS)}]{1,6})`, "g"),
      (m, b, r) => {
        if ([...r].every((c) => c in SUB_MAP)) return m;
        return `${b}^{${supToAscii(r)}}`;
      },
    );
    if (out === before) break;
  }
  return out;
}

function convertSegment(seg: string): string {
  let out = seg;

  // 0. log with Unicode subscript FIRST (before the sup pass, which would
  // otherwise claim the subscript glyphs as nested superscripts):
  // log₃81 → $\log_{3}{81}$
  const subCls = esc(SUB_CHARS);
  const logRe = new RegExp(`log([${subCls}]{1,4})([0-9a-zA-Z${BN_DIGITS}]+)`, "g");

  out = out.replace(logRe, (_m, sub, rest) => `$\\log_{${latexEscapeRaw(subToAscii(sub))}}{${latexEscapeRaw(rest)}}$`);

  // 1. (num)/(den) explicit fractions → \frac{num}{den}
  out = out.replace(/\(([^()$]{1,60})\)\/\(([^()$]{1,60})\)/g, (_m, n, d) => {
    if (/^\s*$/.test(n) || /^\s*$/.test(d)) return _m;
    return `$\\frac{${latexEscapeRaw(n.trim())}}{${latexEscapeRaw(d.trim())}}$`;
  });

  // 2. Radicals: √(body) / √X → \sqrt{...}
  out = out.replace(/√\(([^)$]{1,120})\)/g, (_m, b) => `$\\sqrt{${latexEscapeRaw(b.trim())}}$`);
  out = out.replace(/√([0-90-9a-zA-Z০-৯]{1,12})/g, (_m, b) => `$\\sqrt{${latexEscapeRaw(b)}}$`);

  // 3. Base + superscript-run → $base^{sup}$ (e.g. 2ˣ⁺¹, ৫², arⁿ⁻¹, 7ᶠ).
  // A balanced "(...)" group binds as one base so "(a+b)²" → "$(a+b)^{2}$".
  const supRe = new RegExp(
    `(\\([^()$]{1,60}\\)|[0-9a-zA-Z${BN_DIGITS}\\]।]+)([${esc(SUP_CHARS)}]{1,12})`,
    "g",
  );
  out = out.replace(supRe, (m, base, run) => {
    // Runs made ONLY of subscript-block glyphs belong to the sub pass
    // (step 0 already handled log₃; e.g. x₁ must not become x^{1}).
    if ([...run].every((c) => c in SUB_MAP)) return m;
    const ascii = supToAscii(run);
    // Avoid mangling footnote-like prose: require the run to contain a
    // digit, sign/paren, or be a lone known variable script (ˣ ⁿ) — or a
    // lone letter on a numeric/paren base (2ᵃ → $2^{a}$; "reportᵃ" stays).
    const loneLetterOnNumeric = /^[a-zA-Z]$/.test(ascii) && /[0-9)\]}।]$/.test(base);
    if (!/[0-9+\-()]/.test(ascii) && !/^[xn]$/.test(ascii) && !loneLetterOnNumeric) return m;
    // Thaw nested runs inside paren-group bases: (xᵃ/xᵇ)² → $(x^{a}/x^{b})^{2}$.
    const inner = convertInnerBare(latexEscapeRaw(base));
    return `$${inner}^{${latexEscapeRaw(ascii)}}$`;
  });

  // 3b. Dangling ")ˣ" AFTER the group rule (a frozen split like
  // "(x $\sqrt{x}$)ˣ"): wrap the paren so the step-7 $$-merge fuses it
  // with the preceding span. Runs after step 3 so "(a+b)²" still binds
  // the whole group as one base.
  out = out.replace(new RegExp(`(\\))([${esc(SUP_CHARS)}]{1,6})`, "g"), (m, b, r) => {
    if ([...r].every((c) => c in SUB_MAP)) return m;
    return `$${b}^{${supToAscii(r)}}$`;
  });

  // 4. Base + subscript-run → $base_{sub}$ (e.g. log₃81 handled below, x₁)
  const subRe = new RegExp(`([a-zA-Z${BN_DIGITS}]+)([${esc(SUB_CHARS)}]{1,6})`, "g");
  out = out.replace(subRe, (m, base, run, offset, full) => {
    // Skip if this subscript run is already inside a freshly minted $...$
    // (sup pass) — splitLatex runs once upfront, so check the local context.
    const before = full.slice(Math.max(0, offset - 1), offset);
    if (before === "{") return m;
    if (!/[0-9+\-()]/.test(subToAscii(run)) && !/^[xn]$/.test(subToAscii(run))) return m;
    // Upright log: $log_{3}$ would typeset l·o·g as variables.
    const rawBase = latexEscapeRaw(base);
    const baseLatex = /^[Ll]og$/.test(base) ? `\\${base}` : convertInnerBare(rawBase);
    return `$${baseLatex}_{${latexEscapeRaw(subToAscii(run))}}$`;
  });

  // 5. Fallback: log<sub>X when the subscript pass split it (rare — step 0
  // handles the common raw form). Matches only RAW subscript glyphs.
  out = out.replace(logRe, (_m, sub, rest) => `$\\log_{${latexEscapeRaw(subToAscii(sub))}}{${latexEscapeRaw(rest)}}$`);

  // 6. Caret powers: X^(exp) / X^n → $X^{...}$ (attached to the base;
  // a balanced "(...)" group binds as one base).
  out = out.replace(/(\([^()$]{1,60}\)|\S)\^\(\s*([^)$]{1,40})\s*\)/g, (_m, b, e) => `$${latexEscapeRaw(b)}^{${latexEscapeRaw(e.trim())}}$`);
  out = out.replace(/(\([^()$]{1,60}\)|\S)\^([0-9a-zA-Z০-৯])/g, (_m, b, e) => `$${latexEscapeRaw(b)}^{${latexEscapeRaw(e)}}$`);

  // 7. Merge adjacent $..$$..$ spans created above (e.g. base^{s}$$\log..).
  // NOTE: thawing in unicodeMathToLatex() can create NEW $$ pairs across
  // segment boundaries — it re-applies the same merges on the joined string.
  out = out.replace(/\$\$/g, "");
  // Merge "$a$_{b}$" style splits from passes 3+4 into "$a_{b}$".
  out = out.replace(/\$([^$]{1,60})\$\s*(_\^|\^_|_|\^)\s*\$([^$]{1,60})\$/g, "$\\1$2{$3}$");
  return out;
}

export function mergeAdjacentSpans(s: string): string {
  let out = s.replace(/\$\$/g, "");
  out = out.replace(/\$([^$]{1,60})\$\s*(_\^|\^_|_|\^)\s*\$([^$]{1,60})\$/g, "$\\1$2{$3}$");
  return out;
}

/**
 * Convert one free-text field (question / option / explanation) to LaTeX-
 * augmented text. Idempotent: running twice yields the same string.
 */
export function unicodeMathToLatex(input: string): string {
  if (!input || !input.includes) return input;
  const norm = input.normalize("NFC");
  // Fast path: no math trigger at all.
  if (
    !new RegExp(`[${esc(SUP_CHARS)}${esc(SUB_CHARS)}√^]`).test(norm) &&
    !/\(.+\)\/\(.+\)/.test(norm) &&
    !/log/.test(norm)
  ) {
    return norm;
  }
  const joined = splitLatex(norm)
    .map((p) => {
      if (p.latex) {
        // Thaw frozen runs inside existing spans (e.g. legacy
        // "$(xᵃ/xᵇ)^{a+b}$" → "$(x^{a}/x^{b})^{a+b}$"). Real LaTeX has no
        // raw script glyphs, so well-formed spans pass through untouched.
        const m = p.text.match(/^\$([^$]*)\$$/);
        if (m) return `$${convertInnerBare(m[1])}$`;
        return p.text;
      }
      return convertSegment(p.text);
    })
    .join("");
  // Fuse $$ pairs created across segment boundaries by thawing/wrapping.
  return mergeAdjacentSpans(joined);
}

/** Convert all MCQ text fields of a record. */
export function migrateRecordToLatex<T extends { question: string; options: string[]; explanation: string }>(
  rec: T,
): T {
  return {
    ...rec,
    question: unicodeMathToLatex(rec.question),
    options: rec.options.map(unicodeMathToLatex),
    explanation: unicodeMathToLatex(rec.explanation),
  };
}

// Fold every script glyph to ASCII for matching (superset of the migration:
// lone runs the migrator guards-skip, like logₐ, still fold here).
const SCRIPT_FOLD: Record<string, string> = { ...SUP_MAP, ...SUP_EXTRA, ...SUB_MAP };

/**
 * LaTeX-insensitive content identity for a free-text field. Two strings
 * produced from the SAME source by different pipeline generations
 * ("$(xᵃ/xᵇ)^{a+b}$" vs "$(x^{a}/x^{b})^{a+b}$", "logₐ" vs "$\log_{a}$")
 * fingerprint equal. MATCHING ONLY — never use for display or storage.
 */
export function mathFingerprint(s: string): string {
  const migrated = unicodeMathToLatex(s);
  const folded = [...migrated.normalize("NFC")]
    .map((c) => SCRIPT_FOLD[c] ?? c)
    .join("");
  return folded
    .replace(/\\cdot/g, "·")
    .replace(/\\times/g, "×")
    .replace(/\\log/g, "log") // "log" is content (old text has literal logₐ), not syntax
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[$\\{}^_()]/g, "")
    .replace(/[\s/]/g, " ")
    .trim();
}
