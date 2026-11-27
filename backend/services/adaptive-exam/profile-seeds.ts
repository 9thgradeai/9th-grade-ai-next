// backend/services/adaptive-exam/profile-seeds.ts
// Code-registry → ExamProfile seeds for the Adaptive Exam V2.0 profile registry.
//
// HONESTY CONTRACT
//   • Only profiles with a reviewed config in backend/services/exam-config are
//     seeded. The other four AdaptiveExamProfileId values are declared
//     unavailable with a reason; they are NEVER filled with guessed marks,
//     topics, durations or answers.
//   • Both source configs are `reviewStatus: "reviewed"`, not `approved`.
//     reviewStatus is carried through as verificationStatus, so official
//     simulation stays disabled until an explicit approval happens.
//   • Unsourced values use explicit sentinels, not plausible guesses:
//       – durationMin = 0 means "no sourced duration" (Bank).
//       – difficultyDistribution = all zeros means "no verified distribution".
//     The validator reports these as WARNINGS and officialSimulationEnabled()
//     refuses them. They are not presented as official figures.
//   • `count` mirrors the config's official mark because both configs use
//     1 mark per question. Inferred topics keep no count — allocation stays
//     neutral/inventory-driven, exactly as in the source config.

import "server-only";

import type {
  AdaptiveExamProfileId,
  ExamFamily,
  ExamProfile,
  LanguageCode,
  ProfileSource,
  SubjectAllocationSpec,
  TopicAllocationSpec,
} from "./contracts";
import type { ExamConfig, SubjectNode, TopicNode } from "~backend/services/exam-config/types";
import { BCS_PRELIMINARY_CONFIG } from "~backend/services/exam-config/bcs";
import { BANK_PRELIMINARY_CONFIG } from "~backend/services/exam-config/bank";

import {
  SEED_AUTHORED_AT,
  SEED_CHANGED_BY,
  STRICT_PYQ_POLICY,
  UNSOURCED_DIFFICULTY_DISTRIBUTION,
  PROVISIONAL_PROFILES,
} from "./profile-seed-parts";

export { SEED_AUTHORED_AT, SEED_CHANGED_BY, STRICT_PYQ_POLICY, UNSOURCED_DIFFICULTY_DISTRIBUTION };

const COMMON_NOTES: readonly string[] = [
  "Seeded from a reviewed exam-config; verificationStatus mirrors reviewStatus=reviewed, not approved. Official simulation is disabled.",
  "difficultyDistribution is an explicit all-zero sentinel: no verified difficulty distribution exists in the repository. Supply one from an authoritative source before enabling official simulation.",
  "pyqPolicy is strict: only independently verified answers are eligible (minVerifiedShare=1); source-claimed and unverified answers are excluded.",
  "historicalDataEligible=false until a verified historical corpus is imported and approved.",
  "allowedOverrides=[]: no user overrides are authorised until this profile is approved.",
  "Per-subject language is derived from subject identity (Bangla→bn, English→en, others→bn); it is not an asserted official language policy.",
];

const EPSILON = 1e-9;

/**
 * Flatten a config topic tree into TopicAllocationSpec entries.
 *
 * A parent that already has children carrying its full mark total is treated
 * as a pure grouping node: it keeps its paths and subtopicPaths but no `count`,
 * so a consumer never double-counts it with its children. A parent whose
 * children have no explicit marks (e.g. BCS PART-I, 15 marks) keeps its own
 * `count` because no child carries it.
 */
function topicSpecs(node: TopicNode): TopicAllocationSpec[] {
  const childMarks = node.children
    .map((child) => child.marks)
    .filter((mark): mark is number => mark !== undefined);
  const childrenCarryMarks =
    node.children.length > 0 &&
    childMarks.length === node.children.length &&
    Math.abs(childMarks.reduce((sum, mark) => sum + mark, 0) - (node.marks ?? Number.NaN)) < EPSILON;

  const spec: TopicAllocationSpec = { topicId: node.id, paths: [...node.paths] };
  if (!childrenCarryMarks && node.marks !== undefined) spec.count = node.marks;
  if (node.weight !== undefined) spec.weight = node.weight;
  const subtopicPaths = node.children.flatMap((child) => child.paths);
  if (subtopicPaths.length > 0) spec.subtopicPaths = subtopicPaths;

  return [spec, ...node.children.flatMap(topicSpecs)];
}

function languageForSubject(subjectId: string): LanguageCode {
  if (subjectId.includes("english")) return "en";
  return "bn";
}

function subjectSpec(subject: SubjectNode): SubjectAllocationSpec {
  return {
    subjectId: subject.id,
    nameBn: subject.nameBn,
    nameEn: subject.nameEn,
    aliases: subject.matchNameBn ? [subject.matchNameBn] : [],
    // Both source configs use 1 mark per question, so subject marks == count.
    count: subject.marks,
    language: languageForSubject(subject.id),
    topics: subject.children.flatMap(topicSpecs),
  };
}

type SeedInput = {
  id: AdaptiveExamProfileId;
  family: ExamFamily;
  organization: string;
  recruitmentPost: string;
  stage: string;
  config: ExamConfig;
  /** 0 is the explicit "no sourced duration" sentinel, never a guessed value. */
  durationMin: number;
  source: ProfileSource;
  notes: string[];
};

function buildProfile(input: SeedInput): ExamProfile {
  const { config } = input;
  return {
    id: input.id,
    version: config.version,
    family: input.family,
    ecosystemCode: config.examCode,
    organization: input.organization,
    recruitmentPost: input.recruitmentPost,
    stage: input.stage,
    labelBn: config.labelBn,
    labelEn: config.label,
    subjects: config.subjects.map(subjectSpec),
    totalQuestions: config.totalQuestions,
    totalMarks: config.totalMarks,
    durationMin: input.durationMin,
    scoring: { ...config.scoring },
    difficultyDistribution: { ...UNSOURCED_DIFFICULTY_DISTRIBUTION },
    languagePolicy: "SUBJECT_OVERRIDE",
    historicalDataEligible: false,
    pyqPolicy: { ...STRICT_PYQ_POLICY },
    allowedOverrides: [],
    source: input.source,
    verificationStatus: config.reviewStatus,
    provisional: false,
    ...(config.effectiveFrom ? { effectiveFrom: config.effectiveFrom } : {}),
    revisionHistory: [
      {
        version: config.version,
        changedAt: SEED_AUTHORED_AT,
        changedBy: SEED_CHANGED_BY,
        summary: `Initial seed from reviewed exam-config ${config.examCode} v${config.version}`,
      },
    ],
    notes: [...COMMON_NOTES, ...input.notes, ...config.notes],
  };
}

export const BCS_PRELIMINARY_PROFILE: ExamProfile = buildProfile({
  id: "BCS_PRELIMINARY",
  family: "BCS",
  organization: "Bangladesh Public Service Commission",
  recruitmentPost: "BCS",
  stage: "preliminary",
  config: BCS_PRELIMINARY_CONFIG,
  durationMin: BCS_PRELIMINARY_CONFIG.durationMin ?? 0,
  source: {
    kind: "official",
    reference: "database/data/bcs_syllabus/BCS-Preliminary-Syllabus.md",
    note: "Config provenance=OFFICIAL, reviewStatus=reviewed. Effective date not asserted.",
  },
  notes: [
    "Duration 120 min is sourced from the reviewed config; the effective date is intentionally not asserted.",
    "Post/organisation labels follow the existing BCS exam library; no separate official post config exists.",
  ],
});

export const BB_SENIOR_OFFICER_GENERAL_PROFILE: ExamProfile = buildProfile({
  id: "BB_SENIOR_OFFICER_GENERAL",
  family: "BANK",
  organization: "Bangladesh Bank",
  recruitmentPost: "Senior Officer (General)",
  stage: "preliminary",
  config: BANK_PRELIMINARY_CONFIG,
  // The reviewed Bank config supplies no duration. Zero is a sentinel, not a guess.
  durationMin: 0,
  source: {
    kind: "curated",
    reference: "backend/services/exam-config/bank.ts",
    note: "Config provenance=CURATED, reviewStatus=reviewed. Subject marks are brief-supplied; per-domain marks are not officially sourced.",
  },
  notes: [
    "WORKING ASSUMPTION (Phase 02): the reviewed 100-mark Bank Preliminary config is the only source-backed shape available for BB Senior Officer (General). No post-level marks table was supplied; none is invented.",
    "No sourced duration exists for this profile: durationMin=0 is an explicit sentinel. Official simulation stays disabled until a verified duration is supplied.",
  ],
});

/** Every available code seed. Frozen so callers cannot mutate canonical data. */
export const SEED_PROFILES: readonly ExamProfile[] = Object.freeze([
  BCS_PRELIMINARY_PROFILE,
  BB_SENIOR_OFFICER_GENERAL_PROFILE,
  ...PROVISIONAL_PROFILES,
]);

export type UnavailableProfile = {
  id: string;
  family: ExamFamily | "OTHERS";
  reason: string;
};

/**
 * Profiles the domain knows about but cannot seed. `resolve()` returns null for
 * these; the reason is exposed so the API/UI can explain the absence instead of
 * silently substituting another post's paper shape. Extensible "Others"
 * organisations are declared here until a verified syllabus is supplied.
 */
export const UNAVAILABLE_PROFILES: readonly UnavailableProfile[] = Object.freeze([
  {
    id: "OTHERS_PETROBANGLA",
    family: "OTHERS",
    reason:
      "No syllabus, marks distribution, taxonomy or verified historical questions are available for Petrobangla. Register an organisation and post in the catalog after evidence is supplied.",
  },
  {
    id: "OTHERS_BEPZA",
    family: "OTHERS",
    reason: "No verified syllabus or marks distribution is available for BEPZA.",
  },
  {
    id: "OTHERS_BEZA",
    family: "OTHERS",
    reason: "No verified syllabus or marks distribution is available for BEZA.",
  },
  {
    id: "OTHERS_BIDA",
    family: "OTHERS",
    reason: "No verified syllabus or marks distribution is available for BIDA.",
  },
  {
    id: "OTHERS_NSI",
    family: "OTHERS",
    reason: "No verified syllabus or marks distribution is available for NSI.",
  },
]);

const UNAVAILABLE_BY_ID = new Map<AdaptiveExamProfileId, UnavailableProfile>(
  UNAVAILABLE_PROFILES.map((entry) => [entry.id, entry]),
);

/** The honest reason a profile has no snapshot, or null when it is available. */
export function unavailableReason(id: AdaptiveExamProfileId): string | null {
  return UNAVAILABLE_BY_ID.get(id)?.reason ?? null;
}

/** True when a reviewed code seed exists for this id. */
export function isSeededProfile(id: AdaptiveExamProfileId): boolean {
  return SEED_PROFILES.some((profile) => profile.id === id);
}

/** Canonical seed by id, or null when unavailable. Do not mutate the result. */
export function getSeedProfile(id: AdaptiveExamProfileId): ExamProfile | null {
  return SEED_PROFILES.find((profile) => profile.id === id) ?? null;
}
