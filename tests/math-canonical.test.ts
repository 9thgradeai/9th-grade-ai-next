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
  it("r√π keeps coefficient outside", () =>
    expect(canon("a = r√π।")).toBe("a = r$\\sqrt{π}$।"));
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
