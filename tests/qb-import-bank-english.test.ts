import { describe, it, expect } from "vitest";
import { parseMdFile, routeVoiceNarration } from "../scripts/import-bank-english";

const SAMPLE = `# Bank English · Clauses & Phrases

Q: The board objected to *his presenting the report*. The underlined part is a/an:
A) Present Participle Phrase
B) Adverbial Phrase
C) Gerund Phrase
D) Adjective Clause
Ans: C
Exp: **Speed Shortcut:** Preposition + possessive takes a gerund.

Q: Spot the error: "She *are* going home."
A) She
B) are going
C) home
D) No segment
Ans: B
Exp: Pronoun-verb mismatch.
`;

describe("parseMdFile (bank english)", () => {
  it("parses Q/options/answer/explanation blocks with markers intact", () => {
    const { records, skipped } = parseMdFile("Clauses & Phrases.md", SAMPLE);
    expect(skipped).toEqual([]);
    expect(records).toHaveLength(2);
    expect(records[0].question).toContain("*his presenting the report*");
    expect(records[0].options).toHaveLength(4);
    expect(records[0].answerLetter).toBe("C");
    expect(records[0].explanation).toContain("**Speed Shortcut:**");
    expect(records[0].topic).toBe("Clauses & Phrases");
    expect(records[0].slug).toBe("clauses-and-phrases");
  });

  it("supports a 5th E) option", () => {
    const md = `Q: Pick the odd one.
A) Apple
B) Mango
C) Car
D) Banana
E) No Error
Ans: E
Exp: All fruits except one.
`;
    const { records } = parseMdFile("Errors Detection.md", md);
    expect(records).toHaveLength(1);
    expect(records[0].options).toHaveLength(5);
    expect(records[0].answerLetter).toBe("E");
  });

  it("skips non-Q blocks without throwing", () => {
    const { records, skipped } = parseMdFile("X.md", "# Header\n\nSome intro paragraph.\n");
    expect(records).toHaveLength(0);
    expect(skipped.length).toBeGreaterThan(0);
  });
});

describe("routeVoiceNarration", () => {
  it("routes voice stems to the Active/Passive leaf", () => {
    const r = routeVoiceNarration("*Change the voice:* The bank raised the rate.");
    expect(r.topic).toBe("Active_and_Passive_Voice");
  });

  it("routes narration stems to the Narration leaf", () => {
    const r = routeVoiceNarration("Change the narration: He said, *I am busy*.");
    expect(r.topic).toBe("Direct_and_Indirect_Narration");
  });
});
