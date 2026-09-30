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
// Exported for the canonical layer (post-span run fusion, equation rescue).
export const SUP_MAP: Record<string, string> = {
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
// U+207A–207F leftovers and modifier-letter punctuation that may appear
// ADJACENT to script runs in source text. NOTE: these are deliberately NOT
// members of any run class — ⋅/⁎/‧ directly after a run (as in "4ˣ⋅…")
// would otherwise poison it past the footnote guard and freeze the run.
// They render natively and need no conversion.
const SUP_EXTRA: Record<string, string> = {};
export const SUB_MAP: Record<string, string> = {
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

/**
 * Brace-aware splitter: like splitLatex, but a `$` nested INSIDE braces of
 * an open span (legacy corruption like `$\sqrt{$8^{2}$}$`,
 * `$\frac{$a$}{$b}$}`) is dropped instead of splitting there. This both
 * repairs old nested rows and keeps future passes from re-nesting.
 * Unclosed trailing `$` passes through as prose (never invent closers).
 */
export function splitLatexBraced(s: string): { latex: boolean; text: string }[] {
  const parts: { latex: boolean; text: string }[] = [];
  let buf = "";
  let inMath = false;
  let depth = 0;
  const flush = (latex: boolean) => {
    if (buf) parts.push({ latex, text: buf });
    buf = "";
  };
  for (const c of s) {
    if (c === "$") {
      if (!inMath) {
        flush(false);
        inMath = true;
        depth = 0;
        buf += c;
      } else if (depth === 0) {
        buf += c;
        flush(true);
        inMath = false;
      }
      // else: spurious inner $ — drop it.
    } else {
      if (inMath) {
        if (c === "{") depth++;
        else if (c === "}") depth = Math.max(0, depth - 1);
      }
      buf += c;
    }
  }
  flush(inMath);
  return parts;
}

/** Minimal LaTeX escaping for raw text that is about to enter a $...$ span.
 *
 * Already-valid LaTeX passes through byte-identical: `\commands` (with
 * their brace groups left alone — escaping those broke a live row into
 * "\textbackslash cdot") and `\X` escapes like `\%` are kept verbatim.
 * Only truly raw characters are escaped (`% & # _ { }`, `*`/`×` → `\times`).
 */
function latexEscapeRaw(s: string): string {
  return s.replace(/\\[a-zA-Z]+|\\[^a-zA-Z]|([%&#_*×{}])/g, (m, c) =>
    c === undefined ? m : `\\${c === "*" || c === "×" ? "times " : c}`,
  );
}

function supToAscii(run: string): string {
  return [...run].map((c) => SUP_MAP[c] ?? SUP_EXTRA[c] ?? c).join("");
}

function subToAscii(run: string): string {
  return [...run].map((c) => SUB_MAP[c] ?? c).join("");
}

// Superscript glyphs that are plain digits (root degrees, not variables).
const SUP_DIGIT_CLS = [...SUP_CHARS].filter((c) => /[0-9]/.test(supToAscii(c)));

// Body pattern for √(…) — innermost-first: no RAW √ inside (nested roots
// resolve bottom-up across fixpoint rounds), but already-built $…$ spans
// and one paren-nesting level are allowed so outer roots are not frozen
// by inner conversions (e.g. √(10+√(25+√…)) — live nested-radical rows).
const RAD_BODY = "((?:[^()$√]|\\([^()]*\\)|\\$[^$\\n]*\\$){1,250})";
const RAD_PAREN_RE = new RegExp(`√\\(${RAD_BODY}\\)`, "g");

/** A sup-digit lead is a root degree unless glued to a preceding base
 * (x²√y → the ² belongs to x, not to the root). */
function leadIsDegree(lead: string | undefined, offset: number, full: string): boolean {
  return !!lead && (offset === 0 || !/[0-9a-zA-Z০-৯)\]}।]$/.test(full[offset - 1]));
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
    // √(body) / √X → \sqrt{...} (bare). Decimal radicands (√0.0036) match
    // first so the point is never split off (`√0.0036` ≠ `\sqrt{0}.0036`).
    // Paren bodies resolve innermost-first across iterations (nested
    // √(10+√(25+…)) — outer bodies still holding a raw √ wait a round).
    for (let k = 0; k < 6; k++) {
      const b2 = out;
      RAD_PAREN_RE.lastIndex = 0;
      out = out.replace(RAD_PAREN_RE, (_m, b) => `\\sqrt{${(b as string).trim()}}`);
      if (out === b2) break;
    }
    out = out.replace(
      /√([0-9০-৯]{1,12}\.[0-9০-৯]{1,12}|[0-90-9a-zA-Z০-৯π]{1,12})/g,
      (_m, b) => `\\sqrt{${b}}`,
    );
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
    // Brackets ]/} included (frozen "$\log_{2}{log}$₂" style splits).
    out = out.replace(
      new RegExp(`([)\\]\\}])([${esc(SUP_CHARS)}]{1,6})`, "g"),
      (m, b, r) => {
        if ([...r].every((c) => c in SUB_MAP)) return m;
        return `${b}^{${supToAscii(r)}}`;
      },
    );
    if (out === before) break;
  }
  return out;
}

/**
 * Convert √(…) groups with balanced-paren scanning (arbitrary nesting
 * depth in ONE pass): finds each `√(`, matches its closing paren by depth,
 * recursively converts the body, then wraps. Regex-only matching freezes
 * nested radicals (√(10+√(25+…))) because inner conversions insert `$`
 * spans that split later segments — the scanner consumes the whole group
 * before any `$` exists. Unbalanced groups pass through for review.
 * `wrap`/`inner` inject the prose (span-wrapping) vs bare conversions.
 */
function convertNestedRootParen(
  s: string,
  wrap: (latexInner: string) => string,
  inner: (t: string) => string,
): string {
  let out = "";
  let i = 0;
  for (let guard = 0; guard < 100; guard++) {
    const j = s.indexOf("√(", i);
    if (j === -1) return out + s.slice(i);
    // Depth-scan from inside the opener (depth starts at 1 for s[j+1]).
    let depth = 1;
    let k = j + 2;
    for (; k < s.length && k - j < 600; k++) {
      if (s[k] === "(") depth++;
      else if (s[k] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (k >= s.length || k - j >= 600 || s[k] !== ")") {
      out += s.slice(i, j + 2);
      i = j + 2;
      continue;
    }
    const bodyInner = convertNestedRootParen(inner(s.slice(j + 2, k)), wrap, inner);
    out += s.slice(i, j) + wrap(bodyInner);
    i = k + 1;
  }
  return out + s.slice(i);
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

  // 2. Radicals: √(body) / √X → \sqrt{...}, with an optional leading
  // superscript degree: ³√(8²) / ⁴√(81x⁸) → $\sqrt[3]{8^{2}}$ (book-exact
  // n-th roots; a non-digit lead falls through to the plain radical).
  // Root-over-division FIRST (√3/2 → frac-of-root): otherwise the fraction
  // pass strands the √ outside its own $\frac$ (`√$\frac{3}{2}$` — live bug
  // on sin/cos/tan rows). The fracSegment √-guard in canonical-math keeps
  // these intact until here.
  const NUM_FRAC = `[0-9${BN_DIGITS}]{1,12}(?:\\.[0-9${BN_DIGITS}]{1,12})?`;
  out = out.replace(
    new RegExp(`√(${NUM_FRAC})\\s*/\\s*(${NUM_FRAC})`, "g"),
    (_m, n, d) => `$\\frac{\\sqrt{${n}}}{${d}}$`,
  );
  out = out.replace(
    new RegExp(`√\\(${RAD_BODY}\\)\\s*/\\s*(${NUM_FRAC})`, "g"),
    (_m, b, d) => `$\\frac{\\sqrt{${convertInnerBare(latexEscapeRaw((b as string).trim()))}}}{${d}}$`,
  );
  const supDigitCls = SUP_DIGIT_CLS;
  const degCls = esc(supDigitCls.join(""));
  // Paren groups via balanced scanning (arbitrary nesting depth in one
  // pass — nested √(10+√(25+…)) rows). Degree leads (³√(x²)) fold below.
  out = convertNestedRootParen(
    out,
    (latexInner) => `$\\sqrt{${latexInner}}$`,
    (t) => convertInnerBare(latexEscapeRaw(t.trim())),
  );
  // Fold degree leads glued to fresh spans (⁴$\sqrt{…}$ → $\sqrt[4]{…}$;
  // already-folded `⁴$\sqrt[…]` passes through untouched).
  out = out.replace(
    new RegExp(`([${degCls}]{1,3})\\$\\sqrt\\[?`, "g"),
    (m, lead, offset, full) => {
      if (!leadIsDegree(lead, offset, full)) return m;
      return m.includes("[") ? m : `$\\sqrt[${supToAscii(lead as string)}]{`;
    },
  );
  out = out.replace(
    new RegExp(
      `([${esc(supDigitCls.join(""))}]{1,3})?√([0-9০-৯]{1,12}\\.[0-9০-৯]{1,12}|[0-90-9a-zA-Z০-৯π]{1,12})`,
      "g",
    ),
    (m, lead, b, offset, full) => {
      if (leadIsDegree(lead, offset, full)) {
        return `$\\sqrt[${supToAscii(lead as string)}]{${latexEscapeRaw(b as string)}}$`;
      }
      if (lead) return `${lead}$\\sqrt{${latexEscapeRaw(b as string)}}$`;
      return `$\\sqrt{${latexEscapeRaw(b as string)}}$`;
    },
  );

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

  // 3b. Dangling bracket + raw script run AFTER the group rule (frozen
  // splits like "(x $\sqrt{x}$)ˣ" or "$\log_{2}{log}$₂"): wrap the run so
  // the step-7 $$-merge fuses it with the preceding span. Runs after step
  // 3 so "(a+b)²" still binds the whole group as one base.
  out = out.replace(new RegExp(`([)\\]\\}])([${esc(SUP_CHARS)}]{1,6})`, "g"), (m, b, r) => {
    if ([...r].every((c) => c in SUB_MAP)) return m;
    return `$${b}^{${supToAscii(r)}}$`;
  });
  out = out.replace(new RegExp(`([)\\]\\}])([${esc(SUB_CHARS)}]{1,6})`, "g"), (m, b, r) => {
    return `$${b}_{${subToAscii(r)}}$`;
  });

  // 4. Base + subscript-run → $base_{sub}$ (e.g. log₃81 handled below, x₁).
  // Dots bind inside the base so decimal log bases survive (log₀.₅).
  const subRe = new RegExp(`([a-zA-Z${BN_DIGITS}]+(?:\\.[a-zA-Z${BN_DIGITS}]+)*)([${esc(SUB_CHARS)}]{1,6})`, "g");
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

  // 5b. Second chance for lone single/multi-letter scripts in EQUATIONS:
  // bʸ=c, x₁+x₂=5 — the main guard skips these as footnote suspects, but a
  // field containing `=` is an equation, never a footnote (verified: all 16
  // lone-letter rows in the Math corpus carry `=` and are genuine math).
  if (out.includes("=")) {
    const supLetters = [...SUP_CHARS].filter(
      (c) => /^[a-zA-Z]$/.test(supToAscii(c)) && !(c in SUB_MAP),
    );
    const subLetters = [...SUB_CHARS].filter((c) => /^[a-zA-Z]$/.test(subToAscii(c)));
    out = out.replace(
      new RegExp(`([A-Za-z])([${esc(supLetters.join(""))}]{1,6})`, "g"),
      (_m, b, r) => `$${b}^{${[...r].map((c: string) => supToAscii(c)).join("")}}$`,
    );
    out = out.replace(
      new RegExp(`([A-Za-z])([${esc(subLetters.join(""))}]{1,6})`, "g"),
      (m, b, r, offset, full) => {
        if (full.slice(Math.max(0, offset - 1), offset) === "{") return m;
        const base = /^[Ll]og$/.test(b) ? `\\${b}` : b;
        return `$${base}_{${[...r].map((c: string) => subToAscii(c)).join("")}}$`;
      },
    );
  }

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
  // fold the fraction into the base → "$\log_{0.5}(".
  out = out.replace(/\$\\log_\{([^$}]*)\}\$\.([₀₁₂₃₄₅₆₇₈₉₊₋₍₎ₐₑₓₙₒᵢᵣᵤₖₗₘₚₛₜₕⱼ]+)/g, (_m, base, run) => {
    const folded = [...run].map((c: string) => SUB_MAP[c] ?? c).join("");
    // Re-emit the consumed closing $ — dropping it unbalances every
    // later span in the field (live incident on a log₀.₅ row).
    return `$\\log_{${base}.${folded}}$`;

  });

  // Repair an UNCLOSED log span left by the pre-fix fusion bug
  // ("$\log_{0.5}($x^{2}$…"): re-emit the missing closer so
  // later spans pair correctly. Guarded by odd-$ count: well-formed
  // "$\log_{10}$(1000)…" text is already even and must not gain a $.
  if (((out.match(/\$/g) || []).length % 2) === 1) {
    out = out.replace(/(\$\\log_\{[^$}]*\})(\()/g, "$1$$$2");
    // Mirror image: trailing span missing its OPENER after a closed span
    // ("$\log_{10}$(1000)^{1/3}$" → insert it; the $$-merge fuses next
    // round). The parenthesised chunk must itself look like math (^/_)
    // so prose prices never fuse.
    out = out.replace(/(\$[^$]+)\$\(([^$()]+)\)(\^\{[^$}]*\})\$/g, "$1($2)$3$");
  }
  return out;
}

/**
 * Convert one free-text field (question / option / explanation) to LaTeX-
 * augmented text. Idempotent: running twice yields the same string.
 */
export function unicodeMathToLatex(input: string): string {
  if (!input || !input.includes) return input;
  const norm = input.normalize("NFC");
  // Fast path: no math trigger at all ($ itself is a trigger so existing
  // LaTeX always takes the slow path).
  if (
    !new RegExp(`[${esc(SUP_CHARS)}${esc(SUB_CHARS)}√^$]`).test(norm) &&
    !/\(.+\)\/\(.+\)/.test(norm) &&
    !/log/.test(norm)
  ) {
    return norm;
  }
  // Fixpoint: each round strictly consumes raw triggers or fuses spans, so
  // this terminates (cap is a backstop). Needed because one round can
  // expose new work — e.g. un-nesting reveals a raw run, a `)ˣ` wrap
  // needs fusing with a preceding span, or a nested √(…(…)) resolves one
  // level per round (depth-5 radicals need ~6 rounds incl. $-repair).
  let s = norm;
  // Fuse a degree lead split from its root span by segmentation:
  // "⁴" | "$\sqrt{81x^{8}}$" → "$\sqrt[4]{81x^{8}}$".
  const fuseLeadSpan = (t: string) =>
    t.replace(
      new RegExp(`([${esc(SUP_DIGIT_CLS.join(""))}]{1,3})(\\$\\\\sqrt\\{)`, "g"),
      (m, lead, _span, offset, full) => {
        if (!leadIsDegree(lead, offset, full)) return m;
        return `$\\sqrt[${supToAscii(lead as string)}]{`;
      },
    );
  for (let round = 0; round < 8; round++) {
    const next = mergeAdjacentSpans(
      fuseLeadSpan(
        splitLatexBraced(s)
          .map((p) => {
            if (p.latex) {
              // Thaw frozen runs inside existing spans (e.g. legacy
              // "$(xᵃ/xᵇ)^{a+b}$" → "$(x^{a}/x^{b})^{a+b}$"). Real LaTeX has
              // no raw script glyphs, so well-formed spans pass through
              // untouched.
              const m = p.text.match(/^\$([^$]*)\$$/);
              if (m) return `$${convertInnerBare(m[1])}$`;
              return p.text;
            }
            return convertSegment(p.text);
          })
          .join(""),
      ),
    );
    if (next === s) return next;
    s = next;
  }
  return s;
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
