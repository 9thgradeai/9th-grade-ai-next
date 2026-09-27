import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QuestionRenderer from "@/components/dashboard/practice/QuestionRenderer";
import { SingleChoiceView, MultipleChoiceView } from "@/components/dashboard/practice/ChoiceViews";
import StatementCombinationView from "@/components/dashboard/practice/StatementCombinationView";
import MediaAttachmentView from "@/components/dashboard/practice/MediaAttachmentView";
import type { QuestionDTO } from "@/lib/types";

function fixture(over: Partial<QuestionDTO> = {}): QuestionDTO {
  return {
    id: 1,
    subjectId: 1,
    subject: "Test",
    topic: "T",
    subtopic: "",
    question: "Pick one.",
    options: ["A", "B", "C"],
    correctAnswer: "B",
    explanation: "",
    difficulty: "MEDIUM",
    year: null,
    sourceExam: "",
    bcsTerm: null,
    questionType: "SINGLE_CHOICE",
    correctAnswers: [],
    statements: [],
    media: [],
    ...over,
  };
}

const base = { selected: [] as string[], locked: false, onSelect: vi.fn() };

describe("QuestionRenderer", () => {
  it("renders SingleChoiceView for SINGLE_CHOICE with radio roles", () => {
    render(<QuestionRenderer question={fixture()} {...base} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("renders MultipleChoiceView with checkboxes for MULTIPLE_CHOICE", () => {
    const onSelect = vi.fn();
    render(
      <QuestionRenderer
        question={fixture({ questionType: "MULTIPLE_CHOICE", correctAnswers: ["A", "C"] })}
        selected={[]}
        locked={false}
        onSelect={onSelect}
      />,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    fireEvent.click(boxes[0]);
    expect(onSelect).toHaveBeenCalledWith(["A"]);
  });

  it("single view replaces (not toggles) the selection", () => {
    const onSelect = vi.fn();
    render(<QuestionRenderer question={fixture()} selected={["A"]} locked={false} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole("radio")[2]);
    expect(onSelect).toHaveBeenCalledWith(["C"]);
  });

  it("renders statements + combos for STATEMENT_COMBINATION", () => {
    render(
      <QuestionRenderer
        question={fixture({ questionType: "STATEMENT_COMBINATION", statements: ["First", "Second"] })}
        {...base}
      />,
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("locks input when locked", () => {
    render(<QuestionRenderer question={fixture()} selected={[]} locked onSelect={vi.fn()} />);
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
  });
});

describe("sub-views", () => {
  it("MultipleChoiceView toggles picks off", () => {
    const onSelect = vi.fn();
    render(<SingleChoiceView options={["A"]} selected={[]} locked={false} onSelect={onSelect} />);
    expect(screen.getByRole("radio")).toBeInTheDocument();
    render(<MultipleChoiceView options={["A", "B"]} selected={["A", "B"]} locked={false} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(onSelect).toHaveBeenCalledWith(["B"]);
  });

  it("StatementCombinationView numbers statements with Roman numerals", () => {
    const { container } = render(
      <StatementCombinationView statements={["s1", "s2"]} options={["x"]} selected={[]} locked={false} onSelect={vi.fn()} />,
    );
    expect(container.textContent).toContain("I.");
    expect(container.textContent).toContain("II.");
  });

  it("MediaAttachmentView renders images above children", () => {
    render(
      <MediaAttachmentView media={[{ kind: "image", url: "/fig1.png", alt: "Fig" }]}>
        <span>child</span>
      </MediaAttachmentView>,
    );
    const img = screen.getByAltText("Fig");
    expect(img).toHaveAttribute("src", "/fig1.png");
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("MediaAttachmentView ignores unknown kinds", () => {
    const { container } = render(
      <MediaAttachmentView media={[{ kind: "video", url: "/v.mp4" }]}>
        <span>child</span>
      </MediaAttachmentView>,
    );
    expect(container.querySelector("img,video")).toBeNull();
  });
});
