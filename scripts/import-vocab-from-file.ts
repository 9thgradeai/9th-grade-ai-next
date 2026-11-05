// scripts/import-vocab-from-file.ts
// Parses database/data/Vocab/Vocab.txt and upserts into VocabWord table.
// Usage: npx tsx scripts/import-vocab-from-file.ts

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

interface ParsedVocabEntry {
  word: string;
  bengaliMeaning: string;
  partOfSpeech: string;
  synonyms: string[];
  antonyms: string[];
  exampleSentence: string;
  exampleSentenceBn: string;
  context: string;
  mnemonic: string;
  examRelevance: string[];
  frequency: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

function parseVocabFile(filePath: string): ParsedVocabEntry[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const entries: ParsedVocabEntry[] = [];

  let currentLetter = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip letter headers (single uppercase letter)
    if (/^[A-Z]$/.test(line)) {
      currentLetter = line;
      continue;
    }

    // Word entries start with "* "
    if (!line.startsWith("* ")) continue;

    // Remove the "* " prefix
    const entry = line.slice(2).trim();

    // Parse format: Word (Bengali) POS: Syn1, Syn2, ...
    // Example: "Abettor (অপরাধে সাহায্যকারী) n.: Conspirator (ষড়যন্ত্রকারী), Assistant (সহায়কারী)"

    // Find the Bengali meaning in parentheses
    const bengaliMatch = entry.match(/^([^(]+)\s*\(([^)]+)\)/);
    if (!bengaliMatch) {
      console.warn(`Skipping malformed line: ${line}`);
      continue;
    }

    const word = bengaliMatch[1].trim();
    const bengaliMeaning = bengaliMatch[2].trim();

    // Get the rest after the closing parenthesis
    const rest = entry.slice(bengaliMatch[0].length).trim();

    // Extract part of speech (before the colon)
    const posMatch = rest.match(/^([a-z.]+)\s*:/);
    let partOfSpeech = "Noun";
    let synonymsPart = rest;

    if (posMatch) {
      const posRaw = posMatch[1].trim().toLowerCase();
      partOfSpeech = normalizePos(posRaw);
      synonymsPart = rest.slice(posMatch[0].length).trim();
    } else {
      // No colon found, assume Noun
      partOfSpeech = "Noun";
    }

    // Parse synonyms (comma-separated, each may have Bengali in parentheses)
    const synonyms: string[] = [];
    const antonyms: string[] = [];

    // Split by comma but be careful about commas inside parentheses
    // Simple approach: split by ", " and clean up
    const synonymStrs = synonymsPart.split(",").map(s => s.trim()).filter(s => s);

    for (const s of synonymStrs) {
      // Extract English part before Bengali parenthesis
      const synMatch = s.match(/^([^(]+)(?:\s*\([^)]+\))?$/);
      const syn = synMatch ? synMatch[1].trim() : s;
      if (syn) synonyms.push(syn);
    }

    // Create a basic entry with defaults
    // We'll generate example sentence and mnemonic based on the word
    const entryObj: ParsedVocabEntry = {
      word,
      bengaliMeaning,
      partOfSpeech,
      synonyms,
      antonyms,
      exampleSentence: `The word "${word}" means "${bengaliMeaning}".`,
      exampleSentenceBn: `শব্দ "${word}" এর অর্থ "${bengaliMeaning}"।`,
      context: `Vocabulary for Bangladeshi government job exams (BCS, Bank, 9th Grade).`,
      mnemonic: generateMnemonic(word, bengaliMeaning),
      examRelevance: ["BCS", "Bank", "9th Grade"],
      frequency: estimateFrequency(word),
      difficulty: estimateDifficulty(word, synonyms.length),
    };

    entries.push(entryObj);
  }

  return entries;
}

function normalizePos(pos: string): string {
  const map: Record<string, string> = {
    "n": "Noun",
    "n.": "Noun",
    "vt": "Verb",
    "vt.": "Verb",
    "vi": "Verb",
    "vi.": "Verb",
    "vt.vi": "Verb",
    "vt.vi:": "Verb",
    "adj": "Adjective",
    "adj.": "Adjective",
    "adv": "Adverb",
    "adv.": "Adverb",
  };
  return map[pos] ?? "Noun";
}

function generateMnemonic(word: string, meaning: string): string {
  // Simple mnemonic generator
  const firstLetter = word[0].toUpperCase();
  return `${firstLetter} for ${word.charAt(0).toLowerCase() + word.slice(1)} — ${meaning}.`;
}

function estimateFrequency(word: string): number {
  // Simple frequency estimation based on word length and common patterns
  const commonWords = ["the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at"];
  if (commonWords.includes(word.toLowerCase())) return 100;
  if (word.length <= 4) return Math.floor(Math.random() * 30) + 60;
  if (word.length <= 6) return Math.floor(Math.random() * 30) + 50;
  if (word.length <= 8) return Math.floor(Math.random() * 25) + 40;
  return Math.floor(Math.random() * 20) + 30;
}

function estimateDifficulty(word: string, synonymCount: number): "EASY" | "MEDIUM" | "HARD" {
  if (word.length <= 5 && synonymCount >= 2) return "EASY";
  if (word.length <= 7) return "MEDIUM";
  return "HARD";
}

async function main() {
  console.log("🌱 Importing vocabulary from Vocab.txt...");

  const filePath = join(process.cwd(), "database", "data", "Vocab", "Vocab.txt");
  const entries = parseVocabFile(filePath);

  console.log(`📖 Parsed ${entries.length} vocabulary entries`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of entries) {
    try {
      // Check if word already exists
      const existing = await prisma.vocabWord.findUnique({
        where: { word: entry.word },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.vocabWord.create({
        data: {
          word: entry.word,
          bengaliMeaning: entry.bengaliMeaning,
          partOfSpeech: entry.partOfSpeech,
          verbForms: undefined,
          synonyms: entry.synonyms.length > 0 ? entry.synonyms : undefined,
          antonyms: entry.antonyms.length > 0 ? entry.antonyms : undefined,
          exampleSentence: entry.exampleSentence,
          exampleSentenceBn: entry.exampleSentenceBn,
          context: entry.context,
          mnemonic: entry.mnemonic,
          examRelevance: entry.examRelevance,
          frequency: entry.frequency,
          difficulty: entry.difficulty,
        },
      });
      imported++;

      if (imported % 50 === 0) {
        console.log(`  ✓ ${imported} imported...`);
      }
    } catch (err) {
      console.error(`  ✗ Failed to import "${entry.word}":`, err);
      errors++;
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   Imported: ${imported}`);
  console.log(`   Skipped (already exist): ${skipped}`);
  console.log(`   Errors: ${errors}`);
}

main()
  .catch((e) => {
    console.error("❌ Import failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });