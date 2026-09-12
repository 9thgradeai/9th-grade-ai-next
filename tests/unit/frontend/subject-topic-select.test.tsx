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

function optionTexts(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((o) => o.textContent ?? "");
}

describe("SubjectTopicSelect (popup subject picker)", () => {
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
    // No modal-inducing summary button any more — subjects are directly clickable.
    expect(screen.queryByText(/বাছাই করুন/)).toBeNull();
    // And nothing opens until a subject is clicked.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a popup with topic/subtopic dropdowns when a subject is clicked", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{}}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Click the subject card → it is added to the selection with defaults.
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

    // The popup is now open with both cascading dropdowns.
    expect(screen.getByRole("dialog")).toBeTruthy();
    const comboboxes = screen.getAllByRole("combobox");
    expect(comboboxes).toHaveLength(2);
    const topicOptions = optionTexts(comboboxes[0] as HTMLSelectElement);
    const subjects = makeSubjects();
    expect(topicOptions).toContain(subjects[0].nodes[0].name);
    expect(topicOptions).toContain(subjects[0].nodes[1].name);
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

    // Open the subject's popup so the controls are visible.
    fireEvent.click(screen.getByText("বাংলা").closest("button") as HTMLElement);

    // Complete selection = whole subject → subtopic select disabled.
    const subtopicSelect = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
    expect(subtopicSelect.disabled).toBe(true);

    // Pick a specific topic → cascades the subtopic dropdown.
    fireEvent.change(screen.getAllByRole("combobox")[0], {
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
    const subtopic = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
    expect(subtopic.disabled).toBe(false);
    const options = optionTexts(subtopic);
    expect(options).toContain("শব্দ");
    expect(options).toContain("সমাস");
    expect(options).toContain("ধ্বনি");

    // Selecting a deep descendant path narrows the request to that leaf.
    fireEvent.change(subtopic, { target: { value: "ভাষা/শব্দ/ধ্বনি" } });
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      1: { paths: ["ভাষা/শব্দ/ধ্বনি"], count: 10 },
    });
  });

  it("keeps each subject's selection independent across popups", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{
          1: { paths: ["ভাষা"], count: 10 },
          2: { paths: [], count: 10 },
        }}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Both cards reflect their own selected states.
    const banglaCard = screen.getByText("বাংলা").closest("button") as HTMLElement;
    const englishCard = screen.getByText("ইংরেজি").closest("button") as HTMLElement;
    expect(banglaCard.className).toContain("shadow-neon-glow");
    expect(englishCard.className).toContain("shadow-neon-glow");
    expect(screen.getByText("নির্বাচিত: 10/30")).toBeTruthy();
    expect(screen.getByText("নির্বাচিত: 10/20")).toBeTruthy();

    // Opening the Bangla popup shows Bangla's topics only.
    fireEvent.click(banglaCard);
    rerender(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{ 1: { paths: ["ভাষা"], count: 10 }, 2: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );
    const banglaTopicOptions = optionTexts(
      screen.getAllByRole("combobox")[0] as HTMLSelectElement,
    );
    const subjects = makeSubjects();
    expect(banglaTopicOptions).toContain(subjects[0].nodes[0].name);
    expect(banglaTopicOptions).toContain(subjects[0].nodes[1].name);
    expect(banglaTopicOptions).not.toContain(subjects[1].nodes[0].name);

    // Close and open the English popup → its topics instead.
    fireEvent.click(screen.getByText("সম্পন্ন"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(englishCard);
    rerender(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{ 1: { paths: ["ভাষা"], count: 10 }, 2: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );
    const englishTopicOptions = optionTexts(
      screen.getAllByRole("combobox")[0] as HTMLSelectElement,
    );
    expect(englishTopicOptions).toContain(subjects[1].nodes[0].name);
    expect(englishTopicOptions).not.toContain(subjects[0].nodes[0].name);
  });

  it('removes a subject from the selection via "বিষয়টি সরান"', () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{ 1: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByText("বাংলা").closest("button") as HTMLElement);
    rerender(
      <SubjectTopicSelect
        subjects={makeSubjects()}
        selection={{ 1: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByText("বিষয়টি সরান"));
    expect(onSelectionChange).toHaveBeenCalledWith({});
  });
});