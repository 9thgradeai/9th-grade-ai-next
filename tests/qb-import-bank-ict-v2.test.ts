/**
 * tests/qb-import-bank-ict-v2.test.ts
 * ----------------------------------------------------------------------------
 * Parser + topic-routing guarantees for the second Bank ICT import wave
 * (scripts/import-bank-ict-v2.ts, database/data/Bank/ICT/*.txt):
 *   1. Four-line records (stem / A.–D. / Correct Answer / Explanation).
 *   2. Modern-ICT combined `Correct Answer: … Explanation: …` lines.
 *   3. Wrapped explanation continuations reattach to the owning record.
 *   4. Every file slug routes under 05_ICT (incl. the new Database and
 *      Digital-Bangladesh leaves).
 *   5. Windows paths are sanitized so the LaTeX import gate accepts them.
 * ----------------------------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import {
  parseV2File,
  routeTopicV2,
  fileSlugV2,
  splitOptions,
  sanitizePaths,
} from "../scripts/import-bank-ict-v2";

describe("parseV2File — standard four-line records", () => {
  const text = [
    "Section 1: Network Fundamentals — LAN, MAN, WAN, PAN, Intranet and Internet (1–25)",
    "1. Which type of network is generally used within a small geographical area?",
    "A. WAN B. MAN C. LAN D. PAN",
    "Correct Answer: C. LAN",
    "Explanation: A Local Area Network (LAN) connects devices within a limited area.",
    "2. Which network type covers a city?",
    "A. PAN B. LAN C. MAN D. SAN",
    "Correct Answer: C. MAN",
    "Explanation: A MAN connects networks across a metropolitan region.",
  ].join("\n");

  it("parses stems, inline options, letters and explanations", () => {
    const r = parseV2File("f.txt", text);
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(2);
    expect(r.records[0]).toMatchObject({
      n: 1,
      answerLetter: "C",
      header: "Network Fundamentals — LAN, MAN, WAN, PAN, Intranet and Internet (1–25)",
    });
    expect(r.records[0].options).toEqual(["WAN", "MAN", "LAN", "PAN"]);
    expect(r.records[0].explanation).toContain("Local Area Network");
    expect(r.records[1].options[2]).toBe("MAN");
  });
});

describe("parseV2File — combined Correct Answer + Explanation lines", () => {
  it("splits the trailing explanation off the answer line", () => {
    const r = parseV2File("f.txt", [
      "Section A: Artificial Intelligence, Machine Learning and Generative AI",
      "1. What is Artificial Intelligence (AI)?",
      "A. A method of storing files permanently B. The ability of machines to perform tasks associated with human intelligence C. A type of computer network D. A system used exclusively for numerical calculations",
      "Correct Answer: B. The ability of machines to perform tasks associated with human intelligence Explanation: AI enables machines to perform reasoning and decision-making.",
    ].join("\n"));
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].answerLetter).toBe("B");
    expect(r.records[0].options[1]).toContain("human intelligence");
    expect(r.records[0].explanation).toContain("reasoning");
  });

  it("reattaches wrapped explanation continuations", () => {
    const r = parseV2File("f.txt", [
      "Section F: Bangladesh ICT Institutions",
      "171. Which body drives innovation?",
      "A. X B. Aspire to Innovate (a2i) C. Y D. Z",
      "Correct Answer: B. Aspire to Innovate (a2i) Explanation: a2i is associated with innovation in public services.",
      "এসপায়ার টু ইনোভেট (এটুআই)",
      "+1",
    ].join("\n"));
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].explanation).toContain("এসপায়ার টু ইনোভেট");
    expect(r.records[0].explanation).toContain("+1");
  });
});

describe("parseV2File — malformed input", () => {
  it("reports a record missing its Correct Answer line", () => {
    const r = parseV2File("f.txt", ["1. Q?", "A. a B. b C. c D. d", "2. Next?", "A. a B. b C. c D. d", "Correct Answer: A. a", "Explanation: e"].join("\n"));
    expect(r.records).toHaveLength(1);
    expect(r.skipped.length).toBeGreaterThan(0);
  });

  it("rejects unparseable option blocks", () => {
    expect(splitOptions("A. only-one")).toBeNull();
    expect(splitOptions("B. b C. c D. d")).toBeNull();
  });
});

describe("routeTopicV2 + fileSlugV2", () => {
  it("detects slugs from the real v2 file names", () => {
    expect(fileSlugV2("Questions(Internet, networking and web technology).txt")).toBe("internet-networking-web");
    expect(fileSlugV2("Questions(Cybersecurity and data protection).txt")).toBe("cybersecurity-data-protection");
    expect(fileSlugV2("Questions(Database and information systems).txt")).toBe("database-information-systems");
    expect(fileSlugV2("Questions(Modern ICT and digital Bangladesh).txt")).toBe("modern-ict-digital-bangladesh");
    expect(fileSlugV2("Questions(Operating systems and application software).txt")).toBe("os-application-software");
  });

  it("routes every slug under 05_ICT", () => {
    const slugs = ["internet-networking-web", "cybersecurity-data-protection", "database-information-systems", "modern-ict-digital-bangladesh", "os-application-software"];
    for (const s of slugs) expect(routeTopicV2(s, "")).toMatch(/^05_ICT\//);
  });

  it("routes sections to the right leaves", () => {
    expect(routeTopicV2("internet-networking-web", "Section 4: IP Address, MAC Address, DNS, DHCP and URL")).toContain("Protocols");
    expect(routeTopicV2("cybersecurity-data-protection", "Section 2: Antivirus, Firewalls and Security Controls")).toContain("Utility_Software");
    expect(routeTopicV2("database-information-systems", "Section 3: SQL and Basic Query Concepts")).toContain("SQL");
    expect(routeTopicV2("modern-ict-digital-bangladesh", "Section B: Cloud Computing — IaaS, PaaS and SaaS")).toContain("World_Wide_Web_and_Cloud");
    expect(routeTopicV2("modern-ict-digital-bangladesh", "Section F: Bangladesh ICT Institutions")).toContain("Digital_Bangladesh");
    expect(routeTopicV2("os-application-software", "Section 6: Microsoft Excel — Formulas")).toContain("MS_Excel");
  });
});

describe("sanitizePaths", () => {
  it("rewrites Windows backslash paths to forward slashes", () => {
    expect(sanitizePaths("See C:\\Reports\\Annual.docx for details")).toBe("See C:/Reports/Annual.docx for details");
  });
  it("leaves plain prose untouched", () => {
    const s = "A LAN connects devices within a limited area.";
    expect(sanitizePaths(s)).toBe(s);
  });
});
