/**
 * tests/qb-import-bcs-docx.test.ts
 * ----------------------------------------------------------------------------
 * Deterministic correctness guarantees for the BCS .docx Previous-Year import
 * pipeline (scripts/parse-bcs-docx.ts → scripts/import-bcs-exams.ts):
 *
 *   1. All five donor layouts parse into exactly 4 options + raw answer +
 *      explanation (44th single-para, 46th four-para, 48th উত্তর:-marker,
 *      49th scattered options, 50th combined answer+explanation line).
 *   2. Inline option splitting prefers the ordered (ক→খ→গ→ঘ) block, so prose
 *      markers ("গ.সা.গু") never hijack the split; out-of-order source blocks
 *      still resolve letter-correct.
 *   3. Subject classification routes questions to the canonical BCS subjects.
 *   4. Gate-precision fixes hold: lone loose-hasanta (কোন্), header-form-only
 *      ভূমিকা preamble, option cross-references in explanations, and the
 *      book-Unicode rawMath keep path.
 * ----------------------------------------------------------------------------
 */

import { describe, it, expect } from "vitest"
import {
  splitInlineOptions,
  parseDocxRecord,
  splitDocxRecords,
  classifyBcsSubject,
} from "../scripts/parse-bcs-docx"
import { normalizeBcsRecord } from "../scripts/import-bcs-exams"

describe("docx inline option splitting", () => {
  it("splits a single-paragraph 44th-style record", () => {
    const s = splitInlineOptions(
      "‘চাঁদের অমাবস্যা’ উপন্যাসের যুবক শিক্ষকের নাম– (ক) আবদুল কাদের (খ) খতিব মিয়া (গ) আক্কাস আলী (ঘ) আরেফ আলী"
    )
    expect(s).not.toBeNull()
    expect(s!.stem).toContain("যুবক শিক্ষকের নাম")
    expect(s!.options).toEqual(["আবদুল কাদের", "খতিব মিয়া", "আক্কাস আলী", "আরেফ আলী"])
  })

  it("ignores a prose marker before the real block (গ.সা.গু trap)", () => {
    const s = splitInlineOptions(
      "6a²bc এবং 4a³b²c² এর সংখ্যা সহগের গ.সা.গু নিচের কোনটি? (ক) a²bc (খ) 2a²bc (গ) 2a³b²c² (ঘ) কোনোটিই নয়"
    )
    expect(s).not.toBeNull()
    expect(s!.stem).toContain("নিচের কোনটি?")
    expect(s!.options).toEqual(["a²bc", "2a²bc", "2a³b²c²", "কোনোটিই নয়"])
  })

  it("keeps letter order for out-of-order source blocks", () => {
    const s = splitInlineOptions("(ক) পদ্মা (গ) জিঞ্জিরাম (খ) যমুনা (ঘ) মেঘনা")
    expect(s).not.toBeNull()
    // Letter-ordered so (খ) still resolves to options[1].
    expect(s!.options).toEqual(["পদ্মা", "যমুনা", "জিঞ্জিরাম", "মেঘনা"])
  })

  it("splits latin-marker English blocks", () => {
    const s = splitInlineOptions(
      "‘Sweet are the uses of adversity’ is quoted from Shakespeare’s _______ (a) Julius Caesar (b) Macbeth (c) Comedy of Errors (d) As You Like It"
    )
    expect(s).not.toBeNull()
    expect(s!.options).toEqual(["Julius Caesar", "Macbeth", "Comedy of Errors", "As You Like It"])
  })
})

describe("docx record parsing (all five layouts)", () => {
  it("parses a 46th-style four-paragraph record", () => {
    const p = parseDocxRecord([
      "১। ইন্টারনেট জগতে hyper-linked document গুলোর কালেকশনকে কী বলে?",
      "(ক) HTML (খ) Email (গ) WWW (ঘ) DWS",
      "সঠিক উত্তর: (গ) WWW",
      "ব্যাখ্যা: World Wide Web (WWW) হলো হাইপারটেক্সট দলিলসমূহের পদ্ধতি।",
    ])
    expect(p).not.toBeNull()
    expect(p!.qnum).toBe(1)
    expect(p!.options).toEqual(["HTML", "Email", "WWW", "DWS"])
    expect(p!.correctAnswer).toBe("(গ) WWW")
    expect(p!.explanation).toContain("World Wide Web")
  })

  it("parses a 48th-style record with the উত্তর: marker", () => {
    const p = parseDocxRecord([
      "১. ফররুখ আহমদের ‘সাত সাগরের মাঝি’ কত সালে প্রকাশিত হয়?",
      "(ক) ১৯০৫ (খ) ১৯৪০ (গ) ১৯৪৪ (ঘ) ১৯৫৫",
      "উত্তর: (গ) ১৯৪৪",
      "ব্যাখ্যা: ‘সাত সাগরের মাঝি’ ১৯৪৪ সালে প্রকাশিত হয়।",
    ])
    expect(p).not.toBeNull()
    expect(p!.options[2]).toBe("১৯৪৪")
    expect(p!.correctAnswer).toBe("(গ) ১৯৪৪")
  })

  it("parses a 49th-style scattered record (options after the explanation)", () => {
    const p = parseDocxRecord([
      "প্রশ্ন ২. আহমদ শরীফের মতে মধ্যযুগে চণ্ডীদাস নামে কতজন কবি ছিলেন?",
      "ক) ২",
      "খ) ৩",
      "সঠিক উত্তর: খ) ৩",
      "ব্যাখ্যা: মধ্যযুগে ৩ জন চণ্ডীদাসের অস্তিত্ব পাওয়া যায়।",
      "গ) ৪",
      "ঘ) ৫",
    ])
    expect(p).not.toBeNull()
    expect(p!.qnum).toBe(2)
    expect(p!.options).toEqual(["২", "৩", "৪", "৫"])
  })

  it("parses a 50th-style combined answer+explanation line", () => {
    const p = parseDocxRecord([
      "১. বাংলাদেশের দীর্ঘতম নদী কোনটি?",
      "(ক) পদ্মা",
      "(খ) মেঘনা",
      "(গ) যমুনা",
      "(ঘ) ব্রহ্মপুত্র",
      "সঠিক উত্তর: (খ) মেঘনা। ব্যাখ্যা: মেঘনা দীর্ঘতম ও বৃহত্তম নদী।",
    ])
    expect(p).not.toBeNull()
    expect(p!.options).toEqual(["পদ্মা", "মেঘনা", "যমুনা", "ব্রহ্মপুত্র"])
    expect(p!.correctAnswer).toContain("(খ)")
    expect(p!.explanation).toContain("দীর্ঘতম")
  })

  it("splits sub-numbered records (৭৮ + ৭৮ (খ))", () => {
    const groups = splitDocxRecords([
      "46th BCS",
      "৭৮। ‘সুশাসন চারটি স্তম্ভের উপর নির্ভরশীল’-এই অভিমত কোন সংস্থা প্রকাশ করে?",
      "(ক) জাতিসংঘ (খ) UNDP (গ) বিশ্বব্যাংক (ঘ) ADB",
      "সঠিক উত্তর: (গ) বিশ্বব্যাংক",
      "ব্যাখ্যা: বিশ্বব্যাংক ১৯৮৯ সালে ৪টি স্তম্ভ উল্লেখ করে।",
      "৭৮ (খ)। নিচের কোনটি ‘SMART Bangladesh’ এর উপাদান?",
      "(ক) Smart Democracy (খ) Smart Politics (গ) Smart Society (ঘ) Smart Parliament",
      "সঠিক উত্তর: (গ) Smart Society",
      "ব্যাখ্যা: স্মার্ট বাংলাদেশের ৪টি স্তম্ভের একটি স্মার্ট সোসাইটি।",
    ])
    expect(groups).toHaveLength(2)
    expect(parseDocxRecord(groups[0])!.options).toHaveLength(4)
    expect(parseDocxRecord(groups[1])!.options).toHaveLength(4)
  })

  it("parses a record with the Latin Explanation: marker (47th English section)", () => {
    const p = parseDocxRecord([
      "৩৬। A speech made without previous preparation is called ________. (ক) free speech (খ) extempore speech (গ) maiden speech (ঘ) rousing speech",
      "সঠিক উত্তর: (খ) extempore speech",
      "Explanation: An 'extempore' speech is delivered without prior preparation.",
    ])
    expect(p).not.toBeNull()
    expect(p!.options).toEqual([
      "free speech",
      "extempore speech",
      "maiden speech",
      "rousing speech",
    ])
    expect(p!.explanation).toContain("without prior preparation")
  })

  it("cuts a pasted-in next-record answer block instead of welding rows", () => {
    const p = parseDocxRecord([
      "৭৩। ১৯৫৪ সালের যুক্তফ্রন্ট সরকারের মন্ত্রিসভায় শেখ মুজিব কোন মন্ত্রণালয় পান? (ক) অর্থ (খ) কৃষি ও বন (গ) শিক্ষা (ঘ) স্বাস্থ্য",
      "সঠিক উত্তর: (খ) কৃষি ও বন",
      "ব্যাখ্যা: বঙ্গবন্ধু সর্বকনিষ্ঠ মন্ত্রী ছিলেন।",
      "সঠিক উত্তর: (খ) রাজু আহমেদ",
      "ব্যাখ্যা: ‘জল্লাদের দরবার’-এর রচয়িতা ছিলেন নাট্যব্যক্তিত্ব।",
    ])
    expect(p).not.toBeNull()
    expect(p!.correctAnswer).toBe("(খ) কৃষি ও বন")
    expect(p!.explanation).not.toContain("জল্লাদের দরবার")
  })

  it("returns null for records without options (never fabricated)", () => {
    expect(
      parseDocxRecord([
        "৬২। যদি একটি কামান থেকে ৪টি বস্তুকে নিক্ষেপ করা হয়?",
        "(প্রশ্নে অপশনগুলো অনুপস্থিত)",
        "সঠিক উত্তর: (গ)",
      ])
    ).toBeNull()
  })
})

describe("BCS subject classification", () => {
  it("routes by keyword family", () => {
    expect(classifyBcsSubject("‘চাঁদের অমাবস্যা’ উপন্যাসের লেখক কে?", "")).toBe(
      "বাংলা ভাষা ও সাহিত্য"
    )
    expect(classifyBcsSubject("hyper-linked document গুলোর কালেকশনকে কী বলে?", "")).toBe(
      "কম্পিউটার ও তথ্য প্রযুক্তি"
    )
    expect(classifyBcsSubject("ত্রিভুজের তিনটি কোণের সমষ্টি কত?", "")).toBe("গাণিতিক যুক্তি")
    expect(classifyBcsSubject("বাংলাদেশের দীর্ঘতম নদী কোনটি?", "")).toBe(
      "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা"
    )
    expect(classifyBcsSubject("জাতিসংঘ কত সালে প্রতিষ্ঠিত হয়?", "")).toBe("আন্তর্জাতিক বিষয়াবলী")
    expect(classifyBcsSubject("মুক্তিযুদ্ধের সময় মুজিবনগর সরকারের রাষ্ট্রপতি কে ছিলেন?", "")).toBe(
      "বাংলাদেশ বিষয়াবলি"
    )
    expect(classifyBcsSubject("What is the plural form of ‘sheep’?", "")).toBe(
      "English Language and Literature"
    )
    expect(
      classifyBcsSubject(
        "‘শ্রীকৃষ্ণকীর্তন’ কাব্যের অংশ নয় কোনটি?",
        "কাব্যটি ১৩টি খণ্ডে বিভক্ত (জন্মখণ্ড, নৌকাখণ্ড, হারখণ্ড)"
      )
    ).toBe("বাংলা ভাষা ও সাহিত্য")
    expect(
      classifyBcsSubject("স্রোতের অনুকূলে নৌকার বেগ ঘণ্টায় ১০ কিমি হলে প্রতিকূলে কত?", "")
    ).toBe("গাণিতিক যুক্তি")
  })
})

describe("gate precision on docx content", () => {
  const base = {
    examTerm: "৪৬তম বিসিএস",
    examNum: 46,
    year: null,
    subject: "বাংলাদেশ বিষয়াবলি",
    options: ["ক", "খ", "গ", "ঘ"],
    explanation: "ব্যাখ্যা আছে।",
  }

  it("accepts lone word-final হসন্ত (কোন্) instead of flagging corruption", () => {
    const n = normalizeBcsRecord({
      ...base,
      qnum: 1,
      question: "কোন্ সংস্থা বাংলাদেশের GDP হিসাব করে?",
      correctAnswer: "(ক) ক",
    })
    expect(n.ok).toBe(true)
  })

  it("still rejects corroborated visual-order corruption", () => {
    const n = normalizeBcsRecord({
      ...base,
      qnum: 1,
      // Pre-base ি stranded at a word start + inverted ো despair — unmistakable.
      question: "েকান সংস্থা GDP হিসাব করে?",
      correctAnswer: "(ক) ক",
    })
    expect(n.ok).toBe(false)
  })

  it("does not treat the noun ভূমিকা (role) as a preamble note", () => {
    const n = normalizeBcsRecord({
      ...base,
      qnum: 1,
      question: "কোন নেতা অগ্রণী ভূমিকা পালন করেন?",
      correctAnswer: "(ক) ক",
    })
    expect(n.ok).toBe(true)
  })

  it("accepts explanations that cross-reference options by letter", () => {
    const n = normalizeBcsRecord({
      ...base,
      qnum: 1,
      subject: "বাংলা ভাষা ও সাহিত্য",
      question: "নিচের কোন বাক্যটি শুদ্ধ?",
      options: ["ভুল এক", "ভুল দুই", "সঠিক তিন", "ভুল চার"],
      correctAnswer: "(গ) সঠিক তিন।",
      explanation: "(গ) বাক্যটি প্রয়োগগতভাবে সঠিক। (খ) তে ভুল আছে।",
    })
    expect(n.ok).toBe(true)
  })

  it("keeps book-Unicode math verbatim via rawMath instead of rejecting", () => {
    const n = normalizeBcsRecord({
      ...base,
      qnum: 3,
      subject: "গাণিতিক যুক্তি",
      question: "২, ৩, ৪ এবং ৭ সংখ্যাগুলির গড় বিচ্যুতি কত?",
      options: ["০", "⅔", "³⁄₂", "৪"],
      correctAnswer: "(গ) ³⁄₂।",
      explanation: "গড় = ৪। বিচ্যুতি = ৩/২।",
    })
    expect(n.ok).toBe(true)
    if (n.ok) expect(n.rawMath).toBe(true)
  })

  it("still rejects duplicate options and defective answers", () => {
    const dup = normalizeBcsRecord({
      ...base,
      qnum: 1,
      question: "প্রশ্ন?",
      options: ["এক", "এক", "তিন", "চার"],
      correctAnswer: "(ক) এক",
    })
    expect(dup.ok).toBe(false)
    const bad = normalizeBcsRecord({
      ...base,
      qnum: 2,
      question: "প্রশ্ন?",
      correctAnswer: "সঠিকভাবে প্রশ্ন করা হয়নি।",
    })
    expect(bad.ok).toBe(false)
  })
})
