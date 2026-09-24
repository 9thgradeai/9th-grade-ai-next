/**
 * tests/qb-import-bank.test.ts
 * ----------------------------------------------------------------------------
 * Deterministic correctness guarantees for the Bank exam-library import
 * pipeline (scripts/import-bank-exams.ts — Senior Officer (General)):
 *
 *   1. Pipe-separated (`ক. … | খ. …`) and multi-line records parse into
 *      exactly 4 options + resolved answer + explanation.
 *   2. `cm^3` answers match `cm³` options (mechanical notation equivalence).
 *   3. Bare `Note` answers and `(Key অনুযায়ী)` answers that contradict
 *      their own letter are rejected — never force-fitted.
 *   4. Subject classification routes Bangla/English/Math/GK/ICT questions
 *      to the correct Bangladesh Bank subject.
 * ----------------------------------------------------------------------------
 */

import { describe, it, expect } from "vitest";
import { parseBankRecord, normalizeBankRecord, classifyBankSubject } from "../scripts/import-bank-exams";

const PAPER = { paperSlug: "senior-officer-general-2023", year: 2023, sourceExam: "Senior Officer (General) 2023" };

describe("Bank record parsing", () => {
  it("parses pipe-separated options into 4 options + answer + explanation", () => {
    const p = parseBankRecord([
      "০১. ব্যাকরণের আলোচ্য বিষয়-",
      "ক. ধ্বনি  |  খ. শব্দ  |  গ. বাক্য  |  ঘ. সবগুলোই",
      "Ans. ঘ. সবগুলোই",
      "ব্যাখ্যা: ধ্বনি, শব্দ, বাক্য প্রত্যেকটি অংশই ব্যাকরণের আলোচ্য বিষয়।",
    ]);
    expect(p).not.toBeNull();
    expect(p!.options).toEqual(["ধ্বনি", "শব্দ", "বাক্য", "সবগুলোই"]);
    expect(p!.correctAnswer).toBe("সবগুলোই");
    expect(p!.explanation).toContain("ব্যাকরণের আলোচ্য বিষয়");
    expect(p!.qnum).toBe(1);
  });

  it("treats cm^3 answers as equal to cm³ options (notation equivalence)", () => {
    const p = parseBankRecord([
      "৬৩. Tray volume?",
      "ক. 32 cm³  |  খ. 48 cm³  |  গ. 49 cm³  |  ঘ. 54 cm³",
      "Ans. খ. 48 cm^3",
      "ব্যাখ্যা: Volume is 48 cubic cm.",
    ]);
    expect(p).not.toBeNull();
    const n = normalizeBankRecord({ ...p!, ...PAPER });
    expect(n.ok).toBe(true);
  });

  it("rejects bare Note answers (no answer given)", () => {
    const p = parseBankRecord([
      "০৯. কোনটি শুদ্ধ বানান?",
      "ক. অনাবাদী  |  খ. অপদস্ত  |  গ. অব্যার্থ  |  ঘ. অভাগিনি",
      "Ans. Note (সঠিক উত্তর নেই)",
      "ব্যাখ্যা: অপশনে সঠিক উত্তর নেই।",
    ]);
    expect(p).not.toBeNull();
    const n = normalizeBankRecord({ ...p!, ...PAPER });
    expect(n.ok).toBe(false);
  });

  it("rejects key-qualified answers that contradict their own letter", () => {
    const p = parseBankRecord([
      "৩৮. The conclusions showed deviation.",
      "ক. Strange  |  খ. Heterogeneity  |  গ. Anomaly  |  ঘ. Anonymity",
      "Ans. খ. Anomaly",
      "ব্যাখ্যা: Anomaly means exception.",
    ]);
    expect(p).not.toBeNull();
    // Letter খ points at Heterogeneity but the text names Anomaly (গ).
    const n = normalizeBankRecord({ ...p!, ...PAPER });
    expect(n.ok).toBe(false);
  });
});

describe("Bank subject classification", () => {
  it("routes Bangla grammar questions to বাংলা ভাষা ও সাহিত্য", () => {
    expect(classifyBankSubject("ব্যাকরণের আলোচ্য বিষয় কোনটি?", "ধ্বনি ও শব্দ")).toBe("বাংলা ভাষা ও সাহিত্য");
  });
  it("routes Latin-script vocab questions to English", () => {
    expect(classifyBankSubject("The term DISINTER is same as -", "explanation")).toBe("English Language and Literature");
  });
  it("routes word problems with math keywords to গণিত", () => {
    expect(classifyBankSubject("What is 20% of m if 8% of m is 40?", "percentage math")).toBe("গণিত");
  });
  it("routes current-affairs questions to সাধারণ জ্ঞান", () => {
    expect(classifyBankSubject("Bangladesh became a member of the United Nations in", "1974")).toBe("সাধারণ জ্ঞান");
    expect(classifyBankSubject("'মাটির ময়না' চলচ্চিত্রের নির্মাতা কে?", "তারেক মাসুদ")).toBe("সাধারণ জ্ঞান");
  });
  it("routes computer questions to ICT", () => {
    expect(classifyBankSubject("How many types of recipients are there in an e-mail system?", "email")).toBe("তথ্য ও যোগাযোগ প্রযুক্তি");
  });
});
