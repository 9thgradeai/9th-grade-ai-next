/**
 * tests/seed-bangla-lit.test.ts
 * ----------------------------------------------------------------------------
 * Parser guarantees for the Bangla-Literature folder import
 * (scripts/seed-bangla-lit.ts — কথা-সাহিত্য / গদ্য / নাটক files):
 *
 *   1. Next-line `ব্যাখ্যা:` explanations are joined onto their question.
 *   2. Inline `উত্তর: ক (ব্যাখ্যা: …)` explanations are extracted.
 *   3. Bare-letter answers (`উত্তর: গ`) resolve to the option text.
 *   4. Section headers (no উত্তর:/ক.) are skipped, never parsed as questions.
 * ----------------------------------------------------------------------------
 */

import { describe, it, expect } from "vitest";
import {
  parseBanglaLitLine,
  parseBanglaLitFile,
  resolveBanglaLitAnswer,
} from "../scripts/seed-bangla-lit";

describe("parseBanglaLitLine", () => {
  it("resolves bare-letter answers to the option text", () => {
    const p = parseBanglaLitLine(
      "৩. বাংলা উপন্যাসের প্রাথমিক পর্যায়ে কোন বিষয়টি বিশেষ প্রাধান্য বিস্তার করেছিল? ক. সমাজের রঙ্গরসাত্মক চিত্র খ. সামাজিক কাহিনী গ. বাঙালির জীবন কাহিনী ঘ. সামাজিক নির্যাতন উত্তর: ক",
    );
    expect(p).not.toBeNull();
    expect(p!.question).toBe("বাংলা উপন্যাসের প্রাথমিক পর্যায়ে কোন বিষয়টি বিশেষ প্রাধান্য বিস্তার করেছিল?");
    expect(p!.options).toEqual(["সমাজের রঙ্গরসাত্মক চিত্র", "সামাজিক কাহিনী", "বাঙালির জীবন কাহিনী", "সামাজিক নির্যাতন"]);
    expect(p!.correctAnswer).toBe("সমাজের রঙ্গরসাত্মক চিত্র");
  });

  it("skips lines with fewer than 4 options (source-data quirk)", () => {
    expect(
      parseBanglaLitLine("২. উপন্যাস কোন যুগের সৃষ্টি? ক. মধ্যযুগের খ. প্রাচীন যুগের গ. আধুনিক যুগের উত্তর: গ"),
    ).toBeNull();
  });

  it("extracts inline (ব্যাখ্যা: …) explanations", () => {
    const p = parseBanglaLitLine(
      "১. নাটক কি? ক. দৃশ্যকাব্য খ. গীতিনাট্য গ. কাব্যনাট্য ঘ. নৃত্যনাট্য উত্তর: ক (ব্যাখ্যা: নাটক মূলত রঙ্গমঞ্চে প্রদর্শনের উদ্দেশ্যে রচিত হয়।)",
    );
    expect(p).not.toBeNull();
    expect(p!.correctAnswer).toBe("দৃশ্যকাব্য");
    expect(p!.explanation).toContain("রঙ্গমঞ্চে");
    expect(p!.question).not.toContain("ব্যাখ্যা");
  });

  it("returns null for header lines without options", () => {
    expect(parseBanglaLitLine("কালীপ্রসন্ন সিংহ")).toBeNull();
    expect(parseBanglaLitLine("ব্যাখ্যা: এটি একটি ব্যাখ্যা মাত্র।")).toBeNull();
  });

  it("keeps nested parens inside inline explanations intact", () => {
    const p = parseBanglaLitLine(
      "২৯. কোনটি দীনবন্ধু মিত্রের রচনা? ক. কমলে কামিনী খ. চক্ষুদান গ. বিধবা বিবাহ ঘ. ভদ্রার্জুন উত্তর: ক (ব্যাখ্যা: 'কমলে কামিনী' (১৮৭৩) দীনবন্ধু মিত্র রচিত শেষ নাটক।)",
    );
    expect(p).not.toBeNull();
    expect(p!.correctAnswer).toBe("কমলে কামিনী");
    expect(p!.explanation).toContain("(১৮৭৩)");
  });

  it("resolves paren-wrapped and space-separated exact-option answers", () => {
    expect(resolveBanglaLitAnswer("ক (উইলিয়াম কেরী)", ["উইলিয়াম কেরী", "বিদ্যাসাগর", "রামরাম বসু", "মৃত্যুঞ্জয় বিদ্যালঙ্কার"])).toBe(
      "উইলিয়াম কেরী",
    );
    expect(
      resolveBanglaLitAnswer("ঘ রামরাম বসু", ["অক্ষয়কুমার দত্ত", "হরপ্রসাদ শাস্ত্রী", "দেবেন্দ্রনাথ ঠাকুর", "রামরাম বসু"]),
    ).toBe("রামরাম বসু");
  });

  it("does not force-fit contradictory answer notes", () => {
    // Letter ঘ points at "নন্দিত নরকে" but the note needs human review —
    // kept raw so the import gate rejects instead of guessing.
    expect(
      resolveBanglaLitAnswer("ঘ সঠিক উত্তর 'নন্দিত নরকে'", ["আগুনের পরশমণি", "দারুচিনি দ্বীপ", "শঙ্খনীল কারাগার", "নন্দিত নরকে"]),
    ).toBeNull();
  });
});

describe("parseBanglaLitFile", () => {
  it("joins next-line ব্যাখ্যা: onto its question and skips headers", () => {
    const parsed = parseBanglaLitFile([
      "কথা-সাহিত্য, উপন্যাস ও প্যারীচাঁদ মিত্র",
      "১. 'কথা সাহিত্য' বলতে কোনটি বোঝায়? ক. সাহিত্যের কথা খ. কথা নিয়ে সাহিত্য গ. ছোটগল্প ও উপন্যাস ঘ. নাটক ও আবৃত্তি উত্তর: গ",
      "ব্যাখ্যা: কথাশিল্প বলতে মূলত গল্প ও উপন্যাসভিত্তিক সাহিত্য রূপকে বোঝায়।",
      "কালীপ্রসন্ন সিংহ",
      "১৭. 'হুতোম প্যাঁচার নকশা'র রচয়িতা কে? ক. রামরাম বসু খ. ভূদের মুখোপাধ্যায় গ. দীনবন্ধু মিত্র ঘ. কালীপ্রসন্ন সিংহ উত্তর: ঘ",
      "ব্যাখ্যা: কালীপ্রসন্ন সিংহ 'হুতোম প্যাঁচা' ছদ্মনামে এটি রচনা করেন।",
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].correctAnswer).toBe("ছোটগল্প ও উপন্যাস");
    expect(parsed[0].explanation).toContain("কথাশিল্প");
    expect(parsed[1].correctAnswer).toBe("কালীপ্রসন্ন সিংহ");
    expect(parsed[1].explanation).toContain("হুতোম প্যাঁচা");
  });

  it("handles inline-explanation files without next-line ব্যাখ্যা", () => {
    const parsed = parseBanglaLitFile([
      "MCQ Solution (নাটকের ভূমিকা)",
      "১. নাটক কি? ক. দৃশ্যকাব্য খ. গীতিনাট্য গ. কাব্যনাট্য ঘ. নৃত্যনাট্য উত্তর: ক (ব্যাখ্যা: নাটক মূলত দৃশ্যকাব্য।)",
      "২. নাটকের উৎপত্তি কোথায়? ক. মিশরে খ. স্পেনে গ. গ্রিসে ঘ. লন্ডনে উত্তর: গ (ব্যাখ্যা: প্রাচীন গ্রিসে নাটকের উৎপত্তি।)",
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[1].correctAnswer).toBe("গ্রিসে");
  });
});
