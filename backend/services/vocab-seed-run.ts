// backend/services/vocab-seed-run.ts — Vocab seed function (no server-only guard).
// Used by the Prisma seed script which runs outside Next.js.

import { PrismaClient } from "@prisma/client";
import { VOCAB_SEED_DATA } from "../../database/data/vocab-seed";

const ORIGINAL_SEED_WORDS = [
  { word: "Abandon", bengaliMeaning: "পরিত্যাগ করা", partOfSpeech: "Verb", verbForms: ["abandon", "abandoned", "abandoning", "abandonment"], synonyms: ["desert", "forsake", "leave"], antonyms: ["retain", "keep", "maintain"], exampleSentence: "The government decided to abandon the outdated policy after mass protests.", exampleSentenceBn: "গণবিক্ষোভের পর সরকার সেকেলে নীতিটি পরিত্যাগ করার সিদ্ধান্ত নেয়।", context: "Used for policies, plans, or places left completely.", mnemonic: "Ab + abandon = 'a band' leaves the stage.", examRelevance: ["BCS", "Bank", "9th Grade"], frequency: 95, difficulty: "EASY" },
  { word: "Benevolent", bengaliMeaning: "পরোপকারী, দয়ালু", partOfSpeech: "Adjective", verbForms: null, synonyms: ["kind", "generous", "compassionate"], antonyms: ["malevolent", "cruel", "selfish"], exampleSentence: "The benevolent officer helped the flood victims without any publicity.", context: "Describes people/institutions showing goodwill.", mnemonic: "Bene = good + volent = wishing — wishing good for others.", examRelevance: ["BCS", "Bank"], frequency: 88, difficulty: "MEDIUM" },
  { word: "Ephemeral", bengaliMeaning: "ক্ষণস্থায়ী", partOfSpeech: "Adjective", verbForms: null, synonyms: ["transient", "fleeting", "momentary"], antonyms: ["permanent", "eternal", "lasting"], exampleSentence: "Social media fame is often ephemeral, unlike true knowledge.", context: "Academic/editorial vocabulary.", mnemonic: "Ephemeral = short-lived like a mayfly.", examRelevance: ["BCS", "Bank"], frequency: 75, difficulty: "HARD" },
  { word: "Mitigate", bengaliMeaning: "প্রশমিত করা, লাঘব করা", partOfSpeech: "Verb", verbForms: ["mitigate", "mitigated", "mitigating", "mitigation"], synonyms: ["alleviate", "reduce", "lessen"], antonyms: ["aggravate", "intensify", "worsen"], exampleSentence: "Afforestation can mitigate the effects of climate change.", context: "Key for environment/disaster topics.", mnemonic: "Mitigate = 'mite' + gate — a tiny gate that lessens the flood.", examRelevance: ["BCS", "9th Grade"], frequency: 82, difficulty: "MEDIUM" },
  { word: "Pragmatic", bengaliMeaning: "বাস্তববাদী", partOfSpeech: "Adjective", verbForms: null, synonyms: ["practical", "realistic", "sensible"], antonyms: ["idealistic", "impractical", "utopian"], exampleSentence: "A pragmatic approach to traffic management is needed in Dhaka.", context: "Governance/ethics vocabulary.", mnemonic: "Pragmatic = practical + magic — magic that actually works.", examRelevance: ["BCS"], frequency: 80, difficulty: "MEDIUM" },
  { word: "Ubiquitous", bengaliMeaning: "সর্বব্যাপী", partOfSpeech: "Adjective", verbForms: null, synonyms: ["omnipresent", "pervasive", "universal"], antonyms: ["rare", "scarce", "absent"], exampleSentence: "Mobile phones are now ubiquitous even in remote villages.", context: "Tech/ICT and social change passages.", mnemonic: "Ubi = everywhere + quitous — everywhere at once.", examRelevance: ["BCS", "Bank"], frequency: 77, difficulty: "MEDIUM" },
  { word: "Alleviate", bengaliMeaning: "উপশম করা", partOfSpeech: "Verb", verbForms: ["alleviate", "alleviated", "alleviating", "alleviation"], synonyms: ["relieve", "ease", "mitigate"], antonyms: ["aggravate", "worsen"], exampleSentence: "Microcredit helps alleviate poverty in rural areas.", context: "Poverty/economy topics.", mnemonic: "Alleviate = a + levitate — lifting pain away.", examRelevance: ["BCS", "Bank"], frequency: 85, difficulty: "MEDIUM" },
  { word: "Diligent", bengaliMeaning: "পরিশ্রমী", partOfSpeech: "Adjective", verbForms: null, synonyms: ["hardworking", "industrious", "assiduous"], antonyms: ["lazy", "negligent", "idle"], exampleSentence: "A diligent student revises vocabulary daily.", context: "Character trait vocabulary.", mnemonic: "Diligent = imagine a diligent ant working non-stop.", examRelevance: ["BCS", "9th Grade"], frequency: 90, difficulty: "EASY" },
  { word: "Ambiguous", bengaliMeaning: "দ্ব্যর্থক, অস্পষ্ট", partOfSpeech: "Adjective", verbForms: null, synonyms: ["vague", "unclear", "equivocal"], antonyms: ["clear", "unambiguous", "explicit"], exampleSentence: "The ambiguous circular created confusion among candidates.", context: "Administrative language.", mnemonic: "Ambi = both + guous — unclear both ways.", examRelevance: ["BCS", "Bank"], frequency: 78, difficulty: "MEDIUM" },
  { word: "Resilient", bengaliMeaning: "স্থিতিস্থাপক, সহনশীল", partOfSpeech: "Adjective", verbForms: null, synonyms: ["tough", "adaptable", "hardy"], antonyms: ["fragile", "vulnerable", "weak"], exampleSentence: "Bangladeshi farmers are resilient despite recurring floods.", context: "Disaster management vocabulary.", mnemonic: "Resilient = re + salient — bounce back saliently.", examRelevance: ["BCS", "9th Grade"], frequency: 83, difficulty: "MEDIUM" },
];

export async function seedVocabWords(prisma: PrismaClient) {
  let count = 0;
  for (const w of ORIGINAL_SEED_WORDS) {
    await prisma.vocabWord.upsert({
      where: { word: w.word },
      update: {
        bengaliMeaning: w.bengaliMeaning,
        partOfSpeech: w.partOfSpeech,
        verbForms: w.verbForms ?? undefined,
        synonyms: w.synonyms ?? undefined,
        antonyms: w.antonyms ?? undefined,
        exampleSentence: w.exampleSentence,
        exampleSentenceBn: w.exampleSentenceBn ?? undefined,
        context: w.context,
        mnemonic: w.mnemonic,
        examRelevance: w.examRelevance ?? undefined,
        frequency: w.frequency,
        difficulty: w.difficulty,
      },
      create: {
        word: w.word,
        bengaliMeaning: w.bengaliMeaning,
        partOfSpeech: w.partOfSpeech,
        verbForms: w.verbForms ?? undefined,
        synonyms: w.synonyms ?? undefined,
        antonyms: w.antonyms ?? undefined,
        exampleSentence: w.exampleSentence,
        exampleSentenceBn: w.exampleSentenceBn ?? undefined,
        context: w.context,
        mnemonic: w.mnemonic,
        examRelevance: w.examRelevance ?? undefined,
        frequency: w.frequency,
        difficulty: w.difficulty,
      },
    });
    count++;
  }
  for (const w of VOCAB_SEED_DATA) {
    await prisma.vocabWord.upsert({
      where: { word: w.word },
      update: {
        bengaliMeaning: w.bengaliMeaning,
        partOfSpeech: w.partOfSpeech,
        verbForms: w.verbForms ?? undefined,
        synonyms: w.synonyms ?? undefined,
        antonyms: w.antonyms ?? undefined,
        exampleSentence: w.exampleSentence,
        exampleSentenceBn: w.exampleSentenceBn,
        context: w.context,
        mnemonic: w.mnemonic,
        examRelevance: w.examRelevance ?? undefined,
        frequency: w.frequency,
        difficulty: w.difficulty,
      },
      create: {
        word: w.word,
        bengaliMeaning: w.bengaliMeaning,
        partOfSpeech: w.partOfSpeech,
        verbForms: w.verbForms ?? undefined,
        synonyms: w.synonyms ?? undefined,
        antonyms: w.antonyms ?? undefined,
        exampleSentence: w.exampleSentence,
        exampleSentenceBn: w.exampleSentenceBn,
        context: w.context,
        mnemonic: w.mnemonic,
        examRelevance: w.examRelevance ?? undefined,
        frequency: w.frequency,
        difficulty: w.difficulty,
      },
    });
    count++;
  }
  return count;
}
