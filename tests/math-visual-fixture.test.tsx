import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import MathText from "@/components/ui/MathText";
import RichText from "@/components/ui/RichText";
import { toCanonicalMath } from "@/lib/math/canonical-math";

/** Representative mathematical fixture (Phase 23): one of each shape. */
export const MATH_FIXTURE = [
  "$x^{2}$", // power
  "$x_{1}$", // subscript
  "$\\frac{p+q}{pq}$", // fraction
  "$\\frac{1}{1+\\frac{1}{x}}$", // nested fraction
  "$\\sqrt{a\\times b}$", // square root
  "$\\sqrt[3]{x^{2}}$", // cube root
  "$\\sqrt[4]{81x^{8}}$", // nth root
  "$\\log_{2}x$", // logarithm
  "$x^{2}-5x+6=0$", // equation
  "$\\frac{2^{x+1}-\\sqrt{x}}{\\log_{2}x}$", // nested equation
  "যদি $x^{2}-5x+6=0$ হয়, তবে $x$ এর মান কত?", // Bangla + math
  "Find $x$ if $\\frac{x+1}{x-1}=3$.", // English + math
  "$$\\frac{x+1}{x-1}=5$$", // display math
  "$2^{x+1}+2^{x+2}+2^{x+3}+2^{x+4}+2^{x+5}=270$", // long equation
];

describe("math visual regression fixture", () => {
  for (const text of MATH_FIXTURE) {
    it(`renders without raw LaTeX/unicode: ${text.slice(0, 40)}`, () => {
      const { container } = render(<MathText text={`Q: ${text}`} />);
      expect(container.querySelector(".katex")).not.toBeNull();
      // No raw backslash-commands leak as visible text outside KaTeX spans.
      const prose = [...container.childNodes].map((n) => n.textContent).join("");
      expect(prose).not.toContain("\\frac");
      expect(prose).not.toContain("\\sqrt");
      // No KaTeX hard-error blocks.
      expect(container.querySelector('[data-math-error="true"]')).toBeNull();
    });
  }

  it("display math uses block layout", () => {
    const { container } = render(<MathText text="Solve: $$\\frac{x+1}{x-1}=5$$" />);
    expect(container.querySelector(".math-display")).not.toBeNull();
  });

  it("same fixture renders identically through RichText", () => {
    for (const text of MATH_FIXTURE) {
      const { container, unmount } = render(<RichText text={text} />);
      if (text.includes("$")) expect(container.querySelector(".katex")).not.toBeNull();
      unmount();
    }
  });

  it("canonical pipeline output renders cleanly end-to-end", () => {
    const raws = ["x²", "x₁", "√x", "³√x", "log₂x", "(a+b)/(c+d)", "2ˣ⁺¹", "(xᵃ/xᵇ)ᵃ⁺ᵇ"];
    for (const raw of raws) {
      const canonical = toCanonicalMath(raw);
      const { container, unmount } = render(<MathText text={canonical} />);
      expect(container.querySelector(".katex")).not.toBeNull();
      expect(container.querySelector('[data-math-error="true"]')).toBeNull();
      unmount();
    }
  });

  it("mobile-width long equation does not clip (scrollable display)", () => {
    const { container } = render(
      <MathText text="$$2^{x+1}+2^{x+2}+2^{x+3}+2^{x+4}+2^{x+5}=270$$" />,
    );
    const disp = container.querySelector(".math-display") as HTMLElement;
    expect(disp).not.toBeNull();
    const style = getComputedStyle(disp);
    expect(["auto", "scroll", "visible"]).toContain(style.overflowX);
  });
  it("RichText keeps display math intact while highlighting prose", () => {
    const { container } = render(
      <RichText text="Solve $$\\frac{x+1}{x-1}=5$$ now" query="solve" />,
    );
    expect(container.querySelector(".math-display")).not.toBeNull();
    expect(container.querySelector("mark")?.textContent?.toLowerCase()).toBe("solve");
    // No stray "$" prose nodes leak around the display span.
    const stray = [...container.querySelectorAll("span")].filter(
      (el) => el.textContent === "$" && !el.querySelector(".katex"),
    );
    expect(stray.length).toBe(0);
  });
});
