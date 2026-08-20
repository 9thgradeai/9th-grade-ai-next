import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import AiLogo from "@/components/ui/AiLogo";

describe("AiLogo", () => {
  it("renders the solid gradient tile with a bubble and spark", () => {
    const { container } = render(<AiLogo className="h-8 w-8" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(container.querySelector("rect")).toBeTruthy();
    expect(container.querySelectorAll("path").length).toBe(2);
  });

  it("renders the monochrome glyph without a tile in soft mode", () => {
    const { container } = render(<AiLogo solid={false} className="h-4 w-4" />);
    expect(container.querySelector("rect")).toBeNull();
    expect(container.querySelectorAll("path").length).toBe(2);
  });

  it("is marked decorative and uses unique gradient ids", () => {
    const { container } = render(<AiLogo />);
    const gid = container.querySelector("linearGradient")?.id;
    expect(gid).toBeTruthy();
    expect(container.querySelectorAll(`[id^="ailogo-"]`).length).toBeGreaterThan(0);
  });
});