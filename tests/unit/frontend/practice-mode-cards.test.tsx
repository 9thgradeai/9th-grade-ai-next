import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PracticeModeCards from "@/components/dashboard/PracticeModeCards";

describe("PracticeModeCards", () => {
  it("renders three mode cards with Bengali labels", () => {
    render(<PracticeModeCards mode="quick" onChange={() => {}} quickTotal={10} ecosystem="BCS" />);
    expect(screen.getByRole("group", { name: "Practice mode" })).toBeDefined();
    expect(screen.getByText(/Quick Drill/)).toBeDefined();
    expect(screen.getByText(/Custom Exam/)).toBeDefined();
    expect(screen.getByText(/Mock Test/)).toBeDefined();
  });

  it("marks active mode pressed and calls onChange", () => {
    const onChange = vi.fn();
    render(<PracticeModeCards mode="quick" onChange={onChange} quickTotal={0} ecosystem="BCS" />);
    const mockBtn = screen.getByText(/Mock Test/).closest("button")!;
    expect(mockBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(mockBtn);
    expect(onChange).toHaveBeenCalledWith("mock");
  });
});
