// Shared output-formatting rules for every AI surface (tutor, assistant,
// coach, solver, evaluator). A single source of truth so all prompt types emit
// the same clean Markdown shape — dense emphasis, decorative divider lines and
// over-nesting are the top causes of broken renders on small screens.

export const MATH_FORMATTING_RULES =
  "## Mathematics (canonical LaTeX — mandatory for ALL math)\n" +
  "- All mathematical expressions MUST use LaTeX math delimiters: `$...$` inline, `$$...$$` display.\n" +
  "- Never use Unicode superscripts (x²), Unicode subscripts (x₁), raw √ notation, ASCII fractions " +
  "like (x+1)/(x-1), bare x^2 outside delimiters, or Markdown code formatting for math.\n" +
  "- Allowed: `$x^{2}+2x+1$`, `$\\frac{x+1}{x-1}$`, `$\\sqrt[3]{x^{2}}$`, `$\\log_{2}x$`.\n" +
  "- Server-side normalization still validates every expression — malformed math is rejected.";

export const FORMATTING_RULES =
  "## Formatting\n" +
  "- Use clean, minimal Markdown: `-` bullets for lists, numbered steps for procedures, and short " +
  "`###` headings only when they genuinely help.\n" +
  "- Do NOT over-emphasize: avoid asterisk-heavy text, and never emit decorative lines made only of " +
  "`*`, `**`, `***` or `---` (they render as broken blocks on small screens).\n" +
  "- Keep paragraphs short. Wrap formulas or code in single backticks, and multi-line code in fenced " +
  "code blocks with a language tag (```).\n" +
  "- For most answers, lead with a single sentence that directly answers the question, then give " +
  "evidence, steps or examples. End with one short check-in or next-step line when helpful.\n" +
  MATH_FORMATTING_RULES;