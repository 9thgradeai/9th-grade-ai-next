/**
 * Curated flashcard library — 96 fact-checked, exam-relevant cards across
 * 8 subjects for BCS / Bank / 9th-grade aspirants.
 *
 * Replaces the 15 legacy placeholder cards (which included corrupted text
 * and wrong facts, e.g. Simla Agreement dated 1973 instead of 1972).
 * Every card is one atomic fact: front (prompt) / back (answer).
 */

export type LibraryCard = {
  subject: string;
  question: string;
  answer: string;
  hint: string;
  difficulty: "easy" | "medium" | "hard";
  examRelevance: string[];
};

const BOTH = ["BCS", "Bank"];

export const FLASHCARD_LIBRARY: LibraryCard[] = [
  // ── বাংলা ভাষা ও সাহিত্য (12) ─────────────────────────────
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "সন্ধি কত প্রকার ও কী কী?", answer: "৩ প্রকার: স্বরসন্ধি, ব্যঞ্জনসন্ধি, বিসর্গসন্ধি", hint: "স্বর, ব্যঞ্জন আর বিসর্গ — এই তিনটি মনে রাখো", difficulty: "easy", examRelevance: BOTH },
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "সমাস কত প্রকার?", answer: "৬ প্রকার: দ্বন্দ্ব, দ্বিগু, তৎপুরুষ, কর্মধারয়, বহুব্রীহি, অব্যয়ীভাব", hint: "দ্বন্দ্ব দিয়ে শুরু, অব্যয়ীভাব দিয়ে শেষ", difficulty: "easy", examRelevance: BOTH },
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "বাংলা সাহিত্যের প্রাচীনতম নিদর্শন কোনটি?", answer: "চর্যাপদ", hint: "বৌদ্ধ সহজিয়া সাধকদের গান", difficulty: "easy", examRelevance: BOTH },
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "চর্যাপদ কে, কবে আবিষ্কার করেন?", answer: "হরপ্রসাদ শাস্ত্রী, ১৯০৭ সালে নেপালের রাজদরবার থেকে", hint: "১৯০৭ + হরপ্রসাদ শাস্ত্রী", difficulty: "medium", examRelevance: BOTH },
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "বাংলা গদ্যের জনক কে?", answer: "ঈশ্বরচন্দ্র বিদ্যাসাগর", hint: "বর্ণপরিচয়ের রচয়িতা", difficulty: "easy", examRelevance: BOTH },
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "বাংলা উপন্যাসের জনক কে? প্রথম সার্থক উপন্যাস কোনটি?", answer: "বঙ্কিমচন্দ্র চট্টোপাধ্যায়; দুর্গেশনন্দিনী (১৮৬৫)", hint: "দুর্গেশনন্দিনী → ১৮৬৫", difficulty: "medium", examRelevance: BOTH },
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "অমিত্রাক্ষর ছন্দ ও বাংলা সনেটের প্রবর্তক কে?", answer: "মাইকেল মধুসূদন দত্ত", hint: "মেঘনাদবধ কাব্যের কবি", difficulty: "medium", examRelevance: BOTH },
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "রবীন্দ্রনাথ ঠাকুর কবে, কোন গ্রন্থের জন্য নোবেল পান?", answer: "১৯১৩ সালে, গীতাঞ্জলি (Song Offerings) কাব্যের জন্য", hint: "১৯১৩ + গীতাঞ্জলি", difficulty: "easy", examRelevance: BOTH },
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "কাজী নজরুল ইসলামের প্রথম কাব্যগ্রন্থ কোনটি?", answer: "অগ্নিবীণা (১৯২২)", hint: "আগুনের বীণা — বিদ্রোহের সুর", difficulty: "medium", examRelevance: BOTH },
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "পদ্মাবতী কাব্যের রচয়িতা কে?", answer: "আলাওল", hint: "মধ্যযুগের মুসলিম কবি, আরাকান রাজসভা", difficulty: "medium", examRelevance: ["BCS"] },
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "কারক কত প্রকার?", answer: "৬ প্রকার: কর্তৃ, কর্ম, করণ, সম্প্রদান, অপাদান, অধিকরণ", hint: "কর্তা থেকে অধিকরণ পর্যন্ত ছয়টি", difficulty: "medium", examRelevance: BOTH },
  { subject: "বাংলা ভাষা ও সাহিত্য", question: "বাংলা ভাষার উদ্ভব কোন প্রাকৃত থেকে?", answer: "মাগধী প্রাকৃত → অপভ্রংশ থেকে", hint: "মাগধী → অপভ্রংশ → বাংলা", difficulty: "hard", examRelevance: ["BCS"] },

  // ── English Language and Literature (12) ──────────────────
  { subject: "English Language and Literature", question: "What is the structure of Past Perfect tense?", answer: "had + past participle (e.g. I had eaten)", hint: "Completed before another past action", difficulty: "easy", examRelevance: BOTH },
  { subject: "English Language and Literature", question: "What does the idiom 'Break the ice' mean?", answer: "To initiate conversation in a tense situation", hint: "First move to ease tension", difficulty: "easy", examRelevance: BOTH },
  { subject: "English Language and Literature", question: "What is a clause?", answer: "A group of words with a subject and a predicate", hint: "Independent vs dependent", difficulty: "easy", examRelevance: BOTH },
  { subject: "English Language and Literature", question: "How many parts of speech are there?", answer: "8: noun, pronoun, verb, adjective, adverb, preposition, conjunction, interjection", hint: "Count them on your fingers — 8", difficulty: "easy", examRelevance: BOTH },
  { subject: "English Language and Literature", question: "Change to passive: 'She writes a letter.'", answer: "'A letter is written by her.'", hint: "Present simple → is/am/are + past participle", difficulty: "medium", examRelevance: BOTH },
  { subject: "English Language and Literature", question: "Give the synonym and antonym of 'Benevolent'.", answer: "Synonym: kind; Antonym: malevolent", hint: "Bene = good, Male = bad", difficulty: "medium", examRelevance: BOTH },
  { subject: "English Language and Literature", question: "What is a gerund?", answer: "A verb form ending in -ing used as a noun (e.g. Swimming is fun)", hint: "Verb wearing a noun's mask", difficulty: "medium", examRelevance: BOTH },
  { subject: "English Language and Literature", question: "What is the structure of a Type-2 conditional?", answer: "If + past simple, would + base verb (imaginary present)", hint: "If I were rich, I would travel", difficulty: "medium", examRelevance: BOTH },
  { subject: "English Language and Literature", question: "What does the prefix 'un-' mean? Give an example.", answer: "'Not / opposite' — e.g. unhappy, undo", hint: "Reverses the meaning", difficulty: "easy", examRelevance: BOTH },
  { subject: "English Language and Literature", question: "Who wrote 'Hamlet'? Name its famous soliloquy.", answer: "William Shakespeare; 'To be, or not to be'", hint: "The Danish prince's question", difficulty: "medium", examRelevance: ["BCS"] },
  { subject: "English Language and Literature", question: "Who translated 'Gitanjali' into English?", answer: "Rabindranath Tagore himself (Song Offerings, 1912)", hint: "The poet was his own translator", difficulty: "hard", examRelevance: ["BCS"] },
  { subject: "English Language and Literature", question: "What is the antonym of 'Transparent'?", answer: "Opaque", hint: "Light passes vs light blocked", difficulty: "easy", examRelevance: BOTH },

  // ── বাংলাদেশ বিষয়াবলি (12) ───────────────────────────────
  { subject: "বাংলাদেশ বিষয়াবলি", question: "বাংলাদেশের স্বাধীনতা দিবস কবে?", answer: "২৬ মার্চ, ১৯৭১", hint: "স্বাধীনতার ঘোষণার দিন", difficulty: "easy", examRelevance: BOTH },
  { subject: "বাংলাদেশ বিষয়াবলি", question: "বাংলাদেশের বিজয় দিবস কবে?", answer: "১৬ ডিসেম্বর, ১৯৭১", hint: "পাকিস্তানি বাহিনীর আত্মসমর্পণ", difficulty: "easy", examRelevance: BOTH },
  { subject: "বাংলাদেশ বিষয়াবলি", question: "মুজিবনগর সরকার কবে গঠিত ও শপথ নেয়?", answer: "গঠন: ১০ এপ্রিল ১৯৭১; শপথ: ১৭ এপ্রিল ১৯৭১, আম্রকানন, মেহেরপুর", hint: "১০ তারিখে গঠন, ১৭ তারিখে শপথ", difficulty: "medium", examRelevance: BOTH },
  { subject: "বাংলাদেশ বিষয়াবলি", question: "শিমলা চুক্তি কবে স্বাক্ষরিত হয়?", answer: "২ জুলাই, ১৯৭২ (ইন্দিরা গান্ধী ও জুলফিকার আলী ভুট্টো)", hint: "১৯৭২ — যুদ্ধের পরের বছর", difficulty: "medium", examRelevance: BOTH },
  { subject: "বাংলাদেশ বিষয়াবলি", question: "বঙ্গবন্ধু কবে স্বদেশ প্রত্যাবর্তন করেন?", answer: "১০ জানুয়ারি, ১৯৭২", hint: "জানুয়ারির ১০ তারিখ", difficulty: "medium", examRelevance: BOTH },
  { subject: "বাংলাদেশ বিষয়াবলি", question: "ভাষা আন্দোলন কবে হয়? আন্তর্জাতিক মাতৃভাষা দিবস কীভাবে এলো?", answer: "২১ ফেব্রুয়ারি ১৯৫২; UNESCO ১৯৯৯ সালে দিনটিকে আন্তর্জাতিক মাতৃভাষা দিবস ঘোষণা করে", hint: "১৯৫২-এর শহিদদের সম্মানে ১৯৯৯", difficulty: "easy", examRelevance: BOTH },
  { subject: "বাংলাদেশ বিষয়াবলি", question: "ছয় দফা কবে, কোথায় ঘোষণা করা হয়?", answer: "১৯৬৬ সালে লাহোরে, বঙ্গবন্ধু শেখ মুজিবুর রহমান ঘোষণা করেন", hint: "১৯৬৬ + লাহোর", difficulty: "medium", examRelevance: BOTH },
  { subject: "বাংলাদেশ বিষয়াবলি", question: "বাংলাদেশের সংবিধান কবে কার্যকর হয়?", answer: "১৬ ডিসেম্বর, ১৯৭২", hint: "বিজয় দিবসের প্রথম বার্ষিকীতে", difficulty: "medium", examRelevance: BOTH },
  { subject: "বাংলাদেশ বিষয়াবলি", question: "জাতীয় সংসদের মোট আসন কত?", answer: "৩৫০টি (৩০০টি সরাসরি + ৫০টি সংরক্ষিত নারী আসন)", hint: "৩০০ + ৫০", difficulty: "easy", examRelevance: BOTH },
  { subject: "বাংলাদেশ বিষয়াবলি", question: "পদ্মা সেতু কবে উদ্বোধন করা হয়?", answer: "২৫ জুন, ২০২২", hint: "২০২২ সালের জুন", difficulty: "easy", examRelevance: BOTH },
  { subject: "বাংলাদেশ বিষয়াবলি", question: "বাংলাদেশ কবে জাতিসংঘের সদস্য হয়?", answer: "১৯৭৪ সালে, ১৩৬তম সদস্য হিসেবে", hint: "১৯৭৪ + ১৩৬", difficulty: "medium", examRelevance: BOTH },
  { subject: "বাংলাদেশ বিষয়াবলি", question: "আগরতলা মামলা কবে দায়ের করা হয়? প্রধান আসামি কে ছিলেন?", answer: "১৯৬৮ সালে; প্রধান আসামি বঙ্গবন্ধু শেখ মুজিবুর রহমান", hint: "১৯৬৮ + বঙ্গবন্ধু", difficulty: "hard", examRelevance: ["BCS"] },

  // ── আন্তর্জাতিক বিষয়াবলী (12) ────────────────────────────
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "জাতিসংঘের সদর দপ্তর কোথায়? প্রতিষ্ঠা কবে?", answer: "নিউইয়র্ক, যুক্তরাষ্ট্র; ২৪ অক্টোবর ১৯৪৫", hint: "২৪ অক্টোবর = জাতিসংঘ দিবস", difficulty: "easy", examRelevance: BOTH },
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "SAARC-এর সদস্য দেশ কয়টি? প্রতিষ্ঠা ও সদর দপ্তর কোথায়?", answer: "৮টি সদস্য; প্রতিষ্ঠা ১৯৮৫ ঢাকায়; সদর দপ্তর কাঠমান্ডু", hint: "৮ দেশ, ঢাকায় জন্ম, কাঠমান্ডুতে ঘর", difficulty: "easy", examRelevance: BOTH },
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "বিশ্বব্যাংকের সদর দপ্তর কোথায়? প্রতিষ্ঠা কবে?", answer: "ওয়াশিংটন ডি.সি.; ১৯৪৪ সালে ব্রেটন উডস সম্মেলনে", hint: "IMF-এর যমজ — একই শহর, একই সাল", difficulty: "medium", examRelevance: BOTH },
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "WHO-এর সদর দপ্তর কোথায়?", answer: "জেনেভা, সুইজারল্যান্ড (প্রতিষ্ঠা ১৯৪৮)", hint: "রেড ক্রসের শহরেই WHO", difficulty: "easy", examRelevance: BOTH },
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "UNESCO-এর সদর দপ্তর কোথায়?", answer: "প্যারিস, ফ্রান্স", hint: "শিক্ষা-সংস্কৃতির শহর প্যারিস", difficulty: "easy", examRelevance: BOTH },
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "ইউরোপীয় ইউনিয়নের সদর দপ্তর কোথায়? বর্তমান সদস্য কত?", answer: "ব্রাসেলস, বেলজিয়াম; ২৭টি সদস্য (যুক্তরাজ্য বেরিয়ে যাওয়ার পর)", hint: "Brexit-এর পর ২৮ থেকে ২৭", difficulty: "medium", examRelevance: BOTH },
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "OIC-এর সদস্য সংখ্যা ও সদর দপ্তর কোথায়?", answer: "৫৭টি সদস্য; সদর দপ্তর জেদ্দা, সৌদি আরব", hint: "৫৭ মুসলিম দেশ", difficulty: "medium", examRelevance: BOTH },
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "রেড ক্রস কবে, কে প্রতিষ্ঠা করেন?", answer: "১৮৬৩ সালে হেনরি ডুনান্ট; সদর দপ্তর জেনেভা", hint: "১৮৬৩ + ডুনান্ট", difficulty: "medium", examRelevance: ["BCS"] },
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "বিশ্বের দীর্ঘতম নদী কোনটি?", answer: "নীল নদ (প্রায় ৬,৬৫০ কিমি)", hint: "মিশরের নদী", difficulty: "easy", examRelevance: BOTH },
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "বিশ্বের ক্ষুদ্রতম দেশ কোনটি?", answer: "ভ্যাটিকান সিটি", hint: "পোপের দেশ", difficulty: "easy", examRelevance: BOTH },
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "প্যারিস জলবায়ু চুক্তি কবে গৃহীত হয়?", answer: "২০১৫ সালে (COP21)", hint: "২০১৫ + প্যারিস", difficulty: "medium", examRelevance: BOTH },
  { subject: "আন্তর্জাতিক বিষয়াবলী", question: "NAM (ন্যাম)-এর পূর্ণরূপ কী? প্রথম সম্মেলন কোথায়?", answer: "Non-Aligned Movement; প্রথম সম্মেলন ১৯৬১ সালে বেলগ্রেডে", hint: "জোটনিরপেক্ষ আন্দোলন", difficulty: "hard", examRelevance: ["BCS"] },

  // ── সাধারণ বিজ্ঞান (12) ───────────────────────────────────
  { subject: "সাধারণ বিজ্ঞান", question: "Newton's first law is also called?", answer: "Law of Inertia", hint: "Objects at rest stay at rest", difficulty: "easy", examRelevance: BOTH },
  { subject: "সাধারণ বিজ্ঞান", question: "Speed of light in vacuum?", answer: "3 × 10⁸ m/s", hint: "Three hundred million metres per second", difficulty: "easy", examRelevance: BOTH },
  { subject: "সাধারণ বিজ্ঞান", question: "Photosynthesis equation?", answer: "6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂", hint: "Sunlight turns CO₂ and water into glucose", difficulty: "medium", examRelevance: BOTH },
  { subject: "সাধারণ বিজ্ঞান", question: "মানবদেহে ক্রোমোজোম সংখ্যা কত?", answer: "৪৬টি (২৩ জোড়া)", hint: "২৩ জোড়া", difficulty: "easy", examRelevance: BOTH },
  { subject: "সাধারণ বিজ্ঞান", question: "রক্তের গ্রুপ কে আবিষ্কার করেন? সার্বজনীন দাতা কোন গ্রুপ?", answer: "কার্ল ল্যান্ডস্টাইনার; সার্বজনীন দাতা O−, গ্রহীতা AB+", hint: "O দেয় সবাইকে, AB নেয় সবার থেকে", difficulty: "medium", examRelevance: BOTH },
  { subject: "সাধারণ বিজ্ঞান", question: "অভিকর্ষজ ত্বরণের মান কত?", answer: "৯.৮ m/s²", hint: "প্রায় ১০", difficulty: "easy", examRelevance: BOTH },
  { subject: "সাধারণ বিজ্ঞান", question: "Au ও Na কোন মৌলের প্রতীক?", answer: "Au = সোনা (Gold), Na = সোডিয়াম (Sodium)", hint: "Aurum থেকে Au, Natrium থেকে Na", difficulty: "medium", examRelevance: BOTH },
  { subject: "সাধারণ বিজ্ঞান", question: "DNA-এর পূর্ণরূপ কী? ডাবল হেলিক্স কে দেন?", answer: "Deoxyribonucleic Acid; ওয়াটসন ও ক্রিক (১৯৫৩)", hint: "১৯৫৩ + ডাবল হেলিক্স", difficulty: "medium", examRelevance: BOTH },
  { subject: "সাধারণ বিজ্ঞান", question: "ভিটামিন C-এর অভাবে কোন রোগ হয়?", answer: "স্কার্ভি; ভিটামিন D পাওয়া যায় সূর্যের আলো থেকে", hint: "C → স্কার্ভি, D → রোদ", difficulty: "easy", examRelevance: BOTH },
  { subject: "সাধারণ বিজ্ঞান", question: "শব্দ সবচেয়ে দ্রুত কিসে চলে — কঠিন, তরল না বায়বীয়?", answer: "কঠিন পদার্থে", hint: "অণু যত ঘন, শব্দ তত দ্রুত", difficulty: "medium", examRelevance: BOTH },
  { subject: "সাধারণ বিজ্ঞান", question: "পানির রাসায়নিক সংকেত ও স্ফুটনাঙ্ক কত?", answer: "H₂O; ১০০°C (সমুদ্রপৃষ্ঠে)", hint: "ফুটন্ত পানি = ১০০ ডিগ্রি", difficulty: "easy", examRelevance: BOTH },
  { subject: "সাধারণ বিজ্ঞান", question: "E = mc² সমীকরণটি কার? কী বোঝায়?", answer: "আইনস্টাইনের; ভর-শক্তি তুল্যতা", hint: "আপেক্ষিকতার জনক", difficulty: "hard", examRelevance: ["BCS"] },

  // ── গাণিতিক যুক্তি (12) ───────────────────────────────────
  { subject: "গাণিতিক যুক্তি", question: "π (পাই)-এর আসন্ন মান কত?", answer: "৩.১৪১৫৯…", hint: "পরিধি ÷ ব্যাস", difficulty: "easy", examRelevance: BOTH },
  { subject: "গাণিতিক যুক্তি", question: "পিথাগোরাসের উপপাদ্য কী?", answer: "a² + b² = c² (সমকোণী ত্রিভুজের অতিভুজের বর্গ)", hint: "সমকোণের বিপরীত বাহু", difficulty: "easy", examRelevance: BOTH },
  { subject: "গাণিতিক যুক্তি", question: "দ্বিঘাত সমীকরণের মূল নির্ণয়ের সূত্র কী?", answer: "x = (−b ± √(b²−4ac)) / 2a", hint: "b²−4ac = নিশ্চায়ক", difficulty: "medium", examRelevance: BOTH },
  { subject: "গাণিতিক যুক্তি", question: "বৃত্তের ক্ষেত্রফল ও পরিধির সূত্র কী?", answer: "ক্ষেত্রফল = πr²; পরিধি = 2πr", hint: "r² থাকলে ক্ষেত্র, 2r থাকলে পরিধি", difficulty: "easy", examRelevance: BOTH },
  { subject: "গাণিতিক যুক্তি", question: "(a + b)²-এর বিস্তৃতি কী?", answer: "a² + 2ab + b²", hint: "মাঝখানে 2ab", difficulty: "easy", examRelevance: BOTH },
  { subject: "গাণিতিক যুক্তি", question: "২০-এর নিচে মৌলিক সংখ্যাগুলো কী কী?", answer: "২, ৩, ৫, ৭, ১১, ১৩, ১৭, ১৯", hint: "মোট ৮টি", difficulty: "medium", examRelevance: BOTH },
  { subject: "গাণিতিক যুক্তি", question: "১২ ও ১৮-এর গ.সা.গু কত?", answer: "৬", hint: "উভয়কে ভাগ করে সবচেয়ে বড় সংখ্যা", difficulty: "medium", examRelevance: BOTH },
  { subject: "গাণিতিক যুক্তি", question: "সরল সুদের সূত্র কী?", answer: "I = Pnr (আসল × সময় × হার)", hint: "P, n, r গুণ করো", difficulty: "medium", examRelevance: ["Bank"] },
  { subject: "গাণিতিক যুক্তি", question: "ত্রিভুজের তিন কোণের সমষ্টি কত?", answer: "১৮০°", hint: "সরলকোণের সমান", difficulty: "easy", examRelevance: BOTH },
  { subject: "গাণিতিক যুক্তি", question: "(a − b)²-এর বিস্তৃতি কী?", answer: "a² − 2ab + b²", hint: "প্লাসের মতো, শুধু মাঝে মাইনাস", difficulty: "easy", examRelevance: BOTH },
  { subject: "গাণিতিক যুক্তি", question: "২০০-এর ১৫% কত?", answer: "৩০", hint: "২০০ × ১৫ ÷ ১০০", difficulty: "easy", examRelevance: ["Bank"] },
  { subject: "গাণিতিক যুক্তি", question: "গড় ১০-এর দুটি সংখ্যার একটি ৬ হলে অপরটি কত?", answer: "১৪ (কারণ ৬ + ১৪ = ২০)", hint: "মোট থেকে জানাটা বাদ দাও", difficulty: "medium", examRelevance: ["Bank"] },

  // ── তথ্য ও যোগাযোগ প্রযুক্তি (12) ─────────────────────────
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "CPU-এর পূর্ণরূপ কী?", answer: "Central Processing Unit", hint: "কম্পিউটারের মস্তিষ্ক", difficulty: "easy", examRelevance: BOTH },
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "RAM ও ROM-এর পার্থক্য কী?", answer: "RAM উদ্বায়ী (বিদ্যুৎ গেলে মুছে যায়); ROM অনুদ্বায়ী (স্থায়ী)", hint: "RAM ভোলে, ROM মনে রাখে", difficulty: "easy", examRelevance: BOTH },
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "1 KB = কত byte? 1 GB = কত MB?", answer: "1 KB = 1024 byte; 1 GB = 1024 MB", hint: "সব ১০২৪-এর খেলা", difficulty: "easy", examRelevance: BOTH },
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "কম্পিউটারের জনক কে? প্রথম প্রোগ্রামার কে?", answer: "চার্লস ব্যাবেজ; অ্যাডা লাভলেস", hint: "ব্যাবেজের ইঞ্জিন, অ্যাডার প্রোগ্রাম", difficulty: "medium", examRelevance: BOTH },
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "WWW কে, কবে উদ্ভাবন করেন?", answer: "টিম বার্নার্স-লি, ১৯৮৯ সালে", hint: "১৯৮৯ + CERN", difficulty: "medium", examRelevance: BOTH },
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "HTTP ও HTTPS-এর পোর্ট নম্বর কত?", answer: "HTTP = 80, HTTPS = 443", hint: "৮০ খোলা, ৪৪৩ সুরক্ষিত", difficulty: "medium", examRelevance: ["Bank"] },
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "দশমিক ১০-এর বাইনারি মান কত?", answer: "1010", hint: "৮ + ২", difficulty: "medium", examRelevance: BOTH },
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "ওপেন সোর্স অপারেটিং সিস্টেমের উদাহরণ দাও।", answer: "Linux (লিনাস টরভাল্ডস, ১৯৯১)", hint: "পেঙ্গুইনের OS", difficulty: "medium", examRelevance: BOTH },
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "IPv4 ঠিকানা কত বিটের?", answer: "৩২ বিটের (যেমন 192.168.0.1)", hint: "৪টি অক্টেট × ৮ বিট", difficulty: "hard", examRelevance: ["Bank"] },
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "ইমেইলের উদ্ভাবক কে?", answer: "রে টমলিনসন (@ চিহ্নের ব্যবহারকারী)", hint: "@ চিহ্নের জনক", difficulty: "hard", examRelevance: ["BCS"] },
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "LAN-এর পূর্ণরূপ কী?", answer: "Local Area Network", hint: "ছোট এলাকার নেটওয়ার্ক", difficulty: "easy", examRelevance: BOTH },
  { subject: "তথ্য ও যোগাযোগ প্রযুক্তি", question: "মডেম কী?", answer: "Modulator-Demodulator: ডিজিটাল সংকেতকে অ্যানালগে ও ফেরত রূপান্তরকারী যন্ত্র", hint: "Mo + Dem = Modem", difficulty: "medium", examRelevance: BOTH },

  // ── মানসিক দক্ষতা (12) ────────────────────────────────────
  { subject: "মানসিক দক্ষতা", question: "ধারাটির পরের সংখ্যা: ২, ৪, ৮, ১৬, …?", answer: "৩২ (প্রতিটি দ্বিগুণ)", hint: "×২ করে বাড়ছে", difficulty: "easy", examRelevance: BOTH },
  { subject: "মানসিক দক্ষতা", question: "ধারাটির পরের সংখ্যা: ১, ৪, ৯, ১৬, …?", answer: "২৫ (বর্গসংখ্যা: 1², 2², 3², 4², 5²)", hint: "বর্গের ধারা", difficulty: "easy", examRelevance: BOTH },
  { subject: "মানসিক দক্ষতা", question: "বিজোড়টি বের করো: আপেল, আম, আলু, কলা", answer: "আলু (সবজি, বাকিগুলো ফল)", hint: "কোনটি ফল নয়?", difficulty: "easy", examRelevance: BOTH },
  { subject: "মানসিক দক্ষতা", question: "CAT = 24 হলে DOG = কত? (A=1, B=2…)", answer: "২৬ (D=4, O=15, G=7; যোগ = ২৬)", hint: "অক্ষরের অবস্থান যোগ করো", difficulty: "medium", examRelevance: ["Bank"] },
  { subject: "মানসিক দক্ষতা", question: "উত্তর দিকে মুখ করে ডানে ঘুরলে কোন দিক?", answer: "পূর্ব দিক", hint: "ঘড়ির কাঁটার দিকে ৯০°", difficulty: "easy", examRelevance: BOTH },
  { subject: "মানসিক দক্ষতা", question: "রহিমের বাবার একমাত্র ছেলে রহিম হলে, রহিমের বাবা রহিমের কে?", answer: "বাবা", hint: "একমাত্র ছেলে মানেই সে নিজে", difficulty: "medium", examRelevance: BOTH },
  { subject: "মানসিক দক্ষতা", question: "পরের দিন: সোম, বুধ, শুক্র, …?", answer: "রবিবার (প্রতি ২ দিন পর)", hint: "+২ দিনের ধারা", difficulty: "easy", examRelevance: BOTH },
  { subject: "মানসিক দক্ষতা", question: "আয়নায় একই দেখায় এমন ৩টি বড় হাতের অক্ষর লেখো।", answer: "যেমন A, H, I (আরও: M, O, T, U, V, W, X, Y)", hint: "ডান-বাম প্রতিসম অক্ষর", difficulty: "medium", examRelevance: ["Bank"] },
  { subject: "মানসিক দক্ষতা", question: "বই : পৃষ্ঠা = দেয়াল : ___?", answer: "ইট (বই পৃষ্ঠায় গঠিত, দেয়াল ইটে)", hint: "অংশের সম্পর্ক", difficulty: "medium", examRelevance: BOTH },
  { subject: "মানসিক দক্ষতা", question: "লিপ ইয়ারে ফেব্রুয়ারি মাস কত দিনে?", answer: "২৯ দিনে", hint: "৪ দিয়ে ভাগ যায় এমন বছর", difficulty: "easy", examRelevance: BOTH },
  { subject: "মানসিক দক্ষতা", question: "৫টি কলমের দাম ৪৫ টাকা হলে ৮টির দাম কত?", answer: "৭২ টাকা (প্রতিটি ৯ টাকা)", hint: "ঐকিক নিয়ম", difficulty: "easy", examRelevance: ["Bank"] },
  { subject: "মানসিক দক্ষতা", question: "ঘড়িতে ৩:০০ বাজলে ঘণ্টা ও মিনিটের কাঁটার কোণ কত?", answer: "৯০° (সমকোণ)", hint: "৩টা মানে সোজা কোণ", difficulty: "medium", examRelevance: ["Bank"] },
];
