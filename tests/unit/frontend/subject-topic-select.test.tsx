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

const subjects = makeSubjects();
const bhasa = subjects[0].nodes[0];
const sahitya = subjects[0].nodes[1];
const shobdo = bhasa.children[0];
const partsOfSpeech = subjects[1].nodes[0];

describe("SubjectTopicSelect (popup subject picker)", () => {
  it("shows every subject up-front without any button press", () => {
    render(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{}}
        onSelectionChange={() => {}}
      />,
    );

    expect(screen.getByText(subjects[0].nameBn)).toBeTruthy();
    expect(screen.getByText(subjects[1].nameBn)).toBeTruthy();
    // Nothing opens until a subject is clicked.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a popup with the topic tree when a subject is clicked", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{}}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Click the subject card → it is added to the selection with defaults.
    const subjectCard = screen.getByText(subjects[0].nameBn).closest("button");
    fireEvent.click(subjectCard as HTMLElement);
    expect(onSelectionChange).toHaveBeenCalledWith({
      1: { paths: [], count: 10 },
    });

    rerender(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    // The popup is open with the whole-subject mode active by default and a
    // checkbox rows for the subject's top-level topics.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("পুরো বিষয় ✓")).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].getAttribute("aria-checked")).toBe("false");
    expect(checkboxes[1].getAttribute("aria-checked")).toBe("false");
  });

  it("lets multiple topics/subtopics be selected together across the tree", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByText(subjects[0].nameBn).closest("button") as HTMLElement);

    // Select the first top-level topic.
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      1: { paths: [bhasa.path], count: 10 },
    });

    rerender(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [bhasa.path], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Selecting the topic expands its children so subtopics are tickable.
    const checkboxNames = screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-checked"));
    expect(checkboxNames).toHaveLength(4);

    // Select a second, independent topic → the path list grows.
    fireEvent.click(screen.getAllByRole("checkbox")[3]);
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      1: { paths: [bhasa.path, sahitya.path], count: 10 },
    });

    rerender(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [bhasa.path, sahitya.path], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Tick a subtopic underneath the first topic: the ancestor is dropped
    // (the subtopic narrows it) but the unrelated topic stays selected.
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      1: { paths: [sahitya.path, shobdo.path], count: 10 },
    });

    rerender(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [sahitya.path, shobdo.path], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    // A narrowed multi-path selection no longer counts as "whole subject".
    expect(screen.getByText("সম্পূর্ণ বিষয় নির্বাচন করুন")).toBeTruthy();
  });

  it("expands and re-narrows from an already selected sub-branch", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [shobdo.path], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByText(subjects[0].nameBn).closest("button") as HTMLElement);

    // The selected deep branch is expanded: all ancestors are visible.
    const checkboxes = screen.getAllByRole("checkbox");
    // Selection for [শব্দ]: its ancestors (ভাষা) are not checked themselves.
    expect(checkboxes.length).toBeGreaterThan(1);

    // Re-select the parent topic → descendant branches collapse into it.
    fireEvent.click(checkboxes[0]);
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      1: { paths: [bhasa.path], count: 10 },
    });
  });

  it("toggles back to the whole subject from a narrowed selection", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [bhasa.path], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Bangla popup opens in the narrowed state.
    fireEvent.click(screen.getByText(subjects[0].nameBn).closest("button") as HTMLElement);
    rerender(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [bhasa.path], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(screen.getByText("সম্পূর্ণ বিষয় নির্বাচন করুন")).toBeTruthy();

    // Clicking the whole-subject toggle clears every path.
    fireEvent.click(screen.getByText("সম্পূর্ণ বিষয় নির্বাচন করুন"));
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      1: { paths: [], count: 10 },
    });

    rerender(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(screen.getByText("পুরো বিষয় ✓")).toBeTruthy();
    expect(screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
    ]);
  });

  it("keeps each subject's selection independent across popups", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{
          1: { paths: [bhasa.path], count: 10 },
          2: { paths: [], count: 10 },
        }}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Both cards reflect their own selected states.
    const banglaCard = screen.getByText(subjects[0].nameBn).closest("button") as HTMLElement;
    const englishCard = screen.getByText(subjects[1].nameBn).closest("button") as HTMLElement;
    expect(banglaCard.className).toContain("shadow-neon-glow");
    expect(englishCard.className).toContain("shadow-neon-glow");
    expect(screen.getByText("নির্বাচিত: 10/30")).toBeTruthy();
    expect(screen.getByText("নির্বাচিত: 10/20")).toBeTruthy();

    // Opening the Bangla popup shows Bangla's topics only.
    fireEvent.click(banglaCard);
    rerender(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [bhasa.path], count: 10 }, 2: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );
    const banglaCheckboxes = screen.getAllByRole("checkbox");
    expect(banglaCheckboxes).toHaveLength(4); // ভাষা + its two children + সাহিত্য
    expect(screen.queryByText(partsOfSpeech.name)).toBeNull();

    // Close and open the English popup → its topics instead.
    fireEvent.click(screen.getByText("সম্পন্ন"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(englishCard);
    rerender(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [bhasa.path], count: 10 }, 2: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );
    const englishCheckboxes = screen.getAllByRole("checkbox");
    expect(englishCheckboxes).toHaveLength(1);
    expect(englishCheckboxes[0].getAttribute("aria-label")).toContain(partsOfSpeech.name);
    expect(screen.queryByText(bhasa.name)).toBeNull();
  });

  it('removes a subject from the selection via "বিষয়টি সরান"', () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByText(subjects[0].nameBn).closest("button") as HTMLElement);
    rerender(
      <SubjectTopicSelect
        subjects={subjects}
        selection={{ 1: { paths: [], count: 10 } }}
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByText("বিষয়টি সরান"));
    expect(onSelectionChange).toHaveBeenCalledWith({});
  });
});