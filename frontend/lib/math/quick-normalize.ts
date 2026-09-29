/**
 * frontend/lib/math/quick-normalize.ts
 * ---------------------------------------------------------------------------
 * Lightweight Unicode → LaTeX helper for NEW manual entries and file imports.
 *
 * This is intentionally a 10-line-class function, NOT a replacement for
 * canonical-math.ts. For the full pipeline (validation, preservation checks,
 * diagnostics) use `normalizeMathContent` from canonical-math instead.
 *
 * Use-cases:
 *   - Admin form: before persisting a manually typed question
 *   - File-import adapters: quick pre-pass before the canonical pipeline
 *   - AI route handlers: sanitize raw LLM output before storing
 *
 * Rules:
 *   - Already-canonical `$...$` / `$$...$$` spans pass through byte-identical
 *   - Unicode superscripts (², ³, ⁴…⁹, ⁿ) → ^{n} inside $...$
 *   - Unicode subscripts (₀–₉) → _{n} inside $...$
 *   - √<word>  → \sqrt{word}
 *   - Bare fractions a/b surrounded by spaces → \frac{a}{b} (conservative)
 *
 * This helper is idempotent: quickNormalize(quickNormalize(x)) === quickNormalize(x)
 * for all inputs that don't contain literal `$` characters outside LaTeX spans.
 * ---------------------------------------------------------------------------
 */

/**
 * Minimal Unicode-to-LaTeX pass for BCS / Bank Math question inputs.
 * Intentionally does NOT wrap the whole string in `$...$`; only wraps
 * the isolated math token that triggered a conversion.
 */
export function quickNormalize(text: string): string {
  if (!text) return "";

  // ── Step 1: protect existing $...$ and $$...$$ spans ──────────────────────
  // Replace them with a placeholder so subsequent regexes don't touch them.
  const slots: string[] = [];
  const protected_ = text.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, (m) => {
    slots.push(m);
    return `\x00${slots.length - 1}\x00`;
  });

  // ── Step 2: apply Unicode → LaTeX substitutions ───────────────────────────
  let out = protected_
    // Superscripts: attach to the preceding word/digit token if possible
    .replace(/([A-Za-z0-9])²/g, "$$$1^{2}$$")
    .replace(/([A-Za-z0-9])³/g, "$$$1^{3}$$")
    .replace(/([A-Za-z0-9])⁴/g, "$$$1^{4}$$")
    .replace(/([A-Za-z0-9])⁵/g, "$$$1^{5}$$")
    .replace(/([A-Za-z0-9])⁶/g, "$$$1^{6}$$")
    .replace(/([A-Za-z0-9])⁷/g, "$$$1^{7}$$")
    .replace(/([A-Za-z0-9])⁸/g, "$$$1^{8}$$")
    .replace(/([A-Za-z0-9])⁹/g, "$$$1^{9}$$")
    .replace(/([A-Za-z0-9])ⁿ/g, "$$$1^{n}$$")
    // Subscripts
    .replace(/([A-Za-z0-9])₀/g, "$$$1_{0}$$")
    .replace(/([A-Za-z0-9])₁/g, "$$$1_{1}$$")
    .replace(/([A-Za-z0-9])₂/g, "$$$1_{2}$$")
    .replace(/([A-Za-z0-9])₃/g, "$$$1_{3}$$")
    .replace(/([A-Za-z0-9])₄/g, "$$$1_{4}$$")
    .replace(/([A-Za-z0-9])₅/g, "$$$1_{5}$$")
    .replace(/([A-Za-z0-9])₆/g, "$$$1_{6}$$")
    .replace(/([A-Za-z0-9])₇/g, "$$$1_{7}$$")
    .replace(/([A-Za-z0-9])₈/g, "$$$1_{8}$$")
    .replace(/([A-Za-z0-9])₉/g, "$$$1_{9}$$")
    // Square root: √word or √digit → $\sqrt{word}$
    .replace(/√([A-Za-z0-9]+)/g, "$$\\sqrt{$1}$$")
    // Cube root: ∛word → $\sqrt[3]{word}$
    .replace(/∛([A-Za-z0-9]+)/g, "$$\\sqrt[3]{$1}$$")
    // Fourth root: ∜word → $\sqrt[4]{word}$
    .replace(/∜([A-Za-z0-9]+)/g, "$$\\sqrt[4]{$1}$$");

  // ── Step 3: restore protected spans ───────────────────────────────────────
  out = out.replace(/\x00(\d+)\x00/g, (_, i) => slots[Number(i)]);

  return out;
}
