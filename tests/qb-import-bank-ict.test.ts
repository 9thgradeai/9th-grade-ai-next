/**
 * tests/qb-import-bank-ict.test.ts
 * ----------------------------------------------------------------------------
 * Parser + topic-routing guarantees for the Bank ICT import pipeline
 * (scripts/import-bank-ict.ts):
 *   1. Single-line records parse with letter-resolved answers.
 *   2. Multi-line records (question / A-D / Ans lines) parse, including
 *      wrapped question lines and Topic/Part headers.
 *   3. Malformed records are skipped with reasons, never half-imported.
 *   4. Every file slug routes to a taxonomy path under 05_ICT.
 * ----------------------------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import { parseIctFile, routeTopic, fileSlug, balanceOptions, seededShuffle } from "../scripts/import-bank-ict";

describe("parseIctFile — single-line format", () => {
  it("parses options, answer letter and explanation", () => {
    const r = parseIctFile("f.txt", [
      "10. Which memory is fastest? A) L1 Cache B) SRAM C) CPU Registers D) NVMe SSD Ans: C | Speed Solution: Registers sit inside the ALU.",
    ].join("\n"));
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({
      n: 10,
      question: "Which memory is fastest?",
      options: ["L1 Cache", "SRAM", "CPU Registers", "NVMe SSD"],
      answerLetter: "C",
    });
    expect(r.records[0].explanation).toContain("Registers");
  });

  it("skips lines with missing options", () => {
    const r = parseIctFile("f.txt", "11. Broken? A) x B) y Ans: A | Speed Solution: z");
    expect(r.records).toHaveLength(0);
    expect(r.skipped.length).toBeGreaterThan(0);
  });
});

describe("parseIctFile — multi-line format", () => {
  const text = [
    "Topic 1: MS Word Mastery (Shortcuts)",
    "1. Which shortcut double-underlines?",
    "A) Ctrl + U",
    "B) Ctrl + Shift + D",
    "C) Ctrl + Shift + U",
    "D) Alt + U + D",
    "Ans: B | Speed Solution: D stands for Double.",
  ].join("\n");

  it("parses question/options/answer across lines and keeps the header", () => {
    const r = parseIctFile("f.txt", text);
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({
      n: 1,
      answerLetter: "B",
      header: "MS Word Mastery (Shortcuts)",
    });
    expect(r.records[0].options[1]).toBe("Ctrl + Shift + D");
  });

  it("rejects out-of-order options", () => {
    const bad = [
      "1. Q?",
      "A) x",
      "C) y",
      "B) z",
      "D) w",
      "Ans: A | Speed Solution: s",
    ].join("\n");
    const r = parseIctFile("f.txt", bad);
    expect(r.records).toHaveLength(0);
    expect(r.skipped.length).toBeGreaterThan(0);
  });

  it("parses crammed options + bold answer markers on one line", () => {
    const text = [
      "229. Toggle formula view?",
      "A) Ctrl + F",
      "B) Ctrl + Grave C) Ctrl + Shift + F D) Alt + = **Ans: B | Speed Solution:** The grave key.",
    ].join("\n");
    const r = parseIctFile("f.txt", text);
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].options).toEqual(["Ctrl + F", "Ctrl + Grave", "Ctrl + Shift + F", "Alt + ="]);
    expect(r.records[0].answerLetter).toBe("B");
  });

  it("accepts the Speed Layer variant of the answer line", () => {
    const r = parseIctFile("f.txt", "43. Fragmentation occurs at:\nA) L2\nB) L3\nC) L4\nD) L1\nAns: B | Speed Layer: IP fragmentation is L3.");
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].answerLetter).toBe("B");
  });

  it("tracks bare Mixed headers instead of dropping them", () => {
    const r = parseIctFile("f.txt", [
      "Mixed High-Yield Trick Questions (Across all topics)",
      "1. Q?",
      "A) a",
      "B) b",
      "C) c",
      "D) d",
      "Ans: A | Speed Solution: s",
    ].join("\n"));
    expect(r.skipped).toEqual([]);
    expect(r.records[0].header).toBe("Mixed High-Yield Trick Questions (Across all topics)");
  });

  it("skips records with an empty option rather than corrupting them", () => {
    const r = parseIctFile("f.txt", ["77. Root dir symbol?", "A) C:", "B) /", "C) ~", "D)", "Ans: B | Speed Solution: slash."].join("\n"));
    expect(r.records).toHaveLength(0);
    expect(r.skipped.length).toBeGreaterThan(0);
  });
});

describe("routeTopic", () => {
  it("routes every file slug under 05_ICT", () => {
    for (const slug of ["ms-office", "os-translators", "cpu-memory", "cyber-security", "input-output", "network-topology"]) {
      expect(routeTopic(slug, "")).toMatch(/^05_ICT\//);
    }
  });
  it("defaults header-less MS Office records to Word (the opening section)", () => {
    expect(routeTopic("ms-office", "")).toContain("MS_Word");
  });
  it("routes MS Office headers to Word/Excel/PowerPoint vs System Software", () => {
    expect(routeTopic("ms-office", "MS Word Mastery")).toContain("MS_Word");
    expect(routeTopic("ms-office", "Advanced MS Excel Mastery")).toContain("MS_Excel");
    expect(routeTopic("ms-office", "MS PowerPoint Mastery")).toContain("MS_PowerPoint");
    expect(routeTopic("ms-office", "System Software Architecture")).toContain("System_vs_Application_Software");
  });
  it("routes OS translator parts to System Software, kernel parts to OS", () => {
    expect(routeTopic("os-translators", "Translators (Compiler, Interpreter)")).toContain("System_vs_Application_Software");
    expect(routeTopic("os-translators", "Kernel vs. Shell")).toContain("Operating_Systems");
  });
  it("detects file slugs from real file names", () => {
    expect(fileSlug("Questions(MS Office Mastery,System Software)[9Th-Grade AI].txt")).toBe("ms-office");
    expect(fileSlug("Questions-(CPU & Memory Hierarchy)[9Th-Grade AI].txt")).toBe("cpu-memory");
    expect(fileSlug("Questions-(Network Topology & OSI)[9Th-Grade AI].txt")).toBe("network-topology");
  });
});

describe("balanceOptions", () => {
  const opts: [string, string, string, string] = ["L1", "SRAM", "Registers", "SSD"];

  it("places the correct text at the requested slot and preserves the set", () => {
    for (const slot of [0, 1, 2, 3]) {
      const out = balanceOptions(opts, "Registers", slot, "seed-1");
      expect(out[slot]).toBe("Registers");
      expect([...out].sort()).toEqual([...opts].sort());
    }
  });

  it("is deterministic for the same seed", () => {
    expect(balanceOptions(opts, "Registers", 1, "k")).toEqual(balanceOptions(opts, "Registers", 1, "k"));
  });

  it("round-robin slots distribute uniformly", () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 100; i++) {
      const out = balanceOptions(opts, "Registers", i % 4, `key-${i}`);
      counts[out.indexOf("Registers")]++;
    }
    expect(counts).toEqual([25, 25, 25, 25]);
  });

  it("throws when the correct text is missing (never silently corrupts)", () => {
    expect(() => balanceOptions(opts, "Ghost", 0, "k")).toThrow();
  });

  it("seededShuffle is a stable permutation", () => {
    const out = seededShuffle(["a", "b", "c", "d"], 42);
    expect([...out].sort()).toEqual(["a", "b", "c", "d"]);
    expect(seededShuffle(["a", "b", "c", "d"], 42)).toEqual(out);
  });
});
