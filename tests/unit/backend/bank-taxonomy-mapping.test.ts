/**
 * tests/unit/backend/bank-taxonomy-mapping.test.ts
 * ----------------------------------------------------------------------------
 * Guards the 2026-10-22 Bangladesh Bank taxonomy revision:
 *   • every Bank MCQ must land on a node of database/data/bb-taxonomy.json;
 *   • the mapping is total — no question is ever dropped;
 *   • the legacy flat `ভাষা/` leaves fold into the new grouped leaves.
 * ----------------------------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BB_BANGLA_ROOT,
  BB_BANGLA_ROOT_LATIN,
  BB_BANGLA_ROOT_LEGACY,
  mapBankQuestionPath,
  classifyPartsOfSpeech,
  classifyCorrections,
} from "../../../scripts/bank-taxonomy-mapping";
import { BB_SUBJECT_META } from "../../../scripts/taxonomy";

type TaxonomyNode = { name: string; children: TaxonomyNode[] };

const TAXONOMY: TaxonomyNode = JSON.parse(
  readFileSync(join(process.cwd(), "database", "data", "bb-taxonomy.json"), "utf8"),
);

/** Every taxonomy node path, relative to the subject root. */
const NODE_PATHS: Set<string> = (() => {
  const out = new Set<string>();
  const walk = (n: TaxonomyNode, prefix: string) => {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    out.add(p);
    for (const c of n.children) walk(c, p);
  };
  for (const c of TAXONOMY.children) walk(c, "");
  return out;
})();

describe("bb-taxonomy.json", () => {
  it("exposes the revised Bangla subject root and the grouped grammar leaves", () => {
    expect(TAXONOMY.children.map((c) => c.name)).toEqual([
      "01_বাংলা_ভাষা_ও_সাহিত্য",
      "02_English_Language_and_Literature",
      "03_Mathematics",
      "04_Analytical_Skills",
      "05_ICT",
      "06_Financial_Knowledge",
    ]);
    expect(NODE_PATHS.has(`${BB_BANGLA_ROOT}/ভাষা/শব্দতত্ত্ব/সমাস`)).toBe(true);
    expect(NODE_PATHS.has(`${BB_BANGLA_ROOT}/ভাষা/ধ্বনিতত্ত্ব/সন্ধি_বা_ধ্বনিসংযোগ`)).toBe(true);
    expect(NODE_PATHS.has(`${BB_BANGLA_ROOT}/ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/এককথায়_প্রকাশ`)).toBe(true);
  });

  // The 2026-10-23 drift guard: BB_SUBJECT_META architected the seed upsert
  // key (seed-bb-subjects.ts matches `architectureName` against this JSON and
  // upserts the Subject row on `nameBn`). When the JSON moved to the
  // BCS-canonical root and the metadata did not, `prisma db seed` threw
  // "BB taxonomy drift" and both CI database jobs went red (ADR-070).
  it("keeps BB_SUBJECT_META in lockstep with the JSON roots", () => {
    const jsonRoots = TAXONOMY.children.map((c) => c.name);
    expect(BB_SUBJECT_META.map((m) => m.architectureName)).toEqual(jsonRoots);
    expect(BB_SUBJECT_META.map((m) => m.nameBn)).toEqual(jsonRoots);
  });

  it("still maps rows written under the superseded latin root", () => {
    const mapped = mapBankQuestionPath({
      path: `${BB_BANGLA_ROOT_LATIN}/ভাষা/সমার্থক_শব্দ`,
      subtopic: "",
      question: "q",
    });
    expect(mapped).toBe(`${BB_BANGLA_ROOT}/ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/সমার্থক_শব্দ`);
  });
});

describe("mapBankQuestionPath", () => {
  it("folds the legacy Bangla grammar leaves into the grouped ones", () => {
    const cases: Array<[string, string, string]> = [
      ["ভাষা/পদ", "পদ", "ভাষা/শব্দতত্ত্ব/পদ_ও_পদ_পরিবর্তন"],
      ["ভাষা/কারক", "কারক", "ভাষা/শব্দতত্ত্ব/কারক_ও_বিভক্তি"],
      ["ভাষা/সমাস", "সমাস", "ভাষা/শব্দতত্ত্ব/সমাস"],
      ["ভাষা/প্রত্যয়", "প্রত্যয়", "ভাষা/শব্দতত্ত্ব/প্রকৃতি_ও_প্রত্যয়"],
      ["ভাষা/উপসর্গ", "উপসর্গ", "ভাষা/শব্দতত্ত্ব/উপসর্গ_ও_অনুসর্গ"],
      ["ভাষা/সন্ধি", "সন্ধি", "ভাষা/ধ্বনিতত্ত্ব/সন্ধি_বা_ধ্বনিসংযোগ"],
      ["ভাষা/বর্ণ", "বর্ণ", "ভাষা/ধ্বনিতত্ত্ব/ধ্বনির_প্রতীক_বা_বর্ণের_বিন্যাস"],
      ["ভাষা/সমার্থক_শব্দ", "সমার্থক_শব্দ", "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/সমার্থক_শব্দ"],
      ["ভাষা/বাগধারা", "বাগধারা", "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/বাগধারা_ও_প্রবাদ_প্রবচন"],
    ];
    for (const [leaf, subtopic, expected] of cases) {
      const mapped = mapBankQuestionPath({
        path: `${BB_BANGLA_ROOT_LEGACY}/${leaf}`,
        subtopic,
        question: "q",
      });
      expect(mapped).toBe(`${BB_BANGLA_ROOT}/${expected}`);
    }
  });

  it("splits the legacy বাক্য leaf by subtopic", () => {
    const at = (subtopic: string) =>
      mapBankQuestionPath({
        path: `${BB_BANGLA_ROOT_LEGACY}/ভাষা/বাক্য`,
        subtopic,
        question: "q",
      });
    expect(at("বাচ্য")).toBe(`${BB_BANGLA_ROOT}/ভাষা/বাক্যতত্ত্ব/বাচ্য`);
    expect(at("বাক্য সংকোচন, এক কথায় প্রকাশ")).toBe(
      `${BB_BANGLA_ROOT}/ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/এককথায়_প্রকাশ`,
    );
    expect(at("বাক্য সংকোচন")).toBe(`${BB_BANGLA_ROOT}/ভাষা/বাক্যতত্ত্ব/বাক্য_ও_বাক্যবিন্যাস`);
  });

  it("folds the literary-history sets onto the আধুনিক যুগ group", () => {
    const mapped = mapBankQuestionPath({
      path: `${BB_BANGLA_ROOT_LEGACY}/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা_নাটক`,
      subtopic: "বাংলা_নাটক",
      question: "q",
    });
    expect(mapped).toBe(`${BB_BANGLA_ROOT}/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান`);
  });

  it("distributes the questions parked on the English group nodes", () => {
    const pos = mapBankQuestionPath({
      path: "02_English_Language_and_Literature/PART-I_Language/Parts_of_Speech",
      subtopic: "Parts of Speech",
      question: "Which word is a pronoun in the sentence?",
    });
    expect(pos).toBe(
      "02_English_Language_and_Literature/PART-I_Language/Parts_of_Speech/Noun_Pronoun_Determiner_Gender_Number",
    );

    const vocab = mapBankQuestionPath({
      path: "02_English_Language_and_Literature/PART-I_Language/Words_Vocabulary",
      subtopic: "Collocations—Natural Word Combinations (76–110)",
      question: "Choose the correct collocation.",
    });
    expect(vocab).toBe(
      "02_English_Language_and_Literature/PART-I_Language/Words_Vocabulary/One-Word_Substitutions",
    );

    const err = mapBankQuestionPath({
      path: "02_English_Language_and_Literature/PART-I_Language/Corrections_and_Agreement",
      subtopic: "Errors Detection",
      question: 'Identify the segment containing an error: "The committee are divided."',
    });
    expect(err).toBe(
      "02_English_Language_and_Literature/PART-I_Language/Corrections_and_Agreement/Subject-Verb_Agreement",
    );
  });

  it("leaves taxonomy leaves untouched", () => {
    expect(
      mapBankQuestionPath({
        path: "03_Mathematics/Part_01_Arithmetic/Percentages",
        subtopic: "Percentages",
        question: "q",
      }),
    ).toBeNull();
    expect(
      mapBankQuestionPath({
        path: "02_English_Language_and_Literature/PART-I_Language/Idioms_and_Phrases/Meanings_of_Idioms",
        subtopic: "Idioms & Phrases",
        question: "q",
      }),
    ).toBeNull();
  });

  it("folds the Math / ICT topics the revision dropped", () => {
    expect(
      mapBankQuestionPath({
        path: "03_Mathematics/Part_06_Time_Work_and_Speed/Time_and_Work",
        subtopic: "Time and Work",
        question: "q",
      }),
    ).toBe("03_Mathematics/Part_01_Arithmetic/Ratios_Proportions_and_Mixtures");

    expect(
      mapBankQuestionPath({
        path: "05_ICT/06_Database_and_Information_Systems/SQL_and_Query_Concepts",
        subtopic: "SQL",
        question: "q",
      }),
    ).toBe("05_ICT/04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing");
  });

  it("never returns a path outside the revised taxonomy", () => {
    const legacyPaths = [
      `${BB_BANGLA_ROOT_LEGACY}/ভাষা/পদ`,
      `${BB_BANGLA_ROOT_LEGACY}/ভাষা/বাক্য`,
      `${BB_BANGLA_ROOT_LEGACY}/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা_কথা-সাহিত্য`,
      "02_English_Language_and_Literature/PART-I_Language/Parts_of_Speech",
      "02_English_Language_and_Literature/PART-I_Language/Words_Vocabulary",
      "02_English_Language_and_Literature/PART-I_Language/Corrections_and_Agreement",
      "03_Mathematics/Part_04_Geometry_and_Mensuration/Coordinate_Geometry",
      "05_ICT/05_Emerging_Tech_and_Number_Systems/Digital_Bangladesh_Ecommerce_Egovernance_Law",
    ];
    for (const path of legacyPaths) {
      const mapped = mapBankQuestionPath({ path, subtopic: "", question: "q" });
      expect(mapped, path).not.toBeNull();
      expect(NODE_PATHS.has(mapped!), `${mapped} is not a taxonomy node`).toBe(true);
    }
  });
});

describe("English classifiers", () => {
  it("routes parts-of-speech questions to their leaf", () => {
    expect(classifyPartsOfSpeech("Identify the preposition in the sentence.")).toBe(
      "Parts_of_Speech/Preposition",
    );
    expect(classifyPartsOfSpeech("Which word is an adverb?")).toBe(
      "Parts_of_Speech/Adjective_and_Adverb",
    );
    expect(classifyPartsOfSpeech("Identify the gerund in the sentence.")).toBe(
      "Parts_of_Speech/Verb_Transitive_Intransitive_Non-finite_Gerund_Participle",
    );
  });

  it("routes agreement errors to the agreement leaf", () => {
    expect(classifyCorrections('"The committee are divided in their opinion."')).toBe(
      "Subject-Verb_Agreement",
    );
    expect(classifyCorrections('"She is one of the few bankers who has predicted it."')).toBe(
      "Subject-Verb_Agreement",
    );
    expect(classifyCorrections('"The board aims to expand market share, and minimizing risks."')).toBe(
      "Tense_and_Structure_Errors",
    );
  });
});
