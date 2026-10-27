// backend/services/exam-config/bcs.ts — BCS Preliminary (v1) configuration.
//
// Source of truth for the official BCS Preliminary paper shape:
//   • Subject marks table  → `database/data/bcs_syllabus/BCS-Preliminary-Syllabus.md`
//   • Topic hierarchy      → the seeded `Topic` taxonomy (`database/data/taxonomy.json`)
//   • Suballocations       → the subject mark tables in the same syllabus doc.
//
// OFFICIAL marks are encoded only where the syllabus states them. English,
// Mathematics, Mental Ability and Ethics subtopics carry NO official marks in
// the syllabus, so they are left `inferred` (neutral, inventory-driven) rather
// than fabricated. See `notes` for the one reconciliation decision.
//
// The `paths` values are ABSOLUTE database path prefixes exactly as stored on
// `Topic.path` / `Question.path` (verified against the live taxonomy).

import type { ExamConfig, SubjectNode, TopicNode } from "./types";

const BANGLA = "01_বাংলা_ভাষা_ও_সাহিত্য";
const ENGLISH = "02_English_Language_and_Literature";
const BD = "03_বাংলাদেশ_বিষয়াবলি";
const INTL = "04_আন্তর্জাতিক_বিষয়াবলি";
const GEO = "05_ভূগোল_পরিবেশ_ও_দুর্যোগ_ব্যবস্থাপনা";
const SCI = "06_সাধারণ_বিজ্ঞান";
const ICT = "07_কম্পিউটার_ও_তথ্য_প্রযুক্তি";
const MATH = "08_গাণিতিক_যুক্তি";
const MENTAL = "09_মানসিক_দক্ষতা";
const ETHICS = "10_নৈতিকতা_মূল্যবোধ_ও_সু-শাসন";

/** Official leaf node with a mark allocation. */
function official(
  id: string,
  nameBn: string,
  paths: string[],
  marks: number,
  nameEn?: string,
): TopicNode {
  return { id, nameBn, nameEn, paths, marks, allocationSource: "official", children: [] };
}

/** Inferred node: no official marks — allocation falls back to neutral weights. */
function inferred(id: string, nameBn: string, paths: string[], nameEn?: string): TopicNode {
  return { id, nameBn, nameEn, paths, allocationSource: "inferred", children: [] };
}

const bangla: SubjectNode = {
  id: "bcs.bangla",
  nameBn: "বাংলা ভাষা ও সাহিত্য",
  nameEn: "Bangla Language and Literature",
  marks: 30,
  allocationSource: "official",
  rootSegment: BANGLA,
  matchNameBn: "বাংলা ভাষা ও সাহিত্য",
  children: [
    official("bcs.bangla.language", "ভাষা", [`${BANGLA}/ভাষা`], 15),
    {
      id: "bcs.bangla.literature",
      nameBn: "সাহিত্য",
      paths: [],
      marks: 15,
      allocationSource: "official",
      children: [
        official(
          "bcs.bangla.literature.ancient-medieval",
          "প্রাচীন ও মধ্যযুগ",
          [`${BANGLA}/সাহিত্য/প্রাচীন_যুগ`, `${BANGLA}/সাহিত্য/মধ্যযুগ`],
          5,
        ),
        official(
          "bcs.bangla.literature.modern",
          "আধুনিক যুগ",
          [`${BANGLA}/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান`],
          10,
        ),
      ],
    },
  ],
};

const english: SubjectNode = {
  id: "bcs.english",
  nameBn: "English Language and Literature",
  nameEn: "English Language and Literature",
  marks: 30,
  allocationSource: "official",
  rootSegment: ENGLISH,
  matchNameBn: "English Language and Literature",
  children: [
    official("bcs.english.language", "PART-I: Language", [`${ENGLISH}/PART-I_Language`], 15),
    {
      id: "bcs.english.language.parts_of_speech",
      nameBn: "Parts of Speech",
      paths: [`${ENGLISH}/PART-I_Language/Parts_of_Speech`],
      allocationSource: "inferred",
      children: [],
    },
    {
      id: "bcs.english.language.idioms",
      nameBn: "Idioms and Phrases",
      paths: [`${ENGLISH}/PART-I_Language/Idioms_and_Phrases`],
      allocationSource: "inferred",
      children: [],
    },
    {
      id: "bcs.english.language.corrections",
      nameBn: "Corrections and Agreement",
      paths: [`${ENGLISH}/PART-I_Language/Corrections_and_Agreement`],
      allocationSource: "inferred",
      children: [],
    },
    {
      id: "bcs.english.language.sentences",
      nameBn: "Sentences and Transformations",
      paths: [`${ENGLISH}/PART-I_Language/Sentences_and_Transformations`],
      allocationSource: "inferred",
      children: [],
    },
    {
      id: "bcs.english.language.words",
      nameBn: "Words Vocabulary",
      paths: [`${ENGLISH}/PART-I_Language/Words_Vocabulary`],
      allocationSource: "inferred",
      children: [],
    },
    official(
      "bcs.english.literature",
      "PART-II: Literature",
      [`${ENGLISH}/PART-II_Literature`],
      15,
    ),
  ],
};

const bangladesh: SubjectNode = {
  id: "bcs.bangladesh",
  nameBn: "বাংলাদেশ বিষয়াবলি",
  nameEn: "Bangladesh Affairs",
  marks: 25,
  allocationSource: "official",
  rootSegment: BD,
  matchNameBn: "বাংলাদেশ বিষয়াবলি",
  children: [
    official("bcs.bd.national", "জাতীয় বিষয়াবলি", [`${BD}/০১_জাতীয়_বিষয়াবলি`], 6),
    official("bcs.bd.agriculture", "কৃষিজ সম্পদ", [`${BD}/০২_কৃষিজ_সম্পদ`], 2),
    official("bcs.bd.population", "জনসংখ্যা", [`${BD}/০৩_জনসংখ্যা`], 2),
    official("bcs.bd.economy", "অর্থনীতি", [`${BD}/০৪_অর্থনীতি`], 2),
    official("bcs.bd.industry", "শিল্প ও বাণিজ্য", [`${BD}/০৫_শিল্প_ও_বাণিজ্য`], 2),
    official("bcs.bd.constitution", "সংবিধান", [`${BD}/০৬_সংবিধান`], 3),
    official("bcs.bd.politics", "রাজনৈতিক ব্যবস্থা", [`${BD}/০৭_রাজনৈতিক_ব্যবস্থা`], 3),
    official("bcs.bd.government", "সরকার ব্যবস্থা", [`${BD}/০৮_সরকার_ব্যবস্থা`], 3),
    official("bcs.bd.achievements", "জাতীয় বিষয়াদি", [`${BD}/০৯_জাতীয়_বিষয়াদি`], 2),
  ],
};

const international: SubjectNode = {
  id: "bcs.international",
  nameBn: "আন্তর্জাতিক বিষয়াবলি",
  nameEn: "International Affairs",
  marks: 25,
  allocationSource: "official",
  rootSegment: INTL,
  matchNameBn: "আন্তর্জাতিক বিষয়াবলী",
  children: [
    official(
      "bcs.intl.history",
      "বৈশ্বিক ইতিহাস, আঞ্চলিক ও আন্তর্জাতিক ব্যবস্থা, ভূ-রাজনীতি",
      [`${INTL}/০১_বৈশ্বিক_ইতিহাস_আঞ্চলিক_ও_আন্তর্জাতিক_ব্যবস্থা_ভূ-রাজনীতি`],
      5,
    ),
    official(
      "bcs.intl.security",
      "আন্তর্জাতিক নিরাপত্তা ও আন্তরাষ্ট্রীয় ক্ষমতা সম্পর্ক",
      [`${INTL}/০২_আন্তর্জাতিক_নিরাপত্তা_ও_আন্তরাষ্ট্রীয়_ক্ষমতা_সম্পর্ক`],
      5,
    ),
    official(
      "bcs.intl.current",
      "বিশ্বের সাম্প্রতিক ও চলমান ঘটনাপ্রবাহ",
      [`${INTL}/০৩_বিশ্বের_সাম্প্রতিক_ও_চলমান_ঘটনাপ্রবাহ`],
      5,
    ),
    official(
      "bcs.intl.environment",
      "আন্তর্জাতিক পরিবেশগত ইস্যু ও কূটনীতি",
      [`${INTL}/০৪_আন্তর্জাতিক_পরিবেশগত_ইস্যু_ও_কূটনীতি`],
      5,
    ),
    official(
      "bcs.intl.organizations",
      "আন্তর্জাতিক সংগঠনসমূহ ও বৈশ্বিক অর্থনৈতিক প্রতিষ্ঠানাদি",
      [`${INTL}/০৫_আন্তর্জাতিক_সংগঠনসমূহ_এবং_বৈশ্বিক_অর্থনৈতিক_প্রতিষ্ঠানাদি`],
      5,
    ),
  ],
};

const geography: SubjectNode = {
  id: "bcs.geography",
  nameBn: "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা",
  nameEn: "Geography, Environment and Disaster Management",
  marks: 10,
  allocationSource: "official",
  rootSegment: GEO,
  matchNameBn: "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা",
  children: [
    official("bcs.geo.location", "ভৌগোলিক অবস্থান, সীমানা ও গুরুত্ব", [`${GEO}/০১_ভৌগোলিক_অবস্থান`], 2),
    official("bcs.geo.physical", "ভৌত পরিবেশ ও সম্পদ", [`${GEO}/০২_ভৌত_পরিবেশ_ও_সম্পদ`], 2),
    official("bcs.geo.environment", "বাংলাদেশের পরিবেশ", [`${GEO}/০৩_বাংলাদেশের_পরিবেশ`], 2),
    official("bcs.geo.climate", "পরিবেশ পরিবর্তন ও প্রভাব", [`${GEO}/০৪_পরিবেশ_পরিবর্তন_ও_প্রভাব`], 2),
    official("bcs.geo.disaster", "প্রাকৃতিক দুর্যোগ ও ব্যবস্থাপনা", [`${GEO}/০৫_প্রাকৃতিক_দুর্যোগ_ও_ব্যবস্থাপনা`], 2),
  ],
};

const science: SubjectNode = {
  id: "bcs.science",
  nameBn: "সাধারণ বিজ্ঞান",
  nameEn: "General Science",
  marks: 15,
  allocationSource: "official",
  rootSegment: SCI,
  matchNameBn: "সাধারণ বিজ্ঞান",
  children: [
    official("bcs.sci.physical", "ভৌত বিজ্ঞান", [`${SCI}/ভৌত_বিজ্ঞান`], 5),
    official("bcs.sci.biological", "জীব বিজ্ঞান", [`${SCI}/জীব_বিজ্ঞান`], 5),
    official("bcs.sci.modern", "আধুনিক বিজ্ঞান", [`${SCI}/আধুনিক_বিজ্ঞান`], 5),
  ],
};

const computer: SubjectNode = {
  id: "bcs.computer",
  nameBn: "কম্পিউটার ও তথ্য প্রযুক্তি",
  nameEn: "Computer and Information Technology",
  marks: 15,
  allocationSource: "official",
  rootSegment: ICT,
  matchNameBn: "কম্পিউটার ও তথ্য প্রযুক্তি",
  children: [
    official("bcs.ict.computer", "কম্পিউটার", [`${ICT}/কম্পিউটার`], 10),
    official("bcs.ict.it", "তথ্যপ্রযুক্তি", [`${ICT}/তথ্যপ্রযুক্তি`], 5),
  ],
};

// Mathematics: sub-allocations are ambiguous in the syllabus ("০৪/08") and were
// NOT supplied as exact figures — every child is therefore inferred/neutral.
const math: SubjectNode = {
  id: "bcs.math",
  nameBn: "গাণিতিক যুক্তি",
  nameEn: "Mathematical Reasoning",
  marks: 20,
  allocationSource: "official",
  rootSegment: MATH,
  matchNameBn: "গাণিতিক যুক্তি",
  children: [
    inferred("bcs.math.arithmetic", "পাটিগণিত", [`${MATH}/Part_01_পাটিগণিত`]),
    inferred("bcs.math.algebra", "বীজগণিত", [`${MATH}/Part_02_বীজগণিত`]),
    inferred("bcs.math.series", "সূচক ও ধারা", [`${MATH}/Part_03_সূচক_ও_ধারা`]),
    inferred("bcs.math.geometry", "জ্যামিতি", [`${MATH}/Part_04_জ্যামিতি`]),
    inferred("bcs.math.statistics", "সেট ও পরিসংখ্যান", [`${MATH}/Part_05_সেট_ও_পরিসংখ্যান`]),
  ],
};

const mental: SubjectNode = {
  id: "bcs.mental",
  nameBn: "মানসিক দক্ষতা",
  nameEn: "Mental Ability",
  marks: 15,
  allocationSource: "official",
  rootSegment: MENTAL,
  matchNameBn: "মানসিক দক্ষতা",
  children: [
    inferred("bcs.mental.verbal", "ভাষাগত যৌক্তিক বিচার", [`${MENTAL}/০১_ভাষাগত_যৌক্তিক_বিচার_Verbal_Reasoning`], "Verbal Reasoning"),
    inferred("bcs.mental.problem", "সমস্যা সমাধান", [`${MENTAL}/০২_সমস্যা_সমাধান_Problem_Solving`], "Problem Solving"),
    inferred("bcs.mental.spelling", "বানান ও ভাষা", [`${MENTAL}/০৩_বানান_ও_ভাষা_Spelling_and_Language`], "Spelling and Language"),
    inferred("bcs.mental.mechanical", "যান্ত্রিক দক্ষতা", [`${MENTAL}/০৪_যান্ত্রিক_দক্ষতা_Mechanical_Reasoning`], "Mechanical Reasoning"),
    inferred("bcs.mental.space", "স্থানাঙ্ক সম্পর্ক", [`${MENTAL}/০৫_স্থানাঙ্ক_সম্পর্ক_Space_Relation`], "Space Relation"),
    inferred("bcs.mental.numerical", "সংখ্যাগত ক্ষমতা", [`${MENTAL}/০৬_সংখ্যাগত_ক্ষমতা_Numerical_Ability`], "Numerical Ability"),
  ],
};

const ethics: SubjectNode = {
  id: "bcs.ethics",
  nameBn: "নৈতিকতা, মূল্যবোধ ও সু-শাসন",
  nameEn: "Ethics, Values and Good Governance",
  marks: 15,
  allocationSource: "official",
  rootSegment: ETHICS,
  matchNameBn: "নৈতিকতা, মূল্যবোধ ও সু-শাসন",
  children: [
    inferred("bcs.ethics.definition", "Definition of Values and Good Governance", [`${ETHICS}/Definition_of_Values_and_Good_Governance`]),
    inferred("bcs.ethics.relation", "Relation between Values and Good Governance", [`${ETHICS}/Relation_between_Values_and_Good_Governance`]),
    inferred("bcs.ethics.perception", "General Perception of Values and Good Governance", [`${ETHICS}/General_Perception`]),
    inferred("bcs.ethics.importance", "Importance in Life and Society", [`${ETHICS}/Importance_in_Life_and_Society`]),
    inferred("bcs.ethics.impact", "Impact in National Development", [`${ETHICS}/Impact_in_National_Development`]),
    inferred("bcs.ethics.establishment", "Establishment in a Given Social Context", [`${ETHICS}/Establishment_in_Social_Context`]),
    inferred("bcs.ethics.benefit-cost", "Benefit of Values and Cost of their Absence", [`${ETHICS}/Benefit_and_Adverse_Cost`]),
  ],
};

export const BCS_PRELIMINARY_CONFIG: ExamConfig = {
  examCode: "BCS",
  version: 1,
  label: "BCS Preliminary",
  labelBn: "বিসিএস প্রিলিমিনারি",
  // Effective date not verified against an official gazette — left undefined
  // rather than asserted. Provenance is the in-repo official syllabus document.
  provenance: "OFFICIAL",
  reviewStatus: "reviewed",
  scoring: { marksPerQuestion: 1, penaltyPerWrong: 0.5, marksForUnanswered: 0 },
  totalMarks: 200,
  totalQuestions: 200,
  durationMin: 120,
  subjects: [
    bangla,
    english,
    bangladesh,
    international,
    geography,
    science,
    computer,
    math,
    mental,
    ethics,
  ],
  notes: [
    "Subject marks and the Bengali/International/Bangladesh/Geography/Science/ICT suballocations follow database/data/bcs_syllabus/BCS-Preliminary-Syllabus.md.",
    "Reconciliation: the task brief listed the first International Affairs suballocation as 4; the official syllabus and the 25-mark subject total require 5. Encoded as 5 to keep parent-child totals valid.",
    "English, Mathematics, Mental Ability and Ethics subtopics carry no official marks in the syllabus and are marked inferred — allocation is neutral/inventory-driven, never presented as official.",
    "Effective date is not asserted; provenance is the in-repo syllabus document, reviewStatus=reviewed.",
  ],
};

export const BCS_SUBJECTS = [bangla, english, bangladesh, international, geography, science, computer, math, mental, ethics];
