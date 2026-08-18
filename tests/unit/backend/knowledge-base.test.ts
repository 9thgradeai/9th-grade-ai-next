import { describe, it, expect } from "vitest";
import { KNOWLEDGE_BASE, retrieveKnowledge } from "@/lib/data/knowledge-base";

describe("knowledge base", () => {
  it("is non-empty and well-formed", () => {
    expect(KNOWLEDGE_BASE.length).toBeGreaterThan(50);
    for (const entry of KNOWLEDGE_BASE) {
      expect(entry.id).toBeTruthy();
      expect(entry.subject).toBeTruthy();
      expect(entry.topic).toBeTruthy();
      expect(entry.keywords.length).toBeGreaterThan(0);
      expect(entry.content.length).toBeGreaterThan(50);
      expect(entry.source).toBeTruthy();
    }
  });

  it("covers every BCS preliminary subject", () => {
    const subjects = new Set(KNOWLEDGE_BASE.map((e) => e.subject));
    for (const s of [
      "বাংলা ভাষা ও সাহিত্য",
      "English Language and Literature",
      "বাংলাদেশ বিষয়াবলি",
      "আন্তর্জাতিক বিষয়াবলি",
      "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা",
      "সাধারণ বিজ্ঞান",
      "কম্পিউটার ও তথ্য প্রযুক্তি",
      "গাণিতিক যুক্তি",
      "মানসিক দক্ষতা",
      "নৈতিকতা, মূল্যবোধ ও সু-শাসন",
    ]) {
      expect(subjects.has(s), `missing subject: ${s}`).toBe(true);
    }
  });

  it("retrieves the right entry for a Bangla grammar question", () => {
    const results = retrieveKnowledge("সমাস কাকে বলে? কর্মধারয় সমাসের উদাহরণ দাও", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].topic.toLowerCase()).toContain("সমাস");
  });

  it("retrieves the right entry for an English grammar question", () => {
    const results = retrieveKnowledge("change active voice to passive voice", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].keywords.join(" ")).toMatch(/voice/i);
  });

  it("retrieves BCS exam-system entries for exam questions", () => {
    const results = retrieveKnowledge("BCS প্রিলিমিনারিতে নেগেটিভ মার্কিং কত?", 3);
    expect(results.some((r) => r.topic.toLowerCase().includes("bcs"))).toBe(true);
  });

  it("returns at most `limit` entries", () => {
    const results = retrieveKnowledge("ভিটামিনের অভাবজনিত রোগ কোনটি?", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("returns nothing for an empty/gibberish query", () => {
    expect(retrieveKnowledge("")).toHaveLength(0);
    expect(retrieveKnowledge("   ")).toHaveLength(0);
  });
});