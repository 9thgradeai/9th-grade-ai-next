import { SYLLABUS_DATA } from "@/lib/data/syllabus";

/**
 * Subject metadata for the Subject Universe section.
 *
 * Question/hour totals are computed from the same seeded syllabus data the
 * syllabus explorer uses, so marketing numbers never drift from the product.
 * Current Affairs is dynamic by nature and is labeled honestly instead of
 * being given a fake static count.
 */

// Indices into SYLLABUS_DATA for each marketed subject. Bangladesh Affairs
// also draws on the geography & environment category (category ৫).
const SOURCES: Record<string, number[]> = {
  Bangla: [0],
  English: [1],
  "Bangladesh Affairs": [2, 4],
  "International Affairs": [3],
  "General Science": [5],
  ICT: [6],
  Mathematics: [7],
  "Mental Ability": [8],
};

export type Subject = {
  name: string;
  questions: number | null;
  estimatedHours: number | null;
  blurb: string;
};

function totalFor(indices: number[]) {
  let questions = 0;
  let hours = 0;
  for (const index of indices) {
    const category = SYLLABUS_DATA[index]!;
    for (const topic of category.topics) {
      questions += topic.questions;
      hours += topic.estimatedHours;
    }
  }
  return { questions, estimatedHours: hours };
}

export const SUBJECTS: Subject[] = [
  { name: "Bangla", ...totalFor(SOURCES["Bangla"]), blurb: "Language, literature, and spelling precision." },
  { name: "English", ...totalFor(SOURCES["English"]), blurb: "Grammar, usage, and literature eras." },
  { name: "Mathematics", ...totalFor(SOURCES["Mathematics"]), blurb: "Arithmetic to geometry, drilled to reflex." },
  { name: "Bangladesh Affairs", ...totalFor(SOURCES["Bangladesh Affairs"]), blurb: "History, constitution, economy, geography." },
  { name: "International Affairs", ...totalFor(SOURCES["International Affairs"]), blurb: "Global affairs, diplomacy, organizations." },
  { name: "General Science", ...totalFor(SOURCES["General Science"]), blurb: "Physics, biology, and modern science." },
  { name: "ICT", ...totalFor(SOURCES["ICT"]), blurb: "Computing fundamentals to networks." },
  { name: "Mental Ability", ...totalFor(SOURCES["Mental Ability"]), blurb: "Reasoning, puzzles, and spatial logic." },
  {
    name: "Current Affairs",
    questions: null,
    estimatedHours: null,
    blurb: "Living feed — updated daily, not frozen in a bank.",
  },
];

/** Desktop orbital layout: two rings around the knowledge core. */
export const ORBITS: { name: string; angle: number; radius: number }[] = [
  { name: "Bangla", angle: -90, radius: 30 },
  { name: "English", angle: -18, radius: 30 },
  { name: "Mathematics", angle: 54, radius: 30 },
  { name: "Bangladesh Affairs", angle: 126, radius: 30 },
  { name: "International Affairs", angle: 198, radius: 30 },
  { name: "General Science", angle: -54, radius: 45 },
  { name: "ICT", angle: 18, radius: 45 },
  { name: "Mental Ability", angle: 90, radius: 45 },
  { name: "Current Affairs", angle: 162, radius: 45 },
];

export function orbitPosition(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
}
