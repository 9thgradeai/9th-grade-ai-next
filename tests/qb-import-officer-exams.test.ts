/**
 * tests/qb-import-officer-exams.test.ts
 * ----------------------------------------------------------------------------
 * Deterministic guarantees for scripts/import-bank-officer-exams.ts
 * (Officer (General) / Officer (IT) / Senior Officer (IT)):
 *
 *   1. Single-line `QN.` records parse (stem + 4 options + letter answer +
 *      `Speed Shortcut:` explanation), verbatim Unicode preserved.
 *   2. The `SpeedShortcut:` no-space variant is tolerated.
 *   3. In-stem "A." lookalikes ("Class A IP Address") don't split options.
 *   4. Records with missing/empty options or unresolvable answers return
 *      null — reported invalid, never fabricated.
 *   5. Header lines (JobID/post/BOM) are skipped, not parsed as records.
 * ----------------------------------------------------------------------------
 */

import { describe, it, expect } from "vitest";
import { splitITRecords, parseITRecord } from "../scripts/import-bank-officer-exams";
import { classifyBankSubject } from "../scripts/import-bank-exams";

describe("IT record splitting", () => {
  it("skips JobID/post headers and BOM, one block per QN.", () => {
    const blocks = splitITRecords(
      "﻿JobID-10225\nSenior Officer(IT)\nQ1. What is IDE? A. X B. Y C. Z D. W Answer: A Speed Shortcut: why.\nQ2. Next? A. 1 B. 2 C. 3 D. 4 Answer: B Speed Shortcut: because.",
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0][0]).toMatch(/^Q1\./);
    expect(blocks[1][0]).toMatch(/^Q2\./);
  });
});

describe("IT record parsing", () => {
  it("parses a single-line record verbatim", () => {
    const p = parseITRecord([
      "Q1. OOP stands for: A. Object Oriented Programming B. Open Office Protocol C. Object Operating Program D. Output Oriented Process Answer: A Speed Shortcut: Fundamental software paradigm definition.",
    ]);
    expect(p).not.toBeNull();
    expect(p!.qnum).toBe(1);
    expect(p!.question).toBe("OOP stands for:");
    expect(p!.options).toEqual([
      "Object Oriented Programming",
      "Open Office Protocol",
      "Object Operating Program",
      "Output Oriented Process",
    ]);
    expect(p!.correctAnswer).toBe("Object Oriented Programming");
    expect(p!.explanation).toContain("Fundamental software paradigm");
  });

  it("tolerates the SpeedShortcut: no-space variant", () => {
    const p = parseITRecord([
      "Q2. Broadcast of 192.168.10.1/26? A. 192.168.10.0 B. 192.168.10.62 C. 192.168.10.63 D. 192.168.10.255 Answer: C SpeedShortcut: range ends at .63.",
    ]);
    expect(p).not.toBeNull();
    expect(p!.correctAnswer).toBe("192.168.10.63");
    expect(p!.explanation).toContain("range ends");
  });

  it("does not split on in-stem 'A' without a dot", () => {
    const p = parseITRecord([
      "Q19. Which is a Class A IP Address? A. 10.25.16.5 B. 172.16.10.1 C. 192.168.1.10 D. 224.0.0.5 Answer: A Speed Shortcut: Class A Blob.",
    ]);
    expect(p).not.toBeNull();
    expect(p!.question).toBe("Which is a Class A IP Address?");
    expect(p!.options[0]).toBe("10.25.16.5");
    expect(p!.correctAnswer).toBe("10.25.16.5");
  });

  it("parses multi-line records (25104-style)", () => {
    const p = parseITRecord([
      "Q5. Which command tests connectivity?",
      "A. ipconfig",
      "B. ping",
      "C. tracert",
      "D. netstat",
      "Answer: B",
      "Speed Shortcut: ping uses ICMP.",
    ]);
    expect(p).not.toBeNull();
    expect(p!.options).toEqual(["ipconfig", "ping", "tracert", "netstat"]);
    expect(p!.correctAnswer).toBe("ping");
  });

  it("returns null for records with empty options (never fabricates)", () => {
    const p = parseITRecord([
      "Q95. Sum of interior angles of a hexagon? A.  B.  C.  D.  Answer: C Speed Shortcut: formula.",
    ]);
    expect(p).toBeNull();
  });

  it("returns null when an option letter is missing from source", () => {
    const p = parseITRecord([
      "Q1. Physical security measures?",
      "A. Encryption and Firewall",
      "C. Subclass stuff",
      "D. Two classes",
      "Answer: C",
      "Speed Shortcut: overriding.",
    ]);
    expect(p).toBeNull();
  });

  it("returns null when no Answer marker exists", () => {
    expect(parseITRecord(["Q7. No answer here? A. 1 B. 2 C. 3 D. 4"])).toBeNull();
  });
});

describe("IT classification sanity", () => {
  it("routes network/firewall questions to ICT", () => {
    expect(classifyBankSubject("Firewall is used to monitor network traffic", "")).toBe("05_ICT");
  });
});
