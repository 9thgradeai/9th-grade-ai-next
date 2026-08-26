// Centralized static data for the 9Th-Grade AI dashboard and seed.

export type TabId = "home" | "study-planner" | "practice" | "flashcards" | "ai-solver" | "question-bank" | "progress" | "settings";

export const TABS: { id: TabId; label: string; short: string; bengali: string; icon: string }[] = [
  { id: "home", label: "HOME", short: "HOM", bengali: "হোম", icon: "🏠" },
  { id: "study-planner", label: "PLANNER", short: "PLN", bengali: "প্ল্যানার", icon: "📅" },
  { id: "practice", label: "PRACTICE", short: "PRC", bengali: "প্র্যাকটিস", icon: "⚡" },
  { id: "flashcards", label: "FLASHCARDS", short: "FLC", bengali: "ফ্ল্যাশকার্ড", icon: "🧠" },
  { id: "ai-solver", label: "AI SOLVER", short: "AIS", bengali: "AI সলভার", icon: "🤖" },
  { id: "question-bank", label: "QUESTION BANK", short: "QBK", bengali: "প্রশ্নব্যাংক", icon: "📚" },
  { id: "progress", label: "PROGRESS", short: "PRG", bengali: "প্রোগ্রেস", icon: "📈" },
  { id: "settings", label: "SETTINGS", short: "SET", bengali: "সেটিংস", icon: "⚙️" },
];

// ── Flash news feed (HOME + seed) ────────────────────────
export const FLASH_NEWS = [
  { tag: "EXAM", time: "2h", text: "BCS 51st Preliminary exam date announced: November 15, 2026" },
  { tag: "SYLLABUS", time: "5h", text: "New syllabus update for 46th BCS Written — English Paper revised" },
  { tag: "AI", time: "1d", text: "9th-Grade AI now supports voice-based doubt solving in Bengali" },
  { tag: "MOCK", time: "1d", text: "Adaptive Mock Test v2.0 released with real exam timer interface" },
  { tag: "STREAK", time: "2d", text: "Top weekly streak: 14 days — keep it up, farhan!" },
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