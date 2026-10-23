/**
 * scripts/untopiced-classifier.ts
 * ----------------------------------------------------------------------------
 * Places questions that carry NO taxonomy path (the exam-library rows imported
 * from real BCS / Bank papers) onto a node of the subject's taxonomy, so that
 * every MCQ in the database is reachable from the Practice tab.
 *
 * Strategy
 *   1. Subject-specific keyword rules (leaf paths relative to the subject
 *      root) — used where the taxonomy's leaves are semantic (Bangla grammar,
 *      English, Mathematics, ICT, …). The first matching rule wins.
 *   2. Otherwise the questions are distributed round-robin over the subject's
 *      leaves — the same convention the seeder uses for a subject-level flat
 *      file (scripts/seed-questions.ts). Used where a subject's leaves are
 *      artificial buckets rather than real topics.
 *
 * Nothing is deleted: the migration only fills in `path` / `topicId` /
 * `sourceKey` on rows that have no path yet.
 * ----------------------------------------------------------------------------
 */

export type Rule = { leaf: string; patterns: RegExp[] };
export type SubjectPlan = {
  /** Leaf path relative to the subject root. */
  rules: Rule[];
  /** "round-robin" distributes over the subject's leaves. */
  fallback?: "round-robin";
  /** Semantic catch-all leaf (relative to the subject root). */
  fallbackLeaf?: string;
};

/**
 * Subject re-assignment: the Bank officer-exam import classified rows with a
 * rough keyword heuristic whose fallback was "English", so a lot of Mathematics
 * / ICT / general-knowledge questions ended up in the English subject. These
 * rules move such a row to the subject its CONTENT belongs to.
 */
export type Reassign = { to: string; patterns: RegExp[] };
export const SUBJECT_REASSIGN: Record<string, Reassign[]> = {
  "02_English_Language_and_Literature": [
    {
      to: "03_Mathematics",
      patterns: [
        /unit digit/i, /\bprime\b/i, /equation/i, /value of/i, /algebra/i,
        /\bprobability\b/i, /triangle/i, /\bcircle\b/i, /\bdiameter\b/i,
        /\bpercent(age)?\b/i, /\bremainder\b/i, /\bsimplify\b/i,
        /\$[^$]{1,80}\$/, /\bseries\b/i, /\bpermutation/i,
        /\bmean\b/i, /\bmedian\b/i, /\bmodus\b/i, /\bcombinat/i,
        /\bhow (much|many)\b/i, /\bvalue of\b/i, /\bx\s*=/i,
        /\d\s*%\s*of\b/i, /\bsolve\b/i, /\bhow many times\b/i,
        /\bproduct of\b/i, /\bsum of\b/i, /\bdivided by\b/i,
        /h\.?c\.?f/i, /l\.?c\.?m/i, /\bterabyte\b/i, /\bgb\b/i, /\bmb\b/i,
      ],
    },
    {
      to: "05_ICT",
      patterns: [
        /excel/i, /powerpoint/i, /\bword\b.*(document|processing)/i,
        /operating system/i, /\bsoftware\b/i, /\bhardware\b/i,
        /protocol/i, /ipv\d/i, /\blinux\b/i, /\bwindows\b/i,
        /\bweb\b/i, /database/i, /\bnetwork/i, /\bserver\b/i,
        /\bgui\b/i, /compiler/i, /interpreter/i, /pixel/i, /monitor/i,
        /memory/i, /bandwidth/i, /e-?commerce/i, /website/i, /browser/i,
        /microprocessor/i, /\bkeyboard\b/i, /\bmouse\b/i, /\bprinter\b/i,
        /data structure/i, /programming language/i, /dynamic programming/i,
        /context switch/i, /section break/i, /\bbuffer\b/i, /\bthread/i,
        /\balgorithm/i, /\bsql\b/i, /\bdrop a table\b/i, /version control/i,
        /administrative control/i, /linear sequential/i, /\bport\b/i,
        /\bentity\b/i, /\bcompiler\b/i, /\bprogramming\b/i,
        /logic gate/i, /full adder/i, /binary search/i, /\bloop\b/i,
        /semiconductor/i, /insulation/i, /\bcircuit\b/i, /\bfuse\b/i,
        /\bresistor\b/i, /\btransistor\b/i, /\bmotion effect/i,
        /\bslide\b/i, /\bdeny having sent\b/i,
      ],
    },
    {
      to: "06_Financial_Knowledge",
      patterns: [
        /inflation/i, /interest rate/i, /money supply/i, /monetary/i,
        /foreign exchange/i, /remittance/i, /balance of payment/i, /\bgdp\b/i,
        /central bank/i, /bangladesh bank/i, /credit rating/i,
        /\bshort-run\b/i, /output increases/i, /economic (grouping|model|theory)/i,
        /actuarial/i, /npsb/i, /banking sector/i, /fiscal/i, /\bmoney\b/i,
      ],
    },
    {
      to: "সাধারণ জ্ঞান",
      patterns: [
        /who (is|was|are|were) the (founder|creator|discoverer|inventor|writer)/i,
        /which country/i, /\bcurrency\b/i, /capital of/i,
        /international (day|organization|organisation|environment)/i,
        /time ?zone/i, /\bwiki\b/i, /\bwho invented\b/i, /\bday is observed\b/i,
        /\bcontinent\b/i, /\bplanet\b/i, /\bocean\b/i,
        /is associated with/i, /economic grouping/i, /located in/i,
        /speak in/i, /which living/i, /cytokine/i, /antiviral/i,
        /vaccine/i, /\bartist\b/i, /\bmural\b/i, /\btea plantation\b/i,
        /\bcolour\b/i, /\bcolor\b/i, /\bworst\b/i, /\bbest\b/i,
        /in which district/i, /which district/i,
      ],
    },
  ],
};

// ── Bangla grammar (shared: the BCS and Bank trees use the same leaf names) ──
const BANLA_GRAMMAR: Rule[] = [
  { leaf: "ভাষা/ধ্বনিতত্ত্ব/সন্ধি_বা_ধ্বনিসংযোগ", patterns: [/সন্ধি/] },
  { leaf: "ভাষা/ধ্বনিতত্ত্ব/ধ্বনির_প্রতীক_বা_বর্ণের_বিন্যাস", patterns: [/বর্ণ/, /উচ্চারণ/, /ণ-ত্ব/, /ষ-ত্ব/, /বানান/] },
  { leaf: "ভাষা/শব্দতত্ত্ব/প্রকৃতি_ও_প্রত্যয়", patterns: [/প্রত্যয়/, /ধাতু/] },
  { leaf: "ভাষা/শব্দতত্ত্ব/সমাস", patterns: [/সমাস/] },
  { leaf: "ভাষা/শব্দতত্ত্ব/পদ_ও_পদ_পরিবর্তন", patterns: [/পদবি/, /পদের/, /পদ\s/] },
  { leaf: "ভাষা/শব্দতত্ত্ব/কারক_ও_বিভক্তি", patterns: [/কারক/, /বিভক্তি/] },
  { leaf: "ভাষা/শব্দতত্ত্ব/উপসর্গ_ও_অনুসর্গ", patterns: [/উপসর্গ/] },
  { leaf: "ভাষা/শব্দতত্ত্ব/বচন_ও_লিঙ্গ", patterns: [/বচন/, /লিঙ্গ/] },
  { leaf: "ভাষা/শব্দত্ত্ব/শব্দরূপ_ও_শব্দদ্বৈত", patterns: [/শব্দরূপ/, /শব্দের রূপ/] },
  { leaf: "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/সমার্থক_শব্দ", patterns: [/সমার্থক/, /সমার্থ/] },
  { leaf: "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/বিপরীতার্থক_শব্দ", patterns: [/বিপরীতার্থক/, /বিপরীত/] },
  { leaf: "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/প্রয়োগ-অপপ্রয়োগ", patterns: [/অপপ্রয়োগ/] },
  { leaf: "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/পরিভাষা", patterns: [/পরিভাষা/] },
  { leaf: "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/এককথায়_প্রকাশ", patterns: [/এক কথায়/, /এককথায়/] },
  { leaf: "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/বাগধারা_ও_প্রবাদ_প্রবচন", patterns: [/বাগধারা/, /প্রবাদ/] },
  { leaf: "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/অর্থের_প্রকারভেদ_মুখ্যার্থ_ও_গৌণার্থ", patterns: [/মুখ্যার্থ/, /গৌণার্থ/] },
  { leaf: "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/শব্দের_অর্থবিচার_ও_বাক্যের_অর্থবিচার", patterns: [/অর্থবিচার/] },
  { leaf: "ভাষা/বাক্যতত্ত্ব/বাচ্য", patterns: [/বাচ্য/] },
  { leaf: "ভাষা/বাক্যতত্ত্ব/ছেদচিহ্ন_বা_বিরামচিহ্ন", patterns: [/ছেদচিহ্ন/, /বিরামচিহ্ন/] },
  { leaf: "ভাষা/বাক্যতত্ত্ব/পদবিন্যাস", patterns: [/পদবিন্যাস/] },
  { leaf: "ভাষা/বাক্যতত্ত্ব/বাক্য_ও_বাক্যবিন্যাস", patterns: [/বাক্য/, /প্রয়োগ/] },
  { leaf: "ভাষা/অন্যান্য_আলোচ্য_বিষয়/ছন্দ_ও_অলংকার", patterns: [/ছন্দ/, /অলংকার/] },
  { leaf: "ভাষা/অন্যান্য_আলোচ্য_বিষয়/অভিধান", patterns: [/অভিধান/] },
  // Catch-all: a word-meaning question (the largest group of exam rows).
  { leaf: "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/শব্দের_অর্থবিচার_ও_বাক্যের_অর্থবিচার", patterns: [/অর্থ/, /বোঝায়/, /ব্যাখ্যা/, /তাৎপর্য/] },
];

/** Bangla literature — the two trees spell the era branches differently. */
const BANLA_LITERATURE_BCS: Rule[] = [
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/Tier_01_মাস্টার_হট_স্পট/01_রবীন্দ্রনাথ_ঠাকুর", patterns: [/রবীন্দ্র/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/Tier_01_মাস্টার_হট_স্পট/02_কাজী_নজরুল_ইসলাম", patterns: [/নজরুল/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/Tier_02_ভেরি_হাই_ইল্ড/03_জসীমউদ্দীন", patterns: [/জসীমউদ্দীন/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/Tier_02_ভেরি_হাই_ইল্ড/04_বঙ্কিমচন্দ্র_চট্টোপাধ্যায়", patterns: [/বঙ্কিম/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/Tier_02_ভেরি_হাই_ইল্ড/05_মাইকেল_মধুসূদন_দত্ত", patterns: [/মধুসূদন/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/Tier_02_ভেরি_হাই_ইল্ড/06_শরৎচন্দ্র_চট্টোপাধ্যায়", patterns: [/শরৎচন্দ্র/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/Tier_02_ভেরি_হাই_ইল্ড/07_মীর_মশাররফ_হোসেন", patterns: [/মশাররফ/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/Tier_02_ভেরি_হাই_ইল্ড/08_জীবনানন্দ_দাস", patterns: [/জীবনানন্দ/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/Tier_03_ফোকাসড_লেখক/12_বেগম_রোকেয়া_সাখাওয়াত_হোসেন", patterns: [/বেগম রোকেয়া/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/Tier_03_ফোকাসড_লেখক/13_ঈশ্বরচন্দ্র_বিদ্যাসাগর", patterns: [/ঈশ্বরচন্দ্র/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা_কথা-সাহিত্য", patterns: [/উপন্যাস/, /গল্প/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা_নাটক", patterns: [/নাটক/] },
  { leaf: "সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা_গদ্যের_উৎপত্তি_ও_বিকাশ", patterns: [/গদ্য/] },
  { leaf: "সাহিত্য/প্রাচীন_যুগ/চর্যাপদ/আবিষ্কার_ও_ইতিহাস", patterns: [/চর্যাপদ/] },
  { leaf: "সাহিত্য/মধ্যযুগ/পুথি_সাহিত্য_ও_লোকসাহিত্য", patterns: [/লোকসাহিত্য/, /পুথি/] },
  { leaf: "সাহিত্য/মধ্যযুগ/শাক্ত_পদাবলী", patterns: [/শাক্ত/] },
  { leaf: "সাহিত্য/মধ্যযুগ/বৈষ্ণব_পদাবলী", patterns: [/বৈষ্ণব/] },
  { leaf: "সাহিত্য/মধ্যযুগ/রোমান্টিক_প্রণয়োপাখ্যান", patterns: [/রোমান্টিক/] },
  { leaf: "সাহিত্য/মধ্যযুগ/অনুবাদ_সাহিত্য", patterns: [/অনুবাদ/, /রামায়ণী/, /মহাভারত/] },
  { leaf: "সাহিত্য/মধ্যযুগ/অন্ধকার_যুগ_১২০০_১৩৫০", patterns: [/অন্ধকার/] },
  { leaf: "সাহিত্য/মধ্যযুগ/মঙ্গলকাব্যের_ধারা", patterns: [/মঙ্গলকাব্য/, /মনসামঙ্গল/, /চণ্ডী/] },
  { leaf: "সাহিত্য/মধ্যযুগ/মীর_সৈয়দ_সুলতান_ও_নাথ_সাহিত্য", patterns: [/মীর সৈয়দ/] },
  { leaf: "সাহিত্য/মধ্যযুগ/শ্রীকৃষ্ণকীর্তন_ও_বড়ু_চণ্ডীদাস", patterns: [/শ্রীকৃষ্ণকীর্তন/] },
];

const BANLA_LITERATURE_BANK: Rule[] = BANLA_LITERATURE_BCS.map((r) => ({
  ...r,
  leaf: r.leaf
    .replace("সাহিত্য/প্রাচীন_যুগ/", "সাহিত্য/প্রাচীন_ও_মধ্যযুগ_সংক্ষিপ্ত/")
    .replace("সাহিত্য/মধ্যযুগ/", "সাহিত্য/প্রাচীন_ও_মধ্যযুগ_সংক্ষিপ্ত/"),
}));

// ── English ────────────────────────────────────────────────────────────────
const ENGLISH_BCS: Rule[] = [
  { leaf: "PART-II_Literature/Quotations_from_Drama_and_Poetry", patterns: [/quotation/i, /shakespeare/i, /poem/i, /drama/i] },
  { leaf: "PART-II_Literature/Elizabethan_to_21st_Century_Writers", patterns: [/moby dick/i, /novel/i, /novelist/i, /writer/i, /author/i, /literary/i] },
  { leaf: "PART-I_Language/Words/Spellings", patterns: [/spell/i] },
  { leaf: "PART-I_Language/Words/Antonyms", patterns: [/antonym/i] },
  { leaf: "PART-I_Language/Words/Synonyms", patterns: [/synonym/i] },
  { leaf: "PART-I_Language/Idioms_and_Phrases/Meanings_of_Phrases", patterns: [/idiom/i, /phrase/i] },
  { leaf: "PART-I_Language/Corrections/Subject-Verb_Agreement", patterns: [/subject[- ]verb/i, /agreement/i] },
  { leaf: "PART-I_Language/Corrections/Tense", patterns: [/tense/i] },
  { leaf: "PART-I_Language/Corrections/Preposition", patterns: [/preposition/i] },
  { leaf: "PART-I_Language/Corrections/Verb", patterns: [/verb/i] },
  { leaf: "PART-I_Language/Corrections/Number", patterns: [/number/i] },
  { leaf: "PART-I_Language/Corrections/Gender", patterns: [/gender/i] },
  { leaf: "PART-I_Language/Corrections/Determiner", patterns: [/determiner/i, /article/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Adverb", patterns: [/adverb/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Adjective", patterns: [/adjective/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Pronoun", patterns: [/pronoun/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Noun", patterns: [/noun/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Conjunction", patterns: [/conjunction/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Preposition", patterns: [/preposition/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Verb", patterns: [/verb/i] },
  { leaf: "PART-I_Language/Sentences_and_Transformations/Active_Voice", patterns: [/active voice/i] },
  { leaf: "PART-I_Language/Sentences_and_Transformations/Passive_Voice", patterns: [/passive voice/i] },
  { leaf: "PART-I_Language/Sentences_and_Transformations/Comparative_Degree", patterns: [/comparative/i] },
  { leaf: "PART-I_Language/Sentences_and_Transformations/Superlative_Degree", patterns: [/superlative/i] },
  { leaf: "PART-I_Language/Sentences_and_Transformations/Positive_Degree", patterns: [/positive degree/i] },
  { leaf: "PART-I_Language/Sentences_and_Transformations/Simple_Sentence", patterns: [/simple sentence/i] },
  { leaf: "PART-I_Language/Sentences_and_Transformations/Complex_Sentence", patterns: [/complex sentence/i] },
  { leaf: "PART-I_Language/Sentences_and_Transformations/Compound_Sentence", patterns: [/compound sentence/i] },
  { leaf: "PART-I_Language/Clauses/Subordinate_Clause", patterns: [/clause/i] },
  { leaf: "PART-I_Language/Composition/Paragraphs", patterns: [/paragraph/i] },
  { leaf: "PART-I_Language/Composition/Letters", patterns: [/letter/i] },
  { leaf: "PART-I_Language/Composition/Applications", patterns: [/application/i, /notice/i, /application/i] },
  { leaf: "PART-II_Literature/Quotations_from_Drama_and_Poetry", patterns: [/quotation/i, /shakespeare/i, /poem/i] },
  { leaf: "PART-II_Literature/Elizabethan_to_21st_Century_Writers", patterns: [/moby dick/i, /novel/i, /writer/i, /author/i] },
];

const ENGLISH_BANK: Rule[] = [
  // Literature first — a quote/novel question is not a grammar question.
  { leaf: "PART-II_Literature/Major_Shakespearean_and_Romantic_Quotes", patterns: [/shakespeare/i, /quotation/i, /quoted from/i, /poem/i, /romantic/i, /adversity/i] },
  { leaf: "PART-II_Literature/Literary_Terms_and_Movements", patterns: [/moby dick/i, /novel/i, /novelist/i, /playwright/i, /drama/i, /poetry/i, /literary/i, /literature/i, /movement/i, /centre[sd] on/i] },
  { leaf: "PART-I_Language/Words_Vocabulary/Spellings", patterns: [/spell(ed|ing|s)?/i, /misspell/i] },
  { leaf: "PART-I_Language/Idioms_and_Phrases/Meanings_of_Idioms", patterns: [/idiom/i, /swan-?song/i, /look down (one|your) nose/i, /meaning of the (expression|phrase|idiom)/i] },
  { leaf: "PART-I_Language/Idioms_and_Phrases/Identifying_Phrases", patterns: [/clause/i, /phrase/i] },
  { leaf: "PART-I_Language/Sentences_and_Transformations/Direct_and_Indirect_Narration", patterns: [/narrat/i, /reported (speech|question)/i, /indirect speech/i, /direct speech/i] },
  { leaf: "PART-I_Language/Sentences_and_Transformations/Active_and_Passive_Voice", patterns: [/voice/i, /passive/i, /active/i] },
  { leaf: "PART-I_Language/Sentences_and_Transformations/Degrees_of_Comparison", patterns: [/comparative/i, /superlative/i, /degree of comparison/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Phrasal_Verb", patterns: [/phrasal/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Preposition", patterns: [/preposition/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Adjective_and_Adverb", patterns: [/adverb/i, /adjective/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Noun_Pronoun_Determiner_Gender_Number", patterns: [/noun/i, /pronoun/i, /determiner/i, /article/i, /gender/i, /plural form/i, /possessive/i] },
  { leaf: "PART-I_Language/Parts_of_Speech/Verb_Transitive_Intransitive_Non-finite_Gerund_Participle", patterns: [/verb/i, /gerund/i, /participle/i, /infinitive/i, /modal/i] },
  { leaf: "PART-I_Language/Corrections_and_Agreement/Subject-Verb_Agreement", patterns: [/subject[- ]verb/i, /agreement/i] },
  { leaf: "PART-I_Language/Corrections_and_Agreement/Parallelism_and_Modifiers", patterns: [/parallel/i, /modifier/i] },
  { leaf: "PART-I_Language/Corrections_and_Agreement/Tense_and_Structure_Errors", patterns: [/find the sentence/i, /expresses a negative/i, /tense/i, /error/i, /wrong/i, /identify the (segment|error)/i, /improve/i, /correct sentence/i, /correct form/i, /correct tense/i, /right form/i] },
  { leaf: "PART-I_Language/Words_Vocabulary/Synonyms_and_Antonyms", patterns: [/synonym/i, /antonym/i, /meaning of/i, /means/i, /refers to/i, /same meaning/i, /opposite/i] },
  { leaf: "PART-I_Language/Words_Vocabulary/One-Word_Substitutions", patterns: [/one-word/i, /substitut/i, /appropriate word/i, /collocation/i, /word closest/i, /word choice/i, /choose (the )?(appropriate|correct) (word|option)/i, /complete the sentence/i, /fill in the (blank|gap)/i, /can be (filled|replaced)/i, /suitable word/i] },
];

// ── Mathematics (Bank) ──────────────────────────────────────────────────────
const MATH_BANK: Rule[] = [
  { leaf: "Part_01_Arithmetic/Real_Numbers", patterns: [/prime/i, /divisib/i, /remainder/i, /unit digit/i, /square/i, /cube/i, /root/i, /real number/i, /number system/i, /factorial/i] },
  { leaf: "Part_01_Arithmetic/LCM_and_HCF", patterns: [/lcm/i, /hcf/i, /gcd/i, /factor/i, /multiple/i] },
  { leaf: "Part_01_Arithmetic/Percentages", patterns: [/percent/i, /percentage/i] },
  { leaf: "Part_01_Arithmetic/Simple_and_Compound_Interest", patterns: [/interest/i] },
  { leaf: "Part_01_Arithmetic/Ratios_Proportions_and_Mixtures", patterns: [/ratio/i, /proportion/i, /mixture/i, /alligation/i, /speed/i, /time and work/i, /age/i, /income/i] },
  { leaf: "Part_01_Arithmetic/Profit_Loss_and_Discount", patterns: [/profit/i, /loss/i, /discount/i] },
  { leaf: "Part_02_Algebra/Equations_and_Inequalities", patterns: [/equation/i, /inequalit/i, /quadratic/i, /simultaneous/i, /substitut/i, /function/i, /matrix/i, /determinant/i, /graph/i] },
  { leaf: "Part_02_Algebra/Algebraic_Identities_and_Factorization", patterns: [/identit/i, /factoris/i, /factoriz/i, /simplif/i] },
  { leaf: "Part_02_Algebra/Indices_and_Logarithms", patterns: [/logarithm/i, /index/i, /indices/i, /surd/i] },
  { leaf: "Part_03_Sequences_and_Series/Arithmetic_Progression", patterns: [/arithmetic progression/i, /\bap\b/i] },
  { leaf: "Part_03_Sequences_and_Series/Geometric_Progression", patterns: [/geometric progression/i, /\bgp\b/i] },
  { leaf: "Part_04_Geometry_and_Mensuration/Lines_Angles_Triangles_Quadrilaterals_Circles", patterns: [/angle/i, /triangle/i, /quadrilateral/i, /circle/i, /trigonometr/i, /coordinate/i, /parallel/i] },
  { leaf: "Part_04_Geometry_and_Mensuration/Pythagorean_Theorem", patterns: [/pythagor/i, /right angle/i, /hypotenuse/i] },
  { leaf: "Part_04_Geometry_and_Mensuration/2D_Mensuration_Area_Perimeter", patterns: [/area/i, /perimeter/i, /plane figure/i] },
  { leaf: "Part_04_Geometry_and_Mensuration/3D_Mensuration_Volume_Surface_Area", patterns: [/volume/i, /surface area/i, /cube/i, /cylinder/i, /sphere/i] },
  { leaf: "Part_05_Statistics_and_Probability/Set_Theory_and_Venn_Diagrams", patterns: [/set/i, /venn/i] },
  { leaf: "Part_05_Statistics_and_Probability/Permutations_and_Combinations", patterns: [/permutation/i, /combination/i, /arrangement/i, /counting principle/i] },
  { leaf: "Part_05_Statistics_and_Probability/Statistics_Mean_Median_Mode", patterns: [/mean/i, /median/i, /mode/i, /average/i, /data interpretation/i, /standard deviation/i] },
  { leaf: "Part_05_Statistics_and_Probability/Probability", patterns: [/probabilit/i, /dice/i, /coin/i, /card/i] },
];

// ── ICT (Bank) ─────────────────────────────────────────────────────────────
const ICT_BANK: Rule[] = [
  { leaf: "01_Computer_Hardware_and_Architecture/CPU_ALU_Registers_Memory_Hierarchy_RAM_CMOS", patterns: [/cpu/i, /alu/i, /register/i, /motherboard/i, /ram/i, /rom/i, /cmos/i, /memory/i, /microprocessor/i, /generation/i] },
  { leaf: "01_Computer_Hardware_and_Architecture/Peripherals_Keyboards_Scanners_OCR", patterns: [/keyboard/i, /mouse/i, /monitor/i, /scanner/i, /printer/i, /peripheral/i, /ocr/i, /output device/i, /input device/i, /display/i] },
  { leaf: "01_Computer_Hardware_and_Architecture/Storage_Devices_HDD_SSD_Optical", patterns: [/hard disk/i, /\bharddisk/i, /\bssd\b/i, /optical/i, /\bcd\b/i, /pen drive/i, /memory card/i, /storage/i, /cache/i, /secondary memory/i] },
  { leaf: "02_Software_and_OS/Operating_Systems_Windows_Linux_MacOS", patterns: [/operating system/i, /\bos\b/i, /windows/i, /linux/i, /macos/i, /kernel/i, /shell/i, /boot/i, /process/i, /file system/i] },
  { leaf: "02_Software_and_OS/System_vs_Application_Software", patterns: [/system software/i, /application software/i, /compiler/i, /interpreter/i, /assembler/i, /translat/i, /licens/i, /open source/i, /proprietary/i] },
  { leaf: "02_Software_and_OS/Utility_Software_Antivirus_Compression", patterns: [/antivirus/i, /compress/i, /utility/i, /firewall/i, /backup/i] },
  { leaf: "03_MS_Office_Suite/MS_Word_Shortcuts_Formatting_Mail_Merge", patterns: [/word/i, /mail merge/i, /docx?/i] },
  { leaf: "03_MS_Office_Suite/MS_Excel_Formulas_Cell_Addressing_Functions", patterns: [/excel/i, /spreadsheet/i, /formula/i, /worksheet/i] },
  { leaf: "03_MS_Office_Suite/MS_PowerPoint_Transitions_Animations_Views", patterns: [/powerpoint/i, /slide/i, /presentation/i] },
  { leaf: "04_Networking_and_Web/Network_Topologies_LAN_WAN_Wi-Fi_WiMAX", patterns: [/topolog/i, /\blan\b/i, /\bwan\b/i, /wi-?fi/i, /wimax/i, /router/i, /switch/i, /hub/i, /modem/i, /repeater/i, /network/i, /intranet/i, /extranet/i] },
  { leaf: "04_Networking_and_Web/Protocols_SMTP_POP3_FTP_TCP_IP", patterns: [/protocol/i, /smtp/i, /pop3/i, /ftp/i, /\btcp\b/i, /\bip\b/i, /dns/i, /dhcp/i, /http/i, /url/i, /mac address/i] },
  { leaf: "04_Networking_and_Web/World_Wide_Web_and_Cloud_Computing", patterns: [/world wide web/i, /\bwww\b/i, /website/i, /web page/i, /browser/i, /search engine/i, /cloud/i, /saas/i, /iaas/i, /paas/i, /bandwidth/i, /database/i, /\bsql\b/i, /dbms/i, /data warehouse/i, /data mining/i, /e-?commerce/i, /e-?governance/i, /digital bangladesh/i, /host name/i] },
  { leaf: "04_Networking_and_Web/Internet_Security_Firewalls_Dark_Web", patterns: [/security/i, /malware/i, /virus/i, /worm/i, /trojan/i, /spyware/i, /ransomware/i, /encrypt/i, /decrypt/i, /firewall/i, /cyber/i, /dark web/i, /hacker/i, /phishing/i, /antivirus/i] },
  { leaf: "05_Emerging_Tech_and_Number_Systems/Binary_Decimal_Hexadecimal_Conversions", patterns: [/binary/i, /decimal/i, /hexadecimal/i, /octal/i, /base ?2|8|16/i, /boolean/i, /logic gate/i, /encoding/i, /bit/i, /byte/i, /compression/i] },
  { leaf: "05_Emerging_Tech_and_Number_Systems/Artificial_Intelligence_Chatbots_Prolog", patterns: [/artificial intelligence/i, /\bai\b/i, /machine learning/i, /chatbot/i, /prolog/i, /robot/i, /iot\b/i, /blockchain/i, /big data/i, /digital signature/i, /emerging technolog/i] },
];

// ── Financial Knowledge (Bank) ──────────────────────────────────────────────
const FINANCIAL_BANK: Rule[] = [
  { leaf: "01_Bangladesh_Bank_Framework/Core_Functions_and_Monetary_Policy", patterns: [/monetary policy/i, /central bank/i, /bangladesh bank/i, /repo rate/i, /inflation/i, /money supply/i] },
  { leaf: "01_Bangladesh_Bank_Framework/Banking_Regulations_and_Paid-up_Capital_Guidelines", patterns: [/paid-?up capital/i, /regulat/i, /licen[cs]e/i, /guideline/i, /basel/i] },
  { leaf: "01_Bangladesh_Bank_Framework/Financial_Inclusion_and_Digital_Banking", patterns: [/financial inclusion/i, /digital bank/i, /mobile bank/i, /microfinance/i, /agent bank/i] },
  { leaf: "02_Payment_and_Settlement_Systems/RTGS_Real_Time_Gross_Settlement", patterns: [/rtgs/i, /gross settlement/i, /real time gross/i] },
  { leaf: "02_Payment_and_Settlement_Systems/BEFTN_and_NPSB", patterns: [/beftn/i, /npsb/i, /national payment switch/i] },
  { leaf: "02_Payment_and_Settlement_Systems/MFS_and_FinTech_Regulations", patterns: [/mobile financial/i, /\bmfs\b/i, /fintech/i, /payment system/i, /bkash/i] },
  { leaf: "03_Macroeconomics_and_Indicators/Inflation_GDP_Targets_and_Five_Year_Plans", patterns: [/gdp/i, /five year plan/i, /fiscal year/i, /deflator/i, /national income/i] },
  { leaf: "03_Macroeconomics_and_Indicators/Interest_Rate_Benchmarks_SOFR", patterns: [/interest rate/i, /sofr/i, /benchmark/i, /policy rate/i, /lending rate/i, /deposit rate/i] },
  { leaf: "03_Macroeconomics_and_Indicators/Exchange_Rates_and_Remittance_Flows", patterns: [/exchange rate/i, /remittance/i, /forex/i, /foreign exchange/i, /taka.*dollar|usd/i] },
  { leaf: "04_Banking_Commerce_and_Taxation/Commercial_Banking_Operations", patterns: [/loan/i, /deposit/i, /overdraft/i, /commercial bank/i, /credit/i, /branch/i, /account/i, /letter of credit/i] },
  { leaf: "04_Banking_Commerce_and_Taxation/Capital_Markets_BSEC_and_CMSF", patterns: [/seboni/i, /bsec/i, /cmsf/i, /capital market/i, /stock exchange/i, /bond/i, /share/i] },
  { leaf: "04_Banking_Commerce_and_Taxation/International_Trade_Finance_LCs_and_Brent_Index", patterns: [/trade/i, /export/i, /import/i, /\bl\/c\b/i, /letter of credit/i, /brent/i, /customs/i, /tariff/i, /balance of payment/i] },
];

/** The archive subject (out-of-syllabus general knowledge). */
const ARCHIVE_RULES: Rule[] = [
  { leaf: "০১_সাহিত্য_ও_সংস্কৃতি", patterns: [/রবীন্দ্র|নজরুল|সাহিত্য|কবি|নাটক|উপন্যাস|গল্প|পদ্মার|জ্ঞানদান|ইতিহাসে|পুরাণ/] },
  { leaf: "০২_ভূগোল_ও_ইতিহাস", patterns: [/দেশ|জাতি|ভূগোল|প্রবাস|পাহাড়|নদী|জলবায়ু|কোয়ার্টার|শহর|মহাদেশ/] },
  { leaf: "০৩_বিজ্ঞান_ও_প্রযুক্তি", patterns: [/বিদ্যুৎ|রাসায়নিক|জীব|পদার্থ|আলোক|তরঙ্গ|প্রাণী|আবহবায়ু|কম্পিউটার|ইন্টারনেট|সফটওয়্যার/] },
];

/** Subject nameBn → plan. Subjects without an entry are spread round-robin. */
export const SUBJECT_PLANS: Record<string, SubjectPlan> = {
  // BCS
  "বাংলা ভাষা ও সাহিত্য": {
    rules: [...BANLA_GRAMMAR, ...BANLA_LITERATURE_BCS],
    fallbackLeaf: "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/শব্দের_অর্থবিচার_ও_বাক্যের_অর্থবিচার",
  },
  "English Language and Literature": { rules: ENGLISH_BCS },
  "কম্পিউটার ও তথ্য প্রযুক্তি": { rules: ICT_BANK.map((r) => ({ ...r, leaf: r.leaf })) },
  "মানসিক দক্ষতা": {
    rules: [
      { leaf: "০৬_সংখ্যাগত_ক্ষমতা_Numerical_Ability", patterns: [/number/i, /digit/i, /series/i, /average/i, /data/i] },
      { leaf: "০৫_স্থানাঙ্ক_সম্পর্ক_Space_Relation", patterns: [/direction/i, /distance/i, /mirror/i, /image/i, /cube/i, /fold/i] },
      { leaf: "০২_সমস্যা_সমাধান_Problem_Solving", patterns: [/age/i, /calendar/i, /clock/i, /puzzle/i, /problem/i] },
      { leaf: "০৪_যান্ত্রিক_দক্ষতা_Mechanical_Reasoning", patterns: [/machine/i, /gear/i, /lever/i] },
      { leaf: "০১_ভাষাগত_যৌক্তিক_বিচার_Verbal_Reasoning", patterns: [/syllogism/i, /assumption/i, /conclusion/i, /argument/i, /statement/i] },
    ],
  },
  "নৈতিকতা, মূল্যবোধ ও সু-শাসন": {
    rules: [
      { leaf: "Definition_of_Values_and_Good_Governance", patterns: [/definition/i, /good governance/i, /meaning of value/i] },
      { leaf: "Benefit_and_Adverse_Cost/Benefit_of_Values_and_Good_Governance", patterns: [/benefit/i] },
      { leaf: "Benefit_and_Adverse_Cost/Cost_Society_Pays_in_Absence", patterns: [/cost/i] },
      { leaf: "Importance_in_Life_and_Society/Individual_as_Citizen", patterns: [/citizen/i, /individual/i] },
      { leaf: "Importance_in_Life_and_Society/Making_of_Society", patterns: [/society/i, /making/i] },
      { leaf: "Importance_in_Life_and_Society/National_Ideals", patterns: [/national ideal/i, /ideal/i] },
      { leaf: "Relation_between_Values_and_Good_Governance", patterns: [/relation/i, /values and good/i] },
      { leaf: "Establishment_in_Social_Context", patterns: [/social/i, /establish/i] },
      { leaf: "General_Perception", patterns: [/perception/i] },
      { leaf: "Impact_in_National_Development", patterns: [/impact/i, /development/i] },
    ],
  },
  // Bank
  "01_Bangla_Language_and_Literature": {
    rules: [...BANLA_GRAMMAR, ...BANLA_LITERATURE_BANK],
    fallbackLeaf: "ভাষা/অর্থতত্ত্ব_ও_শব্দভাণ্ডার/শব্দের_অর্থবিচার_ও_বাক্যের_অর্থবিচার",
  },
  "02_English_Language_and_Literature": { rules: ENGLISH_BANK },
  "03_Mathematics": { rules: MATH_BANK },
  "05_ICT": { rules: ICT_BANK },
  "06_Financial_Knowledge": { rules: FINANCIAL_BANK },
  "সাধারণ জ্ঞান": { rules: ARCHIVE_RULES, fallbackLeaf: "০৪_ইংরেজি_ও_সাধারণ_জ্ঞান" },
};

/** Subject names whose questions are spread round-robin over their leaves. */
export const ROUND_ROBIN_SUBJECTS = new Set([
  "03_বাংলাদেশ_বিষয়াবলি",
  "04_আন্তর্জাতিক_বিষয়াবলি",
  "05_ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা",
  "06_সাধারণ বিজ্ঞান",
  "সাধারণ জ্ঞান",
]);

/**
 * Detect the subject a row's CONTENT belongs to (the officer-exam import
 * defaulted to English). Returns the target subject nameBn, or null.
 */
export function detectSubject(subjectNameBn: string, question: string, explanation = ""): string | null {
  const rules = SUBJECT_REASSIGN[subjectNameBn];
  if (!rules) return null;
  const text = `${question} ${explanation}`;
  for (const rule of rules) {
    for (const p of rule.patterns) {
      if (p.test(text)) return rule.to;
    }
  }
  return null;
}

/**
 * Classify one question. Returns a leaf path relative to the subject root, or
 * null when no rule matched (the caller then falls back).
 */
export function classifyQuestion(
  subjectNameBn: string,
  question: string,
  explanation = "",
): string | null {
  const plan = SUBJECT_PLANS[subjectNameBn];
  if (!plan) return null;
  const text = `${question} ${explanation}`;

  // A short prompt that is just a word or a phrase ("Sovereignty",
  // "Swan-song", "To look down one's nose at") asks for a one-word
  // substitution.
  const trimmed = question.trim();
  if (
    subjectNameBn === "02_English_Language_and_Literature" &&
    trimmed.length > 0 &&
    trimmed.length < 70 &&
    !trimmed.includes("?")
  ) {
    return "PART-I_Language/Words_Vocabulary/One-Word_Substitutions";
  }
  for (const rule of plan.rules) {
    for (const p of rule.patterns) {
      if (p.test(text)) return rule.leaf;
    }
  }
  return null;
}
