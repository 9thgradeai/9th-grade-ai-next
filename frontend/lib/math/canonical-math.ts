/**
 * frontend/lib/math/canonical-math.ts
 * ----------------------------------------------------------------------------
 * SINGLE canonical mathematical-content layer for 9Th-Grade AI.
 *
 * Contract: LaTeX math source embedded in normal text with `$...$` (inline)
 * and `$$...$$` (display). Unicode math (x², x₁, √x, ³√x, log₂x) is accepted
 * as INPUT and normalized to LaTeX. Already-canonical LaTeX passes through
 * byte-identical. The pipeline is idempotent:
 *   normalize(normalize(x)) === normalize(x)
 *
 * Conversion core lives in scripts/qb-forensics/unicode-math-to-latex.ts
 * (pure, no Node deps — safe to bundle). This module is the ONLY public
 * facade: validation, preservation checks, MCQ checks, input adapters, and
 * diagnostics. All ingestion paths (seed/import/AI/manual/DOCX/TXT) MUST
 * converge here. No separate math converters allowed.
 * ----------------------------------------------------------------------------
 */

import {
  unicodeMathToLatex,
  splitLatexBraced,
  mergeAdjacentSpans,
  convertInnerBare,
  SUP_MAP,
  SUB_MAP,
} from "../../../scripts/qb-forensics/unicode-math-to-latex";

export type MathDiagnostic = {
  type: string;
  field?: string;
  location?: string;
  detail?: string;
};

export type NormalizeOptions = {
  field?: string;
  /** Allow `$$...$$` display spans (default true — preserved, not invented). */
  displayMath?: boolean;
};

export type NormalizeResult = {
  output: string;
  changed: boolean;
  diagnostics: MathDiagnostic[];
};

export type ValidationResult = {
  valid: boolean;
  errors: MathDiagnostic[];
};

const VALID_COMMANDS = new Set([
  "frac",
  "sqrt",
  "log",
  "ln",
  "times",
  "cdot",
  "div",
  "pm",
  "leq",
  "geq",
  "neq",
  "infty",
  "sum",
  "prod",
  "int",
  "alpha",
  "beta",
  "gamma",
  "theta",
  "pi",
  "text",
  "mathrm",
  "left",
  "right",
]);

/** Suspicious legacy/broken math OUTSIDE canonical delimiters (runtime net). */
const LEGACY_HINT = /(√|³|⁴|ˣ|ⁿ|²|₁|₂|log_[0-9a-zA-Z])/;

function stripMathSpans(s: string): string {
  return splitLatexBraced(s)
    .filter((p) => !p.latex)
    .map((p) => p.text)
    .join(" ");
}

/** Pre-repair deterministic legacy corruption before the core converter. */
function preRepair(input: string, diagnostics: MathDiagnostic[], field?: string): string {
  let s = input.normalize("NFC");
  const push = (type: string, location: string) =>
    diagnostics.push({ type, field, location });
  // Escaped delimiters `\$...\$` → `$...$` (never stored escaped).
  if (/\\\$/.test(s)) {
    s = s.replace(/\\\$/g, "$");
    push("REPAIRED_ESCAPED_DELIMITER", "escaped \\$");
  }
  // Triple dollars `$$$...$$$` → `$$...$$`.
  if (/\$\$\$/.test(s)) {
    s = s.replace(/\$\$\$+/g, "$$");
    push("REPAIRED_TRIPLE_DOLLAR", "$$$");
  }
  // Known corruption: `lo$g_{a}$` → `$\log_{a}$`.
  s = s.replace(/lo\$g_\{([^}]*)\}\$/g, (_m, b) => {
    push("REPAIRED_LOG_SPLIT", `lo$g_{${b}}$`);
    return `$\\log_{${b}}$`;
  });
  // `$(xᵃ/xᵇ)^{a+b}$`-style frozen runs are thawed by the core converter;
  // bare `x^2` / `x_1` outside delimiters get wrapped deterministically.
  // (Ambiguous `1/2x` is NEVER auto-fractioned — flagged for review.)
  s = s.replace(/(^|[\s(=\+\-\u0980-\u09FF])log_([A-Za-z0-9])/g, (_m, pre, sub) => {
    push("REPAIRED_LOG_PLAIN", `log_${sub}`);
    return `${pre}$\\log_{${sub}}$`;
  });
  // Legacy escaped logarithm `log\\_abc` (plain-text subscript from linearized
  // sources) -> `$\\log_{abc}$`. Deterministic: `\\_` outside math spans only
  // ever denotes a subscript in this corpus; already-canonical `\\log_{..}`
  // contains no `log\\_` so this is a fixpoint.
  s = splitLatexBraced(s)
    .map((p) => {
      if (p.latex) return p.text;
      return p.text.replace(/(^|[\s(=+\-*/\u0980-\u09FF])log\\_([A-Za-z0-9]+)/g, (_m, pre, sub) => {
        push("REPAIRED_LOG_ESCAPED", `log\\_${sub}`);
        return `${pre}$\\log_{${sub}}$`;
      });
    })
    .join("");
  // Bracketed radicand `√[body]` -> `$\\sqrt{body}$` via a balanced scan
  // (brackets group exactly like parens here). A direct span is emitted —
  // NOT `√(body)` — because the core `√(...)` pattern stops at the first
  // `)` and would corrupt nested parens like `√[s(s-a)(s-b)]`. Bodies
  // containing `$` are left raw (never invent nesting). Fixpoint: no `√[`
  // remains afterwards.
  if (s.includes("√[")) {
    let out = "";
    let i = 0;
    let replaced = false;
    while (i < s.length) {
      const j = s.indexOf("√[", i);
      if (j === -1) {
        out += s.slice(i);
        break;
      }
      // Only rewrite outside existing math spans.
      const inMath = (s.slice(0, j).match(/\$/g) || []).length % 2 === 1;
      if (inMath) {
        out += s.slice(i, j + 2);
        i = j + 2;
        continue;
      }
      let depth = 0;
      let k = j + 2;
      while (k < s.length) {
        if (s[k] === "[") depth++;
        else if (s[k] === "]") {
          if (depth === 0) break;
          depth--;
        }
        k++;
      }
      if (k >= s.length || k - (j + 2) > 240 || k - (j + 2) < 1 || s.slice(j + 2, k).includes("$")) {
        out += s.slice(i, j + 2);
        i = j + 2;
        continue;
      }
      const body = s.slice(j + 2, k).trim();
      out += s.slice(i, j) + `$\\sqrt{${body}}$`;
      i = k + 1;
      replaced = true;
    }
    if (replaced) push("REPAIRED_ROOT_BRACKET", "√[...]");
    s = out;
  }
  return s;
}


/** True-superscript glyphs (in SUP_MAP but not subscript-block). */
const SUP_RUN_CHARS = Object.keys(SUP_MAP).filter((c) => !(c in SUB_MAP));
const SUB_RUN_CHARS = Object.keys(SUB_MAP);
const escCls = (cs: string[]) => cs.join("").replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
const supAscii = (run: string) => [...run].map((c) => SUP_MAP[c] ?? c).join("");
const subAscii = (run: string) => [...run].map((c) => SUB_MAP[c] ?? c).join("");

/** Token characters for a bare math operand (Latin/Bengali letters, digits). */
const FRAC_TOKEN = "A-Za-z\u0980-\u09FF0-9\u09E6-\u09EF\u03C0";
const FRAC_NUM_RE = /^-?[0-9\u09E6-\u09EF]+(?:\.[0-9\u09E6-\u09EF]+)?$/;

function isFracTokenChar(c: string): boolean {
  return new RegExp(`[${FRAC_TOKEN}]`).test(c);
}

/** Scan forward from `at` (spaces skipped): balanced `(group)` or bare token. */
function fracRight(t: string, at: number): { text: string; end: number; grouped: boolean } | null {
  let k = at;
  while (k < t.length && t[k] === " ") k++;
  if (t[k] === "(") {
    let depth = 0;
    let m = k;
    while (m < t.length) {
      if (t[m] === "(") depth++;
      else if (t[m] === ")") {
        depth--;
        if (depth === 0) break;
      }
      m++;
    }
    if (m >= t.length || m - k > 130) return null;
    const inner = t.slice(k + 1, m);
    if (!inner.trim() || inner.includes("$")) return null;
    return { text: inner.trim(), end: m + 1, grouped: true };
  }
  let m = k;
  if (t[m] === "-") m++; // unary minus on numbers
  const start = m;
  while (m < t.length && isFracTokenChar(t[m])) m++;
  if (m === start) return null;
  return { text: t.slice(k, m), end: m, grouped: false };
}

/** Scan backward from `at` (spaces skipped): the FULL operand, including
 * juxtaposed pieces (`n(n+1)`, `(a)(b)`) and unclosed outer groups
 * (`((a+b))`). Fully-wrapping paren layers are stripped. Never fragments an
 * outer group: leftover unbalanced parens bail (return null). */
function fracLeft(t: string, at: number): { text: string; start: number; grouped: boolean } | null {
  let k = at;
  while (k >= 0 && t[k] === " ") k--;
  if (k < 0 || k - at > 40) return null;
  const consumeGroup = (closeAt: number): number => {
    let depth = 0;
    let m = closeAt;
    while (m >= 0 && closeAt - m <= 130) {
      if (t[m] === ")") depth++;
      else if (t[m] === "(") {
        depth--;
        if (depth === 0) break;
      }
      m--;
    }
    return depth === 0 ? m : -1;
  };
  // First piece is mandatory.
  let start: number;
  if (t[k] === ")") {
    const m = consumeGroup(k);
    if (m < 0) return null;
    start = m;
  } else if (t[k] === "(" || !isFracTokenChar(t[k])) {
    return null;
  } else {
    let m = k;
    while (m >= 0 && isFracTokenChar(t[m])) m--;
    start = m + 1;
    if (t[m] === "-" && (m === 0 || /[\s(=+\-*×·,]/.test(t[m - 1]))) start = m;
  }
  // Extend leftward over juxtaposed pieces and unclosed openers. Only a
  // real paren group marks the operand grouped (mere token juxtaposition
  // like `মান ১` must NOT convert on its own).
  let hasGroup = t[k] === ")";
  for (;;) {
    let j = start - 1;
    while (j >= 0 && t[j] === " ") j--;
    if (j < 0) {
      start = 0;
      break;
    }
    if (t[j] === ")") {
      const m = consumeGroup(j);
      if (m < 0) return null;
      start = m;
      hasGroup = true;
      continue;
    }
    if (isFracTokenChar(t[j])) {
      // Bare-token absorption only extends an already-grouped operand
      // (`n(n+1)`); a lone token never eats preceding prose (`মান ১/২`
      // keeps numerator `১`). `log 5` is handled by the fm-absorb below.
      if (!hasGroup) break;
      let m = j;
      while (m >= 0 && isFracTokenChar(t[m])) m--;
      start = m + 1;
      continue;
    }
    if (t[j] === "(") {
      start = j;
      hasGroup = true;
      break;
    }
    break;
  }
  let text = t.slice(start, k + 1);
  if (!text.trim() || text.includes("$")) return null;
  // Balance check: unbalanced remainder means fragmentation — bail.
  let depth = 0;
  let neg = false;
  for (const c of text) {
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth < 0) {
        neg = true;
        break;
      }
    }
  }
  if (neg || depth !== 0) return null;
  let grouped = hasGroup;
  // Strip fully-wrapping paren layers: `((a+b))` -> `a+b`.
  for (;;) {
    if (!text.startsWith("(")) break;
    let d = 0;
    let wraps = false;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "(") d++;
      else if (text[i] === ")") {
        d--;
        if (d === 0) {
          wraps = i === text.length - 1;
          break;
        }
      }
    }
    if (!wraps) break;
    text = text.slice(1, -1).trim();
    grouped = true;
  }
  // Function application: `log 5/(...)` — absorb `log`/`ln` (with the space).
  if (!grouped) {
    const pre = t.slice(0, start);
    const fm = pre.match(/(^|[\s(=+\-*×·,;:])(log|ln)\s+$/);
    if (fm) {
      start = start - fm[0].length + fm[1].length;
      text = t.slice(start, k + 1);
    }
  }
  return { text, start, grouped };
}

function fracSegment(t: string, push: (type: string, loc: string) => void): string {
  let out = "";
  let i = 0;
  while (i < t.length) {
    const j = t.indexOf("/", i);
    if (j === -1) {
      out += t.slice(i);
      break;
    }
    // Slash-chain guard: dates (12/05/2024), a/b/c — never convert.
    let l = j - 1;
    while (l >= 0 && t[l] === " ") l--;
    let r = j + 1;
    while (r < t.length && t[r] === " ") r++;
    if (t[l] === "/" || t[r] === "/") {
      out += t.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const left = fracLeft(t, j - 1);
    const right = fracRight(t, j + 1);
    let done = false;
    // Chain guard (second look): this slash belongs to a longer a/b/c chain
    // (dates like 12/05/2024) when another slash follows/precedes the operands.
    if (left && right) {
      let after = right.end;
      while (after < t.length && t[after] === " ") after++;
      let before = left.start - 1;
      while (before >= 0 && t[before] === " ") before--;
      if (t[after] === "/" || t[before] === "/") {
        out += t.slice(i, j + 1);
        i = j + 1;
        done = true;
      }
    }
    if (!done && left && right) {
      const bothNumbers = FRAC_NUM_RE.test(left.text) && FRAC_NUM_RE.test(right.text);
      const yearGuard =
        left.text.replace(/[^0-9\u09E6-\u09EF]/g, "").length >= 4 ||
        right.text.replace(/[^0-9\u09E6-\u09EF]/g, "").length >= 4;
      // π-rule: `πr / ২` in an equation is unambiguously division (π never
      // appears in Bengali prose otherwise). Single tokens only.
      const piRule =
        !left.grouped &&
        !right.grouped &&
        /^[A-Za-z0-9\u09E6-\u09EF\u03C0\u00D7\u00B7]+$/.test(left.text) &&
        /^[A-Za-z0-9\u09E6-\u09EF\u03C0\u00D7\u00B7]+$/.test(right.text) &&
        (left.text.includes("\u03C0") || right.text.includes("\u03C0")) &&
        t.includes("=");
      if ((left.grouped || right.grouped || bothNumbers || piRule) && !yearGuard) {
        // Bare word/word (খাতা/কলম, and/or alternatives) falls through here:
        // neither grouped nor numeric, so it is NEVER converted.
        // Upright raw `log`/`ln` absorbed into operands (`log 5` -> `\log 5`).
        const upright = (o: string) =>
          o.replace(/(^|[^\\A-Za-z])\b(log|ln)\b(?![_{a-zA-Z])/g, "$1\\$2");
        out += t.slice(i, left.start) + `$\\frac{${upright(left.text)}}{${upright(right.text)}}$`;
        i = right.end;
        push("REPAIRED_FRACTION", `${left.text}/${right.text}`.slice(0, 60));
        done = true;
      }
    }
    if (!done) {
      out += t.slice(i, j + 1);
      i = j + 1;
    }
  }
  return out;
}

/**
 * Convert DETERMINISTIC fractions to stacked `\\frac` (book-style).
 * Converts ONLY: pure number/number (`9/14`, `18 / 2`, no years/dates) and
 * explicitly grouped operands (`1/(x+1)`, `(x+5)/y`). Bare `x/y`, `a/b+c`,
 * `1/2x` and word/word alternatives are NEVER converted (ambiguous prose).
 * Runs on prose segments only; output spans are fixpoints (idempotent).
 */
function convertDeterministicFractions(s: string, push: (type: string, loc: string) => void): string {
  if (!s.includes("/")) return s;
  return splitLatexBraced(s)
    .map((p) => (p.latex ? p.text : fracSegment(p.text, push)))
    .join("");
}

/** Wrap deterministic bare-ASCII math (x^2, x_1) outside delimiters. */
function wrapBareAsciiMath(s: string): string {
  return splitLatexBraced(s)
    .map((p) => {
      if (p.latex) return p.text;
      let t = p.text;
      // X^(exp) / X^n with word-ish base → $X^{...}$ (skip `...$` tails).
      t = t.replace(
        /(^|[\s\(\[=+\-*/×·,;:])([0-9a-zA-Z\)\]}]+)\^\(\s*([^)$\n]{1,40})\s*\)/g,
        "$1$$$2^{$3}$$",
      );
      t = t.replace(
        /(^|[\s\(\[=+\-*/×·,;:])([0-9a-zA-Z\)\]}]+)\^([0-9a-zA-Z])/g,
        "$1$$$2^{$3}$$",
      );
      // X_n (single alnum subscript) → $X_{n}$ — conservative: base must be
      // a single letter/digit/paren, not prose_word.
      t = t.replace(
        /(^|[\s\(\[=+\-*/×·,;:])([a-zA-Z\)\]}])_([0-9a-zA-Z])/g,
        "$1$$$2_{$3}$$",
      );
      return t;
    })
    .join("");
}

/**
 * Fuse frozen legacy splits where a math span was shattered around one base:
 * `($\sqrt{3})^{5}$` -> `$(\sqrt{3})^{5}$`, `{$\frac{a+b}{2}}^{2}$` ->
 * `${\frac{a+b}{2}}^{2}$`, `$\log_{2}{2}$ˣ` -> `$\log_{2}{2}^{x}$`,
 * `$a^{log}$ₐ` -> `$a^{log}_{a}$`. Each pattern is unambiguous (the tail
 * can only belong to the span); prose is never fused. Also uprights raw
 * `log`/`ln` and `textbackslash CMD` artifacts INSIDE spans, and folds
 * vulgar fractions (`½`, `³ᐟ₂`) to `n/d` for the fraction converter.
 * All outputs are fixpoints (idempotent).
 */
function fuseSpanSplits(s: string, push: (type: string, loc: string) => void): string {
  const supCls = escCls(SUP_RUN_CHARS);
  const subCls = escCls(SUB_RUN_CHARS);
  // Vulgar fractions first (prose segments only): ½ -> 1/2, ³ᐟ₂ -> 3/2.
  const VULGAR: Record<string, string> = {
    "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4",
    "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6",
    "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
  };
  s = splitLatexBraced(s)
    .map((p) => {
      if (p.latex) return p.text;
      let t = p.text;
      t = t.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (c) => {
        push("REPAIRED_VULGAR_FRACTION", c);
        return VULGAR[c];
      });
      t = t.replace(
        new RegExp(`([${escCls(SUP_RUN_CHARS.filter((c) => /[0-9]/.test(supAscii(c))) )}]{1,3})ᐟ([${subCls}]{1,3})`, "g"),
        (_m, a, b) => {
          push("REPAIRED_VULGAR_FRACTION", `${a}ᐟ${b}`);
          return `${supAscii(a)}/${subAscii(b)}`;
        },
      );
      return t;
    })
    .join("");
  // Wrapped span with power tail — closed (`($..$)^{n}$`) AND unclosed
  // (`($..)^{n}$`, where the inner `$` is spurious corruption) forms fuse to
  // `$(..)^{n}$`. The tail can only belong to the wrapped base.
  const beforeParen = s;
  s = s.replace(/\(\$([^$\n]{1,80})\$\)\^\{([^{}]{1,40})\}\$/g, "$$($1)^{$2}$$");
  s = s.replace(/\(\$([^$\n(][^$\n]{0,79})\)\^\{([^{}]{1,40})\}\$/g, "$$($1)^{$2}$$");
  s = s.replace(/\{\$([^$\n]{1,80})\$\}\^\{([^{}]{1,40})\}\$/g, "$${$1}^{$2}$$");
  s = s.replace(/\{\$([^$\n({][^$\n]{0,79})\}\^\{([^{}]{1,40})\}\$/g, "$${$1}^{$2}$$");
  // Bracket-wrapped corruption (`[n(n+1)/$2]^{2}$`): drop the spurious inner
  // `$`, stack the inner division, wrap the whole base.
  s = s.replace(
    /(\$?)\[([^$\n\[\]]{1,80})\$([^$\n]{1,20})\]\^\{([^{}]{1,40})\}\$/g,
    (_m, _lead, a, b, c) => {
      // fracSegment emits delimited spans; unwrap one level for nesting.
      // A pre-existing leading `$` is consumed so exactly one remains
      // (otherwise mergeAdjacentSpans would eat the `$$` pair and corrupt).
      const inner = fracSegment(`${a}${b}`, () => {}).replace(/^\$/, "").replace(/\$$/, "");
      return `$[${inner}]^{${c}}$`;
    },
  );
  if (s !== beforeParen) push("REPAIRED_SPLIT_POWER", "(..)^{n}");
  // General paren fuse: `(CONTENT)^{n}$` -> `$(CONTENT)^{n}$` when CONTENT
  // holds ≥1 closed span and the surrounding prose is mathy (no Bengali, no
  // 3+ letter Latin words, no inner parens outside spans). Covers
  // `(2$..$)^{n}$` and `($..$ + $..$)^{n}$`; prose `(see $T$)^{n}$` never
  // fuses. Structure is validated in the callback, not the pattern.
  s = s.replace(
    /\(([\s\S]{1,120}?)\)\^\{([^{}]{1,40})\}\$/g,
    (m: string, content: string, exp: string) => {
      const check = (c: string): string | null => {
        if (!c.includes("$")) return null;
        const ps = c.split(/(\$[^$\n]{1,60}\$)/g);
        let prose = "";
        for (let k = 0; k < ps.length; k++) {
          const q = ps[k];
          if (k % 2 === 1) {
            if (!(q.startsWith("$") && q.endsWith("$"))) return null;
          } else {
            if (/[()$]/.test(q)) return null;
            prose += q;
          }
        }
        if (/[\u0980-\u09FF]/.test(prose) || /[A-Za-z]{3,}/.test(prose)) return null;
        const stripped = c.replace(/\$/g, "");
        if (!/[\\0-9\u09E6-\u09EF]/.test(stripped)) return null;
        return stripped;
      };
      let stripped = check(content);
      if (stripped === null && /\$[^$\n()]*$/.test(content)) {
        stripped = check(content + "$");
      }
      if (stripped === null) return m;
      push("REPAIRED_SPLIT_POWER", m.slice(0, 60));
      return "$(" + stripped + ")^{" + exp + "}$";
    },
  );
  s = s.replace(
    /\(([^$\n()]{1,30})\$([^$\n]*?)\)\^\{([^{}]{1,40})\}\$/g,
    (m, coef, body, exp) => {
      if (!/[0-9০-৯+\-×·*/^]/.test(coef)) return m;
      push("REPAIRED_SPLIT_POWER", m.slice(0, 60));
      return "$(" + coef + body + ")^{" + exp + "}$";
    },
  );
  s = s.replace(
    /\((\$[^$\n]{1,60}\$)([^$\n()]{1,40})\$\)\^\{([^{}]{1,40})\}\$/g,
    (_mm, spanBody, tailBody, expBody) => {
      push("REPAIRED_SPLIT_POWER", _mm.slice(0, 60));
      const innerSpan = String(spanBody).replace(/^\$/, "").replace(/\$$/, "");
      return "$(" + innerSpan + tailBody + ")^{" + expBody + "}$";
    },
  );
  // Caret power with span group: `10^($\\log_{10}$ 7)` ->
  // `$10^{(\\log_{10} 7)}$`. The `^(` group unambiguously binds base to tail.
  s = s.replace(
    /([0-9A-Za-z]+)\^\((\$[^$\n]{1,60}\$)([^$\n()]{1,40})\)/g,
    (_m, b, sp, t) => {
      push("REPAIRED_CARET_SPAN", _m.slice(0, 60));
      return "$" + b + "^{(" + sp.slice(1, -1) + t + ")}$";
    },
  );
  // Bracket power with misplaced opener: `[$(2/3)^{4}]^{3/4}$` ->
  // `$[(2/3)^{4}]^{3/4}$`. The `$` after `[` unambiguously belongs before it;
  // the bracket body must be mathy (no prose words).
  s = s.replace(
    /\[\$((?:[^$\n]|\$[^$\n]{1,60}\$){1,100}?)\]\^\{([^{}]{1,40})\}\$/g,
    (m, inner, exp) => {
      const prose = inner.replace(/\$[^$\n]{1,60}\$/g, "");
      if (/[\u0980-\u09FF]/.test(prose) || /[A-Za-z]{3,}/.test(prose)) return m;
      if (!/[\\0-9\u09E6-\u09EF]/.test(inner.replace(/\$/g, ""))) return m;
      push("REPAIRED_SPLIT_POWER", m.slice(0, 60));
      return "$[" + inner + "]^{" + exp + "}$";
    },
  );
  // Script run glued after a span: `$..$ˣ`, `$..$₂`, `$..$ₐᵇ`.
  const runRe = new RegExp(
    `\\$([^$\\n]{1,60})\\$([${subCls}]{1,4})?([${supCls}]{1,6})`,
    "g",
  );
  s = s.replace(runRe, (m, inner, sub, sup) => {
    if (!sub && ![...sup].some((c) => SUP_RUN_CHARS.includes(c))) return m;
    if (!sub && [...sup].every((c) => c in SUB_MAP)) return m;
    push("REPAIRED_SPLIT_SCRIPT", m.slice(0, 60));
    let out = `$${inner}`;
    if (sub) out += `_{${subAscii(sub)}}`;
    if (sup) out += `^{${supAscii(sup)}}`;
    return `${out}$`;
  });
  // Span internals: upright raw log|ln, repair textbackslash artifacts.
  s = splitLatexBraced(s)
    .map((p) => {
      if (!p.latex) return p.text;
      const m = p.text.match(/^\$([\s\S]*)\$$/);
      if (!m) return p.text;
      let body = m[1];
      const b0 = body;
      body = body.replace(/(^|[^\\A-Za-z])\b(log|ln)\b(?![_{a-zA-Z])/g, "$1\\$2");
      body = body.replace(/\\?(log|ln)\\?textbackslash\s*\\_\s*([A-Za-z0-9]+)/g, "\\$1_{$2}");
      body = body.replace(/textbackslash\s*([a-zA-Z]+)/g, "\\$1");
      body = body.replace(/textbackslash\s*\\_\s*([A-Za-z0-9]+)/g, "_{$1}");
      // Minimal balance-append: a body missing exactly one `)` gains it
      // (`$((2)^{2}$` -> `$((2)^{2})$`). Never removes or invents more.
      const opens = (body.match(/\(/g) || []).length;
      const closes = (body.match(/\)/g) || []).length;
      if (opens === closes + 1) body = `${body})`;
      body = body.replace(
        /([A-Za-z0-9\u09E6-\u09EF\u03C0]+)\s*\/\s*([A-Za-z0-9\u09E6-\u09EF\u03C0]+)/g,
        (fm, l, r) => {
          if (!fm.includes("\u03C0")) return fm;
          push("REPAIRED_PI_FRACTION", fm.slice(0, 40));
          return `\\frac{${l}}{${r}}`;
        },
      );
      if (body !== b0) push("REPAIRED_SPAN_INTERNALS", body.slice(0, 60));
      return `$${convertInnerBare(body)}$`;
    })
    .join("");
  return s;
}

/** Equation-context rescue: Bengali-word bases (`অতিভুজ²=`, `জ্যা²=`, `π²=`).
 * The core converter skips non-Latin bases as footnote suspects; inside a
 * segment containing `=` that reading is impossible, so wrap deterministically.
 * Pure-digit bases are the core's territory and are skipped here. */
function rescueBengaliScripts(s: string, push: (type: string, loc: string) => void): string {
  // Equation context is judged on the WHOLE input: `$..$` spans split the
  // text into parts, and the `=` usually lives in a different part than the
  // script run (`× ভূমি₁ ×` vs `অনুপাত = ...`).
  const mathCtx = s.includes("=");
  const supLetters = SUP_RUN_CHARS.filter((c) => !(c in SUB_MAP));
  const word = "[\u0980-\u09E5\u09F0-\u09FF\u03C0](?:[\u0980-\u09FF\u03C0 0-9\u09E6-\u09EF]*[\u0980-\u09E5\u09F0-\u09FF\u03C0])?";
  const re = new RegExp(`(${word})((?:[${escCls(SUB_RUN_CHARS)}]{1,4})?)([${escCls(supLetters)}]{0,6})`, "g");
  const hasRun = (sub: string, sup: string) =>
    (sub ?? "") !== "" || [...(sup ?? "")].some((c) => !(c in SUB_MAP));
  return splitLatexBraced(s)
    .map((p) => {
      // A segment that is NOTHING but word+script-runs (`বাহু²` as a whole
      // option) is math regardless of `=`.
      const trimmed = p.text.trim();
      if (!p.latex && trimmed) {
        const wholeRe = new RegExp(
          "^(" +
            word +
            ")((?:[" +
            escCls(SUB_RUN_CHARS) +
            "]{1,4})?)([" +
            escCls(supLetters) +
            "]{1,6})$",
        );
        const whole = wholeRe.exec(trimmed);
        if (
          whole &&
          ((whole[2] ?? "") !== "" || [...(whole[3] ?? "")].some((c) => !(c in SUB_MAP)))
        ) {
          push("REPAIRED_BN_SCRIPT", trimmed.slice(0, 40));
          let out = "$" + whole[1];
          if (whole[2]) out += "_{" + subAscii(whole[2]) + "}";
          if (whole[3]) out += "^{" + supAscii(whole[3]) + "}";
          out += "$";
          return p.text.replace(trimmed, out);
        }
      }
      if (p.latex || !mathCtx) return p.text;
      return p.text.replace(re, (m, base, sub, sup) => {
        if (!hasRun(sub, sup)) return m;
        push("REPAIRED_BN_SCRIPT", m.slice(0, 40));
        let out = `$${base}`;
        if (sub) out += `_{${subAscii(sub)}}`;
        if (sup) out += `^{${supAscii(sup)}}`;
        return `${out}$`;
      });
    })
    .join("");
}

/** Equation-context rescue: numeric/paren base + letter sup-run (`2ˣʸ=4`). */
function rescueEquationScripts(s: string, push: (type: string, loc: string) => void): string {
  const supLetters = SUP_RUN_CHARS.filter((c) => /^[a-zA-Z]$/.test(supAscii(c)));
  if (supLetters.length === 0) return s;
  // Same whole-input gating as the Bengali rescue above.
  const mathCtx = s.includes("=");
  const re = new RegExp(`([0-9)\\]।])([${escCls(supLetters)}]{1,6})`, "g");
  return splitLatexBraced(s)
    .map((p) => {
      if (p.latex || !mathCtx) return p.text;
      return p.text.replace(re, (_m, b, r) => {
        push("REPAIRED_EQUATION_SCRIPT", `${b}${r}`);
        return `$${b}^{${supAscii(r)}}$`;
      });
    })
    .join("");
}

/**
 * Canonical normalizer — the single entry point for ALL math ingestion.
 * Idempotent: normalize(normalize(x)) === normalize(x).
 */
export function normalizeMathContent(input: string, options: NormalizeOptions = {}): NormalizeResult {
  const field = options.field;
  const diagnostics: MathDiagnostic[] = [];
  if (input == null) return { output: input, changed: false, diagnostics };
  if (typeof input !== "string") return { output: input, changed: false, diagnostics };

  const original = input.normalize("NFC");
  let s = preRepair(original, diagnostics, field);
  s = wrapBareAsciiMath(s);
  s = convertDeterministicFractions(s, (type, location) =>
    diagnostics.push({ type, field, location }),
  );
  s = unicodeMathToLatex(s);
  s = convertDeterministicFractions(s, (type, location) =>
    diagnostics.push({ type, field, location }),
  );
  s = fuseSpanSplits(s, (type, location) =>
    diagnostics.push({ type, field, location }),
  );
  // Vulgar fractions folded above (`½` -> `1/2`) now stack via the fraction pass.
  s = convertDeterministicFractions(s, (type, location) =>
    diagnostics.push({ type, field, location }),
  );
  s = rescueEquationScripts(s, (type, location) =>
    diagnostics.push({ type, field, location }),
  );
  s = rescueBengaliScripts(s, (type, location) =>
    diagnostics.push({ type, field, location }),
  );
  // Post-pass: repair nested `$\sqrt{$x$}$` → `$\sqrt{x}$` leftovers.
  const before = s;
  s = s.replace(/\$(\\sqrt(?:\[[^\]]*\])?)\{\$([^$]*)\$\}/g, "$$$1{$2}$");
  s = mergeAdjacentSpans(s);
  if (s !== before) diagnostics.push({ type: "REPAIRED_NESTED_DELIMITER", field, location: "nested $ inside braces" });

  // Second application must be a fixpoint (idempotency guardrail for callers).
  const again = mergeAdjacentSpans(
    unicodeMathToLatex(
      convertDeterministicFractions(wrapBareAsciiMath(preRepair(s, [], field)), () => {}),
    ),
  );
  if (again !== s) {
    // Deterministic third pass converges; record it, don't loop forever.
    s = again;
    diagnostics.push({ type: "NORMALIZED_FIXPOINT", field, location: "second pass converged" });
  }
  return { output: s, changed: s !== original, diagnostics };
}

/** Convenience: normalize and return the string only. */
export function toCanonicalMath(input: string, field?: string): string {
  return normalizeMathContent(input, { field }).output;
}

/** Validate delimiter + LaTeX structure of canonical text. */
export function validateMathContent(input: string, field = "field"): ValidationResult {
  const errors: MathDiagnostic[] = [];
  if (typeof input !== "string") {
    return { valid: false, errors: [{ type: "NOT_A_STRING", field }] };
  }
  const s = input;
  if (/\$\$\$/.test(s)) errors.push({ type: "TRIPLE_DOLLAR", field, location: "$$$" });
  if (/\\\$(?=[^$]*\$)/.test(s) || /\\\$$/.test(s))
    errors.push({ type: "ESCAPED_DELIMITER", field, location: "\\$" });
  // Unbalanced `$` (ignoring `$$` pairs).
  const singles = s.replace(/\$\$/g, "");
  const dollars = (singles.match(/\$/g) || []).length;
  if (dollars % 2 === 1) errors.push({ type: "UNBALANCED_DOLLAR", field, location: "odd $ count" });

  // Per-span structural checks.
  const re = /\$\$([\s\S]*?)\$\$|\$([^$\n]*?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const body = m[1] ?? m[2] ?? "";
    const loc = body.slice(0, 60);
    const open = (body.match(/\{/g) || []).length;
    const close = (body.match(/\}/g) || []).length;
    if (open !== close) errors.push({ type: "UNBALANCED_BRACE", field, location: loc });
    const bo = (body.match(/\[/g) || []).length;
    const bc = (body.match(/\]/g) || []).length;
    if (bo !== bc) errors.push({ type: "UNBALANCED_BRACKET", field, location: loc });
    const po = (body.match(/\(/g) || []).length;
    const pc = (body.match(/\)/g) || []).length;
    if (po !== pc) errors.push({ type: "UNBALANCED_PAREN", field, location: loc });
    if (/\$(?!\$)/.test(body)) errors.push({ type: "NESTED_DELIMITER", field, location: loc });
    // Brace-aware \\frac check: exactly two balanced brace groups must
    // follow (nested braces like \\frac{r^{n}-1}{r-1} are VALID).
    const fracAt = body.indexOf("\\frac");
    if (fracAt !== -1) {
      const groups: string[] = [];
      let pos = fracAt + 5;
      for (let g = 0; g < 2; g++) {
        while (pos < body.length && body[pos] === " ") pos++;
        if (body[pos] !== "{") break;
        let depth = 0;
        const startG = pos;
        while (pos < body.length) {
          if (body[pos] === "{") depth++;
          else if (body[pos] === "}") {
            depth--;
            if (depth === 0) break;
          }
          pos++;
        }
        if (depth !== 0) break;
        groups.push(body.slice(startG, pos + 1));
        pos++;
      }
      if (groups.length !== 2)
        errors.push({ type: "MALFORMED_FRAC", field, location: loc });
    }
    if (/\\sqrt(?![{\[])/.test(body))
      errors.push({ type: "MALFORMED_SQRT", field, location: loc });
    if (/\^[^{a-zA-Z0-9(\\]/.test(body) && /\^[^ {]/.test(body) && !/\^\{/.test(body))
      errors.push({ type: "MALFORMED_SUPERSCRIPT", field, location: loc });
    if (/<\/?[a-z][^>]*>/i.test(body))
      errors.push({ type: "HTML_IN_MATH", field, location: loc });
    if (/```/.test(body)) errors.push({ type: "CODEBLOCK_IN_MATH", field, location: loc });
    const cmds = body.match(/\\[a-zA-Z]+/g) ?? [];
    for (const c of cmds) {
      const name = c.slice(1);
      if (!VALID_COMMANDS.has(name))
        errors.push({ type: "UNKNOWN_COMMAND", field, location: `${c} in ${loc}` });
    }
    if (/(^|[^\\])\blog\b(?![_{a-zA-Z])/.test(` ${body}`))
      errors.push({ type: "UPRIGHT_LOG", field, location: `raw log in ${loc}` });
  }
  // Raw Unicode math left outside delimiters.
  const prose = stripMathSpans(s);
  if (LEGACY_HINT.test(prose))
    errors.push({ type: "RAW_UNICODE_MATH", field, location: prose.slice(0, 80) });
  if (/(^|[\s(=])log_[0-9a-zA-Z]/.test(prose))
    errors.push({ type: "RAW_LOG_SUBSCRIPT", field, location: prose.slice(0, 80) });
  return { valid: errors.length === 0, errors };
}

/** Token-preservation check: conversion must never silently drop math. */
export function checkMathPreservation(source: string, canonical: string, field = "field"): MathDiagnostic[] {
  const diags: MathDiagnostic[] = [];
  const count = (s: string, re: RegExp) => (s.match(re) || []).length;
  const pairs: [RegExp, string][] = [
    [/\d/g, "digits"],
    [/[a-zA-Z\u0980-\u09FF]/g, "variables"],
    [/=/g, "equality"],
    [/[()]/g, "parentheses"],
    // NOTE: `/` is excluded here — every consumed slash becomes exactly one
    // `\frac`, which is accounted by the slash/frac balance check below.
    [/[+\-×·*]/g, "operators"],
  ];
  // Roots/fractions/exponents counted on the RAW source (unicode + ascii).
  // Only convertible radicals count: `√(...)` / `√X` (the core converter
  // handles exactly these; `√[...]` is rewritten to `√(...)` in preRepair).
  const convertRoots = (t: string) =>
    count(t, /√\([^)$]{1,120}\)/g) +
    count(t, /√[0-90-9a-zA-Z\u0980-\u09FF]/g) +
    count(t, /\\sqrt/g);
  const srcRoots = convertRoots(source);
  const dstRoots = count(canonical, /\\sqrt/g);
  if (dstRoots < srcRoots)
    diags.push({ type: "LOST_ROOT", field, detail: `${srcRoots}→${dstRoots}` });
  // Only patterns the pipeline converts count as losable: real `\\frac`
  // and explicit `(num)/(den)` (single-sided `a/(b)` is deliberately left
  // alone as ambiguous per Phase 7 — never flag it).
  const srcFrac =
    count(source, /\\frac/g) + count(source, /\([^()$]{1,60}\)\/\([^()$]{1,60}\)/g);
  const dstFrac = count(canonical, /\\frac/g);
  if (dstFrac < srcFrac)
    diags.push({ type: "LOST_FRACTION", field, detail: `${srcFrac}→${dstFrac}` });
  // Each stacked \\frac legitimately consumes up to 2 paren pairs from
  // explicit fraction groups (`(x+5)/y` -> `\\frac{x+5}{y}`).
  const fracCount = count(canonical, /\\frac/g);
  // Slash accounting: each `/` consumed by conversion yields one `\\frac`,
  // so (slashes + fracs) must never shrink.
  const slashBalance =
    count(canonical, /\//g) +
    count(canonical, /\\frac/g) -
    (count(source, /\//g) + count(source, /\\frac/g));
  if (slashBalance < 0)
    diags.push({
      type: "LOST_FRACTION_SLASH",
      field,
      detail: `slash-balance ${slashBalance}`,
    });
  for (const [re, name] of pairs) {
    const a = count(source.normalize("NFC"), new RegExp(re.source, "g"));
    const b = count(canonical, new RegExp(re.source, "g"));
    // Canonical adds LaTeX syntax chars ({,},\,^,_) so only flag LOSSES.
    if (name === "variables") continue; // \log/\frac add letters legitimately
    const allowed = name === "parentheses" ? 2 + 2 * fracCount : 2;
    if (b < a - allowed)
      diags.push({ type: `LOST_${name.toUpperCase()}`, field, detail: `${a}→${b}` });
  }
  // Catastrophic: source had `=` but canonical has none.
  if (/=/.test(source) && !/=/.test(canonical))
    diags.push({ type: "LOST_EQUATION", field, detail: "equality disappeared" });
  return diags;
}

/** Runtime safety net: legacy math outside delimiters (no mutation). */
export function detectLegacyMath(text: string): boolean {
  if (typeof text !== "string" || !text) return false;
  return LEGACY_HINT.test(stripMathSpans(text.normalize("NFC")));
}

// ── Input adapters (all converge into normalizeMathContent) ──────────────

/** Adapter A — plain text / Unicode input. */
export function adaptPlainText(input: string, field?: string): NormalizeResult {
  return normalizeMathContent(input, { field });
}

/** Adapter B — DOCX/OMML structural nodes → LaTeX → canonical validation. */
export function adaptOmmlText(input: string, field?: string): NormalizeResult {
  // The python converter (scripts/docx-math-to-latex.py) maps m:f→\frac,
  // m:sSup→^{}, m:sSub→_{}, m:rad→\sqrt{}, m:nary, m:d, m:acc. Its text
  // output arrives here; converge into the same normalizer + validation.
  const r = normalizeMathContent(input, { field });
  const v = validateMathContent(r.output, field ?? "omml");
  return { ...r, diagnostics: [...r.diagnostics, ...v.errors] };
}

/** Adapter C — AI-generated MCQ JSON → schema → normalize → validate. */
export type AiMcqJson = {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

export function adaptAiMcq(raw: unknown): {
  mcq: AiMcqJson | null;
  errors: MathDiagnostic[];
  normalized: AiMcqJson | null;
} {
  const errors: MathDiagnostic[] = [];
  if (!raw || typeof raw !== "object") {
    return { mcq: null, errors: [{ type: "AI_SCHEMA_NOT_OBJECT" }], normalized: null };
  }
  const r = raw as Record<string, unknown>;
  if (
    typeof r.question !== "string" ||
    !Array.isArray(r.options) ||
    typeof r.answer !== "string" ||
    typeof r.explanation !== "string"
  ) {
    return { mcq: null, errors: [{ type: "AI_SCHEMA_INVALID" }], normalized: null };
  }
  const mcq: AiMcqJson = {
    question: r.question,
    options: r.options as string[],
    answer: r.answer,
    explanation: r.explanation,
  };
  const normalized: AiMcqJson = {
    question: normalizeMathContent(mcq.question, { field: "question" }).output,
    options: mcq.options.map((o) => normalizeMathContent(o, { field: "option" }).output),
    answer: normalizeMathContent(mcq.answer, { field: "answer" }).output,
    explanation: normalizeMathContent(mcq.explanation, { field: "explanation" }).output,
  };
  for (const [k, v] of Object.entries(normalized)) {
    const vals = Array.isArray(v) ? v : [v];
    vals.forEach((s, i) => {
      const res = validateMathContent(s, Array.isArray(v) ? `${k}[${i}]` : k);
      errors.push(...res.errors);
    });
  }
  const q = validateMcq(normalized);
  errors.push(...q.errors);
  return { mcq, errors, normalized };
}

/** Adapter D — manual/admin editing: normalize before persistence. */
export function adaptManualInput(input: string, field?: string): NormalizeResult {
  return normalizeMathContent(input, { field });
}

// ── MCQ quality validation (mathematics) ─────────────────────────────────

export function validateMcq(m: { question: string; options: string[]; answer: string; explanation: string }): {
  valid: boolean;
  errors: MathDiagnostic[];
} {
  const errors: MathDiagnostic[] = [];
  if (!Array.isArray(m.options) || m.options.length !== 4)
    errors.push({ type: "MCQ_OPTION_COUNT", detail: `got ${m.options?.length}` });
  if (!m.options?.includes(m.answer))
    errors.push({ type: "MCQ_ANSWER_NOT_IN_OPTIONS", detail: m.answer?.slice(0, 60) });
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  if (new Set(m.options?.map(norm)).size !== m.options?.length)
    errors.push({ type: "MCQ_DUPLICATE_OPTIONS" });
  for (const [k, v] of Object.entries(m)) {
    const vals = Array.isArray(v) ? (v as string[]) : [v as string];
    vals.forEach((s, i) => {
      if (!s || !String(s).trim())
        errors.push({ type: "MCQ_EMPTY_FIELD", field: Array.isArray(v) ? `${k}[${i}]` : k });
      else {
        const res = validateMathContent(String(s), Array.isArray(v) ? `${k}[${i}]` : k);
        errors.push(...res.errors.filter((e) => e.type !== "RAW_UNICODE_MATH"));
      }
    });
  }
  if (!/literally-never/.test(m.question) && m.question === m.explanation)
    errors.push({ type: "MCQ_EXPLANATION_SAME_AS_QUESTION" });
  return { valid: errors.length === 0, errors };
}

/** Strict system instruction for AI math generation (Phase 15). */
export const AI_MATH_SYSTEM_INSTRUCTION =
  "All mathematical expressions MUST be represented using LaTeX math delimiters " +
  "($...$ inline, $$...$$ display). Never use Unicode superscripts (x²), Unicode " +
  "subscripts (x₁), raw √ notation, ASCII fractions like (x+1)/(x-1), bare x^2 " +
  "outside delimiters, or Markdown code formatting for math. " +
  "Allowed: $x^{2}+2x+1$, $\\frac{x+1}{x-1}$, $\\sqrt[3]{x^{2}}$, $\\log_{2}x$. " +
  "Output structured JSON: {question, options[4], answer, explanation}.";

export { convertInnerBare };
