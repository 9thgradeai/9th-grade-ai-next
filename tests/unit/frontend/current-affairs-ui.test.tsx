// @vitest-environment jsdom
//
// Current-affairs UI tests: the interactive MCQ quiz
// (immediate feedback + bilingual explanation) and the
// markdown/DOCX export converters.

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import McqQuizWidget from "@/components/current-affairs/McqQuizWidget";
import CitationDrawer from "@/components/current-affairs/CitationDrawer";
import { LanguageContext } from "@/lib/lang-ctx";
import { docToMarkdown, docToBlocks } from "@/components/current-affairs/exportNote";
import type { Server } from "@/lib/types";

const MCQS: Server.CurrentAffairsMcqDTO[] = [
  {
    id: "m1",
    question: "What did GDP do?",
    options: ["Rose", "Fell", "Flat", "Unknown"],
    correctOption: 0,
    explanation: "It rose 5.2%.",
    explanationBn: "এটি ৫.২% বেড়েছে।",
    relevantExam: "Both",
  },
  {
    id: "m2",
    question: "Second question?",
    options: ["A", "B", "C", "D"],
    correctOption: 2,
    explanation: "Because C.",
    explanationBn: "কারণ C।",
    relevantExam: "BCS",
  },
];

function renderQuiz(lang: "en" | "bn" = "en") {
  return render(
    <LanguageContext.Provider value={{ lang, setLang: () => {}, toggleLang: () => {} }}>
      <McqQuizWidget mcqs={MCQS} title="Practice MCQs" subtitle="From today's note" />
    </LanguageContext.Provider>,
  );
}

describe("McqQuizWidget", () => {
  it("renders the first question with all options", () => {
    renderQuiz();
    expect(screen.getByText("What did GDP do?")).toBeDefined();
    expect(screen.getByText("Rose")).toBeDefined();
    expect(screen.getByText("Fell")).toBeDefined();
  });

  it("gives immediate feedback and reveals the explanation on selection", () => {
    renderQuiz();
    fireEvent.click(screen.getByText("Rose"));
    // Correct pick → explanation appears (English).
    expect(screen.getByText("It rose 5.2%.")).toBeDefined();
    // The explanation is revealed only after answering.
    expect(screen.getByText("Q1 of 2 · Both")).toBeDefined();
  });

  it("marks a wrong selection and shows the Bangla explanation when lang=bn", () => {
    const { unmount } = renderQuiz("bn");
    fireEvent.click(screen.getByText("Fell")); // wrong option
    expect(screen.getByText("এটি ৫.২% বেড়েছে।")).toBeDefined();
    unmount();
  });

  it("locks options after answering and navigates to the next question", () => {
    renderQuiz();
    fireEvent.click(screen.getByText("Rose"));
    // After answering, picking another option must not change the answer.
    fireEvent.click(screen.getByText("Fell"));
    expect(screen.getByText("It rose 5.2%.")).toBeDefined();

    fireEvent.click(screen.getByText("Next →"));
    expect(screen.getByText("Second question?")).toBeDefined();
  });

  it("tracks the score across questions", () => {
    renderQuiz();
    fireEvent.click(screen.getByText("Rose")); // correct
    fireEvent.click(screen.getByText("Next →"));
    fireEvent.click(screen.getByRole("button", { name: "Option C: C" })); // correct
    expect(screen.getByText(/2\/2 correct/)).toBeDefined();
  });
});

describe("CitationDrawer", () => {
  const CITATIONS: Server.CurrentAffairsCitationDTO[] = [
    {
      id: "c1",
      publisher: "The Daily Star",
      articleTitle: "Climate pact signed",
      sourceUrl: "https://daily-star.example/climate",
      publishedAt: null,
    },
  ];

  it("expands to list sources with external links", () => {
    render(
      <CitationDrawer citations={CITATIONS} title="Verified Sources" badge="100% Authenticated" />,
    );
    fireEvent.click(screen.getByText("Verified Sources"));
    expect(screen.getByText("Climate pact signed")).toBeDefined();
    const link = screen.getByRole("link", { name: /open source/i });
    expect(link).toHaveAttribute("href", "https://daily-star.example/climate");
    expect(link).toHaveAttribute("target", "_blank");
  });
});

describe("export converters", () => {
  it("flattens a TipTap doc into blocks", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    };
    expect(docToBlocks(doc)).toEqual([
      { level: 1, text: "Title" },
      { text: "Body" },
    ]);
  });

  it("converts a note to markdown with sources and MCQ answers", () => {
    const md = docToMarkdown(
      "Title",
      "2026-10-03",
      {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
      },
      [{ publisher: "Star", articleTitle: "A", sourceUrl: "https://star.example/a" }],
      [
        {
          question: "Q?",
          options: ["a", "b", "c", "d"],
          correctOption: 1,
          explanation: "Because.",
          relevantExam: "Bank",
        },
      ],
    );
    expect(md).toContain("# Title");
    expect(md).toContain("Hello");
    expect(md).toContain("1. Star — \"A\" (https://star.example/a)");
    expect(md).toContain("Q? [Bank]");
    expect(md).toContain("Answer: B");
    expect(md).toContain("Because.");
  });
});
