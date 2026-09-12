import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SubjectTopicSelect from "@/components/dashboard/SubjectTopicSelect";
import type { Server } from "@/lib/types";

function makeSubjects(): Server.ExamSubjectDTO[] {
  return [
    {
      id: 1,
      nameBn: "বাংলা",
      nameEn: "Bangla",
      icon: "বাং",
      color: "#107c41",
      bg: "bg-emerald-500/10",
      questionCount: 30,
      nodes: [
        {
          id: 10,
          name: "ভাষা",
          path: "ভাষা",
          depth: 1,
          questionCount: 15,
          children: [
            {
              id: 101,
              name: "শব্দ",
              path: "ভাষা/শব্দ",
              depth: 2,
              questionCount: 8,
              children: [
                {
                  id: 1010,
                  name: "ধ্বনি",
                  path: "ভাষা/শব্দ/ধ্বনি",
                  depth: 3,
                  questionCount: 3,
                  children: [],
                },
              ],
            },
            {
              id: 102,
              name: "সমাস",
              path: "ভাষা/সমাস",
              depth: 2,
              questionCount: 7,
              children: [],
            },
          ],
        },
        {
          id: 11,
          name: "সাহিত্য",
          path: "সাহিত্য",
          depth: 1,
          questionCount: 15,
          children: [
            {
              id: 111,
              name: "প্রাচীন যুগ",
              path: "সাহিত্য/প্রাচীন যুগ",
              depth: 2,
              questionCount: 15,
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: 2,
      nameBn: "ইংরেজি",
      nameEn: "English",
      icon: "EN",
      color: "#20639b",
      bg: "bg-blue-500/10",
      questionCount: 20,
      nodes: [
        {
          id: 20,
          name: "Parts of Speech",
          path: "Parts of Speech",
          depth: 1,
          questionCount: 20,
          children: [
            {
              id: 201,
              name: "Noun",
              path: "Parts of Speech/Noun",
              depth: 2,
              questionCount: 20,
              children: [],
            },
          ],
        },
      ],
    },
  ];
}

describe("SubjectTopicSelect (inline dropdown picker)", () => {
  it("shows every subject up-front without any button press", () => {
    render(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{}}
        onSelectionChange={() => {}}
      />,
    );

    expect(screen.getByText("বাংলা")).toBeTruthy();
    expect(screen.getByText("ইংরেজি")).toBeTruthy();
    expect(screen.queryByText(/বাছাই করুন/)).toBeNull();
  });

  it("reveals topic/subtopic dropdowns only after a subject is selected", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{}}
        onSelectionChange={onSelectionChange}
      />,
    );

    expect(screen.queryByLabelText("টপিক")).toBeNull();

    const subjectCard = screen.getByText("বাংলা").closest("button");
    fireEvent.click(subjectCard as HTMLElement);
    expect(onSelectionChange).toHaveBeenCalledWith({
      1: { paths: [], count: 10 },
    });

    rerender(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{ 1: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Topic + subtopic dropdowns now visible for the selected subject.
    expect(screen.getByLabelText("টপিক")).toBeTruthy();
    expect(screen.getByLabelText("সাবটপিক")).toBeTruthy();
    const topicOptions = screen.getByLabelText("টপিক").querySelectorAll("option");
    expect(Array.from(topicOptions).map((o) => o.textContent)).toContain("ভাষা");
    expect(Array.from(topicOptions).map((o) => o.textContent)).toContain("সাহিত্য");
  });

  it("populates the subtopic dropdown from the chosen topic's descendants", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{ 1: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Complete selection = whole subject → subtopic select disabled.
    const subtopicSelect = screen.getByLabelText("সাবটপিক") as HTMLSelectElement;
    expect(subtopicSelect.disabled).toBe(true);

    // Pick a specific topic → cascades the subtopic dropdown.
    fireEvent.change(screen.getByLabelText("টপিক"), {
      target: { value: "ভাষা" },
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      1: { paths: ["ভাষা"], count: 10 },
    });

    rerender(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{ 1: { paths: ["ভাষা"], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Deep descendants (including depth 3) are all offered as options.
    const subtopic = screen.getByLabelText("সাবটপিক") as HTMLSelectElement;
    expect(subtopic.disabled).toBe(false);
    const options = Array.from(subtopic.options).map((o) => o.textContent);
    expect(options).toContain("শব্দ");
    expect(options).toContain("সমাস");
    expect(options).toContain("ধ্বনি");

    // Selecting a deep descendant path narrows the request to that leaf.
    fireEvent.change(subtopic, { target: { value: "ভাষা/শব্দ/ধ্বনি" } });
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      1: { paths: ["ভাষা/শব্দ/ধ্বনি"], count: 10 },
    });
  });

  it("keeps each subject's selection independent", () => {
    const onSelectionChange = vi.fn();
    render(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{
          1: { paths: ["ভাষা"], count: 10 },
          2: { paths: [], count: 10 },
        }}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Two subjects → two topic dropdowns.
    expect(screen.getAllByLabelText("টপিক")).toHaveLength(2);
    expect(screen.getAllByLabelText("সাবটপিক")).toHaveLength(2);
  });
});