import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OptionRow from "@/components/dashboard/practice/OptionRow";
import SubjectTopicSelect from "@/components/dashboard/SubjectTopicSelect";
import type { Server } from "@/lib/types";

describe("OptionRow production hardening", () => {
  it("meets touch target size and kills tap delay", () => {
    render(
      <OptionRow
        option="ঢাকা"
        index={0}
        multi={false}
        state={{ selected: false, locked: false, verdict: null }}
        onPick={() => {}}
      />,
    );
    const row = screen.getByRole("radio");
    expect(row.className).toContain("min-h-[52px]");
    expect(row.className).toContain("[touch-action:manipulation]");
  });
});

describe("SubjectTopicSelect touch targets", () => {
  const subjects = [
    {
      id: 1,
      nameBn: "বাংলা",
      nameEn: "Bangla",
      questionCount: 10,
      icon: "📚",
      bg: "",
      nodes: [
        { path: "ব্যাকরণ", name: "ব্যাকরণ", questionCount: 10, children: [] },
      ],
    },
  ] as unknown as Server.ExamSubjectDTO[];

  it("topic checkbox hit area is >= 44px with full-row target", () => {
    render(
      <SubjectTopicSelect subjects={subjects} selection={{}} onSelectionChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /বাংলা/ }));
    const checkbox = screen.getByRole("checkbox", { name: /ব্যাকরণ/ });
    expect(checkbox.className).toContain("min-w-[44px]");
    // Label button fills the row height too
    const labelBtn = screen.getByRole("button", { name: /^ব্যাকরণ/ });
    expect(labelBtn.className).toContain("min-h-[44px]");
  });

  it("selecting a subject then clearing search keeps 44px clear button", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      nameBn: `বিষয়${i + 1}`,
      nameEn: `Subject${i + 1}`,
      questionCount: 5,
      icon: "📚",
      bg: "",
      nodes: [],
    })) as unknown as Server.ExamSubjectDTO[];
    const onChange = vi.fn();
    render(<SubjectTopicSelect subjects={many} selection={{}} onSelectionChange={onChange} />);
    const search = screen.getByRole("searchbox", { name: "বিষয় খুঁজুন" });
    fireEvent.change(search, { target: { value: "বিষয়" } });
    const clear = screen.getByRole("button", { name: "খোঁজা মুছুন" });
    expect(clear.className).toContain("min-w-[44px]");
  });
});
