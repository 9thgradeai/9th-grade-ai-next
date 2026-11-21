// backend/services/adaptive-exam/historical-sources.ts
// Explicit source catalogue for Adaptive Exam V2.0 historical ingestion.
//
// HONESTY CONTRACT
//   • Only repository-local files listed here can be discovered. No arbitrary
//     path, URL or user-supplied glob becomes an ingestion source.
//   • Year/date/set labels are SOURCE CLAIMS taken from a filename or file
//     header. They are not externally verified facts.
//   • BCS Uttoron is discovery-only in this phase: it can be listed but never
//     previewed/imported until the maintainer approves a verified treatment.
//   • Bank Senior Officer (General) files are previewable, but every parsed
//     answer remains SOURCE_CLAIMED/DISPUTED/UNVERIFIED and ineligible for PYQ
//     until an independent verification pass supplies a verified answer.

import type { ExamFamily } from "./contracts";

export type HistoricalSourceFormat = "BCS_UTTORON_JSON" | "BANK_SO_GENERAL_TXT";

export type HistoricalSourceReviewScope =
  | "DISCOVERY_ONLY"
  | "PENDING_VERIFICATION";

export type HistoricalSubjectMapping = Readonly<{
  subjectId: string;
  subjectName: string;
  topicPath: string;
}>;

export type HistoricalSourceDescriptor = Readonly<{
  id: string;
  family: ExamFamily;
  organization: string;
  recruitmentPost: string;
  examinationName: string;
  stage: string;
  /** Source-claimed year from filename/header; never an externally verified year. */
  examYear?: number;
  paperSet?: string;
  /** Repo-relative path. The filesystem reader refuses paths outside its root. */
  filePath: string;
  format: HistoricalSourceFormat;
  reviewScope: HistoricalSourceReviewScope;
  /** Keyed by the source's own subject id/section label. Curation, not an official mapping. */
  subjectMap?: Readonly<Record<string, HistoricalSubjectMapping>>;
  defaultSubject: HistoricalSubjectMapping;
  sourceClaim: string;
  notes: readonly string[];
}>;

const BCS_SUBJECT_MAP: Readonly<Record<string, HistoricalSubjectMapping>> = Object.freeze({
  "1": { subjectId: "bcs.bangla", subjectName: "Bangla Language & Literature", topicPath: "bcs.bangla" },
  "2": { subjectId: "bcs.english", subjectName: "English Language & Literature", topicPath: "bcs.english" },
  "3": { subjectId: "bcs.bangladesh", subjectName: "Bangladesh Affairs", topicPath: "bcs.bangladesh" },
  "4": { subjectId: "bcs.international", subjectName: "International Affairs", topicPath: "bcs.international" },
  "5": { subjectId: "bcs.geography", subjectName: "Geography, Environment & Disaster Management", topicPath: "bcs.geography" },
  "6": { subjectId: "bcs.science", subjectName: "General Science", topicPath: "bcs.science" },
  "7": { subjectId: "bcs.computer", subjectName: "Computer & Information Technology", topicPath: "bcs.computer" },
  "8": { subjectId: "bcs.math", subjectName: "Mathematical Reasoning", topicPath: "bcs.math" },
  "9": { subjectId: "bcs.mental", subjectName: "Mental Ability", topicPath: "bcs.mental" },
  "10": { subjectId: "bcs.ethics", subjectName: "Ethics, Values & Good Governance", topicPath: "bcs.ethics" },
});

const UNCLASSIFIED_BCS: HistoricalSubjectMapping = Object.freeze({
  subjectId: "bcs.unclassified",
  subjectName: "Unclassified",
  topicPath: "unclassified",
});

const UNCLASSIFIED_BANK: HistoricalSubjectMapping = Object.freeze({
  subjectId: "bank.unclassified",
  subjectName: "Unclassified",
  topicPath: "unclassified",
});

const BANK_SECTION_MAP: Readonly<Record<string, HistoricalSubjectMapping>> = Object.freeze({
  english: { subjectId: "bank.english", subjectName: "English — Grammar and Language", topicPath: "bank.english" },
  bangla: { subjectId: "bank.bangla", subjectName: "বাংলা ভাষা ও সাহিত্য", topicPath: "bank.bangla" },
  mathematics: { subjectId: "bank.math", subjectName: "General Mathematics", topicPath: "bank.math" },
  math: { subjectId: "bank.math", subjectName: "General Mathematics", topicPath: "bank.math" },
  "financial & banking knowledge": { subjectId: "bank.financial", subjectName: "Financial and Banking Knowledge", topicPath: "bank.financial" },
  "financial and banking knowledge": { subjectId: "bank.financial", subjectName: "Financial and Banking Knowledge", topicPath: "bank.financial" },
  "analytical skills": { subjectId: "bank.analytical", subjectName: "Analytical Skills", topicPath: "bank.analytical" },
  ict: { subjectId: "bank.ict", subjectName: "Basic Knowledge on ICT", topicPath: "bank.ict" },
});

const BANK_DIR = "database/data/question_bank/Bank/Senior Officer(General)";

const BANK_COMMON_NOTES: readonly string[] = Object.freeze([
  "Answer letters in this file are source claims. No independent answer key is present; verification is never upgraded automatically.",
  "No difficulty labels exist in the source; parsed records stay unclassified instead of receiving a fabricated MEDIUM band.",
  "Subject labels are unclassified unless the file itself supplies a section header. Curated section-to-config mapping is not an official allocation.",
]);

function bankSource(input: {
  id: string;
  file: string;
  examinationName: string;
  examYear?: number;
  paperSet?: string;
  sourceClaim: string;
  notes?: readonly string[];
}): HistoricalSourceDescriptor {
  return Object.freeze({
    id: input.id,
    family: "BANK",
    organization: "Bangladesh Bank",
    recruitmentPost: "Senior Officer (General)",
    examinationName: input.examinationName,
    stage: "preliminary",
    ...(input.examYear === undefined ? {} : { examYear: input.examYear }),
    ...(input.paperSet ? { paperSet: input.paperSet } : {}),
    filePath: `${BANK_DIR}/${input.file}`,
    format: "BANK_SO_GENERAL_TXT",
    reviewScope: "PENDING_VERIFICATION",
    subjectMap: BANK_SECTION_MAP,
    defaultSubject: UNCLASSIFIED_BANK,
    sourceClaim: input.sourceClaim,
    notes: Object.freeze([...BANK_COMMON_NOTES, ...(input.notes ?? [])]),
  });
}

/** Frozen catalogue. Add sources here only after recording the source claim. */
export const HISTORICAL_SOURCES: readonly HistoricalSourceDescriptor[] = Object.freeze([
  Object.freeze({
    id: "uttoron:bcs-preliminary",
    family: "BCS",
    organization: "Bangladesh Public Service Commission",
    recruitmentPost: "BCS",
    examinationName: "BCS Preliminary (10th–50th)",
    stage: "preliminary",
    filePath: "database/data/question_bank/bcs/uttoron/bcs_preliminary_question_bank.json",
    format: "BCS_UTTORON_JSON",
    reviewScope: "DISCOVERY_ONLY",
    subjectMap: BCS_SUBJECT_MAP,
    defaultSubject: UNCLASSIFIED_BCS,
    sourceClaim:
      "Dataset metadata claims a deterministic scrape compiled from processed BCS JSON files. Metadata counts are claims, not independently verified facts.",
    notes: Object.freeze([
      "Discovery-only in Phase 05: listing is allowed, preview/import is refused until a maintainer approves a verified treatment.",
      "Metadata claims 41 exams and 5,350 rows; ingestion must re-derive counts from the file rather than trust metadata.",
      "Source answers are claimed letters. Some rows have blank answers and 50 rows carry question images; those rows must not be silently guessed.",
    ]),
  }),
  bankSource({
    id: "bb-so-general:2019",
    file: "Senior Officer (General) 2019 [MCQ].txt",
    examinationName: "Senior Officer (General) 2019 [MCQ]",
    examYear: 2019,
    sourceClaim: "Year is claimed by the filename and the file's first line.",
  }),
  bankSource({
    id: "bb-so-general:2021",
    file: "Senior Officer(General)_2021 (2).txt",
    examinationName: "Senior Officer (General) 2021",
    examYear: 2021,
    sourceClaim: "Year is claimed by the filename. Several entries explicitly note answer-key mismatches.",
    notes: Object.freeze([
      "The loader in scripts/import-bank-exams.ts references a different 2021 filename; this catalogue points at the file that actually exists.",
    ]),
  }),
  bankSource({
    id: "bb-so-general:2022",
    file: "Senior Officer (General) 2022 [MCQ].txt",
    examinationName: "Senior Officer (General) 2022 [MCQ]",
    examYear: 2022,
    sourceClaim: "Year is claimed by the filename and the file's first line.",
  }),
  bankSource({
    id: "bb-so-general:2023",
    file: "Senior Officer (General) 2023.txt",
    examinationName: "Senior Officer (General) 2023 [MCQ]",
    examYear: 2023,
    sourceClaim: "Year is claimed by the filename and the file's first line.",
    notes: Object.freeze([
      "Some entries say `Ans. Note (সঠিক উত্তর নেই)`; those must remain unverified, never converted to a guessed option.",
    ]),
  }),
  bankSource({
    id: "bb-so-general:2023-ii",
    file: "_Senior Officer (General)-II-2023.txt",
    examinationName: "Senior Officer (General) 2023 [MCQ] — II",
    examYear: 2023,
    paperSet: "II",
    sourceClaim: "Year, exam title, institution and PDF reference are claimed in the file header.",
    notes: Object.freeze([
      "Multiple entries carry `Key অনুযায়ী`/`Note` caveats; those are preserved as disputed source claims.",
    ]),
  }),
  bankSource({
    id: "bb-so-general:2025",
    file: "SeniorOfficer(General)_2025.txt",
    examinationName: "Senior Officer (General) 2025",
    paperSet: "B",
    sourceClaim:
      "Filename claims 2025 while the file header claims 15 May 2026. The conflict is preserved; examYear is intentionally omitted.",
    notes: Object.freeze([
      "Filename/header year conflict: no examYear is assigned until the discrepancy is resolved.",
      "Section headers in this file are the only direct subject evidence available in the Bank corpus.",
    ]),
  }),
]);

const SOURCE_BY_ID = new Map(HISTORICAL_SOURCES.map((source) => [source.id, source]));

/** Only catalogue ids are valid source refs; rejects traversal and free-form paths. */
export function getHistoricalSource(sourceId: string): HistoricalSourceDescriptor | null {
  return SOURCE_BY_ID.get(sourceId) ?? null;
}

export function listHistoricalSources(filter?: {
  family?: ExamFamily;
  reviewScope?: HistoricalSourceReviewScope;
}): HistoricalSourceDescriptor[] {
  return HISTORICAL_SOURCES.filter(
    (source) =>
      (!filter?.family || source.family === filter.family) &&
      (!filter?.reviewScope || source.reviewScope === filter.reviewScope),
  );
}

/** Normalises a section label from source text for the curated subject map. */
export function normaliseSectionLabel(label: string): string {
  return label
    .normalize("NFKC")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
