import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import AiLogo from "@/components/ui/AiLogo";

describe("AiLogo", () => {
  it("renders the solid deep-space tile with the ninth-signal glyph", () => {
    const { container } = render(<AiLogo className="h-8 w-8" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(container.querySelectorAll("rect").length).toBe(2);
    expect(container.querySelectorAll("path").length).toBe(4);
    expect(container.querySelector("circle")).toBeTruthy();
  });

  it("renders the monochrome glyph without a tile in soft mode", () => {
    const { container } = render(<AiLogo solid={false} className="h-4 w-4" />);
    expect(container.querySelector("rect")).toBeNull();
    expect(container.querySelectorAll("path").length).toBe(4);
  });

  it("is marked decorative and uses unique gradient ids", () => {
    const { container } = render(<AiLogo />);
    const gid = container.querySelector("linearGradient")?.id;
    expect(gid).toBeTruthy();
    expect(container.querySelectorAll(`[id^="ailogo-"]`).length).toBeGreaterThan(0);
  });
});