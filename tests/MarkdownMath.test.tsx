import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Markdown from "@/components/chat/Markdown";

describe("Markdown — $...$ math rendering (Phase 3)", () => {
  it("typesets inline $...$ spans with KaTeX", () => {
    const { container } = render(
      <Markdown text="The area is $\frac{1}{2}bh$ square units." />,
    );
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.textContent).not.toContain("$\\frac");
  });

  it("typesets display $$...$$ spans", () => {
    const { container } = render(<Markdown text="$$x^2 + y^2 = z^2$$" />);
    expect(container.querySelector(".math-display")).not.toBeNull();
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("keeps unclosed currency dollars as prose", () => {
    const { container } = render(<Markdown text="It costs $10M in total." />);
    expect(container.textContent).toContain("$10M");
    expect(container.querySelector(".katex")).toBeNull();
  });

  it("emphasis around math does not split the span", () => {
    const { container } = render(<Markdown text="Use *$\sqrt{4}$* here." />);
    expect(container.querySelector("em .katex")).not.toBeNull();
  });

  it("bold around math does not split the span", () => {
    const { container } = render(<Markdown text="Result: **$2^{3}$ = 8**." />);
    expect(container.querySelector("strong .katex")).not.toBeNull();
  });

  it("typesets math inside list items", () => {
    const { container } = render(
      <Markdown text={"- first $a^2$\n- second $b^2$"} />,
    );
    expect(container.querySelectorAll(".katex").length).toBe(2);
  });
});
