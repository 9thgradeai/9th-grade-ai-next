// Rotating literary quotes for the Home welcome section.
// Bangla + English literature — prominent writers only.

export type LiteraryQuote = {
  id: string;
  textBn: string;
  textEn: string;
  authorBn: string;
  authorEn: string;
  workBn?: string;
  workEn?: string;
  lang: "bn" | "en";
};

export const LITERARY_QUOTES: LiteraryQuote[] = [
  {
    id: "tagore-where-mind",
    textBn: "চিত্ত যেথা ভয়শূন্য, উচ্চ যেথা শির",
    textEn: "Where the mind is without fear and the head is held high",
    authorBn: "রবীন্দ্রনাথ ঠাকুর",
    authorEn: "Rabindranath Tagore",
    workBn: "গীতাঞ্জলি",
    workEn: "Gitanjali",
    lang: "bn",
  },
  {
    id: "nazrul-arise",
    textBn: "বল বীর — বল উন্নত মম শির!",
    textEn: "Speak, O hero — speak: my head is held ever high!",
    authorBn: "কাজী নজরুল ইসলাম",
    authorEn: "Kazi Nazrul Islam",
    workBn: "বিদ্রোহী",
    workEn: "Bidrohi (The Rebel)",
    lang: "bn",
  },
  {
    id: "jibanananda-banalata",
    textBn: "হাজার বছর ধরে আমি পথ হাঁটিতেছি পৃথিবীর পথে",
    textEn: "A thousand years I have walked the paths of this earth",
    authorBn: "জীবনানন্দ দাশ",
    authorEn: "Jibanananda Das",
    workBn: "বনলতা সেন",
    workEn: "Banalata Sen",
    lang: "bn",
  },
  {
    id: "sukanta-chharpatra",
    textBn: "এসেছে নতুন শিশু, তাকে ছেড়ে দিতে হবে স্থান",
    textEn: "A new child has arrived; we must make room for them",
    authorBn: "সুকান্ত ভট্টাচার্য",
    authorEn: "Sukanta Bhattacharya",
    workBn: "ছাড়পত্র",
    workEn: "Chharpatra",
    lang: "bn",
  },
  {
    id: "shakespeare-tempest",
    textBn: "আমরা সেই বস্তুতে গড়া, যা দিয়ে স্বপ্ন তৈরি",
    textEn: "We are such stuff as dreams are made on",
    authorBn: "উইলিয়াম শেক্সপিয়ার",
    authorEn: "William Shakespeare",
    workBn: "দ্য টেম্পেস্ট",
    workEn: "The Tempest",
    lang: "en",
  },
  {
    id: "wordsworth-daffodils",
    textBn: "একাকী মেঘের মতো ঘুরে বেড়াই আমি",
    textEn: "I wandered lonely as a cloud",
    authorBn: "উইলিয়াম ওয়ার্ডসওয়ার্থ",
    authorEn: "William Wordsworth",
    workBn: "ড্যাফোডিলস",
    workEn: "Daffodils",
    lang: "en",
  },
  {
    id: "shelley-ozymandias",
    textBn: "আমার নাম ওজিম্যানডিয়াস, রাজাদের রাজা",
    textEn: "My name is Ozymandias, King of Kings",
    authorBn: "পার্সি বিশি শেলি",
    authorEn: "Percy Bysshe Shelley",
    workBn: "ওজিম্যানডিয়াস",
    workEn: "Ozymandias",
    lang: "en",
  },
  {
    id: "keats-truth-beauty",
    textBn: "সৌন্দর্যই সত্য, সত্যই সৌন্দর্য",
    textEn: "Beauty is truth, truth beauty",
    authorBn: "জন কীটস",
    authorEn: "John Keats",
    workBn: "ওড অন আ গ্রিসিয়ান আর্ন",
    workEn: "Ode on a Grecian Urn",
    lang: "en",
  },
];

/** Deterministic quote-of-the-day (rotates daily, stable within a day). */
export function quoteOfTheDay(date = new Date()): LiteraryQuote {
  const dayIndex =
    Math.floor(date.getTime() / 86400000) % LITERARY_QUOTES.length;
  return LITERARY_QUOTES[dayIndex];
}
