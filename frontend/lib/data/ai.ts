// src/lib/ai-data.ts
// Static data backing the AI Tutor, recommendations, and flash-news modal.

import type { FlashNews, Recommendation, PresetPrompt } from "@/lib/types";

// ---------------------------------------------------------------- 1️⃣ AI Tutor: preset quick prompts
export const PRESET_PROMPTS: PresetPrompt[] = [
  {
    id: "physics-formulas",
    label: {
      bn: "৯ম শ্রেণীর পদার্থবিজ্ঞানের গতি সূত্রগুলো ব্যাখ্যা করো",
      en: "Explain the formula of motion for class 9 physics",
    },
  },
  {
    id: "math-shortcuts",
    label: {
      bn: "উচ্চতর গণিতের ত্রিকোণমিতির শর্টকাট সূত্র দাও",
      en: "Give me the shortcut formulas for trigonometry in Higher Math",
    },
  },
  {
    id: "chemistry-table",
    label: {
      bn: "রসায়নের পর্যায় সারণি মনে রাখার সহজ উপায়",
      en: "Easy trick to remember the periodic table",
    },
  },
];

// ---------------------------------------------------------------- 2️⃣ AI Recommendation Engine
export const RECOMMENDATIONS: Recommendation[] = [
  {
    id: "higher-math",
    subject: { bn: "উচ্চতর গণিত", en: "Higher Math" },
    metric: "accuracy",
    accuracy: 45,
    title: {
      bn: "উচ্চতর গণিত রিভিশন",
      en: "Higher Math Revision",
    },
    description: {
      bn: "আপনার উচ্চতর গণিত বিষয়ের নির্ভুলতা মাত্র ৪৫%। আজই ১৫টি রিভিশন প্রশ্ন দিয়ে দুর্বলতা ঢাকা যাক!",
      en: "Your accuracy in Higher Math is only 45%. Close the gap with 15 targeted revision questions today!",
    },
    cta: {
      bn: "9Th-Grade AI দিয়ে ১৫টি রিভিশন প্রশ্ন শুরু করুন",
      en: "Start 15 Revision Questions with 9Th-Grade AI",
    },
  },
  {
    id: "biology",
    subject: { bn: "জীববিদ্যা", en: "Biology" },
    metric: "accuracy",
    accuracy: 58,
    title: {
      bn: "জীববিদ্যা মাস্টারি",
      en: "Biology Mastery",
    },
    description: {
      bn: "আপনার জীববিদ্যার নির্ভুলতা ৫৮% — ১০টি ফ্ল্যাশকার্ড দিয়ে পড়াশোনা করুন।",
      en: "Your Biology accuracy is 58%. Try 10 flashcards to lock in the concepts.",
    },
    cta: {
      bn: "10টি স্মার্ট ফ্ল্যাশকার্ড শুরু করুন",
      en: "Start 10 Smart Flashcards",
    },
  },
];

// ---------------------------------------------------------------- 3️⃣ Flash News samples (used by HomeTab carousel AND FlashNewsModal)
export const FLASH_NEWS_ITEMS: FlashNews[] = [
  {
    id: "bcs-51-dates",
    tag: "EXAM",
    title: {
      bn: "বিসিs ৫১শ প্রিলিমিনারির তারিখ ঘোষণা",
      en: "BCS Preliminary 51st Date Announced",
    },
    text: "বিসিs ৫১শ প্রিলিমিনারি পরীক্ষা অনুষ্ঠিত হবে ১৫ নভেম্বর, ২০২৬।",
    time: "2h",
    category: { bn: "পরীক্ষা", en: "Exam" },
    date: "2026-08-14",
    readTime: 1,
    full:
      "বিসিs ৫১শ প্রিলিমিনারি পরীক্ষা অনুষ্ঠিত হবে ১৫ নভেম্বর, ২০২৬ তারিখে। পরীক্ষাটি ২টি পত্রে ৪০০ নম্বরে অনুষ্ঠিত হবে। ফলাফল আসবে ৩০ নভেম্বরের মধ্যে। প্রশ্নপত্রের বিষয়বস্তু আরও আপডেটেড হয়েছে — বিশেষ করে আন্তর্জাতিক সম্পর্ক ও অর্থনৈতিক বিভাগে।",
  },
  {
    id: "syllabus-update",
    tag: "SYLLABUS",
    title: {
      bn: "৪৬শ BCS Written — English Paper রিভিউ করা হয়েছে",
      en: "46th BCS Written — English Paper Revised",
    },
    text: "৪৬শ BCS Written এর English Paper সিলেবাস আপডেট করা হয়েছে।",
    time: "5h",
    category: { bn: "সিলেবাস", en: "Syllabus" },
    date: "2026-08-13",
    readTime: 2,
    full:
      "৪৬শ বাংলাদেশ কৃষক সেবা পরীক্ষার রচনাভাগ ও অপরিবর্তীত অংশগুলো পর্যালোচনা করা হয়েছে। এখন থেকে পরীক্ষায় দুঈটি ভাষার (বাংলা + আন্তর্জাতিক ইংরেজি) প্রশ্ন থাকবে। আপডেটেড সিলেবাসটি 9Th-Grade AI-এর ভিতরে প্রতিফলিত হয়েছে।",
  },
  {
    id: "ai-voice",
    tag: "AI",
    title: {
      bn: "9th-Grade AI কণ্ঠস্বরে ভাষা বাংলায় সমর্থন যোগ করেছে",
      en: "9th-Grade AI Now Supports Bengali Voice",
    },
    text: "9th-Grade AI কণ্ঠস্বরে ভাষা বাংলায় সমর্থন যোগ করেছে — আপনি বাংলায় জিজ্ঞাসা করতে পারেন।",
    time: "1d",
    category: { bn: "AI", en: "AI" },
    date: "2026-08-12",
    readTime: 1,
    full:
      "AI টিউটর এখন বাংলাদেশি ইন্টোনেশন ও স্বর ব্যবহার করে আপনার প্রশ্নের উত্তর দিতে পারে। এই ফিচারটি ব্যবহার করতে শুধু '9th-Grade AI'-এর মাইক্রোফোন আইকনে ক্লিক করুন।",
  },
];