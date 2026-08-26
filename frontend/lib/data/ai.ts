// src/lib/ai-data.ts
// Static data backing the AI Tutor and flash-news modal.

import type { FlashNews, PresetPrompt } from "@/lib/types";

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

// ---------------------------------------------------------------- 2️⃣ Flash News samples (consume via /api/flash-news; HomeTab uses api.news())
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