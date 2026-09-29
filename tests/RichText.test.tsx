import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RichText, { truncateMathSafe } from "@/components/ui/RichText";

describe("RichText", () => {
  it("renders plain text unchanged", () => {
    render(<RichText text="What is the capital of Bangladesh?" />);
    expect(screen.getByText("What is the capital of Bangladesh?")).toBeInTheDocument();
  });

  it("renders **bold** markers as strong", () => {
    const { container } = render(<RichText text="Choose the **correct** sentence." />);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("correct");
    expect(container.textContent).toBe("Choose the correct sentence.");
  });

  it("renders *italic* markers as em", () => {
    const { container } = render(
      <RichText text="The board objected to *his presenting the report*." />,
    );
    const em = container.querySelector("em");
    expect(em?.textContent).toBe("his presenting the report");
    expect(container.textContent).toBe("The board objected to his presenting the report.");
  });

  it("leaves unmatched asterisks literal", () => {
    render(<RichText text="Solve 5 * 3 + 2." />);
    expect(screen.getByText("Solve 5 * 3 + 2.")).toBeInTheDocument();
  });

  it("highlights query matches without breaking markers", () => {
    const { container } = render(<RichText text="The *audit report* was reviewed." query="audit" />);
    const mark = container.querySelector("mark");
    expect(mark?.textContent).toBe("audit");
    expect(container.querySelector("em")?.textContent).toBe("audit report");
  });

  it("escapes HTML instead of rendering it", () => {
    const { container } = render(<RichText text="<img src=x onerror=alert(1)>" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("RichText — math rendering", () => {
  it("typesets $...$ spans with KaTeX", () => {
    const { container } = render(<RichText text="The area is $\frac{1}{2}$ of the base." />);
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.textContent).not.toContain("$\\frac");
  });

  it("leaves unclosed currency dollars as prose", () => {
    const { container } = render(<RichText text="He earns $10M per year." />);
    expect(container.textContent).toContain("$10M");
    expect(container.querySelector(".katex")).toBeNull();
  });
});

describe("truncateMathSafe", () => {
  it("returns short text unchanged", () => {
    expect(truncateMathSafe("x² + y² = z²", 60)).toBe("x² + y² = z²");
  });

  it("never cuts inside a math span", () => {
    const text = "Area = $\\frac{1}{2} \\times base \\times height$ units squared here";
    const out = truncateMathSafe(text, 24);
    expect(out.endsWith("…")).toBe(true);
    expect(((out.match(/\$/g) ?? []).length) % 2).toBe(0);
    expect(out.length).toBeLessThanOrEqual(25);
  });

  it("keeps complete spans and plain prose intact", () => {
    const out = truncateMathSafe("Solve $x + 1 = 5$ for x and then verify", 60);
    expect(out).toBe("Solve $x + 1 = 5$ for x and then verify");
  });

  it("trims at the last $ when the cut would strand an opener", () => {
    const out = truncateMathSafe("Total $\\sqrt{144} plus trailing words", 12);
    expect(((out.match(/\$/g) ?? []).length) % 2).toBe(0);
    expect(out.endsWith("…")).toBe(true);
  });
});
