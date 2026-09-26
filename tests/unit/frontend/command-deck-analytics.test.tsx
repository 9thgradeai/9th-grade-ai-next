import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PerformanceCard from "@/components/dashboard/command-center/PerformanceCard";
import TodayPlanCard from "@/components/dashboard/command-center/TodayPlanCard";

vi.mock("@/lib/store-ctx/dashboard", () => ({
  useDashboardStore: () => ({ setActiveTab: vi.fn() }),
}));

vi.mock("@/lib/toast-ctx", () => ({
  useToastSafe: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/lib/lang-ctx", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lang-ctx")>("@/lib/lang-ctx");
  return { ...actual, useLanguage: () => ({ lang: "en" as const }) };
});

vi.mock("@/lib/services/api", () => ({
  api: { createStudyTask: vi.fn() },
}));

const activity = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, "0")}`,
  answered: 4 + (i % 5),
  correct: 3 + (i % 3),
  durationSec: 600,
}));

describe("PerformanceCard range morph", () => {
  it("plots the selected window and re-plots on range change", () => {
    const onRangeChange = vi.fn();
    const { container, rerender } = render(
      <PerformanceCard activity={activity} results={[]} range="7D" onRangeChange={onRangeChange} />,
    );
    // 7D → 7 dots; the plotted path exists.
    expect(container.querySelectorAll("svg circle")).toHaveLength(7);
    expect(container.querySelector("svg path[stroke]")).toHaveAttribute("d");
    rerender(
      <PerformanceCard activity={activity} results={[]} range="30D" onRangeChange={onRangeChange} />,
    );
    expect(container.querySelectorAll("svg circle")).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "90D" }));
    expect(onRangeChange).toHaveBeenCalledWith("90D");
  });

  it("keeps the honest empty state with no activity", () => {
    render(<PerformanceCard activity={[]} results={[]} range="7D" onRangeChange={() => {}} />);
    expect(screen.getByText(/No activity points/i)).toBeInTheDocument();
  });
});

describe("TodayPlanCard checkmark", () => {
  const tasks = [
    { id: 1, title: "Solve 20 MCQs", subject: "Math", day: "Monday", duration: 20, priority: "high", completed: true },
    { id: 2, title: "Revise notes", subject: "English", day: "Monday", duration: 15, priority: "medium", completed: false },
  ] as never;

  it("draws the check on completed tasks and toggles on click", () => {
    const onToggle = vi.fn();
    const { container } = render(<TodayPlanCard tasks={tasks} onToggle={onToggle} />);
    // Completed task carries the svg checkmark; the open task does not.
    const checks = container.querySelectorAll('button[aria-pressed="true"] svg path');
    expect(checks).toHaveLength(1);
    expect(container.querySelector('button[aria-pressed="false"] svg')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
    expect(onToggle).toHaveBeenCalledWith(2);
  });
});
