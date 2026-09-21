// backend/services/vocab-ai.ts — AI-powered vocabulary aids: mnemonics,
// contextual examples, word-of-the-day, and word relationships.
// Server-only; delegates to the AI provider system with failover + mock fallback.

import "server-only";

import { InternalServerError } from "~backend/errors";
import { buildVocabSystem } from "~backend/ai/prompts/vocab";
import { resolveModelCandidates, reportProviderOutcome } from "~backend/ai/providers/registry";
import type { LLMProvider, LLMProviderName } from "~backend/ai/providers/types";

// ── Types ──────────────────────────────────────────────────

export type MnemonicResult = {
  mnemonic: string;
  source: string;
};

export type ExamplesResult = {
  examples: string[];
  source: string;
};

export type WordOfDayResult = {
  word: string;
  bengaliMeaning: string;
  partOfSpeech: string;
  mnemonic: string;
  examples: string[];
  synonyms: string[];
  antonyms: string[];
  source: string;
};

export type RelationshipsResult = {
  explanation: string;
  source: string;
};

// ── Provider failover (non-streaming) ──────────────────────

async function withVocabFailover<T>(
  fn: (p: LLMProvider, name: LLMProviderName) => Promise<T>,
): Promise<{ value: T; provider: LLMProviderName; model: string; isMock: boolean }> {
  const candidates = resolveModelCandidates("assistant");
  let lastErr: unknown;
  for (const cand of candidates) {
    try {
      const value = await fn(cand.provider, cand.name);
      reportProviderOutcome(cand.name, true);
      return {
        value,
        provider: cand.name,
        model: cand.provider.model,
        isMock: cand.name === "mock",
      };
    } catch (err) {
      console.error(`[ai:vocab] provider ${cand.name} failed`, err);
      reportProviderOutcome(cand.name, false);
      lastErr = err;
    }
  }
  throw lastErr ?? new InternalServerError("All AI providers failed for vocabulary request.");
}

// ── Mock responses ─────────────────────────────────────────

const MOCK_MNEMONICS: Record<string, string> = {
  default:
    "MOCK — No API key configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY for real AI mnemonics.\n\n" +
    "Common mnemonic technique: break the word into parts and connect to a Bengali sound-alike or vivid image.",
  abandon:
    "Abandon = 'A band on' —想象一个乐队在舞台上 abandoned (丢弃)了他们的乐器离开了。" +
    "বাংলায়: 'অ্যাবান্ডন' শুনলে মনে হয় 'অবনমন' — কিছু পরিত্যাগ করলে অবনমন হয়।",
  benevolent:
    "Benevolent = 'Bene' (ভালো, like benefit) + 'volent' (ইচ্ছা) = ভালো ইচ্ছা রাখা। " +
    "বাংলায়: 'বিনয়ী ভোলেন্ট' — বিনয়ী মানে সরল, ভোলেন্ট মানে দয়ালু।",
  ephemeral:
    "Ephemeral = 'E' + 'phemeral' sounds like 'femural' — femur bone lasts forever, but this word means the OPPOSITE: short-lived. " +
    "বাংলায়: 'এফিমারাল' — 'ফিম' এর মতো মুহূর্তের জন্য।",
  mitigate:
    "Mitigate = 'Mite' (ক্ষুদ্র পোকা) + 'gate' — ছোট পোকাটির জন্য গেট খুলে দিলে বিপদ কমে। " +
    "বাংলায়: 'মাইটিগেট' — মাইট (ক্ষুদ্র) + গেট = ক্ষতি কমানো।",
};

const MOCK_EXAMPLES: Record<string, string[]> = {
  default: [
    "The government implemented new policies to address the growing concern.",
    "সরকার ক্রমবর্ধমান উদ্বেগ মোকাবেলায় নতুন নীতিমালা প্রণয়ন করেছে।",
  ],
  abandon: [
    "The committee decided to abandon the project after the cost overrun became unacceptable.",
    "ব্যয়ের চেহারা অগ্রহণযোগ্য হয়ে পড়ার পর কমিটি প্রকল্পটি পরিত্যাগ করার সিদ্ধান্ত নেয়।",
    "In BCS examinations, 'abandon' often appears in comprehension passages about policy changes.",
  ],
  benevolent: [
    "The benevolent donor contributed Tk 50 lakh to the flood relief fund without seeking publicity.",
    "দয়ালু দাতা প্রচার না চেয়ে বন্যা ত্রাণ তহবিলে ৫০ লাখ টাকা দান করেছেন।",
  ],
};

const MOCK_WORD_OF_DAY: WordOfDayResult = {
  word: "Pragmatic",
  bengaliMeaning: "বাস্তববাদী",
  partOfSpeech: "Adjective",
  mnemonic:
    "Pragmatic = 'Practical' + 'Magic' — the magic that actually works in real life. " +
    "বাংলায়: 'প্র্যাগমাটিক' — প্র্যাকটিক্যাল + ম্যাজিক, বাস্তবে কাজের।",
  examples: [
    "A pragmatic approach to traffic management is needed in Dhaka city.",
    "বিসিএস পরীক্ষায় 'pragmatic' প্রায়ই synonyms অংশে আসে।",
  ],
  synonyms: ["practical", "realistic", "sensible", "pragmatic"],
  antonyms: ["idealistic", "impractical", "utopian", "theoretical"],
  source: "mock",
};

const MOCK_RELATIONSHIPS: Record<string, string> = {
  default:
    "MOCK — No API key configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY for real AI relationship explanations.\n\n" +
    "Word relationships help you remember vocabulary by connecting new words to known ones. " +
    "Focus on: (1) synonym clusters, (2) opposite pairs, (3) collocations (words that appear together).",
};

// ── Service functions ──────────────────────────────────────

/**
 * Generate a creative mnemonic for a vocabulary word.
 * Uses the AI provider system with failover; falls back to mock if no API key.
 */
export async function generateMnemonic(
  word: string,
  bengaliMeaning: string,
  context?: string,
): Promise<MnemonicResult> {
  const system = buildVocabSystem();
  const userText = [
    `Generate a memorable mnemonic for the English vocabulary word: "${word}"`,
    `Bengali meaning: ${bengaliMeaning}`,
    context ? `Exam context: ${context}` : "",
    "",
    "Return ONLY a JSON object: { \"mnemonic\": \"...\" }",
    "The mnemonic should be vivid, funny, or use sound-alikes. Max 80 words.",
    "Include Bengali phonetic hints when helpful.",
  ]
    .filter(Boolean)
    .join("\n");

  // Check if we have a pre-written mock for this word
  const mockKey = word.toLowerCase();
  if (MOCK_MNEMONICS[mockKey]) {
    return { mnemonic: MOCK_MNEMONICS[mockKey], source: "mock" };
  }

  try {
    const fo = await withVocabFailover((p) =>
      p.generate({ system, messages: [{ role: "user", content: userText }], maxTokens: 512 }),
    );

    const parsed = safeParseJson<{ mnemonic: string }>(fo.value.text);
    return {
      mnemonic: parsed?.mnemonic ?? fo.value.text.trim(),
      source: fo.provider,
    };
  } catch {
    return { mnemonic: MOCK_MNEMONICS.default, source: "mock" };
  }
}

/**
 * Generate contextual example sentences for a vocabulary word.
 */
export async function generateContextualExamples(
  word: string,
  partOfSpeech: string,
  difficulty: string,
): Promise<ExamplesResult> {
  const system = buildVocabSystem();
  const userText = [
    `Generate 2-3 contextual example sentences for the word: "${word}" (part of speech: ${partOfSpeech})`,
    `Difficulty level: ${difficulty}`,
    "Sentences should feel like real BCS/Bank exam passages — formal, concise, topic-relevant.",
    "Mix Bengali and English where natural.",
    "",
    'Return ONLY a JSON object: { "examples": ["sentence1", "sentence2", ...] }',
  ].join("\n");

  const mockKey = word.toLowerCase();
  if (MOCK_EXAMPLES[mockKey]) {
    return { examples: MOCK_EXAMPLES[mockKey], source: "mock" };
  }

  try {
    const fo = await withVocabFailover((p) =>
      p.generate({ system, messages: [{ role: "user", content: userText }], maxTokens: 512 }),
    );

    const parsed = safeParseJson<{ examples: string[] }>(fo.value.text);
    return {
      examples: parsed?.examples ?? MOCK_EXAMPLES.default,
      source: fo.provider,
    };
  } catch {
    return { examples: MOCK_EXAMPLES.default, source: "mock" };
  }
}

/**
 * Generate the word of the day with mnemonic, examples, and relationships.
 * This is the richest vocab AI feature — combines all others.
 */
export async function generateWordOfTheDay(): Promise<WordOfDayResult> {
  const system = buildVocabSystem();
  const userText = [
    "Generate a 'Word of the Day' for a Bangladeshi government job exam aspirant.",
    "Pick a word that is:",
    "- Frequently tested in BCS/Bank exams",
    "- Medium difficulty (not too easy, not obscure)",
    "- Has clear Bengali meaning and exam relevance",
    "",
    "Return ONLY a JSON object:",
    JSON.stringify({
      word: "...",
      bengaliMeaning: "...",
      partOfSpeech: "...",
      mnemonic: "...",
      examples: ["...", "..."],
      synonyms: ["...", "...", "..."],
      antonyms: ["...", "...", "..."],
    }),
    "",
    "Keep mnemonic under 80 words. Examples should feel like exam passages.",
  ].join("\n");

  try {
    const fo = await withVocabFailover((p) =>
      p.generate({ system, messages: [{ role: "user", content: userText }], maxTokens: 1024 }),
    );

    const parsed = safeParseJson<WordOfDayResult>(fo.value.text);
    if (parsed && parsed.word) {
      return { ...parsed, source: fo.provider };
    }
    return { ...MOCK_WORD_OF_DAY, source: fo.provider };
  } catch {
    return MOCK_WORD_OF_DAY;
  }
}

/**
 * Explain word relationships: synonyms, antonyms, collocations, and usage register.
 */
export async function explainWordRelationships(
  word: string,
  synonyms: string[],
  antonyms: string[],
): Promise<RelationshipsResult> {
  const system = buildVocabSystem();
  const userText = [
    `Explain the word relationships for: "${word}"`,
    `Known synonyms: ${synonyms.join(", ")}`,
    `Known antonyms: ${antonyms.join(", ")}`,
    "",
    "Explain:",
    "1. How these synonyms differ in nuance and register (formal/informal/academic).",
    "2. Common collocations (what words appear next to this word).",
    "3. Why the antonyms are opposites — what's the core meaning being contrasted.",
    "4. Exam tips: which relationships are most tested in BCS/Bank exams.",
    "",
    "Write in a natural Bengali-English mix. Keep it concise but insightful.",
  ].join("\n");

  const mockKey = word.toLowerCase();
  if (MOCK_RELATIONSHIPS[mockKey]) {
    return { explanation: MOCK_RELATIONSHIPS[mockKey], source: "mock" };
  }

  try {
    const fo = await withVocabFailover((p) =>
      p.generate({ system, messages: [{ role: "user", content: userText }], maxTokens: 768 }),
    );

    return { explanation: fo.value.text.trim(), source: fo.provider };
  } catch {
    return { explanation: MOCK_RELATIONSHIPS.default, source: "mock" };
  }
}

// ── Helpers ────────────────────────────────────────────────

function safeParseJson<T>(text: string): T | null {
  try {
    // Try direct parse first
    return JSON.parse(text) as T;
  } catch {
    // Try extracting JSON from markdown code blocks
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1]) as T;
      } catch {
        // ignore
      }
    }
    // Try finding a JSON object in the text
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as T;
      } catch {
        // ignore
      }
    }
    return null;
  }
}
