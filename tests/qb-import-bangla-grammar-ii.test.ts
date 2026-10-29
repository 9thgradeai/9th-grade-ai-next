import { describe, it, expect } from "vitest";
import { parseDocxRecord, waiveGateCodes } from "../scripts/import-bangla-grammar-ii";
import { scanMca } from "../scripts/qb-forensics/import-gate";

type Rec = { parsed: { question: string; options: string[]; correctAnswer: string; explanation: string }; repair?: string };
type Res = Rec | { skip: string } | null;

const asRec = (r: Res): Rec => {
  expect(r).not.toBeNull();
  expect(typeof r).toBe("object");
  expect("parsed" in (r as object)).toBe(true);
  return r as Rec;
};

describe("parseDocxRecord (docx-derived bangla grammar records)", () => {
  it("parses a clean record without reporting a repair", () => {
    const r = parseDocxRecord(
      "০১. 'কূজন' শব্দের অর্থ কি? ক. খারাপ লোক খ. পাখির ডাক গ. ছোট লোক ঘ. ইতর বিশেষ Ans. খ. পাখির ডাক ব্যাখ্যা: 'কূজন' হলো পাখির ডাক।",
    );
    const { parsed, repair } = asRec(r);
    expect(repair).toBeUndefined();
    expect(parsed.question).toBe("'কূজন' শব্দের অর্থ কি?");
    expect(parsed.options).toHaveLength(4);
    expect(parsed.correctAnswer).toBe("পাখির ডাক");
    expect(parsed.explanation).toContain("পাখির ডাক");
  });

  // Source: Questions(Terminology).txt line 86 — the colon after ব্যাখ্যা is
  // missing, so the explanation is glued onto the answer.
  it("repairs a missing colon after ব্যাখ্যা without dropping the explanation", () => {
    const line =
      "৮৬. 'Obligatory' শব্দটির পারিভাষিক শব্দ কোনটি? ক. অনুগত খ. বাধ্যতামূলক গ. বধিত করা ঘ. শপথ গ্রহণ Ans. খ. বাধ্যতামূলক ব্যাখ্যা যা করা বাধ্যতামূলক বা অবশ্যকরণীয় তাকে 'Obligatory' বলে.";
    const { parsed, repair } = asRec(parseDocxRecord(line));
    expect(repair).toBe("colon");
    expect(parsed.correctAnswer).toBe("বাধ্যতামূলক");
    expect(parsed.explanation).toBe(
      "যা করা বাধ্যতামূলক বা অবশ্যকরণীয় তাকে 'Obligatory' বলে.",
    );
  });

  // Source: Questions(বাগধারা).txt line 48 — a leftover list marker inside
  // option ক makes that option longer than the keyed answer text.
  it("repairs a stray list marker inside an option", () => {
    const line =
      "৪৮. ‘গোয়ার গোবিন্দ’ বাগধারাটির অর্থ কী? ক. ১. একগুঁয়ে ও নির্বোধ ব্যক্তি খ. বুদ্ধিমান লোক গ. ধার্মিক ব্যক্তি ঘ. চালাক গোবিন্দ উত্তর: ক. একগুঁয়ে ও নির্বোধ ব্যক্তি ব্যাখ্যা: যে একই সাথে একরোখা এবং বুদ্ধিতে কাঁচা, তাকে ‘গোয়ার গোবিন্দ’ বলা হয়।";
    const { parsed, repair } = asRec(parseDocxRecord(line));
    expect(repair).toBe("stray-number");
    expect(parsed.options[0]).toBe("একগুঁয়ে ও নির্বোধ ব্যক্তি");
    expect(parsed.correctAnswer).toBe("একগুঁয়ে ও নির্বোধ ব্যক্তি");
    expect(parsed.explanation).toContain("একরোখা");
  });

  // Source: Questions(Terminology).txt line 12 — the answer words gloss the
  // keyed option instead of restating it. The explanation must survive, which
  // is exactly what a naive "answer = letter" rewrite would throw away.
  it("resolves a glossed answer off its letter and keeps the explanation", () => {
    const line =
      "১২. 'Attested' এর বাংলা পরিভাষা কোনটি? ক. সত্যায়িত খ. সত্যায়ন গ. প্রত্যয়িত ঘ. সংলগ্ন Ans. ক. সত্যায়িত / প্রত্যয়িত ব্যাখ্যা: কোনো নথিপত্র প্রত্যয়ন বা সত্যায়িত করাকে 'Attested' বলে.";
    const { parsed, repair } = asRec(parseDocxRecord(line));
    expect(repair).toBe("gloss-answer");
    expect(parsed.correctAnswer).toBe("সত্যায়িত");
    expect(parsed.explanation).toContain("নথিপত্র প্রত্যয়ন");
    expect(parsed.options).toHaveLength(4);
  });

  // Source: Questions(Terminology).txt line 125 — glossed answer, trailing
  // punctuation, and no ব্যাখ্যা in the source at all.
  it("resolves a trailing-punctuation gloss and leaves the explanation empty", () => {
    const line =
      "১২৫. 'Unstamped' এর বাংলা পরিভাষা- ক. বাতিলযোগ্য খ. অনিবন্ধিত গ. ডাকটিকিটবিহীন ঘ. সিলমোহরবিহীন Ans. ঘ. সিলমোহরবিহীন.";
    const { parsed, repair } = asRec(parseDocxRecord(line));
    expect(repair).toBe("gloss-answer");
    expect(parsed.correctAnswer).toBe("সিলমোহরবিহীন");
    expect(parsed.explanation).toBe("");
  });

  // Source: Questions(Terminology).txt line 67 — the key letter points at an
  // option ("ক ও খ উভয়ই") that the answer words contradict ("নির্ঘণ্ট").
  it("falls back to the source's answer letter when the words point elsewhere", () => {
    const line =
      "৬৭. 'Index' শব্দের বাংলা পারিভাষিক শব্দ কোনটি? ক. নির্ঘণ্ট খ. সূচক গ. ক ও খ উভয়ই ঘ. খ ও গ উভয়ই Ans. গ. নির্ঘণ্ট (বা সূচক).";
    const { parsed, repair } = asRec(parseDocxRecord(line));
    expect(repair).toBe("letter-keyed");
    expect(parsed.correctAnswer).toBe("ক ও খ উভয়ই");
  });

  // Source: Questions(বিপরীত শব্দ).docx ৯০ — an ASCII "g" stands in for the
  // Bangla option marker গ.
  it("repairs an ASCII g option marker", () => {
    const line =
      "৯০. 'আগমনী' শব্দের বিপরীত শব্দ কোনটি? ক. বিদায়ী খ. প্রত্যয়  g. বিসর্জন ঘ. প্রাক্কনী উত্তর: ক ব্যাখ্যা: আগমন সূচক হলো 'আগমনী', আর চলে যাওয়ার সূচক হলো 'বিদায়ী'।";
    const { parsed, repair } = asRec(parseDocxRecord(line));
    expect(repair).toBe("latin-marker");
    expect(parsed.options).toEqual(["বিদায়ী", "প্রত্যয়", "বিসর্জন", "প্রাক্কনী"]);
    expect(parsed.correctAnswer).toBe("বিদায়ী");
    expect(parsed.explanation).toContain("আগমন সূচক");
  });

  // Source: Questions(বিপরীত শব্দ).docx ১৩১ — the third marker repeats ঘ.
  it("repairs a duplicated option marker that skips a letter", () => {
    const line =
      "১৩১. 'পুষ্ট' শব্দের বিপরীত শব্দ কোনটি? ক. জীর্ণ খ. ক্ষীণ/ কৃশ ঘ. দুর্বল ঘ. ভঙ্গুর উত্তর: খ ব্যাখ্যা: শরীরিকভাবে সুগঠিত হওয়া 'পুষ্ট', আর শুকিয়ে যাওয়া বা কৃশ হওয়া হলো 'ক্ষীণ'।";
    const { parsed, repair } = asRec(parseDocxRecord(line));
    expect(repair).toBe("dup-marker");
    expect(parsed.options).toEqual(["জীর্ণ", "ক্ষীণ/ কৃশ", "দুর্বল", "ভঙ্গুর"]);
    expect(parsed.correctAnswer).toBe("ক্ষীণ/ কৃশ");
    expect(parsed.explanation).toContain("সুগঠিত");
  });

  // Source: Questions(বিপরীত শব্দ).docx ৬৪ / ৬৯ — the .docx genuinely has
  // three options. padding a fourth would invent content, so the record stays
  // unparsed and the importer reports it.
  it("does not invent a fourth option for a three-option source record", () => {
    const line =
      "৬৪. 'হর্ষ'-এর বিপরীতার্থক শব্দ কোনটি? ক. আনন্দ খ. কষ্ট গ. বিষাদ উত্তর: গ ব্যাখ্যা: 'হর্ষ' অর্থ আনন্দ বা উল্লাস, এর সঠিক বিপরীতার্থক শব্দ 'বিষাদ' (দুঃখ)।";
    const r = parseDocxRecord(line);
    expect(r === null || (r !== null && "skip" in r)).toBe(true);
  });

  it("returns null or a skip for a line that is not a record", () => {
    const r = parseDocxRecord("শব্দতত্ত্ব");
    expect(r === null || (r !== null && "skip" in r)).toBe(true);
  });
});

describe("waiveGateCodes (approved gate waivers)", () => {
  const NO_EXPLANATION =
    "১৯. Blue Print - এর পারিভাষিক শব্দ কোনটি? ক. জীবনবৃত্তান্ত খ. চলচ্চিত্র গ. পটভূমি ঘ. প্রতিচিত্র Ans. ঘ. প্রতিচিত্র (বা নীল নকশা).";
  const WITH_EXPLANATION =
    "০১. প্রশ্ন? ক. এক খ. দুই গ. তিন ঘ. চার Ans. ক. এক ব্যাখ্যা: ব্যাখ্যা এখানে আছে।";

  it("waives EMPTY_EXPLANATION only when the source carries no marker", () => {
    expect(waiveGateCodes(["EMPTY_EXPLANATION"], NO_EXPLANATION)).toEqual({
      waived: ["EMPTY_EXPLANATION"],
      blocking: [],
    });
    // A record that DOES have a ব্যাখ্যা: but lost it while parsing is a bug,
    // not a source omission — it must keep blocking.
    expect(waiveGateCodes(["EMPTY_EXPLANATION"], WITH_EXPLANATION)).toEqual({
      waived: [],
      blocking: ["EMPTY_EXPLANATION"],
    });
  });

  it("always waives DUPLICATE_OPTION (answer is stored as option text)", () => {
    expect(waiveGateCodes(["DUPLICATE_OPTION"], WITH_EXPLANATION)).toEqual({
      waived: ["DUPLICATE_OPTION"],
      blocking: [],
    });
  });

  it("never waives any other fatal code", () => {
    expect(waiveGateCodes(["MOJIBAKE", "EMPTY_EXPLANATION"], NO_EXPLANATION)).toEqual({
      waived: ["EMPTY_EXPLANATION"],
      blocking: ["MOJIBAKE"],
    });
    expect(waiveGateCodes(["DUPLICATE_OPTION", "MISSING_CORRECT_OPTION"], NO_EXPLANATION)).toEqual({
      waived: ["DUPLICATE_OPTION"],
      blocking: ["MISSING_CORRECT_OPTION"],
    });
  });

  it("the real no-explanation source record is accepted end to end", () => {
    const { parsed } = asRec(parseDocxRecord(NO_EXPLANATION));
    const gate = scanMca(parsed);
    expect(gate.fatal.map((f) => f.code)).toContain("EMPTY_EXPLANATION");
    expect(waiveGateCodes(gate.fatal.map((f) => f.code), NO_EXPLANATION).blocking).toEqual([]);
  });
});
