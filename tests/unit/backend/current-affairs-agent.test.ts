// @vitest-environment node
//
// Unit tests for the current-affairs agent's zero-hallucination
// guardrail (enforceGrounding): facts must bind to real,
// search-returned citations — fabricated sources are stripped.

import { describe, it, expect } from "vitest";
import { enforceGrounding, CurrentAffairsSchema } from "~backend/ai/current-affairs";
import type { SearchHit } from "~backend/ai/current-affairs";

const HITS: SearchHit[] = [
  {
    publisher: "The Daily Star",
    articleTitle: "Bangladesh signs climate pact",
    sourceUrl: "https://daily-star.example/climate",
    publishedAt: "2026-10-01",
    snippet: "Bangladesh signed a climate pact.",
  },
  {
    publisher: "Prothom Alo",
    articleTitle: "GDP growth rises",
    sourceUrl: "https://prothom-alo.example/gdp",
    publishedAt: null,
    snippet: "GDP grew 5.2%.",
  },
];

const VALID = {
  title: "Daily note",
  summary: "A summary",
  sections: [
    {
      heading: "Economy",
      facts: [
        { text: "GDP grew 5.2%", citation: 2 },
        { text: "Climate pact signed", citation: 1 },
      ],
    },
  ],
  citations: [
    { publisher: "The Daily Star", articleTitle: "Bangladesh signs climate pact", sourceUrl: "https://daily-star.example/climate" },
    { publisher: "Prothom Alo", articleTitle: "GDP growth rises", sourceUrl: "https://prothom-alo.example/gdp" },
  ],
  mcqs: [
    {
      question: "Q?",
      options: ["a", "b", "c", "d"],
      correctOption: 0,
      explanation: "Because.",
      explanationBn: "কারণ।",
      relevantExam: "Both",
    },
    {
      question: "Q2?",
      options: ["a", "b", "c", "d"],
      correctOption: 1,
      explanation: "Because.",
      explanationBn: "কারণ।",
      relevantExam: "BCS",
    },
    {
      question: "Q3?",
      options: ["a", "b", "c", "d"],
      correctOption: 2,
      explanation: "Because.",
      explanationBn: "কারণ।",
      relevantExam: "Bank",
    },
    {
      question: "Q4?",
      options: ["a", "b", "c", "d"],
      correctOption: 3,
      explanation: "Because.",
      explanationBn: "কারণ।",
      relevantExam: "Both",
    },
    {
      question: "Q5?",
      options: ["a", "b", "c", "d"],
      correctOption: 0,
      explanation: "Because.",
      explanationBn: "কারণ।",
      relevantExam: "Both",
    },
  ],
};

describe("current-affairs schema", () => {
  it("accepts a valid structured note", () => {
    expect(CurrentAffairsSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects MCQs with fewer than 5 items", () => {
    expect(CurrentAffairsSchema.safeParse({ ...VALID, mcqs: VALID.mcqs.slice(0, 4) }).success).toBe(false);
  });

  it("rejects options arrays that are not exactly 4", () => {
    const bad = JSON.parse(JSON.stringify(VALID));
    bad.mcqs[0].options = ["a", "b", "c"];
    expect(CurrentAffairsSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects out-of-range correctOption", () => {
    const bad = JSON.parse(JSON.stringify(VALID));
    bad.mcqs[0].correctOption = 4;
    expect(CurrentAffairsSchema.safeParse(bad).success).toBe(false);
  });
});

describe("enforceGrounding (zero-hallucination guardrail)", () => {
  it("keeps citations that came from the real search", () => {
    const out = enforceGrounding(VALID as never, HITS);
    expect(out.citations).toHaveLength(2);
    expect(out.citations[0].sourceUrl).toBe("https://daily-star.example/climate");
    // Fact bindings survive re-indexing.
    expect(out.sections[0].facts[0].citation).toBe(2);
  });

  it("strips fabricated citation URLs not returned by search", () => {
    const withFake = {
      ...VALID,
      citations: [
        ...VALID.citations,
        { publisher: "Made Up", articleTitle: "Fake news", sourceUrl: "https://invented.example/fake" },
      ],
    };
    const out = enforceGrounding(withFake as never, HITS);
    expect(out.citations).toHaveLength(2);
    expect(out.citations.some((c) => c.sourceUrl.includes("invented"))).toBe(false);
  });

  it("drops facts bound to stripped citations", () => {
    const withFake = {
      ...VALID,
      citations: [
        ...VALID.citations,
        { publisher: "Made Up", articleTitle: "Fake news", sourceUrl: "https://invented.example/fake" },
      ],
      sections: [
        {
          heading: "Economy",
          facts: [
            { text: "GDP grew", citation: 2 },
            { text: "Totally invented fact", citation: 3 }, // bound to the fake source
          ],
        },
      ],
    };
    const out = enforceGrounding(withFake as never, HITS);
    expect(out.sections[0].facts).toHaveLength(1);
    expect(out.sections[0].facts[0].text).toBe("GDP grew");
  });

  it("falls back to search hits when every citation is fabricated", () => {
    const allFake = {
      ...VALID,
      citations: [
        { publisher: "Made Up", articleTitle: "Fake", sourceUrl: "https://invented.example/fake" },
      ],
    };
    const out = enforceGrounding(allFake as never, HITS);
    expect(out.citations).toHaveLength(2);
    expect(out.citations.map((c) => c.sourceUrl)).toEqual(HITS.map((h) => h.sourceUrl));
  });

  it("removes sections left with no grounded facts", () => {
    const out = enforceGrounding(
      {
        ...VALID,
        sections: [
          { heading: "Only fake", facts: [{ text: "Nope", citation: 99 }] },
          { heading: "Real", facts: [{ text: "GDP grew", citation: 2 }] },
        ],
      } as never,
      HITS,
    );
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].heading).toBe("Real");
  });
});
