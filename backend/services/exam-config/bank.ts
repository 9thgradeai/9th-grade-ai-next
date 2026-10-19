// backend/services/exam-config/bank.ts — Bangladesh Bank Preliminary (v1) config.
//
// Source of truth:
//   • Subject marks table → this task's brief (English 20, Bangla 20, General
//     Mathematics 20, Financial & Banking 10, Analytical 20, ICT 10 = 100).
//   • Domain hierarchy → the seeded Bank taxonomy (`database/data/bb-taxonomy.json`).
//
// No OFFICIAL per-domain suballocations were supplied for the Bank exam, and the
// taxonomy carries no independently verified yield statistics. Every domain is
// therefore `inferred` (neutral, inventory-driven). The "High/Medium/Low Yield"
// labels referenced in the brief were not present in the task text or the repo,
// so they are intentionally NOT fabricated here — see `notes`.
//
// `paths` are ABSOLUTE DB path prefixes verified against the live taxonomy.

import type { ExamConfig, SubjectNode, TopicNode } from "./types";

const BANGLA = "০১_বাংলা_ভাষা_ও_সাহিত্য";
const ENGLISH = "02_English_Language_and_Literature";
const MATH = "03_Mathematics";
const ANALYTICAL = "04_Analytical_Skills";
const ICT = "05_ICT";
const FINANCIAL = "06_Financial_Knowledge";

/** Inferred domain node — no official marks, neutral inventory fallback. */
function domain(id: string, nameBn: string, path: string, nameEn?: string): TopicNode {
  return { id, nameBn, nameEn, paths: [path], allocationSource: "inferred", children: [] };
}

const bangla: SubjectNode = {
  id: "bank.bangla",
  nameBn: "বাংলা ভাষা ও সাহিত্য",
  nameEn: "Bangla — Grammar and Language",
  marks: 20,
  allocationSource: "official",
  rootSegment: BANGLA,
  matchNameBn: `${BANGLA}`,
  children: [
    domain("bank.bangla.language", "ভাষা", `${BANGLA}/ভাষা`),
    domain("bank.bangla.literature", "সাহিত্য", `${BANGLA}/সাহিত্য`),
  ],
};

const english: SubjectNode = {
  id: "bank.english",
  nameBn: "English — Grammar and Language",
  nameEn: "English — Grammar and Language",
  marks: 20,
  allocationSource: "official",
  rootSegment: ENGLISH,
  matchNameBn: ENGLISH,
  children: [
    domain("bank.english.language", "PART-I: Language", `${ENGLISH}/PART-I_Language`),
    domain("bank.english.literature", "PART-II: Literature", `${ENGLISH}/PART-II_Literature`),
  ],
};

const math: SubjectNode = {
  id: "bank.math",
  nameBn: "General Mathematics",
  nameEn: "General Mathematics",
  marks: 20,
  allocationSource: "official",
  rootSegment: MATH,
  matchNameBn: MATH,
  children: [
    domain("bank.math.arithmetic", "Arithmetic", `${MATH}/Part_01_Arithmetic`),
    domain("bank.math.algebra", "Algebra", `${MATH}/Part_02_Algebra`),
    domain("bank.math.series", "Sequences and Series", `${MATH}/Part_03_Sequences_and_Series`),
    domain("bank.math.geometry", "Geometry and Mensuration", `${MATH}/Part_04_Geometry_and_Mensuration`),
    domain("bank.math.statistics", "Statistics and Probability", `${MATH}/Part_05_Statistics_and_Probability`),
    domain("bank.math.speed", "Time, Work and Speed", `${MATH}/Part_06_Time_Work_and_Speed`),
  ],
};

const analytical: SubjectNode = {
  id: "bank.analytical",
  nameBn: "Analytical Skills",
  nameEn: "Analytical Skills",
  marks: 20,
  allocationSource: "official",
  rootSegment: ANALYTICAL,
  matchNameBn: ANALYTICAL,
  children: [
    domain("bank.analytical.verbal", "Verbal Reasoning", `${ANALYTICAL}/01_Verbal_Reasoning`),
    domain("bank.analytical.problem", "Problem Solving", `${ANALYTICAL}/02_Problem_Solving`),
    domain("bank.analytical.space", "Space Relation", `${ANALYTICAL}/03_Space_Relation`),
    domain("bank.analytical.numerical", "Numerical and Series Ability", `${ANALYTICAL}/04_Numerical_and_Series_Ability`),
  ],
};

const ict: SubjectNode = {
  id: "bank.ict",
  nameBn: "Basic Knowledge on ICT",
  nameEn: "Basic Knowledge on ICT",
  marks: 10,
  allocationSource: "official",
  rootSegment: ICT,
  matchNameBn: ICT,
  children: [
    domain("bank.ict.hardware", "Computer Hardware and Architecture", `${ICT}/01_Computer_Hardware_and_Architecture`),
    domain("bank.ict.software", "Software and OS", `${ICT}/02_Software_and_OS`),
    domain("bank.ict.office", "MS Office Suite", `${ICT}/03_MS_Office_Suite`),
    domain("bank.ict.networking", "Networking and Web", `${ICT}/04_Networking_and_Web`),
    domain("bank.ict.emerging", "Emerging Tech and Number Systems", `${ICT}/05_Emerging_Tech_and_Number_Systems`),
  ],
};

const financial: SubjectNode = {
  id: "bank.financial",
  nameBn: "Financial and Banking Knowledge",
  nameEn: "Financial and Banking Knowledge",
  marks: 10,
  allocationSource: "official",
  rootSegment: FINANCIAL,
  matchNameBn: FINANCIAL,
  children: [
    domain("bank.financial.framework", "Bangladesh Bank Framework", `${FINANCIAL}/01_Bangladesh_Bank_Framework`),
    domain("bank.financial.payment", "Payment and Settlement Systems", `${FINANCIAL}/02_Payment_and_Settlement_Systems`),
    domain("bank.financial.macro", "Macroeconomics and Indicators", `${FINANCIAL}/03_Macroeconomics_and_Indicators`),
    domain("bank.financial.commerce", "Banking, Commerce and Taxation", `${FINANCIAL}/04_Banking_Commerce_and_Taxation`),
  ],
};

export const BANK_PRELIMINARY_CONFIG: ExamConfig = {
  examCode: "BANGLADESH_BANK",
  version: 1,
  label: "Bangladesh Bank Preliminary",
  labelBn: "বাংলাদেশ ব্যাংক প্রিলিমিনারি",
  provenance: "CURATED",
  reviewStatus: "reviewed",
  scoring: { marksPerQuestion: 1, penaltyPerWrong: 0.25, marksForUnanswered: 0 },
  totalMarks: 100,
  totalQuestions: 100,
  subjects: [english, bangla, math, financial, analytical, ict],
  notes: [
    "Subject marks follow the supplied Bank brief (English 20, Bangla 20, General Mathematics 20, Financial & Banking 10, Analytical 20, ICT 10 = 100).",
    "Domain hierarchy follows the seeded Bank taxonomy; no official suballocations were supplied, so domains are inferred and allocated neutrally.",
    "High/Medium/Low Yield labels were referenced in the brief but not included in the supplied task text or the repo; they are NOT fabricated. Add them as configurable `weight` values once an authoritative source is provided.",
    "Provenance=CURATED (reviewStatus=reviewed): subject marks are brief-supplied, per-domain marks are not officially sourced.",
  ],
};

export const BANK_SUBJECTS = [english, bangla, math, financial, analytical, ict];
