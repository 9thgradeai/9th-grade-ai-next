// Centralized static data for the 9Th-Grade AI dashboard and seed.

export type TabId = "home" | "study-planner" | "practice" | "flashcards" | "question-bank" | "progress" | "mistakes" | "settings";

export const TABS: { id: TabId; label: string; short: string; bengali: string; icon: string }[] = [
  { id: "home", label: "HOME", short: "HOM", bengali: "হোম", icon: "🏠" },
  { id: "practice", label: "PRACTICE", short: "PRC", bengali: "প্র্যাকটিস", icon: "⚡" },
  { id: "question-bank", label: "QUESTION BANK", short: "QBK", bengali: "প্রশ্নব্যাংক", icon: "📚" },
  { id: "mistakes", label: "MISTAKES", short: "MST", bengali: "ভুল বিশ্লেষণ", icon: "🎯" },
  { id: "progress", label: "PROGRESS", short: "PRG", bengali: "প্রোগ্রেস", icon: "📈" },
  { id: "flashcards", label: "FLASHCARDS", short: "FLC", bengali: "ফ্ল্যাশকার্ড", icon: "🧠" },
  { id: "study-planner", label: "PLANNER", short: "PLN", bengali: "প্ল্যানার", icon: "📅" },
  { id: "settings", label: "SETTINGS", short: "SET", bengali: "সেটিংস", icon: "⚙️" },
];

// ── Archive categories (seed) ─────────────────────────────
export const ARCHIVE_CATEGORIES = [
  {
    name: "BCS Preliminary",
    icon: "🎯",
    count: 128,
    yearRange: "1982 – 2026",
    status: "ACTIVE",
    accent: "emerald",
  },
  {
    name: "BCS Written",
    icon: "📄",
    count: 96,
    yearRange: "1990 – 2026",
    status: "AVAILABLE",
    accent: "sky",
  },
  {
    name: "Teacher Recruitment",
    icon: "👨‍🏫",
    count: 74,
    yearRange: "2005 – 2026",
    status: "ACTIVE",
    accent: "yellow",
  },
  {
    name: "Bank Jobs",
    icon: "🏦",
    count: 210,
    yearRange: "2008 – 2026",
    status: "NEW",
    accent: "purple",
  },
];

// ── Question bank filters ────────────────────────────────
export const QUESTION_BANK_CATEGORIES = [
  { label: "বাংলা ভাষা ও সাহিত্য", count: 1245 },
  { label: "English Language and Literature", count: 980 },
  { label: "বাংলাদেশ বিষয়াবলি", count: 1100 },
  { label: "আন্তর্জাতিক বিষয়াবলী", count: 695 },
  { label: "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা", count: 420 },
  { label: "সাধারণ বিজ্ঞান", count: 1120 },
  { label: "কম্পিউটার ও তথ্য প্রযুক্তি", count: 580 },
  { label: "গাণিতিক যুক্তি", count: 764 },
  { label: "মানসিক দক্ষতা", count: 532 },
  { label: "নৈতিকতা, মূল্যবোধ ও সু-শাসন", count: 310 },
];