import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ScoreRing from "@/components/dashboard/practice/ScoreRing";

describe("ScoreRing", () => {
  it("renders progressbar with correct value", () => {
    render(<ScoreRing percentage={75} label="Mock test score" />);
    const bar = screen.getByRole("progressbar", { name: "Mock test score" });
    expect(bar.getAttribute("aria-valuenow")).toBe("75");
  });
});
