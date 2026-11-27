// backend/services/adaptive-exam/provisional-profiles.ts
// Project-supplied baseline profiles for exam posts that have no independently
// verified post-level syllabus in the repository.
//
// HONESTY CONTRACT
//   • Every profile produced here is `provisional: true`, `reviewStatus=reviewed`
//     and can never enable FULL_EXAM_SIMULATION.
//   • Marks come exclusively from the project-supplied baseline table in the
//     master audit prompt. Nothing is inferred as official.
//   • The Officer IT column sums to 80 while the supplied table states 100;
//     the discrepancy is preserved in `notes` instead of being silently fixed.
//   • Topic paths reuse the reviewed BCS/Bank taxonomy where a matching subject
//     exists. The Bank taxonomy has no General Knowledge branch, so GK topics
//     are a generic provisional path and will yield no verified PYQs.

import "server-only";

import type {
  AdaptiveExamProfileId,
  ExamFamily,
  ExamProfile,
  LanguageCode,
  SubjectAllocationSpec,
  TopicAllocationSpec,
} from "./contracts";
import type { ExamConfig, SubjectNode } from "~backend/services/exam-config/types";
import { BCS_PRELIMINARY_CONFIG } from "~backend/services/exam-config/bcs";
import { BANK_PRELIMINARY_CONFIG, BANK_SUBJECTS } from "~backend/services/exam-config/bank";
import { SEED_AUTHORED_AT, SEED_CHANGED_BY, STRICT_PYQ_POLICY, UNSOURCED_DIFFICULTY_DISTRIBUTION } from "./profile-seed-constants";

const BANK_SUBJECT_IDS = {
  bangla: "bank.bangla",
  english: "bank.english",
  math: "bank.math",
  analytical: "bank.analytical",
  financial: "bank.financial",
  ict: "bank.ict",
} as const;

type BankMarks = Partial<Record<keyof typeof BANK_SUBJECT_IDS | "gk", number>>;

function provisionalTopic(topicId: string, path: string, nameBn: string, nameEn: string): TopicAllocationSpec {
  return { topicId, paths: [path], weight: 1 };
}

function gkSubject(count: number): SubjectAllocationSpec {
  return {
    subjectId: "bank.gk",
    nameBn: "সাধারণ জ্ঞান",
    nameEn: "General Knowledge",
    aliases: ["General Knowledge", "সাধারণ জ্ঞান"],
    count,
    language: "en",
    topics: [provisionalTopic("bank.gk.general", "general-knowledge/general", "সাধারণ জ্ঞান", "General Knowledge")],
  };
}

/** Bank subject specs with supplied marks, in the baseline table's column order. */
function bankSubjects(marks: BankMarks): SubjectAllocationSpec[] {
  const byId = new Map<string, SubjectNode>(BANK_SUBJECTS.map((subject) => [subject.id, subject]));
  const specs: SubjectAllocationSpec[] = [];
  const order: Array<keyof typeof BANK_SUBJECT_IDS> = ["bangla", "english", "math", "analytical", "financial", "ict"];
  for (const key of order) {
    const count = marks[key];
    if (!count) continue;
    const node = byId.get(BANK_SUBJECT_IDS[key]);
    if (!node) continue;
    specs.push({
      subjectId: node.id,
      nameBn: node.nameBn,
      nameEn: node.nameEn,
      aliases: node.matchNameBn ? [node.matchNameBn] : [],
      count,
      language: key === "bangla" ? "bn" : "en",
      topics: node.children.flatMap((child) => [
        {
          topicId: child.id,
          paths: [...child.paths],
          weight: 1,
          subtopicPaths: child.children.flatMap((leaf) => leaf.paths),
        },
      ]),
    });
  }
  if (marks.gk) specs.push(gkSubject(marks.gk));
  return specs;
}

function bcsSubjects(config: ExamConfig): SubjectAllocationSpec[] {
  function topicSpecs(node: SubjectNode["children"][number]): TopicAllocationSpec[] {
    return [
      { topicId: node.id, paths: [...node.paths], weight: 1, ...(node.children.length > 0
        ? { subtopicPaths: node.children.flatMap((child) => child.paths) }
        : {}) },
      ...node.children.flatMap(topicSpecs),
    ];
  }
  return config.subjects.map((subject) => ({
    subjectId: subject.id,
    nameBn: subject.nameBn,
    nameEn: subject.nameEn,
    aliases: subject.matchNameBn ? [subject.matchNameBn] : [],
    count: subject.marks,
    language: subject.id.includes("english") ? "en" : "bn",
    topics: subject.children.flatMap(topicSpecs),
  }));
}

type ProvisionalInput = {
  id: AdaptiveExamProfileId;
  family: ExamFamily;
  organization: string;
  recruitmentPost: string;
  stage: string;
  labelBn: string;
  labelEn: string;
  subjects: SubjectAllocationSpec[];
  sourceReference: string;
  notes: string[];
  durationMin?: number;
};

function buildProvisional(input: ProvisionalInput): ExamProfile {
  const totalQuestions = input.subjects.reduce((sum, subject) => sum + subject.count, 0);
  return {
    id: input.id,
    version: 1,
    family: input.family,
    ecosystemCode: input.family === "BCS" ? "BCS" : "BANGLADESH_BANK",
    organization: input.organization,
    recruitmentPost: input.recruitmentPost,
    stage: input.stage,
    labelBn: input.labelBn,
    labelEn: input.labelEn,
    subjects: input.subjects,
    totalQuestions,
    totalMarks: totalQuestions,
    durationMin: input.durationMin ?? 0,
    scoring: input.family === "BCS"
      ? { ...BCS_PRELIMINARY_CONFIG.scoring }
      : { ...BANK_PRELIMINARY_CONFIG.scoring },
    difficultyDistribution: { ...UNSOURCED_DIFFICULTY_DISTRIBUTION },
    languagePolicy: "SUBJECT_OVERRIDE",
    historicalDataEligible: false,
    pyqPolicy: { ...STRICT_PYQ_POLICY },
    allowedOverrides: [],
    source: {
      kind: "user-provided",
      reference: input.sourceReference,
      note: "Project-supplied baseline; provisional configuration, not an official notice.",
    },
    verificationStatus: "reviewed",
    provisional: true,
    revisionHistory: [{
      version: 1,
      changedAt: SEED_AUTHORED_AT,
      changedBy: SEED_CHANGED_BY,
      summary: "Provisional seed from project-supplied marks baseline.",
    }],
    notes: [
      "PROVISIONAL: no independently verified post-level syllabus or official notice is attached; not approved.",
      "Official simulation is disabled; historicalDataEligible=false and difficulty distribution is an explicit all-zero sentinel.",
      ...input.notes,
    ],
  };
}

const BB = "Bangladesh Bank";

/** BCS Special has no separately supplied distribution; the supplied BCS
 *  preliminary table is used as a PROVISIONAL mirror, explicitly labelled. */
export const BCS_SPECIAL_PROFILE = buildProvisional({
  id: "BCS_SPECIAL",
  family: "BCS",
  organization: "Bangladesh Public Service Commission",
  recruitmentPost: "BCS (Special)",
  stage: "preliminary",
  labelBn: "বিসিএস স্পেশাল (প্রভিশনাল)",
  labelEn: "BCS Special (provisional)",
  subjects: bcsSubjects(BCS_PRELIMINARY_CONFIG),
  sourceReference: "docs/audits/ADAPTIVE_EXAM_MASTER_AUDIT_REPORT.md#c-syllabus-and-profile-audit",
  notes: [
    "No separate BCS Special syllabus or marks table was supplied. The BCS General baseline is mirrored provisionally and must not be presented as the official Special distribution.",
  ],
});

export const BB_AD_PROFILE = buildProvisional({
  id: "BB_ASSISTANT_DIRECTOR_GENERAL",
  family: "BANK",
  organization: BB,
  recruitmentPost: "Assistant Director (AD)",
  stage: "preliminary",
  labelBn: "বাংলাদেশ ব্যাংক এডি (প্রভিশনাল)",
  labelEn: "Bangladesh Bank AD (provisional)",
  subjects: bankSubjects({ bangla: 20, english: 20, math: 20, analytical: 20, financial: 10, ict: 10 }),
  sourceReference: "docs/audits/ADAPTIVE_EXAM_MASTER_AUDIT_REPORT.md#c-syllabus-and-profile-audit",
  notes: ["Supplied AD baseline: 20/20/20/20/10/10 = 100."],
});

export const BB_OFFICER_GENERAL_PROFILE = buildProvisional({
  id: "BB_OFFICER_GENERAL",
  family: "BANK",
  organization: BB,
  recruitmentPost: "Officer (General)",
  stage: "preliminary",
  labelBn: "বাংলাদেশ ব্যাংক অফিসার (জেনারেল) (প্রভিশনাল)",
  labelEn: "Bangladesh Bank Officer (General) (provisional)",
  subjects: bankSubjects({ bangla: 25, english: 25, math: 20, gk: 20, ict: 10 }),
  sourceReference: "docs/audits/ADAPTIVE_EXAM_MASTER_AUDIT_REPORT.md#c-syllabus-and-profile-audit",
  notes: ["Supplied Officer General baseline: 25/25/20/20/10 = 100. GK has no reviewed taxonomy branch."],
});

export const BB_OFFICER_CASH_PROFILE = buildProvisional({
  id: "BB_OFFICER_CASH",
  family: "BANK",
  organization: BB,
  recruitmentPost: "Officer (Cash)",
  stage: "preliminary",
  labelBn: "বাংলাদেশ ব্যাংক অফিসার (ক্যাশ) (প্রভিশনাল)",
  labelEn: "Bangladesh Bank Officer (Cash) (provisional)",
  subjects: bankSubjects({ bangla: 25, english: 25, math: 20, gk: 20, ict: 10 }),
  sourceReference: "docs/audits/ADAPTIVE_EXAM_MASTER_AUDIT_REPORT.md#c-syllabus-and-profile-audit",
  notes: ["Supplied Officer Cash baseline: 25/25/20/20/10 = 100. Treated as a separate profile."],
});

export const BB_ASSISTANT_MANAGER_PROFILE = buildProvisional({
  id: "BB_ASSISTANT_MANAGER",
  family: "BANK",
  organization: BB,
  recruitmentPost: "Assistant Manager",
  stage: "preliminary",
  labelBn: "বাংলাদেশ ব্যাংক সহকারী ম্যানেজার (প্রভিশনাল)",
  labelEn: "Bangladesh Bank Assistant Manager (provisional)",
  subjects: bankSubjects({ bangla: 25, english: 25, math: 20, gk: 20, ict: 10 }),
  sourceReference: "docs/audits/ADAPTIVE_EXAM_MASTER_AUDIT_REPORT.md#c-syllabus-and-profile-audit",
  notes: ["Supplied Assistant Manager baseline: 25/25/20/20/10 = 100."],
});

export const BB_OFFICER_IT_PROFILE = buildProvisional({
  id: "BB_OFFICER_IT",
  family: "BANK",
  organization: BB,
  recruitmentPost: "Officer (IT)",
  stage: "preliminary",
  labelBn: "বাংলাদেশ ব্যাংক অফিসার (আইটি) (প্রভিশনাল)",
  labelEn: "Bangladesh Bank Officer (IT) (provisional)",
  subjects: bankSubjects({ bangla: 10, english: 10, math: 10, gk: 10, ict: 40 }),
  sourceReference: "docs/audits/ADAPTIVE_EXAM_MASTER_AUDIT_REPORT.md#c-syllabus-and-profile-audit",
  notes: [
    "Supplied Officer IT column lists 10/10/10/10/40 = 80 while the same table states TOTAL 100. The discrepancy is preserved; no marks were invented to close it.",
  ],
});

export const PROVISIONAL_PROFILES: readonly ExamProfile[] = Object.freeze([
  BCS_SPECIAL_PROFILE,
  BB_AD_PROFILE,
  BB_OFFICER_GENERAL_PROFILE,
  BB_OFFICER_CASH_PROFILE,
  BB_ASSISTANT_MANAGER_PROFILE,
  BB_OFFICER_IT_PROFILE,
]);
