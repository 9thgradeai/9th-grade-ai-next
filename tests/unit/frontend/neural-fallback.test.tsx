import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import NeuralFallback from "@/components/visual/neural/NeuralFallback";

describe("NeuralFallback", () => {
  it("renders a decorative static neural artwork", () => {
    const { container } = render(<NeuralFallback />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelectorAll("[data-neural-fallback]")).toBeTruthy();
  });

  it("draws nodes and links", () => {
    const { container } = render(<NeuralFallback nodes={48} />);
    expect(container.querySelectorAll("circle").length).toBeGreaterThanOrEqual(48);
    expect(container.querySelectorAll("line").length).toBeGreaterThan(10);
  });

  it("is deterministic for a fixed seed", () => {
    const a = render(<NeuralFallback seed={7} />);
    const b = render(<NeuralFallback seed={7} />);
    expect(a.container.innerHTML).toBe(b.container.innerHTML);
  });
});
