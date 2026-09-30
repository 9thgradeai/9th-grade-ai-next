import { describe, it, expect } from "vitest";
import {
  normalizeMathContent,
  toCanonicalMath,
  validateMathContent,
  checkMathPreservation,
  detectLegacyMath,
  adaptAiMcq,
  validateMcq,
  AI_MATH_SYSTEM_INSTRUCTION,
} from "@/lib/math/canonical-math";

const canon = (s: string) => normalizeMathContent(s).output;

describe("canonical math pipeline — powers", () => {
  it("x² → $x^{2}$", () => expect(canon("x²")).toBe("$x^{2}$"));
  it("2ˣ⁺¹ wraps exponent", () => expect(canon("2ˣ⁺¹")).toContain("2^{x+1}"));
  it("(a+b)² binds group", () => expect(canon("(a+b)²")).toBe("$(a+b)^{2}$"));
  it("bare x^2 → $x^{2}$", () => expect(canon("x^2")).toBe("$x^{2}$"));
});

describe("canonical math pipeline — subscripts", () => {
  it("x₁ → $x_{1}$", () => expect(canon("x₁")).toBe("$x_{1}$"));
  it("log₂81 → upright log", () => expect(canon("log₂81")).toBe("$\\log_{2}{81}$"));
  it("log_a x → \\log_{a}", () => {
    const out = canon("log_a x");
    expect(out).toContain("\\log_{a}");
    expect(out).not.toMatch(/(^|[^\\])\blog\b(?![_{])/);
  });
});

describe("canonical math pipeline — roots & fractions", () => {
  it("√x → \\sqrt{x}", () => expect(canon("√x")).toBe("$\\sqrt{x}$"));
  it("√(a×b)", () => expect(canon("√(a×b)")).toContain("\\sqrt{"));
  it("³√x → nth root", () => expect(canon("³√x")).toBe("$\\sqrt[3]{x}$"));
  it("³√(x²)", () => expect(canon("³√(x²)")).toBe("$\\sqrt[3]{x^{2}}$"));
  it("(a+b)/(c+d) → frac", () =>
    expect(canon("(a+b)/(c+d)")).toBe("$\\frac{a+b}{c+d}$"));
  it("1/2x is NOT auto-fractioned (ambiguous)", () =>
    expect(canon("choose 1/2x of them")).not.toContain("\\frac"));
});

describe("canonical math pipeline — equations & mixed language", () => {
  it("x²-5x+6=0 keeps equality", () => {
    const out = canon("x²-5x+6=0");
    expect(out).toContain("=");
    expect(checkMathPreservation("x²-5x+6=0", out)).toEqual([]);
  });
  it("Bangla + math", () =>
    expect(canon("যদি $x^2-5x+6=0$ হয়, তবে $x$ এর মান কত?")).toContain("হয়"));
  it("English + math", () =>
    expect(canon("Find $x$ if $\\frac{x+1}{x-1}=3$.")).toContain("\\frac"));
});

describe("canonical math pipeline — idempotency", () => {
  const samples = [
    "If $x > 2$, find $x^{2}$.",
    "$\\frac{2^{x+1}-\\sqrt{x}}{\\log_{2}x}$",
    "$x_{1}+x_{2}=5$",
    "plain prose without math",
    "$\\sqrt{a\\sqrt{a\\sqrt{a}}}$",
  ];
  for (const s of samples) {
    it(`idempotent: ${s.slice(0, 40)}`, () => {
      expect(canon(canon(s))).toBe(canon(s));
    });
  }
  it("never double-wraps", () => expect(canon("$x^{2}$")).toBe("$x^{2}$"));
  it("never emits $$$", () => expect(canon("$$$x$$$")).not.toContain("$$$"));
});

describe("canonical math pipeline — validation", () => {
  it("rejects unbalanced brace", () =>
    expect(validateMathContent("$\\frac{x}{y$", "q").valid).toBe(false));
  it("rejects nested delimiters", () => {
    const r = validateMathContent("$\\sqrt{$8^{2}$}$", "q");
    expect(r.valid).toBe(false);
    expect(
      r.errors.some((e) =>
        ["NESTED_DELIMITER", "UNBALANCED_DOLLAR", "UNBALANCED_BRACE"].includes(e.type),
      ),
    ).toBe(true);
  });
  it("rejects escaped delimiters", () =>
    expect(validateMathContent("\\\\$x\\\\$", "q").valid).toBe(false));
  it("valid canonical passes", () =>
    expect(validateMathContent("If $x > 2$, find $x^{2}$.", "q").valid).toBe(true));
  it("flags raw unicode math in prose", () =>
    expect(detectLegacyMath("Solve x² now")).toBe(true));
  it("clean prose is not legacy", () =>
    expect(detectLegacyMath("What is the capital?")).toBe(false));
});

describe("canonical math pipeline — preservation (hard failure)", () => {
  it("equation loss detected", () => {
    const diags = checkMathPreservation("Solve for x: 2^x + 2^(x+1) = 24", "Solve for x:");
    expect(diags.length).toBeGreaterThan(0);
  });
  it("root loss detected", () => {
    expect(checkMathPreservation("√x + 1", "1").some((d) => d.type === "LOST_ROOT")).toBe(true);
  });
});

describe("canonical math pipeline — MCQ validation", () => {
  const good = {
    question: "If $x^{2}-5x+6=0$, what is $x$?",
    options: ["$2$", "$3$", "$4$", "$6$"],
    answer: "$2$",
    explanation: "We factor as $(x-2)(x-3)=0$.",
  };
  it("accepts a good MCQ", () => expect(validateMcq(good).valid).toBe(true));
  it("rejects wrong option count", () =>
    expect(validateMcq({ ...good, options: ["$2$"] }).valid).toBe(false));
  it("rejects answer not in options", () =>
    expect(validateMcq({ ...good, answer: "$9$" }).valid).toBe(false));
  it("rejects duplicate options", () =>
    expect(
      validateMcq({ ...good, options: ["$2$", "$2$", "$4$", "$6$"] }).valid,
    ).toBe(false));
});

describe("canonical math pipeline — AI adapter", () => {
  it("normalizes AI unicode into LaTeX", () => {
    const { normalized, errors } = adaptAiMcq({
      question: "If x²-5x+6=0, what is x?",
      options: ["2", "3", "4", "6"],
      answer: "2",
      explanation: "Factor as (x-2)(x-3)=0.",
    });
    expect(normalized!.question).toContain("x^{2}");
    expect(Array.isArray(errors)).toBe(true);
  });
  it("rejects non-object", () =>
    expect(adaptAiMcq(null).normalized).toBeNull());
  it("system instruction bans unicode math", () =>
    expect(AI_MATH_SYSTEM_INSTRUCTION).toMatch(/Never use Unicode/i));
});

describe("canonical math pipeline — toCanonicalMath helper", () => {
  it("(xᵃ/xᵇ)ᵃ⁺ᵇ", () =>
    expect(toCanonicalMath("(xᵃ/xᵇ)ᵃ⁺ᵇ")).toBe("$(x^{a}/x^{b})^{a+b}$"));
  it("x₁+x₂", () => expect(toCanonicalMath("x₁+x₂=5")).toContain("x_{1}"));
});
describe("canonical math pipeline — legacy repairs", () => {
  it("√[s(s-a)] → balanced \\sqrt span", () => {
    const out = canon("√[s(s-a)(s-b)] = 5");
    expect(out).toContain("\\sqrt{s(s-a)(s-b)}");
    expect(checkMathPreservation("√[s(s-a)(s-b)] = 5", out)).toEqual([]);
  });
  it("log\\_a(bc) → upright log", () => {
    expect(canon("log\\_a(bc) = x")).toContain("\\log_{a}");
  });
  it("lo$g_{a}$ corruption repaired", () => {
    expect(canon("lo$g_{a}$ = 1")).toContain("\\log_{a}");
  });
  it("repairs are idempotent", () => {
    for (const raw of ["√[s(s-a)]", "log\\_abc a", "x^2", "x_1"]) {
      const once = canon(raw);
      expect(canon(once)).toBe(once);
    }
  });
});
describe("canonical math pipeline — deterministic book fractions", () => {
  it("Bengali digit/digit → stacked frac", () =>
    expect(canon("মান ১/২ হয়")).toBe("মান $\\frac{১}{২}$ হয়"));
  it("multi-digit number/number → stacked frac", () =>
    expect(canon("ভগ্নাংশ ৯/১৪।")).toBe("ভগ্নাংশ $\\frac{৯}{১৪}$।"));
  it("1/(x+1) → frac (explicit grouping)", () =>
    expect(canon("find 1/(x + 1)")).toBe("find $\\frac{1}{x + 1}$"));
  it("(x+5)/y → frac (explicit grouping)", () =>
    expect(canon("(x+৫)/y = ১")).toBe("$\\frac{x+৫}{y}$ = ১"));
  it("(3+5+6)/2 → frac", () =>
    expect(canon("s = (3 + 5 + 6) / 2 = 7")).toBe("s = $\\frac{3 + 5 + 6}{2}$ = 7"));
  it("word/word alternatives NEVER convert", () =>
    expect(canon("খাতা/কলম নাও")).toBe("খাতা/কলম নাও"));
  it("dates NEVER convert", () =>
    expect(canon("তারিখ ১২/০৫/২০২৪")).toBe("তারিখ ১২/০৫/২০২৪"));
  it("fiscal years NEVER convert", () =>
    expect(canon("2024/25 অর্থবছর")).toBe("2024/25 অর্থবছর"));
  // A trailing superscript binds to the DENOMINATOR in linear notation:
  // `1/x²` is 1/(x²). Stranding it after the brace renders `\frac{1}{x}^{2}`,
  // which reads as (1/x)² — wrong values reach the learner.
  it("1/x² → exponent stays inside the denominator brace", () =>
    expect(canon("x² - 1/x² = 8")).toContain("$\\frac{1}{x^{2}}$"));
  it("8/x³ → exponent stays inside the denominator brace", () =>
    expect(canon("8x³ - 8/x³")).toContain("$\\frac{8}{x^{3}}$"));
  it("1/9x² → multi-token denominator keeps its exponent", () =>
    expect(canon("9x² + 1/9x²")).toContain("$\\frac{1}{9x^{2}}$"));
  it("no stranded exponent outside any \\frac brace", () => {
    const out = canon("x² - 1/x² = 8 হলে, x + 1/x এর মান কত?");
    expect(out).not.toMatch(/\\frac\{[^}]*\}\s*\^\{/);
  });
  it("superscripted numerator is unaffected", () =>
    expect(canon("x/y + y/x = 3 হলে, x²/y²")).toContain("$\\frac{x^{2}}{y^{2}}$"));
  it("superscript before the slash does not block conversion", () =>
    expect(canon("ab = (a+b)²/4 - (a-b)²/4")).toBe(
      "ab = $\\frac{(a+b)^{2}}{4}$ - $\\frac{(a-b)^{2}}{4}$",
    ));
  it("1/2x, a/b+c, x/y NEVER convert", () => {
    expect(canon("choose 1/2x of them")).toBe("choose 1/2x of them");
    expect(canon("a/b+c")).toBe("a/b+c");
    expect(canon("x/y coordinates")).toBe("x/y coordinates");
  });
  it("frac conversions are idempotent + preservation-clean", () => {
    for (const raw of ["মান ১/২ হয়", "1/(x + 1)", "(x+৫)/y = ১", "s = (3 + 5 + 6) / 2 = 7"]) {
      const once = canon(raw);
      expect(canon(once)).toBe(once);
      expect(checkMathPreservation(raw, once)).toEqual([]);
    }
  });
});
describe("canonical math pipeline — log fractions", () => {
  it("log 5 / (log 5 - log 2) keeps log binding", () =>
    expect(canon("x = log 5 / (log 5 - log 2)")).toBe(
      "x = $\\frac{\\log 5}{\\log 5 - \\log 2}$",
    ));
  it("standalone log uprights its argument", () =>
    expect(canon("Take log: x log 2 = 5")).toBe("Take log: x $\\log 2$ = 5"));
  it("bare log series uprights", () =>
    expect(canon("2log b = log a + log c")).toBe(
      "2$\\log b$ = $\\log a$ + $\\log c$",
    ));
  it("glued log-subscripts upright in equations", () =>
    expect(canon("(যেহেতু loga-logb=x)")).toBe(
      "(যেহেতু $\\log_{a}$-$\\log_{b}$=x)",
    ));
  it("prose words never match log rules", () => {
    expect(canon("Take log on both sides")).toBe("Take log on both sides");
    expect(canon("catalog 5 items")).toBe("catalog 5 items");
  });
});
describe("canonical math pipeline — span-split fusion", () => {
  it("($\\sqrt{3})^{5}$ fuses", () =>
    expect(canon("($\\sqrt{৩})^{5}$")).toBe("$(\\sqrt{৩})^{5}$"));
  it("{$\\frac{a+b}{2}}^{2}$ fuses", () =>
    expect(validateMathContent(canon("ab = {$\\frac{a+b}{2}}^{2}$"), "t").valid).toBe(true));
  it("[n(n+1)/$2]^{2}$ heals + stacks", () =>
    expect(canon("[n(n+1)/$2]^{2}$")).toBe("$[\\frac{n(n+1)}{2}]^{2}$"));
  it("trailing sup-run fuses", () =>
    expect(canon("$\\log_{2}{2}$ˣ=3")).toBe("$\\log_{2}{2}^{x}$=3"));
  it("vulgar fractions stack", () => {
    expect(canon("x + ½ = 3").includes("\\frac{1}{2}")).toBe(true);
    expect(validateMathContent(canon("³ᐟ₂x = 3"), "t").valid).toBe(true);
  });
  it("nested operands never fragment", () =>
    expect(checkMathPreservation("[n(n+1)/$2]^{2}$", canon("[n(n+1)/$2]^{2}$"))).toEqual([]));
});
describe("canonical math pipeline — coefficient fusion", () => {
  it("(2$\\sqrt{3})^{3}$ fuses to book form", () =>
    expect(canon("(2$\\sqrt{৩})^{3}$")).toBe("$(2\\sqrt{৩})^{3}$"));
  it("prose coefficient never fuses", () =>
    expect(canon("(see $T$)^{2}$ here")).toBe("(see $T$)^{2}$ here"));
  it("nested-span numerators stay untouched", () =>
    expect(canon("ab = ($(a+b)^{2}$ - 1)/2")).toBe("ab = ($(a+b)^{2}$ - 1)/2"));
});
describe("canonical math pipeline — words, pi and general fuse", () => {
  it("whole-field Bengali word wraps", () =>
    expect(canon("বাহু²")).toBe("$বাহু^{2}$"));
  it("Bengali prose never wraps", () =>
    expect(canon("খাতা কলম")).toBe("খাতা কলম"));
  it("√π typesets", () => expect(canon("√π : ২")).toBe("$\\sqrt{π}$ : ২"));
  it("whole equation wraps with real sqrt command", () =>
    expect(canon("a = r√π।")).toBe("$a = r\\sqrt{π}$।"));
  it("multi-span paren fuses", () =>
    expect(canon("($\\sqrt{3}$ + $\\sqrt{2})^{2}$")).toBe("$((\\sqrt{3} + \\sqrt{2})^{2}$".replace("((", "(")));
});
describe("canonical math pipeline — subscripts, pi and tails", () => {
  it("subscript-only wraps without empty sup", () =>
    expect(canon("ভূমি₁ = ৫")).toBe("$ভূমি_{1}$ = ৫"));
  it("πr / ২ stacks in equations", () =>
    expect(canon("a = πr / ২।")).toBe("a = $\\frac{πr}{২}$।"));
  it("span-body π fraction stacks", () =>
    expect(canon("$(πr / ২)^{2}$")).toBe("$(\\frac{πr}{২})^{2}$"));
  it("numeric span fractions stay inline", () =>
    expect(canon("$(81/16)^{-3/4}$")).toBe("$(81/16)^{-3/4}$"));
});
describe("canonical math pipeline — escaper artifacts and caret spans", () => {
  it("textbackslash-underscore heals to subscript", () =>
    expect(canon("Identity $b^{\\log\\textbackslash \\_b x}$ = x.")).toBe(
      "Identity $b^{\\log_{b} x}$ = x.",
    ));
  it("caret-span power groups", () =>
    expect(canon("Value of 10^($\\log_{10}$ 7) is:")).toBe(
      "Value of $10^{(\\log_{10} 7)}$ is:",
    ));
});
describe("canonical math pipeline — bracket power", () => {
  it("misplaced opener moves before bracket", () =>
    expect(canon("[$(2/3)^{4}]^{3/4}$")).toBe("$[(2/3)^{4}]^{3/4}$"));
  it("prose brackets never fuse", () =>
    expect(canon("cost [$5 and $10] done")).toBe("cost [$5 and $10] done"));
});
describe("canonical math pipeline — grouped and algebraic fractions", () => {
  it("multi-digit groups stack (year-count bug fixed)", () => {
    expect(canon("x = (80 × 100) / 125 = 64")).toBe("x = $\\frac{80 × 100}{125}$ = 64");
    expect(canon("S = (0 + 2 + 4 + 5 + 9) / 5")).toBe("S = $\\frac{0 + 2 + 4 + 5 + 9}{5}$");
    expect(canon("x = (40000 × 3) / 2")).toBe("x = $\\frac{40000 × 3}{2}$");
  });
  it("letter/number stacks without equation", () =>
    expect(canon("ক্রয়মূল্য x / 19 টাকা।")).toBe("ক্রয়মূল্য $\\frac{x}{19}$ টাকা।"));
  it("both sides stack inside parens", () =>
    expect(canon("ক্ষতি = (x/19 - x/29)")).toBe("ক্ষতি = ($\\frac{x}{19}$ - $\\frac{x}{29}$)"));
  it("nested groups never fragment", () =>
    expect(canon("n(n+1)/2 = ৫")).toBe("$\\frac{n(n+1)}{2}$ = ৫"));
  it("abbreviations and codes never convert", () => {
    expect(canon("The ratio Mr./X = 5")).toBe("The ratio Mr./X = 5");
    expect(canon("Q2/3 বেছে নাও")).toBe("Q2/3 বেছে নাও");
  });
});
describe("canonical math pipeline — no prose absorption, no doubling", () => {
  it("prose words stay outside stacked groups", () =>
    expect(canon("জন করে (১৯×৯×৫)/৫৭ = ৫")).toBe(
      "জন করে $\\frac{১৯×৯×৫}{৫৭}$ = ৫",
    ));
  it("nested slashes stack inner only, never double", () =>
    expect(canon("ক্ষতি = [(10x / 551) / (x / 19)] = ৫")).toBe(
      "ক্ষতি = [($\\frac{10x}{551}$) / ($\\frac{x}{19}$)] = ৫",
    ));
  it("juxtaposed single letters still absorb", () =>
    expect(canon("n(n+1)/2 = ৫")).toBe("$\\frac{n(n+1)}{2}$ = ৫"));
});
describe("canonical math pipeline — bare log arguments", () => {
  it("log with span argument fuses to one span", () =>
    expect(canon("Simplify log $x^{2}$ + log $x^{3}$.")).toBe(
      "Simplify $\\log x^{2}$ + $\\log x^{3}$.",
    ));
  it("log(paren) and log[number] glue", () => {
    expect(canon("log(5x) = 2")).toBe("$\\log(5x)$ = 2");
    expect(canon("log2 = 1")).toBe("$\\log2$ = 1");
  });
  it("log of bracket group", () =>
    expect(canon("log[(x + 5)(x - 5)] = 11")).toBe("$\\log[(x + 5)(x - 5)]$ = 11"));
});
describe("canonical math pipeline — span-adjacent fractions", () => {
  it("span/number stacks, keeps % outside", () =>
    expect(canon("($R^{2}$/100)%")).toBe("($\\frac{R^{2}}{100}$)%"));
  it("span/span stacks", () =>
    expect(canon("$A_{4}$/$A_{2}$ = 1.5")).toBe("$\\frac{A_{4}}{A_{2}}$ = 1.5"));
  it("number/span stacks", () =>
    expect(canon("1/$x^{3}$ + 5")).toBe("$\\frac{1}{x^{3}}$ + 5"));
  it("trailing exponent aborts", () =>
    expect(canon("$a$/$b$^2 = 5")).toBe("$a$/$b$^2 = 5"));
  it("caret binds before slash", () => {
    expect(canon("x^2/y=5")).toBe("$\\frac{x^{2}}{y}$=5");
    expect(canon("a/y^2=5")).toBe("$\\frac{a}{y^{2}}$=5");
  });
});
describe("canonical math pipeline — bare equation wrapping", () => {
  it("symbolic equations wrap", () =>
    expect(canon("সমীকরণ: ৩x + ২x = ৯০ ⇒ x = ১৮।")).toBe(
      "সমীকরণ: $৩x + ২x = ৯০ \\Rightarrow  x = ১৮$।",
    ));
  it("units stay outside", () =>
    expect(canon("৪+৪+২+২+৩ = ১৫টি।")).toBe("$৪+৪+২+২+৩ = ১৫$টি।"));
  it("paren groups never split", () =>
    expect(canon("যেমন: ৫ = ৬(১)-১ (ভাগশেষ ৫)।")).toBe(
      "যেমন: $৫ = ৬(১)-১$ (ভাগশেষ ৫)।",
    ));
  it("pure Bengali equalities stay prose", () =>
    expect(canon("বিজোড় + বিজোড় = জোড়।")).toBe("বিজোড় + বিজোড় = জোড়।"));
  it("option letters untouched", () =>
    expect(canon("কোনটি সঠিক? (a) খ (b) গ")).toBe("কোনটি সঠিক? (a) খ (b) গ"));
  it("degree without equation untouched", () =>
    expect(canon("তাপমাত্রা ১০০° সেলসিয়াস।")).toBe("তাপমাত্রা ১০০° সেলসিয়াস।"));
});
describe("canonical math pipeline — bare equation wrapping", () => {
  it("symbolic chains wrap with arrows mapped", () =>
    expect(canon("সমীকরণ: ৩x + ২x = ৯০ ⇒ x = ১৮।")).toBe(
      "সমীকরণ: $৩x + ২x = ৯০ \\Rightarrow  x = ১৮$।",
    ));
  it("retry after prose left side", () =>
    expect(canon("যোগফল = 1+2+3+4+5 = 15।")).toBe("যোগফল = $1+2+3+4+5 = 15$।"));
  it("lone values never wrap", () =>
    expect(canon("মোট = ৫০।")).toBe("মোট = ৫০।"));
});
describe("canonical math pipeline — quoted and whole-part divisions", () => {
  it("quoted single letters stack, quotes kept", () =>
    expect(canon("তাহলে 'x/z' এর মান?")).toBe("তাহলে '$\\frac{x}{z}$' এর মান?"));
  it("whole-part single letters stack", () =>
    expect(canon("a/b")).toBe("$\\frac{a}{b}$"));
  it("uppercase-only never converts", () =>
    expect(canon("'M/F' ratio")).toBe("'M/F' ratio"));
  it("unquoted prose pairs never convert", () =>
    expect(canon("x/y coordinates")).toBe("x/y coordinates"));
});
describe("canonical math pipeline — LaTeX artifact repair (Phase 1)", () => {
  it("literal \\% outside math becomes %", () => {
    expect(canon("a 15\\% profit turns into a 5\\% loss.")).toBe(
      "a 15% profit turns into a 5% loss.",
    );
    expect(canon("The answer is 12\\%.")).toBe("The answer is 12%.");
  });
  it("\\% inside a span stays escaped", () =>
    expect(canon("Value is $15\\%$ of total.")).toBe("Value is $15\\%$ of total."));
  it("bare \\sqrt wraps; lost closer consumed on odd parity", () =>
    expect(canon("Mean proportional = \\sqrt{0.04 × 0.09}$ = √0.0036 = 0.06.")).toBe(
      "Mean proportional = $\\sqrt{0.04 × 0.09}$ = $\\sqrt{0.0036}$ = 0.06.",
    ));
  it("bare \\sqrt with no stray $ wraps directly", () =>
    expect(canon("R = \\sqrt{Fraction × 100}  = 3.33\\%.")).toBe(
      "R = $\\sqrt{Fraction × 100}$  = 3.33%.",
    ));
  it("span-in-brace command stays untouched for review", () => {
    const raw = "Time = \\sqrt{$\\frac{4}{9}$ × 100}$ = 20/3.";
    expect(canon(raw)).toBe(raw);
    expect(validateMathContent(raw).valid).toBe(false);
  });
  it("broken implication arrow maps to ⇒", () => {
    const out = canon("Set $6n + 2 = 164$ 🡆 $6n = 162$.");
    expect(out).not.toContain("🡆");
    expect(out).toContain(" ⇒ ");
  });
  it("double-struck pi becomes π", () => expect(canon("ℼ = 3.14")).toContain("π"));
  it("decimal radicand never splits at the point", () => {
    expect(canon("x = √0.0036.")).toBe("x = $\\sqrt{0.0036}$.");
    expect(canon("√36 = 6")).toBe("$\\sqrt{36}$ = 6");
  });
  it("linearized subscripts heal to spans", () => {
    expect(canon("T\\_4+T\\_$8 = 2a + 10d = 24$")).toBe(
      "$T_{4}$+$T_{8} = 2a + 10d = 24$",
    );
    expect(canon("S\\_\\{p+q\\} = -(p+q)")).toContain("$S_{p+q}$");
    expect(canon("Solve for x: log\\_(x+1) ($2x^{2}$ + 1) = 2.")).toBe(
      "Solve for x: $\\log_{x+1}$ ($2x^{2}$ + 1) = 2.",
    );
    expect(canon("Evaluate log\\_$\\sqrt{2}$ 16.")).toBe(
      "Evaluate $\\log_{\\sqrt{2}}$ 16.",
    );
    expect(canon("$\\log_{25}$ x = log\\_$5^{2}$ x = 2.")).toBe(
      "$\\log_{25}$ x = $\\log_{5^{2}}$ $x = 2$.",
    );
  });
  it("unrepairable linearized subscript fails validation (review net)", () => {
    const out = canon("V\\_new = R\\_$\\frac{new}{P}$\\_new = 1.5");
    expect(validateMathContent(out).valid).toBe(false);
    expect(detectLegacyMath("R\\_$x$ remains")).toBe(true);
  });
  it("currency and keyboard dollar usage is never touched", () => {
    expect(canon("move $10M through your account.")).toBe(
      "move $10M through your account.",
    );
    expect(canon("It costs $80")).toBe("It costs $80");
    expect(canon("Ctrl + Shift + $")).toBe("Ctrl + Shift + $");
    expect(canon("The '$' symbol corresponds to currency format.")).toBe(
      "The '$' symbol corresponds to currency format.",
    );
  });
  it("all artifact repairs are idempotent", () => {
    for (const raw of [
      "a 15\\% profit.",
      "Mean proportional = \\sqrt{0.04 × 0.09}$ = √0.0036 = 0.06.",
      "Set $6n + 2 = 164$ 🡆 $n = 27$.",
      "T\\_4+T\\_$8 = 2a + 10d = 24$",
      "log\\_(x+1) ($2x^{2}$ + 1) = 2.",
      "S\\_\\{p+q\\} = -(p+q)",
      "move $10M through your account.",
      "Time = \\sqrt{$\\frac{4}{9}$ × 100}$ = 20/3.",
    ]) {
      const once = canon(raw);
      expect(canon(once)).toBe(once);
    }
  });
});

describe("canonical math pipeline — false-refusal fixes (heal phase)", () => {
  it("√(x) paren consumption does not trip LOST_PARENTHESES", () => {
    const raw = "অতিভুজ = √(১২² + ৫²) = √(১৪৪ + ২৫) = √১৬৯ = ১৩ মিটার।";
    const out = canon(raw);
    expect(out).toContain("\\sqrt{");
    expect(checkMathPreservation(raw, out)).toEqual([]);
  });
  it("in-span (a)/(b) group is preserved, not flagged as lost fraction", () => {
    const raw = "Set up ratio: $(4x-8)/(x+8)=2/3$. Solving yields $x=4$.";
    const out = canon(raw);
    expect(out).toContain("(4x-8)/(x+8)");
    expect(checkMathPreservation(raw, out)).toEqual([]);
  });
  it("genuine paren/frac loss is still flagged", () => {
    expect(
      checkMathPreservation("(a)(b)(c)(d)", "no parens here").some(
        (d) => d.type === "LOST_PARENTHESES",
      ),
    ).toBe(true);
    expect(
      checkMathPreservation("\\frac{a}{b}", "no frac here").some(
        (d) => d.type === "LOST_FRACTION",
      ),
    ).toBe(true);
  });
  it("KaTeX-supported commands used in the bank validate", () => {
    for (const s of [
      "$-11, -7, -3, 1, \\dots$",
      "$T_n = 40 - 4(n-1) > 0 \\implies n \\le 10$",
      "$4d = 16 \\implies d = 4$",
    ]) {
      expect(
        validateMathContent(s).errors.filter((e) => e.type === "UNKNOWN_COMMAND"),
      ).toEqual([]);
    }
  });
});

describe("canonical math pipeline — paren-consumer allowances & base notation", () => {
  it("power, log-subscript and prose-group paren consumption do not flag", () => {
    expect(
      checkMathPreservation(
        "range = -(2^(n-1)) থেকে +(2^(n-1) - 1)",
        canon("range = -(2^(n-1)) থেকে +(2^(n-1) - 1)"),
      ),
    ).toEqual([]);
    expect(
      checkMathPreservation(
        "Simplify log\\_(a/b) + log\\_(b/c) + log\\_(c/a).",
        canon("Simplify log\\_(a/b) + log\\_(b/c) + log\\_(c/a)."),
      ),
    ).toEqual([]);
    expect(
      checkMathPreservation(
        "The inverse of f(x) = (x + 1)/(x − 2) is—",
        canon("The inverse of f(x) = (x + 1)/(x − 2) is—"),
      ),
    ).toEqual([]);
  });
  it("in-span fraction groups next to prose parens never fabricate a lost fraction", () => {
    const raw = "Ratio = ($\\frac{2}{5}$)/($\\frac{5}{12}$).";
    expect(checkMathPreservation(raw, canon(raw))).toEqual([]);
  });
  it("(digits)unicodeSubscript becomes one balanced span", () => {
    const raw = "(10111)₂ = 23।";
    const out = canon(raw);
    expect(out).toContain("$(10111)_{2}$");
    expect(validateMathContent(out, "question").errors).toEqual([]);
    expect(checkMathPreservation(raw, out, "question")).toEqual([]);
    const bn = canon("(১০১০)₂ বাইনারি সংখ্যা।");
    expect(bn).toContain("$(১০১০)_{2}$");
    expect(canon(out)).toBe(out);
  });
});

describe("canonical math pipeline — root-over-division (Practice-Tab fix)", () => {
  const clean = (raw: string) => {
    const out = canon(raw);
    expect(validateMathContent(out, "question").errors).toEqual([]);
    expect(checkMathPreservation(raw, out, "question")).toEqual([]);
    expect(canon(out)).toBe(out); // fixpoint
    return out;
  };
  it("√3/2 → frac-of-root (never strands √ outside)", () =>
    expect(clean("If sin x = √3/2, then tan x = ?")).toContain(
      "$\\frac{\\sqrt{3}}{2}$",
    ));
  it("legacy stranded √$\\frac$ repairs to frac-of-root", () =>
    expect(clean("√$\\frac{3}{2}$")).toBe("$\\frac{\\sqrt{3}}{2}$"));
  it("nested radicals resolve to balanced \\sqrt nesting", () =>
    expect(
      clean("What is the value of √(10+√(25+√(108+√(154+√225))))"),
    ).toBe(
      "What is the value of $\\sqrt{10+\\sqrt{25+\\sqrt{108+\\sqrt{154+\\sqrt{225}}}}}$",
    ));
  it("degree roots still fold (³√(x²), ⁴√(81x⁸))", () => {
    expect(clean("³√(x²)")).toBe("$\\sqrt[3]{x^{2}}$");
    expect(clean("⁴√(81x⁸)")).toBe("$\\sqrt[4]{81x^{8}}$");
  });
  it("x²√y keeps ² on x (not a root degree)", () =>
    expect(clean("x²√y")).toContain("$x^{2}\\sqrt{y}$"));
  it("linguistic √ + Bengali letter (√দয় etymology) is prose, not math", () => {
    const raw = "√দয় + আলু = দয়ালু";
    expect(canon(raw)).toBe(raw);
    expect(validateMathContent(raw, "question").errors).toEqual([]);
    expect(checkMathPreservation(raw, raw, "question")).toEqual([]);
    expect(detectLegacyMath(raw)).toBe(false);
  });
  it("unbalanced √ group passes through for manual review", () => {
    const raw = "unbalanced √(abc leaves review";
    expect(canon(raw)).toBe(raw);
  });
});

describe("reciprocals stranded inside a $…$ span", () => {
  const canon = (s: string) => normalizeMathContent(s).output;
  const idem = (s: string) => canon(canon(s)) === canon(s);

  it("stacks 1/x stranded in an existing span (regression #35943)", () => {
    expect(canon("$(x + 1/x)^{2}$")).toBe("$(x + \\frac{1}{x})^{2}$");
    expect(canon("$(x - 1/x)^{2}$")).toBe("$(x - \\frac{1}{x})^{2}$");
    expect(idem("$(x + 1/x)^{2}$")).toBe(true);
  });
  it("stacks a scripted denominator without eating the exponent", () => {
    expect(canon("$(x^{2} + 1/x^{2})^{2}$")).toBe(
      "$(x^{2} + \\frac{1}{x^{2}})^{2}$",
    );
  });
  it("makes a mixed-style question consistent end to end", () => {
    const raw = "x - $\\frac{1}{x}$ = 3 হলে, $(x + 1/x)^{2}$ এর মান কত?";
    expect(canon(raw)).toBe(
      "x - $\\frac{1}{x}$ = 3 হলে, $(x + \\frac{1}{x})^{2}$ এর মান কত?",
    );
  });

  // Guards: the book prints these INLINE, so they must survive untouched.
  it("leaves exponent fractions inline", () => {
    expect(canon("$x^{5/2}$")).toBe("$x^{5/2}$");
    expect(canon("$(27)^{-2/3}$")).toBe("$(27)^{-2/3}$");
    expect(canon("$k^{1/x}$")).toBe("$k^{1/x}$");
    expect(canon("$k^{(1/x+1/y)}$")).toBe("$k^{(1/x+1/y)}$");
    expect(canon("$2^{x/2}$")).toBe("$2^{x/2}$");
  });
  it("leaves arithmetic working lines inline", () => {
    expect(canon("$72/2=36$")).toBe("$72/2=36$");
    expect(canon("$=(101+199)/2=150$")).toBe("$=(101+199)/2=150$");
    expect(canon("$r = 1/2$")).toBe("$r = 1/2$");
  });
  it("is idempotent (never double-wraps)", () => {
    for (const s of ["$(x + \\frac{1}{x})^{2}$", "$x + \\frac{1}{x}$", "$(x + 1/x)^{2}$"]) {
      expect(idem(s)).toBe(true);
    }
  });
  it("output stays valid LaTeX", () => {
    const out = canon("$(x + 1/x)^{2}$ = $(x - 1/x)^{2}$ + 4 = $3^{2}$ + 4");
    expect(validateMathContent(out, "explanation").errors).toEqual([]);
    expect(checkMathPreservation("$(x + 1/x)^{2}$", out, "explanation")).toEqual([]);
  });
});
