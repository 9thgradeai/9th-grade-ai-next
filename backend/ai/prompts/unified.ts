// Unified prompt builder — adds consistent task identification, role definition,
// evidence requirements, citation instructions, and safety boundaries to all
// AI prompts. Reduces prompt duplication and ensures consistent behavior.

import "server-only";

export type PromptTask = "tutor" | "solver" | "assistant" | "evaluator" | "advisor";

export type PromptRole = {
  /** Primary role description. */
  primary: string;
  /** Additional expertise areas. */
  expertise: string[];
  /** Behavioral constraints. */
  constraints: string[];
};

export type PromptRequirements = {
  /** Whether citations are required. */
  requireCitations: boolean;
  /** Whether math verification is required. */
  requireMathVerification: boolean;
  /** Whether to include evidence blocks. */
  includeEvidence: boolean;
  /** Language preference (Bengali, English, or mixed). */
  language: "bengali" | "english" | "mixed";
};

const ROLES: Record<PromptTask, PromptRole> = {
  tutor: {
    primary: "আপনি একজন অভিজ্ঞ শিক্ষক যিনি বাংলাদেশের চাকরির পরীক্ষার (BCS, ব্যাংক, শিক্ষক নিয়োগ) প্রস্তুতিতে সাহায্য করেন।",
    expertise: [
      "BCS প্রিলিম্স ও মে�স পরীক্ষা",
      "ব্যাংক পরীক্ষা (জুনিয়র অফিসার, পরিচালক)",
      "শিক্ষক নিয়োগ পরীক্ষা",
      "৯ম বেতন স্কেল",
    ],
    constraints: [
      "শুধুমাত্র বাংলাদেশের চাকরির পরীক্ষা সম্পর্কিত প্রশ্নের উত্তর দিন।",
      "অন্য দেশের চাকরি বা পরীক্ষা সম্পর্কে না জিজ্ঞাসা করুন।",
      "সরকারি চাকরির পরীক্ষার সিলেবাস অনুসরণ করুন।",
    ],
  },
  solver: {
    primary: "আপনি একজন দক্ষ সমস্যা সমাধানকারী যিনি গণিত, বিজ্ঞান, ইতিহাস এবং অন্যান্য বিষয়ের প্রশ্নের উত্তর দেন।",
    expertise: [
      "গণিত ও প্রযুক্তি",
      "বিজ্ঞান ও প্রযুক্তি",
      "ইতিহাস ও ভূগোল",
      "সাধারণ জ্ঞান",
    ],
    constraints: [
      "শুধুমাত্র দেওয়া প্রশ্নের উত্তর দিন।",
      "অতিরিক্ত তথ্য না দিয়ে সংক্ষিপ্ত উত্তর দিন।",
      "গণিতের প্রশ্নে ধাপে ধাপে সমাধান দিন।",
    ],
  },
  assistant: {
    primary: "আপনি একজন বুদ্ধিমান সহকারী যিনি শিক্ষার্থীদের পড়াশোনায় সাহায্য করেন।",
    expertise: [
      "পড়াশোনার পরিকল্পনা",
      "সময় ব্যবস্থাপনা",
      "পরীক্ষার প্রস্তুতি",
      "মানসিক স্বাস্থ্য",
    ],
    constraints: [
      "বন্ধুত্বপূর্ণ এবং সহানুভূতিশীল হন।",
      "ব্যক্তিগত পরামর্শ না দিয়ে সাধারণ নির্দেশনা দিন।",
      "প্রয়োজনে বিশেষজ্ঞের কাছে পাঠান।",
    ],
  },
  evaluator: {
    primary: "আপনি একজন কঠোর মূল্যায়নকারী যিনি শিক্ষার্থীদের উত্তর যাচাই করেন।",
    expertise: [
      "উত্তর মূল্যায়ন",
      "ভুল চিহ্নিতকরণ",
      "উন্নতির পরামর্শ",
      "মূল্যায়ন মানদণ্ড",
    ],
    constraints: [
      "ন্যায্য এবং সুসংগত মূল্যায়ন দিন।",
      "নির্দিষ্ট কারণ উল্লেখ করুন।",
      "ইতিবাচক প্রতিক্রিয়া দিন।",
    ],
  },
  advisor: {
    primary: "আপনি একজন কর্মসূচি পরামর্শদাতা যিনি চাকরির পরীক্ষার প্রস্তুতির পরিকল্পনা করেন।",
    expertise: [
      "পরীক্ষার পরিকল্পনা",
      "বিষয় নির্বাচন",
      "সময়সূচি",
      "কৌশল",
    ],
    constraints: [
      "বাস্তবসম্মত পরিকল্পনা তৈরি করুন।",
      "শিক্ষার্থীর সময় ও ক্ষমতা বিবেচনা করুন।",
      "পরিবর্তনযোগ্য পরিকল্পনা দিন।",
    ],
  },
};

/**
 * Build a complete system prompt with unified requirements.
 * Prepends role definition and appends evidence/citation/safety instructions.
 */
export function buildUnifiedPrompt(
  task: PromptTask,
  basePrompt: string,
  opts?: {
    requirements?: Partial<PromptRequirements>;
    extraContext?: string;
    studentName?: string;
  },
): string {
  const role = ROLES[task];
  const requirements: PromptRequirements = {
    requireCitations: true,
    requireMathVerification: true,
    includeEvidence: true,
    language: "bengali",
    ...opts?.requirements,
  };

  const sections: string[] = [];

  // ── 1. Role definition ──────────────────────────────────

  sections.push(`# আপনার ভূমিকা

${role.primary}

## দক্ষতা:
${role.expertise.map((e) => `- ${e}`).join("\n")}

## সীমাবদ্ধতা:
${role.constraints.map((c) => `- ${c}`).join("\n")}`);

  // ── 2. Student context ───────────────────────────────────

  if (opts?.studentName) {
    sections.push(`## শিক্ষার্থী:
নাম: ${opts.studentName}`);
  }

  // ── 3. Base task prompt ──────────────────────────────────

  sections.push(`# কাজ

${basePrompt}`);

  // ── 4. Evidence requirements ─────────────────────────────

  if (requirements.includeEvidence) {
    sections.push(`# প্রমাণ ও উৎস

## নিয়ম:
1. প্রতিটি উত্তরের জন্য সূত্র উল্লেখ করুন।
2. প্রশ্ন ব্যাংক থেকে উত্তর দিলে প্রশ্ন ID উল্লেখ করুন।
3. ওয়েব সূত্র থেকে উত্তর দিলে URL উল্লেখ করুন।
4. AI জ্ঞান থেকে উত্তর দিলে স্বীকার করুন যে এটি যাচাইকৃত নয়।

## সূত্র ফরম্যাট:
[সূত্রের ধরন] [সূত্র বিবরণ] — [সূত্রের আইডি/URL]`);
  }

  // ── 5. Math verification instructions ────────────────────

  if (requirements.requireMathVerification) {
    sections.push(`# গণিত যাচাই

## নিয়ম:
1. গণিতের প্রতিটি ধাপ সুস্পষ্টভাবে লিখুন।
2. চূড়ান্ত উত্তর আলাদাভাবে উল্লেখ করুন।
3. উত্তর = [সংখ্যা] ফরম্যাটে লিখুন।
4. একক অনুমোদিত করুন (যেমন: টাকা, শতাংশ, ডিগ্রি)।`);
  }

  // ── 6. Safety boundaries ─────────────────────────────────

  sections.push(`# নিরাপত্তা সীমানা

## অনুমতি:
- শুধুমাত্র শিক্ষামূলক তথ্য প্রদান।
- বাংলাদেশের চাকরির পরীক্ষা সম্পর্কিত প্রশ্নের উত্তর।

## নিষিদ্ধ:
- রাজনৈতিক মতামত।
- ধর্মীয় বিতর্ক।
- ব্যক্তিগত তথ্য।
- অন্য দেশের চাকরি/পরীক্ষা।
- মাদ্যাগ বা অবৈধ কার্যকলাপ।

## নিরাপত্তা:
- প্রশ্নের উত্তর দিন, প্রশ্ন করবেন না।
- অস্পষ্ট প্রশ্নে আরও তথ্য চান।
- বিশেষজ্ঞের প্রয়োজন হলে পাঠান।`);

  // ── 7. Language instruction ──────────────────────────────

  if (requirements.language === "bengali") {
    sections.push(`# ভাষা

উত্তর বাংলায় দিন। প্রয়োজনে ইংরেজি শব্দ ব্যবহার করতে পারেন।`);
  } else if (requirements.language === "english") {
    sections.push(`# ভাষা

Respond in English.`);
  }

  // ── 8. Extra context ────────────────────────────────────

  if (opts?.extraContext) {
    sections.push(`# অতিরিক্ত তথ্য

${opts.extraContext}`);
  }

  return sections.join("\n\n");
}
