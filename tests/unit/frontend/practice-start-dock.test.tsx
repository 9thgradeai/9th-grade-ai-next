import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PracticeStartDock from "@/components/dashboard/PracticeStartDock";
import SubjectTopicSelect from "@/components/dashboard/SubjectTopicSelect";
import type { Server } from "@/lib/types";

function dockProps(overrides: Partial<Parameters<typeof PracticeStartDock>[0]> = {}) {
  return {
    totalCount: 0,
    availableTotal: 0,
    insufficient: false,
    durationMin: 10,
    durationTouched: false,
    autoCaption: "",
    selectedCount: 0,
    loading: false,
    onAdjustDuration: vi.fn(),
    onStart: vi.fn(),
    ...overrides,
  };
}

describe("PracticeStartDock (sticky one-handed start)", () => {
  it("pins to the viewport with totals and a disabled start when nothing is selected", () => {
    render(<PracticeStartDock {...dockProps()} />);
    const dock = screen.getByTestId("practice-start-dock");
    expect(dock.className).toContain("sticky");
    expect(screen.getByTestId("dock-total").textContent).toBe("0");
    expect(screen.getByTestId("dock-start").hasAttribute("disabled")).toBe(true);
  });

  it("enables start with the live count and fires onStart", () => {
    const onStart = vi.fn();
    render(
      <PracticeStartDock
        {...dockProps({ totalCount: 20, availableTotal: 50, selectedCount: 1, onStart })}
      />,
    );
    const start = screen.getByTestId("dock-start");
    expect(start.hasAttribute("disabled")).toBe(false);
    expect(start.textContent).toContain("20টি");
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("steps the session time without leaving the dock", () => {
    const onAdjustDuration = vi.fn();
    render(
      <PracticeStartDock
        {...dockProps({ totalCount: 10, selectedCount: 1, onAdjustDuration })}
      />,
    );
    fireEvent.click(screen.getByLabelText("সময় বাড়ান"));
    expect(onAdjustDuration).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByLabelText("সময় কমান"));
    expect(onAdjustDuration).toHaveBeenCalledWith(-1);
    expect(screen.getByTestId("dock-duration").textContent).toBe("10");
  });

  it("flags the over-requested state in the totals", () => {
    render(
      <PracticeStartDock
        {...dockProps({ totalCount: 60, availableTotal: 50, insufficient: true, selectedCount: 1 })}
      />,
    );
    expect(screen.getByTestId("dock-total").textContent).toBe("60");
    expect(screen.getByText("/ 50 উপলব্ধ")).toBeTruthy();
  });
});

function makeManySubjects(): Server.ExamSubjectDTO[] {
  const names: [string, string][] = [
    ["বাংলা", "Bangla"],
    ["ইংরেজি", "English"],
    ["গণিত", "Math"],
    ["বিজ্ঞান", "Science"],
    ["ইতিহাস", "History"],
  ];
  return names.map(([nameBn, nameEn], i) => ({
    id: i + 1,
    nameBn,
    nameEn,
    icon: nameEn.slice(0, 2),
    color: "#107c41",
    bg: "bg-emerald-500/10",
    questionCount: 10,
    nodes: [],
  }));
}

describe("SubjectTopicSelect search", () => {
  it("filters the subject grid by Bangla or English name", () => {
    const subjects = makeManySubjects();
    render(
      <SubjectTopicSelect subjects={subjects} selection={{}} onSelectionChange={() => {}} />,
    );
    const search = screen.getByLabelText("বিষয় খুঁজুন");
    fireEvent.change(search, { target: { value: "math" } });
    expect(screen.queryByText("গণিত")).toBeTruthy();
    expect(screen.queryByText("বাংলা")).toBeNull();
    // Clear restores the full grid.
    fireEvent.click(screen.getByLabelText("খোঁজা মুছুন"));
    expect(screen.queryByText("বাংলা")).toBeTruthy();
    expect(screen.queryByText("ইতিহাস")).toBeTruthy();
  });

  it("shows an empty state when nothing matches", () => {
    render(
      <SubjectTopicSelect
        subjects={makeManySubjects()}
        selection={{}}
        onSelectionChange={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("বিষয় খুঁজুন"), { target: { value: "zzz" } });
    expect(screen.getByText(/কোনো বিষয় মেলেনি/)).toBeTruthy();
  });
});
