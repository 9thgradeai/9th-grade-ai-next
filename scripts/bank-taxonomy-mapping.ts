/**
 * scripts/bank-taxonomy-mapping.ts
 * ----------------------------------------------------------------------------
 * Maps every live Bank (Bangladesh Bank) MCQ onto a node of the revised Bank
 * taxonomy:
 *
 *   database/data/Bank/Taxonomy/Bank_Grade9_Question_Bank_Detailed.txt
 *     → database/data/bb-taxonomy.json
 *
 * Revision 2026-10-22 (source: database/data/Bank/Taxonomy/Updated/Taxonomy.txt):
 *   • the Bangla subject root became `01_Bangla_Language_and_Literature`
 *     (was `০১_বাংলা_ভাষা_ও_সাহিত্য`) — then, with the exact-canonical
 *     taxonomy (2026-10-23), both ecosystems converged on the BCS-canonical
 *     `01_বাংলা_ভাষা_ও_সাহিত্য` (ADR-070);
 *   • the flat `ভাষা/` grammar leaves were regrouped into
 *     শব্দতত্ত্ব · ধ্বনিতত্ত্ব · বাক্যতত্ত্ব · অর্থতত্ত্ব_ও_শব্দভাণ্ডার · অন্যান্য_আলোচ্য_বিষয়.
 *
 * Rules:
 *   • A question is NEVER dropped. Every question keeps its row (and therefore
 *     its bookmarks / attempts / progress) and is re-pointed at a taxonomy node.
 *   • Preferred target = a taxonomy LEAF. When a legacy topic has no leaf
 *     counterpart, the questions land on the closest taxonomy GROUP node
 *     (still a taxonomy node, still selectable in the Practice picker).
 *   • Paths are absolute, subject-root-first, exactly like `Topic.path` /
 *     `Question.path` (see scripts/taxonomy.ts `contentPath`).
 * ----------------------------------------------------------------------------
 */

// ── Subject roots (must match database/data/bb-taxonomy.json) ──────────────
export const BB_BANGLA_ROOT = "01_বাংলা_ভাষা_ও_সাহিত্য";
export const BB_ENGLISH_ROOT = "02_English_Language_and_Literature";
export const BB_MATH_ROOT = "03_Mathematics";
export const BB_ANALYTICAL_ROOT = "04_Analytical_Skills";
export const BB_ICT_ROOT = "05_ICT";
export const BB_FINANCIAL_ROOT = "06_Financial_Knowledge";

/** Legacy Bangla subject root (pre-2026-10-22 revision, Bengali digits). */
export const BB_BANGLA_ROOT_LEGACY = "০১_বাংলা_ভাষা_ও_সাহিত্য";
/** Superseded Bangla subject root (ADR-068 revision, latin) — still accepted
 * as INPUT so rows written by an ADR-068-era importer keep mapping; outputs
 * always carry BB_BANGLA_ROOT. */
export const BB_BANGLA_ROOT_LATIN = "01_Bangla_Language_and_Literature";

/** Every Bangla root spelling a live or historical Question.path may carry. */
const BANGLA_ROOTS = new Set<string>([BB_BANGLA_ROOT, BB_BANGLA_ROOT_LEGACY, BB_BANGLA_ROOT_LATIN]);

// ── English leaves ─────────────────────────────────────────────────────────
export const ENG_NOUN = "Noun_Pronoun_Determiner_Gender_Number";
export const ENG_VERB = "Verb_Transitive_Intransitive_Non-finite_Gerund_Participle";
export const ENG_PHRASAL = "Phrasal_Verb";
export const ENG_ADJ_ADV = "Adjective_and_Adverb";
export const ENG_PREP = "Preposition";
export const ENG_SVA = "Subject-Verb_Agreement";
export const ENG_TENSE = "Tense_and_Structure_Errors";
export const ENG_PARALLELISM = "Parallelism_and_Modifiers";
export const ENG_ACTIVE = "Active_and_Passive_Voice";
export const ENG_NARRATION = "Direct_and_Indirect_Narration";
export const ENG_SYNONYM = "Synonyms_and_Antonyms";
export const ENG_SPELLING = "Spellings";
export const ENG_ONE_WORD = "One-Word_Substitutions";

// ── Bangla: legacy flat `ভাষা` leaf → revised grouped leaf ────────────────
// Relative to `<root>/ভাষা`. Legacy leaves that the revised taxonomy dropped
// (বাগধারা, বর্ণ, বানান_ও_বাক্য_শুদ্ধি …) are folded into their semantic twin.
export const BANGLA_LANGUAGE_LEAF_MAP: Record<string, string> = {
  পদ: "শব্দতত্ত্ব/পদ_ও_পদ_পরিবর্তন",
  কারক: "শব্দতত্ত্ব/কারক_ও_বিভক্তি",
  সমাস: "শব্দতত্ত্ব/সমাস",
  প্রত্যয়: "শব্দতত্ত্ব/প্রকৃতি_ও_প্রত্যয়",
  উপসর্গ: "শব্দতত্ত্ব/উপসর্গ_ও_অনুসর্গ",
  সন্ধি: "ধ্বনিতত্ত্ব/সন্ধি_বা_ধ্বনিসংযোগ",
  বর্ণ: "ধ্বনিতত্ত্ব/ধ্বনির_প্রতীক_বা_বর্ণের_বিন্যাস",
  বানান_ও_বাক্য_শুদ্ধি: "ধ্বনিতত্ত্ব/ধ্বনির_প্রতীক_বা_বর্ণের_বিন্যাস",
  বাক্য: "বাক্যতত্ত্ব/বাক্য_ও_বাক্যবিন্যাস",
  বাচ্য: "বাক্যতত্ত্ব/বাচ্য",
  সমার্থক_শব্দ: "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/সমার্থক_শব্দ",
  বিপরীতার্থক_শব্দ: "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/বিপরীতার্থক_শব্দ",
  বাগধারা: "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/বাগধারা_ও_প্রবাদ_প্রবচন",
  "প্রয়োগ-অপপ্রয়োগ": "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/প্রয়োগ-অপপ্রয়োগ",
  পরিভাষা: "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/পরিভাষা",
};

/** Revised taxonomy node for the legacy `ভাষা/বাক্য` leaf, per subtopic. */
export function banglaBakyapath(subtopic: string): string {
  if (subtopic.includes("বাচ্য")) return "বাক্যতত্ত্ব/বাচ্য";
  if (subtopic.includes("এক কথায় প্রকাশ") || subtopic.includes("এককথায়"))
    return "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/এককথায়_প্রকাশ";
  return "বাক্যতত্ত্ব/বাক্য_ও_বাক্যবিন্যাস";
}

// ── Math: legacy leaf → revised taxonomy node ────────────────────────────
export const MATH_LEAF_MAP: Record<string, string> = {
  // Part_01 (Arithmetic)
  "Part_01_Arithmetic/Age_Problems": "Part_01_Arithmetic/Ratios_Proportions_and_Mixtures",
  "Part_01_Arithmetic/Averages_and_Weighted_Average":
    "Part_05_Statistics_and_Probability/Statistics_Mean_Median_Mode",
  "Part_01_Arithmetic/Comprehensive_Arithmetic": "Part_01_Arithmetic",
  "Part_01_Arithmetic/Fractions_Decimals_and_Proportional_Comparisons":
    "Part_01_Arithmetic/Real_Numbers",
  "Part_01_Arithmetic/Income_Expenditure_and_Savings":
    "Part_01_Arithmetic/Ratios_Proportions_and_Mixtures",
  "Part_01_Arithmetic/Number_System_and_Number_Theory": "Part_01_Arithmetic/Real_Numbers",
  // Legacy spelling used by the Math importer ("Teory").
  "Part_01_Arithmetic/Number_System_and_Number_Teory": "Part_01_Arithmetic/Real_Numbers",
  // Part_02 (Algebra)
  "Part_02_Algebra/Algebraic_Fractions_and_Rational_Expressions":
    "Part_02_Algebra/Equations_and_Inequalities",
  "Part_02_Algebra/Comprehensive_Algebra": "Part_02_Algebra",
  "Part_02_Algebra/Functions_Substitution_and_Graph_Concepts":
    "Part_02_Algebra/Equations_and_Inequalities",
  "Part_02_Algebra/Matrices_and_Determinants": "Part_02_Algebra/Equations_and_Inequalities",
  // Part_03 (Sequences and Series)
  "Part_03_Sequences_and_Series/Mixed_Sequences_and_Series": "Part_03_Sequences_and_Series",
  // Part_04 (Geometry and Mensuration)
  "Part_04_Geometry_and_Mensuration/Comprehensive_Geometry_and_Mensuration":
    "Part_04_Geometry_and_Mensuration",
  "Part_04_Geometry_and_Mensuration/Coordinate_Geometry":
    "Part_04_Geometry_and_Mensuration/Lines_Angles_Triangles_Quadrilaterals_Circles",
  "Part_04_Geometry_and_Mensuration/Trigonometry_and_Height_Distance":
    "Part_04_Geometry_and_Mensuration/Lines_Angles_Triangles_Quadrilaterals_Circles",
  // Part_05 (Statistics and Probability)
  "Part_05_Statistics_and_Probability/Data_Interpretation_and_Analysis":
    "Part_05_Statistics_and_Probability/Statistics_Mean_Median_Mode",
  "Part_05_Statistics_and_Probability/Probability_and_Counting_Mixed_Practice":
    "Part_05_Statistics_and_Probability",
  // Part_06 (Time, Work and Speed) — dropped by the revised taxonomy.
  "Part_06_Time_Work_and_Speed/Mixed_Time_Work_and_Speed": "Part_01_Arithmetic",
  "Part_06_Time_Work_and_Speed/Speed_Distance_and_Time":
    "Part_01_Arithmetic/Ratios_Proportions_and_Mixtures",
  "Part_06_Time_Work_and_Speed/Time_and_Work":
    "Part_01_Arithmetic/Ratios_Proportions_and_Mixtures",
};

// ── ICT: legacy leaf → revised taxonomy node ──────────────────────────────
export const ICT_LEAF_MAP: Record<string, string> = {
  "05_Emerging_Tech_and_Number_Systems/Digital_Bangladesh_Ecommerce_Egovernance_Law":
    "04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing",
  "06_Database_and_Information_Systems/Database_Fundamentals_DBMS_RDBMS_Keys":
    "04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing",
  "06_Database_and_Information_Systems/Information_Systems_Warehousing_Mining":
    "04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing",
  "06_Database_and_Information_Systems/SQL_and_Query_Concepts":
    "04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing",
};

// ── English: redistribution of questions parked on GROUP nodes ───────────
//
// `PART-I_Language/Parts_of_Speech`, `…/Words_Vocabulary` and
// `…/Corrections_and_Agreement` are GROUP nodes in the revised taxonomy.
// Their questions are re-distributed over the leaves below them.

/** Explicit overrides for the parts-of-speech set (matched on a substring).
 *  Values are paths relative to `PART-I_Language`. */
const POS_OVERRIDES: Array<[string, string]> = [
  ["part of speech of the word “fast”", `Parts_of_Speech/${ENG_ADJ_ADV}`],
  ["part of speech of “fast”", `Parts_of_Speech/${ENG_ADJ_ADV}`],
  ["part of speech of the underlined word", `Parts_of_Speech/${ENG_PREP}`],
  ["the word “after” is a", `Parts_of_Speech/${ENG_PREP}`],
  ["“across” is a", `Parts_of_Speech/${ENG_PREP}`],
  ["“because of” is a", `Parts_of_Speech/${ENG_PREP}`],
  ["the word “my” is a", `Parts_of_Speech/${ENG_NOUN}`],
  ["“Neither” functions as a", `Parts_of_Speech/${ENG_NOUN}`],
  ["“What” is a", `Parts_of_Speech/${ENG_NOUN}`],
  ["“the rich” refers to", `Parts_of_Speech/${ENG_NOUN}`],
  ["the word “English” is a", `Parts_of_Speech/${ENG_NOUN}`],
  ["the word “hard” is a", `Parts_of_Speech/${ENG_ADJ_ADV}`],
  ["the word “that” introduces a", `Parts_of_Speech/${ENG_NOUN}`],
  ["“its” is a", `Parts_of_Speech/${ENG_NOUN}`],
  ["“Walking along the road” is a", `Parts_of_Speech/${ENG_VERB}`],
  ["“too” is an", `Parts_of_Speech/${ENG_ADJ_ADV}`],
  ["“better” is a", `Parts_of_Speech/${ENG_ADJ_ADV}`],
  ["the word “little” is a", `Parts_of_Speech/${ENG_NOUN}`],
  ["“early” is a", `Parts_of_Speech/${ENG_ADJ_ADV}`],
  ["“Having finished” is a", `Parts_of_Speech/${ENG_VERB}`],
  ["“rewrite” is a", `Parts_of_Speech/${ENG_VERB}`],
  ["“neither … nor” form a", `Parts_of_Speech/${ENG_NOUN}`],
  ["“lying on the table” functions as a", `Parts_of_Speech/${ENG_VERB}`],
  ["the word “one” is a", `Parts_of_Speech/${ENG_NOUN}`],
  ["having completed the assignment", `Parts_of_Speech/${ENG_VERB}`],
  ["function of “that”", `Parts_of_Speech/${ENG_NOUN}`],
  ["reported question", `Sentences_and_Transformations/${ENG_NARRATION}`],
  ["adverbial clause of time", `Corrections_and_Agreement/${ENG_TENSE}`],
];

/** Ordered regex rules for the parts-of-speech set. */
const POS_RULES: Array<[RegExp, string]> = [
  [/phrasal/i, `Parts_of_Speech/${ENG_PHRASAL}`],
  [/preposition/i, `Parts_of_Speech/${ENG_PREP}`],
  [/\btense\b|present perfect|past perfect|sequence of tenses/i, `Corrections_and_Agreement/${ENG_TENSE}`],
  [/noun formed|noun form|form of/i, `Parts_of_Speech/${ENG_NOUN}`],
  [/adverb/i, `Parts_of_Speech/${ENG_ADJ_ADV}`],
  [/adjective/i, `Parts_of_Speech/${ENG_ADJ_ADV}`],
  [/gerund|participle|infinitive|non-finite/i, `Parts_of_Speech/${ENG_VERB}`],
  [/\bverb\b|modal/i, `Parts_of_Speech/${ENG_VERB}`],
  [/noun|pronoun|determiner|article/i, `Parts_of_Speech/${ENG_NOUN}`],
  [/conjunction|interjection|clause/i, `Parts_of_Speech/${ENG_NOUN}`],
];


/**
 * Classify a parts-of-speech question onto its revised taxonomy node.
 * The result is a path relative to `PART-I_Language` — a few of the mixed
 * parts-of-speech items are really tense / narration questions and belong to
 * their own leaves.
 */
export function classifyPartsOfSpeech(question: string): string {
  for (const [needle, leaf] of POS_OVERRIDES) {
    if (question.toLowerCase().includes(needle.toLowerCase())) return leaf;
  }
  for (const [re, leaf] of POS_RULES) {
    if (re.test(question)) return leaf;
  }
  return `Parts_of_Speech/${ENG_NOUN}`;
}

/** Classify a words-and-vocabulary question onto its revised taxonomy leaf. */
export function classifyWordsVocabulary(question: string, subtopic: string): string {
  if (/collocation/i.test(subtopic)) return ENG_ONE_WORD;
  if (/collocations|word partnership/i.test(question)) return ENG_ONE_WORD;
  if (/one-word|substitution/i.test(question)) return ENG_ONE_WORD;
  if (/spelling|misspell/i.test(question)) return ENG_SPELLING;
  return ENG_SYNONYM;
}

/**
 * Subject–verb agreement markers. A sentence containing one of these is very
 * likely testing agreement (the classic "the committee are" family), and is
 * routed to the `Subject-Verb_Agreement` leaf; everything else is a
 * structure/tense error and goes to `Tense_and_Structure_Errors`.
 */
const SVA_MARKERS: RegExp[] = [
  /\bneither\b[^"]{0,80}\b(was|were|is|are|has|have)\b/i,
  /\beither\b[^"]{0,80}\b(was|were|is|are)\b/i,
  /\bthe (committee|jury|team|board|staff|management|auditors|traders|panel|council|group|bank|company|government|police|authority|directors|officers|clerk[s]?|employees|graduates|tellers|economists|analysts)\b[^"]{0,60}\b(are|were|have|has)\b/i,
  /\b(committee|jury|team|board|staff|management|panel|council|group|data|statistics|economics|physics|mathematics|optics|media|news|physics|people|men|women|children|police|staff|clerk[s]?|employees|graduates|tellers)\b[^"]{0,40}\b(are|were|have)\b/i,
  /\b(each|every|neither|either)\b[^"]{0,70}\b(are|were|have)\b/i,
  /\bthe number of\b[^"]{0,60}\b(have|are)\b/i,
  /\ba number of\b[^"]{0,60}\b(are|were)\b/i,
  /\b(many a|more than one|a pair of|two-thirds|three-fourths|half of|a flock of|a series of|a large number of|a great many|a number of)\b[^"]{0,60}\b(are|were|have|has)\b/i,
  /\b(is|are|was|were) (one of|each of)\b/i,
  /\b(it is|i am|he is|she is) (i|we|they|he|she)\b/i,
  /\bthat (is|are|was|were)\b[^"]{0,40}\b(who|which)\b/i,
  /\b(one of the (many|few|several|three|officers|managers|bankers|branches|books|points|problems|companies|directors|graduates|analysts|applicants|candidates|members))\b[^"]{0,60}\b(has|have)\b/i,
  /\b(ten years|two hundred|fifty million|bread and butter|ten thousand|many people|a number)\b[^"]{0,40}\b(are|were)\b/i,
  /\b(not a single|none of)\b[^"]{0,60}\b(are|were|have)\b/i,
  /\bdata\b[^"]{0,30}\b(indicates|shows|reveals|reflects|shows)\b/i,
  /\b(indicates|suggests|shows|reflects|reveals)\b[^"]{0,40}\b(the data|the survey|information|statistics)\b/i,
  /\b(are|were|have)\b[^"]{0,30}\b(the data|these data)\b/i,
  /\bno sooner\b/i,
  /\bscarcely\b/i,
  /\bhardly\b/i,
];

/** Classify an error-detection question onto its revised taxonomy leaf. */
export function classifyCorrections(question: string): string {
  for (const re of SVA_MARKERS) {
    if (re.test(question)) return ENG_SVA;
  }
  return ENG_TENSE;
}

/**
 * Legacy English paths whose leaf lives under a different parent in the
 * revised taxonomy (a tense / narration question that used to sit under
 * `Parts_of_Speech`).
 */
export const ENGLISH_LEAF_REPATH: Record<string, string> = {
  "PART-I_Language/Parts_of_Speech/Tense_and_Structure_Errors":
    "PART-I_Language/Corrections_and_Agreement/Tense_and_Structure_Errors",
  "PART-I_Language/Parts_of_Speech/Direct_and_Indirect_Narration":
    "PART-I_Language/Sentences_and_Transformations/Direct_and_Indirect_Narration",
};

/**
 * Full path mapping for one Bank question.
 * Returns the new absolute path, or `null` when the question is already on a
 * valid taxonomy path and needs no move.
 */
export function mapBankQuestionPath(args: {
  path: string;
  subtopic: string;
  question: string;
}): string | null {
  const { path, subtopic, question } = args;
  if (!path) return null;

  const segs = path.split("/");
  const root = segs[0];

  if (BANGLA_ROOTS.has(root)) {
    const rest = segs.slice(1);
    if (rest[0] === "সাহিত্য") {
      // The revised taxonomy has no leaf for the literary-history sets
      // (কথা-সাহিত্য / গদ্যের উৎপত্তি / নাটক) — they fold onto the
      // আধুনিক যুগ group node.
      const folded = BANGLA_LITERATURE_FOLD[rest.join("/")];
      return folded ? `${BB_BANGLA_ROOT}/${folded}` : null;
    }
    if (rest[0] !== "ভাষা") return null;
    const leaf = rest[1] ?? "";
    if (leaf === "বাক্য") {
      return `${BB_BANGLA_ROOT}/ভাষা/${banglaBakyapath(subtopic)}`;
    }
    const mapped = BANGLA_LANGUAGE_LEAF_MAP[leaf];
    if (!mapped) return null;
    return `${BB_BANGLA_ROOT}/ভাষা/${mapped}`;
  }

  if (root === BB_ENGLISH_ROOT) {
    const rest = segs.slice(1); // e.g. ["PART-I_Language", "Parts_of_Speech"]
    if (rest[0] !== "PART-I_Language") return null;
    const repathed = ENGLISH_LEAF_REPATH[rest.join("/")];
    if (repathed) return `${BB_ENGLISH_ROOT}/${repathed}`;
    const group = rest[1] ?? "";
    // Only the GROUP nodes are redistributed — their leaves already are
    // taxonomy leaves and must stay where they are.
    if (rest.length === 2 && group === "Parts_of_Speech") {
      return `${BB_ENGLISH_ROOT}/PART-I_Language/${classifyPartsOfSpeech(question)}`;
    }
    if (rest.length === 2 && group === "Words_Vocabulary") {
      return `${BB_ENGLISH_ROOT}/PART-I_Language/Words_Vocabulary/${classifyWordsVocabulary(question, subtopic)}`;
    }
    if (rest.length === 2 && group === "Corrections_and_Agreement") {
      return `${BB_ENGLISH_ROOT}/PART-I_Language/Corrections_and_Agreement/${classifyCorrections(question)}`;
    }
    return null;
  }

  if (root === BB_MATH_ROOT) {
    const key = segs.slice(1).join("/");
    const mapped = MATH_LEAF_MAP[key];
    if (!mapped) return null;
    return `${BB_MATH_ROOT}/${mapped}`;
  }

  if (root === BB_ICT_ROOT) {
    const key = segs.slice(1).join("/");
    const mapped = ICT_LEAF_MAP[key];
    if (!mapped) return null;
    return `${BB_ICT_ROOT}/${mapped}`;
  }

  return null;
}

/** Bangla literature leaves that the revised taxonomy does not keep as leaves. */
export const BANGLA_LITERATURE_FOLD: Record<string, string> = {
  "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা_কথা-সাহিত্য":
    "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান",
  "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা_গদ্যের_উৎপত্তি_ও_বিকাশ":
    "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান",
  "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা_নাটক":
    "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান",
};
