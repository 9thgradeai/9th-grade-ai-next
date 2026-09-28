import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MathText from "@/components/ui/MathText";
import RichText from "@/components/ui/RichText";

describe("MathText (KaTeX book-exact math)", () => {
  it("renders plain text unchanged when no $...$ present", () => {
    render(<MathText text="সাধারণ গদ্য, কোনো গণিত নেই।" />);
    expect(screen.getByText("সাধারণ গদ্য, কোনো গণিত নেই।")).toBeInTheDocument();
  });

  it("typesets $...$ spans with KaTeX", () => {
    const { container } = render(<MathText text="যদি $2^{x+1}$=32 হয়" />);
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.textContent).toContain("যদি");
  });

  it("falls back to raw text on malformed LaTeX instead of crashing", () => {
    const { container } = render(<MathText text="Broken $\\frac{ scam" />);
    expect(container.textContent).toContain("Broken");
  });
});

describe("RichText with math", () => {
  it("typesets $...$ inside question text", () => {
    const { container } = render(<RichText text="Solve $9^{x}$ for x." />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("keeps **bold** working alongside math", () => {
    const { container } = render(<RichText text="Find **x**: $x_{1}$?" />);
    expect(container.querySelector("strong")?.textContent).toBe("x");
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("never splits LaTeX when highlighting", () => {
    const { container } = render(<RichText text="Value $x_{1}$ here" query="x" />);
    // highlight marks may exist in prose, but the KaTeX span stays intact
    expect(container.querySelector(".katex")).not.toBeNull();
  });
});
