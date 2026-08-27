import "server-only";

// Romanized-Bengali ("Banglish") normalizer.
//
// Many Bangladeshi aspirants type in Banglish (e.g. "ami BCS korte chai").
// Sending clean Bengali to the model improves answer quality and keeps
// responses consistent across the bilingual tutor/solver/assistant.
//
// This is a pragmatic, dictionary-based v1: it transliterates the most
// common standalone Banglish tokens. It is intentionally conservative — it
// only replaces whole-word tokens it is confident about, so English terms
// (BCS, English, math) pass through untouched. Phrase-level transliteration
// (e.g. "kemon acho") is handled by a small phrase table.

const PHRASES: Record<string, string> = {
  "kemon acho": "কেমন আছো",
  "kemon achis": "কেমন আছিস",
  "ki obostha": "কী অবস্থা",
  "dhonnobad": "ধন্যবাদ",
  "thanks": "ধন্যবাদ",
  "bhalo nei": "ভালো নেই",
  "bhalo achi": "ভালো আছি",
};

const WORDS: Record<string, string> = {
  ami: "আমি",
  amra: "আমরা",
  tumi: "তুমি",
  apni: "আপনি",
  apnara: "আপনারা",
  se: "সে",
  tara: "তারা",
  amader: "আমাদের",
  tomar: "তোমার",
  apnar: "আপনার",
  amake: "আমাকে",
  kore: "করে",
  korte: "করতে",
  korbo: "করবো",
  chai: "চাই",
  cai: "চাই",
  chaile: "চাইলে",
  keno: "কেন",
  kivabe: "কিভাবে",
  kibhabe: "কিভাবে",
  kothay: "কোথায়",
  kokhon: "কখন",
  keu: "কেউ",
  ke: "কে",
  ki: "কী",
  koto: "কত",
  onek: "অনেক",
  somoy: "সময়",
  somasya: "সমস্যা",
  proshno: "প্রশ্ন",
  uttor: "উত্তর",
  boi: "বই",
  pora: "পড়া",
  porbo: "পড়বো",
  pore: "পরে",
  bhalo: "ভালো",
  kharap: "খারাপ",
  shikkha: "শিক্ষা",
  shikkhok: "শিক্ষক",
  chakri: "চাকরি",
  porikkha: "পরীক্ষা",
  jonno: "জন্য",
  shathe: "সাথে",
  ar: "আর",
  o: "ও",
  e: "এ",
  ei: "এই",
  oi: "ওই",
  hoy: "হয়",
  hobe: "হবে",
  ace: "আছে",
  ache: "আছে",
  nai: "নাই",
  nei: "নেই",
  kichu: "কিছু",
  sob: "সব",
  aj: "আজ",
  kal: "কাল",
  help: "সাহায্য",
  shahojjo: "সাহায্য",
  bujhi: "বুঝি",
  bujhte: "বুঝতে",
  bolun: "বলুন",
  bol: "বল",
  likhun: "লিখুন",
  dekhao: "দেখাও",
  koro: "করো",
  korun: "করুন",
};

const wordBoundary = (token: string): string => {
  const mapped = WORDS[token];
  return mapped ?? token;
};

/**
 * Normalize a Banglish string into Bengali where confidently possible.
 * Returns the original string (lightly trimmed) if no tokens matched, so we
 * never corrupt already-correct Bengali/English input.
 */
export function normalizeBanglish(input: string): string {
  if (!input) return input;
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  // Whole-string phrase replacement first.
  const lower = trimmed.toLowerCase();
  for (const [phrase, bn] of Object.entries(PHRASES)) {
    if (lower.includes(phrase)) {
      const re = new RegExp(phrase, "gi");
      return trimmed.replace(re, bn);
    }
  }

  // Word-level replacement on token boundaries.
  const tokens = trimmed.split(/(\s+)/);
  let changed = false;
  const out = tokens.map((tok) => {
    if (/^\s+$/.test(tok)) return tok;
    const stripped = tok.replace(/[.,!?;:()"']/g, "").toLowerCase();
    const mapped = WORDS[stripped];
    if (mapped && mapped !== stripped) {
      changed = true;
      return tok.replace(new RegExp(`(^|[^\\p{L}])${escapeRegExp(stripped)}`, "iu"), `$1${mapped}`);
    }
    return tok;
  });

  const result = out.join("");
  return changed ? result : trimmed;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
