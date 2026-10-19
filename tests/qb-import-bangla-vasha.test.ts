import { describe, it, expect } from "vitest";
import { parseLineTolerant } from "../scripts/import-bangla-vasha";

type Parsed = { question: string; options: string[]; correctAnswer: string; explanation: string };
const asParsed = (p: unknown) => p as Parsed;
const isSkipped = (p: unknown) => typeof p === "object" && p !== null && "skip" in p;

describe("parseLineTolerant (bangla vasha single-line records)", () => {
  it("delegates a clean record to the strict parser unchanged", () => {
    const p = parseLineTolerant(
      "০২. 'কূজন' শব্দের অর্থ কি? ক. খারাপ লোক খ. পাখির ডাক গ. ছোট লোক ঘ. ইতর বিশেষ উত্তর: খ. পাখির ডাক ব্যাখ্যা: 'কূজন' শব্দের অর্থ হলো পাখির কলতান।",
    );
    expect(p).not.toBeNull();
    expect(isSkipped(p)).toBe(false);
    const q = asParsed(p);
    expect(q.options).toEqual(["খারাপ লোক", "পাখির ডাক", "ছোট লোক", "ইতর বিশেষ"]);
    expect(q.correctAnswer).toBe("পাখির ডাক");
  });

  it("repairs a Latin option-marker typo (K. → ক.) by position", () => {
    const p = parseLineTolerant(
      "৮০. 'গৃহস্থ' কোন সমাসের অন্তর্গত? K. উপপদ তৎপুরুষ খ. অলুক তৎপুরুষ গ. মধ্যপদলোপী কর্মধারয় ঘ. তৎপুরুষ উত্তর: ক. উপপদ তৎপুরুষ ব্যাখ্যা: গৃহে থাকে যে = গৃহস্থ।",
    );
    expect(isSkipped(p)).toBe(false);
    const q = asParsed(p);
    expect(q.options[0]).toBe("উপপদ তৎপুরুষ");
    expect(q.correctAnswer).toBe("উপপদ তৎপুরুষ");
  });

  it("resolves a truncated answer that is a strict prefix of the option", () => {
    const p = parseLineTolerant(
      "০৯. 'অমরার নাগাল' বাগধারাটির অর্থ কী? ক. অসম্ভব বস্তু বা অসাধ্য সাধন খ. সহজে পাওয়া গ. স্বর্গ লাভ ঘ. অমরত্ব উত্তর: ক. অ ব্যাখ্যা: অসাধ্য সাধন।",
    );
    expect(isSkipped(p)).toBe(false);
    const q = asParsed(p);
    expect(q.correctAnswer).toBe("অসম্ভব বস্তু বা অসাধ্য সাধন");
  });

  it("resolves an answer remainder that CONTAINS the option (bracket note)", () => {
    const p = parseLineTolerant(
      "০৮. 'বাঘিনী' শব্দের প্রকৃতি ও প্রত্যয় কোনটি? ক. বাঘ + ইনি (ঈনী) খ. বাঘিন + ই গ. বাঘ + নী ঘ. বাঘ + ইনী উত্তর: ক. বাঘ + ইনি (ঈনী) [স্ত্রীবাচক তদ্ধিত প্রত্যয়] ব্যাখ্যা: ইনি প্রত্যয়।",
    );
    expect(isSkipped(p)).toBe(false);
    const q = asParsed(p);
    expect(q.correctAnswer).toBe("বাঘ + ইনি (ঈনী)");
  });

  it("still skips a record whose remainder contradicts the pointed-to option", () => {
    const p = parseLineTolerant(
      "০১. প্রশ্ন? ক. এক খ. দুই গ. তিন ঘ. চার উত্তর: ক. দুই ব্যাখ্যা: ব্যাখ্যা।",
    );
    expect(p).not.toBeNull();
    expect(isSkipped(p)).toBe(true);
  });
});
