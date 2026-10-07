import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import SubjectTopicSelect from "@/components/dashboard/SubjectTopicSelect";
import type { Server } from "@/lib/types";

const SUBJECTS: Server.ExamSubjectDTO[] = [
  {
    id: 1,
    nameBn: "বাংলা",
    nameEn: "Bangla",
    icon: "📖",
    color: "emerald",
    bg: "bg-emerald-500/10",
    questionCount: 50,
    nodes: [
      { id: 11, name: "ব্যাকরণ", path: "grammar", depth: 1, questionCount: 30, children: [] },
    ],
  },
];

function Harness() {
  const [selection, setSelection] = useState<Record<number, { paths: string[]; count?: number }>>({});
  return (
    <div id="dashboard-content">
      <SubjectTopicSelect subjects={SUBJECTS} selection={selection} onSelectionChange={setSelection} />
    </div>
  );
}

describe("SubjectTopicSelect scroll-lock", () => {
  it("locks background scroll while the sheet is open and restores on close", () => {
    document.body.style.overflow = "";
    render(<Harness />);
    const dash = document.getElementById("dashboard-content");
    expect(dash?.style.overflow).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /বাংলা/ }));
    expect(document.body.style.overflow).toBe("hidden");
    expect(dash?.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "সম্পন্ন" }));
    expect(document.body.style.overflow).toBe("");
    expect(dash?.style.overflow).toBe("");
  });
});
