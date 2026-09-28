/**
 * tests/qb-unicode-math-to-latex.test.ts
 * ----------------------------------------------------------------------------
 * Guarantees for the legacy-Unicode-math → LaTeX migration
 * (scripts/qb-forensics/unicode-math-to-latex.ts), covering every math shape
 * found in the BCS Math .txt files (database/data/ques/Math/) and the Bank
 * Indices & Logarithms docx:
 *   superscripts (2ˣ⁺¹, ৫², (a+b)²), subscripts (x₁, log₃81), radicals
 *   (√(…), √৯), caret powers (P(1+r/100)^n), plain prose passthrough, and
 *   idempotency (already-$...$ spans never double-wrap).
 * ----------------------------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import {
  unicodeMathToLatex,
  migrateRecordToLatex,
  mathFingerprint,
} from "../scripts/qb-forensics/unicode-math-to-latex";

describe("unicodeMathToLatex — math MCQ migration", () => {
  // Bengali literals below are NFC-normalized: the migrator NFC-normalizes
  // its output, and source files may carry decomposed forms (হ + য় vs হয়).
  const nfc = (s: string) => s.normalize("NFC");

  it("converts Unicode superscripts to ^{...}", () => {
    expect(unicodeMathToLatex("যদি 2ˣ⁺¹=32 হয়")).toBe(nfc("যদি $2^{x+1}$=32 হয়"));
    expect(unicodeMathToLatex("If $2^{0+3}$ = 8")).toBe("If $2^{0+3}$ = 8"); // idempotent
    expect(unicodeMathToLatex("2ᵃ = 3")).toBe("$2^{a}$ = 3");
  });

  it("binds a balanced (…) group as one superscript base", () => {
    expect(unicodeMathToLatex("ab = (a+b)²/4")).toBe("ab = $(a+b)^{2}$/4");
  });

  it("converts Unicode subscripts to _{...} without stealing log₃", () => {
    expect(unicodeMathToLatex("x₁ + x₂ = 5")).toBe("$x_{1}$ + $x_{2}$ = 5");
    expect(unicodeMathToLatex(nfc("log₃81 এর মান"))).toBe(nfc("$\\log_{3}{81}$ এর মান"));
  });

  it("converts radicals to \\sqrt{...}", () => {
    expect(unicodeMathToLatex(nfc("= √(৪ × ১৬) = ৮"))).toBe(nfc("= $\\sqrt{৪ \\times  ১৬}$ = ৮"));
    expect(unicodeMathToLatex("ক. √৯ খ. √২")).toBe("ক. $\\sqrt{৯}$ খ. $\\sqrt{২}$");
  });

  it("attaches caret powers to their base", () => {
    expect(unicodeMathToLatex("C = P(1+r/100)^n")).toBe("C = P$(1+r/100)^{n}$");
  });

  it("thaws nested runs inside paren-group bases", () => {
    expect(unicodeMathToLatex("(xᵃ / xᵇ)ᵃ⁺ᵇ")).toBe("$(x^{a} / x^{b})^{a+b}$");
  });

  it("thaws frozen runs inside existing $...$ spans", () => {
    expect(unicodeMathToLatex("$(xᵃ / xᵇ)^{a+b}$")).toBe("$(x^{a} / x^{b})^{a+b}$");
    expect(unicodeMathToLatex("If $2^{0+3}$ = 8")).toBe("If $2^{0+3}$ = 8");
  });

  it("leaves prose footnote markers alone", () => {
    expect(unicodeMathToLatex("see reportᵃ for details")).toBe("see reportᵃ for details");
  });

  it("leaves plain Bengali/English prose byte-identical", () => {
    const prose = "সাধারণ গদ্য, কোনো গণিত নেই।";
    expect(unicodeMathToLatex(prose)).toBe(prose);
    expect(unicodeMathToLatex("a + (n-1)d সূত্র")).toBe("a + (n-1)d সূত্র");
  });

  it("is idempotent across all shapes", () => {
    const samples = [
      "যদি 2ˣ⁺¹=32 হয়",
      "ab = (a+b)²/4",
      "x₁ + x₂ = 5",
      "log₃81",
      "√(৪ × ১৬)",
      "C = P(1+r/100)^n",
      "Already $\\frac{a}{b}$ latex",
    ];
    for (const s of samples) {
      const once = unicodeMathToLatex(s);
      expect(unicodeMathToLatex(once)).toBe(once);
    }
  });

  it("migrates every field of a record", () => {
    const out = migrateRecordToLatex({
      question: nfc("যদি 2ˣ⁺¹=32 হয়?"),
      options: ["2²", "2³", "2⁴", "2⁵"],
      explanation: nfc("কারণ √১৬ = ৪।"),
    });
    expect(out.question).toBe(nfc("যদি $2^{x+1}$=32 হয়?"));
    expect(out.options).toEqual(["$2^{2}$", "$2^{3}$", "$2^{4}$", "$2^{5}$"]);
    expect(out.explanation).toBe(nfc("কারণ $\\sqrt{১৬}$ = ৪।"));
  });

  it("does not let a trailing ⋅ poison the superscript run", () => {
    expect(unicodeMathToLatex("4ˣ⋅$4^{1}$+$4^{x}$=320")).toBe("$4^{x}$⋅$4^{1}$+$4^{x}$=320");
  });

  it("folds a decimal log base split across spans without dropping $", () => {
    expect(unicodeMathToLatex("Solve $\\log_{0}$.₅(x).")).toBe("Solve $\\log_{0.5}$(x).");
  });

  it("repairs an unclosed log span left by the pre-fix fusion", () => {
    expect(unicodeMathToLatex("Solve $\\log_{0.5}($x^{2}$ - 5x + 6) = 0.")).toBe(
      "Solve $\\log_{0.5}$($x^{2}$ - 5x + 6) = 0.",
    );
  });

  it("fuses a log span with a directly following power span", () => {
    // Odd-$ input heals to one balanced span across fixpoint rounds.
    expect(unicodeMathToLatex("A $\\log_{10}$(1000)^{1/3}$ B")).toBe(
      "A $\\log_{10}(1000)^{1/3}$ B",
    );
  });

  it("fingerprints pipeline generations identically (matching only)", () => {
    // Same source through old-Unicode vs new-OMML generations.
    expect(mathFingerprint("$(xᵃ / xᵇ)^{a+b}$")).toBe(mathFingerprint("$(x^{a} / x^{b})^{a+b}$"));
    expect(mathFingerprint("logₐ(bc)")).toBe(mathFingerprint("$\\log_{a}$(bc)"));
    expect(mathFingerprint("$2^{2+log₂}$ ³")).toBe(mathFingerprint("$2^{2+log2}$ ³"));
    // Different questions stay distinct.
    expect(mathFingerprint("If $2^{3}$ = 8?")).not.toBe(mathFingerprint("If $2^{4}$ = 8?"));
  });
});
