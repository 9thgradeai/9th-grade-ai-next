// Centralized mock data for the 9Th-Grade AI dashboard.

export type TabId = "home" | "study-planner" | "practice" | "flashcards" | "ai-solver" | "question-bank" | "progress" | "offline";

export const TABS: { id: TabId; label: string; short: string; bengali: string; icon: string }[] = [
  { id: "home", label: "HOME", short: "HOM", bengali: "হোম", icon: "🏠" },
  { id: "study-planner", label: "PLANNER", short: "PLN", bengali: "প্ল্যানার", icon: "📅" },
  { id: "practice", label: "PRACTICE", short: "PRC", bengali: "প্র্যাকটিস", icon: "⚡" },
  { id: "flashcards", label: "FLASHCARDS", short: "FLC", bengali: "ফ্ল্যাশকার্ড", icon: "🧠" },
  { id: "ai-solver", label: "AI SOLVER", short: "AIS", bengali: "AI সলভার", icon: "🤖" },
  { id: "question-bank", label: "QUESTION BANK", short: "QBK", bengali: "প্রশ্নব্যাংক", icon: "📚" },
  { id: "progress", label: "PROGRESS", short: "PRG", bengali: "প্রোগ্রেস", icon: "📈" },
  { id: "offline", label: "OFFLINE", short: "OFL", bengali: "অফলাইন", icon: "📥" },
];

// ── Quick action grid (HOME) ─────────────────────────────
export const QUICK_ACTIONS = [
  { label: "Archive", icon: "🗄️", color: "text-emerald-500" },
  { label: "Quick Practice", icon: "⚡", color: "text-yellow-400" },
  { label: "Mock Test", icon: "📝", color: "text-sky-400" },
  { label: "চর্চা AI", icon: "🤖", color: "text-purple-400" },
  { label: "My Prep", icon: "📋", color: "text-rose-400" },
  { label: "Question Bank", icon: "📚", color: "text-emerald-400" },
  { label: "History", icon: "🕘", color: "text-orange-400" },
  { label: "Flash News", icon: "📰", color: "text-cyan-400" },
];

// ── Upcoming exam banner ────────────────────────────────
export const UPCOMING_EXAM = {
  name: "BCS Preliminary 51st",
  date: "2026-11-15T10:00:00",
  papers: "2 Papers • 400 Marks",
  syllabus: "Complete BCS Prelim Syllabus",
};

// ── Flash news feed (HOME) ─────────────────────────────
export const FLASH_NEWS = [
  { tag: "EXAM", time: "2h", text: "BCS 51st Preliminary exam date announced: November 15, 2026" },
  { tag: "SYLLABUS", time: "5h", text: "New syllabus update for 46th BCS Written — English Paper revised" },
  { tag: "AI", time: "1d", text: "চর্চা AI now supports voice-based doubt solving in Bengali" },
  { tag: "MOCK", time: "1d", text: "Adaptive Mock Test v2.0 released with real exam timer interface" },
  { tag: "STREAK", time: "2d", text: "Top weekly streak: 14 days — keep it up, farhan!" },
];

// ── Progress gauge (HOME) ─────────────────────────────
export const DASHBOARD_STATS = {
  completion: 1, // percent
  points: 91.6,
  exams: 52,
  rank: 25,
  streak: 0,
  questionsAnswered: 1243,
  accuracy: 71,
};

// ── Archive categories ────────────────────────────────
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

// ── Subjects for practice ─────────────────────────────
export const SUBJECTS = [
  { name: "বাংলা ভাষা ও সাহিত্য", icon: "📖", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { name: "English Language and Literature", icon: "📚", color: "text-sky-400", bg: "bg-sky-500/10" },
  { name: "বাংলাদেশ বিষয়াবলি", icon: "🇧🇩", color: "text-green-400", bg: "bg-green-500/10" },
  { name: "আন্তর্জাতিক বিষয়াবলী", icon: "🌍", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { name: "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা", icon: "🗺️", color: "text-teal-400", bg: "bg-teal-500/10" },
  { name: "সাধারণ বিজ্ঞান", icon: "🔬", color: "text-purple-400", bg: "bg-purple-500/10" },
  { name: "কম্পিউটার ও তথ্য প্রযুক্তি", icon: "💻", color: "text-indigo-400", bg: "bg-indigo-500/10" },
  { name: "গাণিতিক যুক্তি", icon: "🧮", color: "text-amber-400", bg: "bg-amber-500/10" },
  { name: "মানসিক দক্ষতা", icon: "🧠", color: "text-rose-400", bg: "bg-rose-500/10" },
  { name: "নৈতিকতা, মূল্যবোধ ও সু-শাসন", icon: "⚖️", color: "text-emerald-500", bg: "bg-emerald-500/10" },
];

// ── Topic trees for the drawer ─────────────────────────
export const TOPIC_TREES: Record<string, { name: string; subTopics: { name: string; questions: string }[] }[]> = {
  "বাংলা ভাষা ও সাহিত্য": [
    {
      name: "ভাষা (১৫ নম্বর)",
      subTopics: [
        { name: "প্রয়োগ-অপপ্রয়োগ, বানান ও বাক্য শুদ্ধি", questions: "45/12K" },
        { name: "পরিভাষা, সমার্থক ও বিপরীতার্থক শব্দ", questions: "32/8.2K" },
        { name: "ধ্বনি, বর্ণ, শব্দ, পদ, বাক্য, প্রত্যয়, সন্ধি ও সমাস", questions: "55/15K" },
      ],
    },
    {
      name: "সাহিত্য (১৫ নম্বর)",
      subTopics: [
        { name: "প্রাচীন ও মধ্যযুগ (০৫ নম্বর)", questions: "28/7.1K" },
        { name: "আধুনিক যুগ (১৮০০-বর্তমান পর্যন্ত) (১০ নম্বর)", questions: "52/14K" },
      ],
    },
  ],
  "English Language and Literature": [
    {
      name: "PART-I: Language (15 Marks)",
      subTopics: [
        { name: "A. Parts of Speech", questions: "42/11K" },
        { name: "B. Idioms & Phrases", questions: "35/8.8K" },
        { name: "C. Clauses", questions: "28/7.2K" },
        { name: "D. Corrections", questions: "38/9.6K" },
        { name: "E. Sentences & Transformations", questions: "32/8.1K" },
        { name: "F. Words", questions: "45/12K" },
        { name: "G. Composition", questions: "18/4.5K" },
      ],
    },
    {
      name: "PART-II: Literature (15 Marks)",
      subTopics: [
        { name: "Topic 1: The Anglo-Saxon / Old English Period (450–1066 AD)", questions: "18/4.8K" },
        { name: "Topic 2: The Middle English Period (1066–1500 AD)", questions: "22/5.9K" },
        { name: "Topic 3: The Renaissance Period (1500–1660 AD)", questions: "28/7.4K" },
        { name: "Topic 4: The Neoclassical Period (1660–1798 AD)", questions: "24/6.3K" },
        { name: "Topic 5: The Romantic Period (1798–1837 AD)", questions: "26/6.8K" },
        { name: "Topic 6: The Victorian Period (1837–1901 AD)", questions: "24/6.3K" },
        { name: "Topic 7: The Modern Period (1901–1939 AD)", questions: "22/5.9K" },
        { name: "Topic 8: The Post-Modern & Contemporary Period (1939–Present)", questions: "20/5.3K" },
      ],
    },
  ],
  "বাংলাদেশ বিষয়াবলি": [
    {
      name: "জাতীয় বিষয়াবলি (০৬ নম্বর)",
      subTopics: [
        { name: "প্রাচীনকাল হতে সম-সাময়িক ইতিহাস", questions: "65/18K" },
        { name: "ভাষা আন্দোলন, ১৯৫৪ নির্বাচন, ১৯৬৯ গণ অভ্যুত্থান", questions: "48/13K" },
        { name: "স্বাধীনতা সংগ্রাম ও মহান মুক্তিযুদ্ধ", questions: "72/20K" },
        { name: "মুক্তিযুদ্ধের রণকৌশল ও বৃহৎ শক্তিবর্গের ভূমিকা", questions: "45/12K" },
        { name: "পাকিস্তানী বাহিনীর আত্মসমর্পণ ও বাংলাদেশের অভ্যুদয়", questions: "38/10K" },
      ],
    },
    {
      name: "কৃষি, জনসংখ্যা, অর্থনীতি ও শিল্প (০২+০২+০২+০২ নম্বর)",
      subTopics: [
        { name: "কৃষি সম্পদ: শস্য ও খাদ্য উৎপাদন", questions: "22/5.8K" },
        { name: "জনসংখ্যা, জাতি, গোষ্ঠী ও ক্ষুদ্র নৃগোষ্ঠী", questions: "18/4.7K" },
        { name: "অর্থনীতি: উন্নয়ন পরিকল্পনা, জাতীয় আয়-ব্যয়, দারিদ্র্য বিমোচন", questions: "24/6.3K" },
        { name: "শিল্প ও বাণিজ্য: গার্মেন্টস, বৈদেশিক লেন-দেন, ব্যাংক", questions: "20/5.4K" },
      ],
    },
    {
      name: "সংবিধান, রাজনৈতিক ও সরকার ব্যবস্থা (০৩+০৩+০৩ নম্বর)",
      subTopics: [
        { name: "সংবিধান: প্রস্তাবনা, মৌলিক অধিকার, সংশোধনীসমূহ", questions: "32/8.5K" },
        { name: "রাজনৈতিক দলসমূহ, ক্ষমতাসীন ও বিরোধী দল", questions: "28/7.4K" },
        { name: "সরকার ব্যবস্থা: আইন, শাসন, বিচার, প্রশাসনিক পুনর্বিন্যাস", questions: "35/9.2K" },
      ],
    },
    {
      name: "জাতীয় বিষয়াদি (০২ নম্বর)",
      subTopics: [
        { name: "জাতীয় অর্জন, বিশিষ্ট ব্যক্তিত্ব, প্রতিষ্ঠানসমূহ", questions: "18/4.8K" },
        { name: "জাতীয় পুরস্কার, খেলাধুলা, চলচ্চিত্র, গণমাধ্যম", questions: "15/4.1K" },
      ],
    },
  ],
  "আন্তর্জাতিক বিষয়াবলী": [
    {
      name: "১. বৈশ্বিক ইতিহাস, আঞ্চলিক ব্যবস্থা, ভূ-রাজনীতি (০৫ নম্বর)",
      subTopics: [
        { name: "বৈশ্বিক ইতিহাস", questions: "38/10K" },
        { name: "আঞ্চলিক ও আন্তর্জাতিক ব্যবস্থা", questions: "32/8.5K" },
        { name: "ভূ-রাজনীতি", questions: "28/7.4K" },
      ],
    },
    {
      name: "২. আন্তর্জাতিক নিরাপত্তা ও আন্তরাষ্ট্রীয় ক্ষমতা সম্পর্ক (০৫ নম্বর)",
      subTopics: [
        { name: "আন্তর্জাতিক নিরাপত্তা", questions: "35/9.2K" },
        { name: "আন্তরাষ্ট্রীয় ক্ষমতা সম্পর্ক", questions: "30/7.9K" },
      ],
    },
    {
      name: "৩. বিশ্বের সাম্প্রতিক ও চলমান ঘটনাপ্রবাহ (০৫ নম্বর)",
      subTopics: [
        { name: "সাম্প্রতিক ঘটনাপ্রবাহ", questions: "42/11K" },
        { name: "চলমান ঘটনাপ্রবাহ", questions: "35/9.3K" },
      ],
    },
    {
      name: "৪. আন্তর্জাতিক পরিবেশগত ইস্যু ও কূটনীতি (০৫ নম্বর)",
      subTopics: [
        { name: "আন্তর্জাতিক পরিবেশগত ইস্যু", questions: "28/7.5K" },
        { name: "কূটনীতি", questions: "25/6.6K" },
      ],
    },
    {
      name: "৫. আন্তর্জাতিক সংগঠনসমূহ এবং বৈশ্বিক অর্থনৈতিক প্রতিষ্ঠান (০৫ নম্বর)",
      subTopics: [
        { name: "আন্তর্জাতিক সংগঠনসমূহ", questions: "32/8.4K" },
        { name: "বৈশ্বিক অর্থনৈতিক প্রতিষ্ঠান", questions: "28/7.3K" },
      ],
    },
  ],
  "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা": [
    {
      name: "১. বাংলাদেশ ও অঞ্চলভিত্তিক ভৌগোলিক অবস্থান, সীমানা (০২ নম্বর)",
      subTopics: [
        { name: "পারিবেশিক, আর্থ-সামাজিক ও ভূ-রাজনৈতিক গুরুত্ব", questions: "18/4.8K" },
      ],
    },
    {
      name: "২. অঞ্চলভিত্তিক ভৌত পরিবেশ (ভূ-প্রাকৃতিক), সম্পদের বণ্টন (০২ নম্বর)",
      subTopics: [
        { name: "ভূ-প্রাকৃতিক পরিবেশ", questions: "15/4.1K" },
        { name: "সম্পদের বণ্টন ও গুরুত্ব", questions: "14/3.8K" },
      ],
    },
    {
      name: "৩. বাংলাদেশের পরিবেশ: প্রকৃতি ও সম্পদ, প্রধান চ্যালেঞ্জসমূহ (০২ নম্বর)",
      subTopics: [
        { name: "প্রকৃতি ও সম্পদ", questions: "16/4.3K" },
        { name: "প্রধান চ্যালেঞ্জসমূহ", questions: "14/3.7K" },
      ],
    },
    {
      name: "৪. বাংলাদেশ ও বৈশ্বিক পরিবেশ পরিবর্তন (০২ নম্বর)",
      subTopics: [
        { name: "আবহাওয়া ও জলবায়ু নিয়ামকসমূহের সেক্টরভিত্তিক প্রভাব", questions: "18/4.9K" },
        { name: "স্থানীয়, আঞ্চলিক ও বৈশ্বিক প্রভাব", questions: "15/4.0K" },
      ],
    },
    {
      name: "৫. প্রাকৃতিক দুর্যোগ ও ব্যবস্থাপনা (০২ নম্বর)",
      subTopics: [
        { name: "দুর্যোগের ধরন, প্রকৃতি ও ব্যবস্থাপনা", questions: "14/3.7K" },
      ],
    },
  ],
  "সাধারণ বিজ্ঞান": [
    {
      name: "ভৌত বিজ্ঞান (০৫ নম্বর)",
      subTopics: [
        { name: "পদার্থের অবস্থা, এটমের গঠন, কার্বনের বহুমুখী ব্যবহার", questions: "22/5.9K" },
        { name: "এসিড, ক্ষার, লবণ, পদার্থের ক্ষয়, সাবানের কাজ, ভৌত রাশি ও পরিমাপ", questions: "18/4.8K" },
        { name: "চৌম্বকত্ব, তরanga এবং শব্দ, তাপ ও তাপগতি বিদ্যা, আলোর প্রকৃতি", questions: "24/6.4K" },
        { name: "স্থির এবং চল তড়িৎ, ইলেকট্রনিক্স, আধুনিক পদার্থবিজ্ঞান", questions: "20/5.3K" },
        { name: "শক্তির উৎস এবং এর প্রয়োগ, নবায়নযোগ্য শক্তির উৎস, পারমাণবিক শক্তি, খনিজ উৎস, শক্তির রূপান্তর", questions: "22/5.9K" },
        { name: "আলোক যন্ত্রপাতি, মৌলিক কণা, ধাতব পদার্থ এবং তাদের যৌগসমূহ, অধাতব পদার্থ, জারণ-বিজারণ, তড়িৎ কোষ, অজৈব যৌগ, জৈব যৌগ, তড়িৎ চৌম্বক, ট্রান্সফরমার, এক্সরে, তেজস্ক্রিয়তা", questions: "20/5.3K" },
      ],
    },
    {
      name: "জীব বিজ্ঞান (০৫ নম্বর)",
      subTopics: [
        { name: "পদার্থের জীববিজ্ঞান-বিষয়ক ধর্ম, টিস্যু, জেনেটিকস, জীববৈচিত্র্য", questions: "18/4.8K" },
        { name: "এনিম্যাল ডাইভারসিটি, প্লান্ট ডাইভারসিটি, এনিম্যাল টিস্যু, অর্গান এবং অর্গান সিস্টেম, সালোক সংশ্লেষণ", questions: "18/4.8K" },
        { name: "ভাইরাস, ব্যাকটেরিয়া, জুলোজিক্যাল নমেনক্লেচার, বোটানিক্যাল নমেনক্রেচার, প্রাণিজগৎ, উদ্ভিদ, ফুল, ফল", questions: "16/4.3K" },
        { name: "রক্ত ও রক্ত সঞ্চালন, রক্তচাপ, হৃদপিণ্ড এবং হৃদরোগ, স্নায়ু এবং স্নায়ুরোগ", questions: "16/4.3K" },
        { name: "খাদ্য ও পুষ্টি, ভিটামিন, মাইক্রোবায়োলজি, প্লান্ট নিউট্রেশন, পরাগায়ন", questions: "14/3.7K" },
      ],
    },
    {
      name: "আধুনিক বিজ্ঞান (০৫ নম্বর)",
      subTopics: [
        { name: "পৃথিবী সৃষ্টির ইতিহাস, কসমিক রে, ব্লাক হোল, হিগের কণা, বারিমণ্ডল", questions: "14/3.7K" },
        { name: "টাইড, বায়ুমণ্ডল, টেকটোনিক প্লেট, সাইক্লোন, সুনামি, বিবর্তন, সামুদ্রিক জীবন", questions: "12/3.2K" },
        { name: "মানবদেহ, রোগের কারণ ও প্রতিকার, সংক্রামক রোগ, রোগ জীবাণুর জীবনধারণ", questions: "16/4.3K" },
        { name: "মা ও শিশু স্বাস্থ্য, ইম্যুনাইজেশন এবং ভ্যাকসিনেশন, এইচআইভি, এইডস, টিবি, পোলিও", questions: "14/3.7K" },
        { name: "জোয়ার-ভাটা, এপিকালচার, সেরিকালচার, পিসিকালচার, হর্টিকালচার, ডায়োড, ট্রানজিস্টর, আইসি, আপেক্ষিক তত্তা, ফোটন কণা", questions: "16/4.3K" },
      ],
    },
  ],
  "কম্পিউটার ও তথ্য প্রযুক্তি": [
    {
      name: "কম্পিউটার (১০ নম্বর)",
      subTopics: [
        { name: "পেরিফেরালস: কি-বোর্ড, মাউস, OCR", questions: "18/4.8K" },
        { name: "অঙ্গসংগঠন: CPU, হার্ড ডিস্ক, ALU", questions: "22/5.9K" },
        { name: "পারঙ্গমতা, নম্বর ব্যবস্থা, অপারেটিং সিস্টেম", questions: "20/5.3K" },
        { name: "এমবেডেড কম্পিউটার, ইতিহাস, প্রকারভেদ", questions: "16/4.3K" },
        { name: "কম্পিউটার প্রোগ্রাম, ভাইরাস, ফায়ারওয়াল, ডেটাবেইস", questions: "24/6.4K" },
      ],
    },
    {
      name: "তথ্যপ্রযুক্তি (০৫ নম্বর)",
      subTopics: [
        { name: "ই-কমার্স, সেলুলার ডাটা নেটওয়ার্ক (2G, 3G, 4G)", questions: "14/3.7K" },
        { name: "কম্পিউটার নেটওয়ার্ক, ওয়াই-ফাই, ল্যান, ম্যান", questions: "18/4.8K" },
        { name: "স্মার্টফোন, WWW, ইন্টারনেট, ই-মেইল", questions: "22/5.9K" },
        { name: "ক্লাউড কম্পিউটিং, সোশ্যাল নেটওয়ার্কিং, রোবটিক্স", questions: "20/5.3K" },
        { name: "সাইবার অপরাধ", questions: "12/3.2K" },
      ],
    },
  ],
  "গাণিতিক যুক্তি": [
    {
      name: "বাস্তব সংখ্যা, ল.সা.গু, গ.সা.গু, শতকরা, মুনাফা, অনুপাত, লাভ-ক্ষতি (৪/০৮ নম্বর)",
      subTopics: [
        { name: "বাস্তব সংখ্যা ও ভগ্নাংশ", questions: "35/9.2K" },
        { name: "ল.সা.গু, গ.সা.গু", questions: "28/7.4K" },
        { name: "শতকরা, মুনাফা, অনুপাত, লাভ-ক্ষতি", questions: "42/11K" },
      ],
    },
    {
      name: "বীজগাণিতিক সূত্রাবলি, সমীকরণ, অসমতা (৪/০৮ নম্বর)",
      subTopics: [
        { name: "বীজগাণিতিক সূত্রাবলি", questions: "32/8.4K" },
        { name: "বহুপদী উৎপাদক", questions: "24/6.3K" },
        { name: "সরল ও দ্বিপদী সমীকরণ, অসমতা, সহসমীকরণ", questions: "38/10K" },
      ],
    },
    {
      name: "সূচক ও লগারিদম, সমান্তর ও গুণোত্তর অনুক্রম (০৪ নম্বর)",
      subTopics: [
        { name: "সূচক ও লগারিদম", questions: "28/7.4K" },
        { name: "সমান্তর ও গুণোত্তর অনুক্রম ও ধারা", questions: "24/6.3K" },
      ],
    },
    {
      name: "রেখা, কোণ, ত্রিভুজ, চতুর্ভুজ, বৃত্ত, পরিমিতি (৪/০৮ নম্বর)",
      subTopics: [
        { name: "রেখা, কোণ, ত্রিভুজ সংক্রান্ত উপপাদ্য", questions: "32/8.4K" },
        { name: "চতুর্ভুজ, বৃত্ত সংক্রান্ত উপপাদ্য", questions: "28/7.4K" },
        { name: "পিথাগোরাসের উপপাদ্য, পরিমিতি- সরলক্ষেত্র ও ঘনবস্তু", questions: "35/9.2K" },
      ],
    },
    {
      name: "সেট, বিন্যাস, সমাবেশ, পরিসংখ্যান, সম্ভাব্যতা (৪/০৮ নম্বর)",
      subTopics: [
        { name: "সেট, বিন্যাস ও সমাবেশ", questions: "28/7.4K" },
        { name: "পরিসংখ্যান", questions: "22/5.8K" },
        { name: "সম্ভাব্যতা", questions: "24/6.3K" },
      ],
    },
  ],
  "মানসিক দক্ষতা": [
    {
      name: "১. ভাষাগত যৌক্তিক বিচার (Verbal Reasoning)",
      subTopics: [
        { name: "Verbal Analogies", questions: "45/12K" },
        { name: " syllogism", questions: "32/8.4K" },
        { name: "Blood Relations", questions: "28/7.4K" },
      ],
    },
    {
      name: "২. সমস্যা সমাধান (Problem Solving)",
      subTopics: [
        { name: "Puzzle Solving", questions: "38/10K" },
        { name: "Coding-Decoding", questions: "35/9.2K" },
        { name: "Data Sufficiency", questions: "28/7.4K" },
      ],
    },
    {
      name: "৩. বানান ও ভাষা (Spelling and Language)",
      subTopics: [
        { name: "Spelling Tests", questions: "32/8.4K" },
        { name: "Grammar Usage", questions: "28/7.4K" },
      ],
    },
    {
      name: "৪. যান্ত্রিক দক্ষতা (Mechanical Reasoning)",
      subTopics: [
        { name: "Mechanical Aptitude", questions: "35/9.2K" },
        { name: "Physics-based Problems", questions: "28/7.4K" },
      ],
    },
    {
      name: "৫. স্থানাঙ্ক সম্পর্ক (Space Relation)",
      subTopics: [
        { name: "Spatial Reasoning", questions: "30/7.9K" },
        { name: "Paper Folding & Cutting", questions: "25/6.6K" },
      ],
    },
    {
      name: "৬. সংখ্যাগত ক্ষমতা (Numerical Ability)",
      subTopics: [
        { name: "Number Series", questions: "38/10K" },
        { name: "Arithmetic Problems", questions: "42/11K" },
        { name: "Data Interpretation", questions: "32/8.4K" },
      ],
    },
  ],
  "নৈতিকতা, মূল্যবোধ ও সু-শাসন": [
    {
      name: "Definition of Values and Good Governance",
      subTopics: [
        { name: "Definition of Values and Good Governance", questions: "18/4.8K" },
        { name: "Relation between Values and Good Governance", questions: "15/4.0K" },
      ],
    },
    {
      name: "General Perception of Values and Good Governance",
      subTopics: [
        { name: "General Perception of Values and Good Governance", questions: "16/4.3K" },
        { name: "Importance in the life of an individual as a citizen and in the making of society and national ideals", questions: "22/5.9K" },
      ],
    },
    {
      name: "Impact of Values and Good Governance in national development",
      subTopics: [
        { name: "Impact of Values and Good Governance in national development", questions: "18/4.8K" },
        { name: "How the element of Good Governance and Values can be established in society in a given social context", questions: "15/4.0K" },
      ],
    },
    {
      name: "The benefit of Values and Good Governance and the cost society pays adversely in their absence",
      subTopics: [
        { name: "The benefit of Values and Good Governance", questions: "14/3.7K" },
        { name: "The cost society pays adversely in their absence", questions: "12/3.2K" },
      ],
    },
  ],
};

// Default fallback topics for any subject without a tree
export const DEFAULT_TOPICS = [
  {
    name: "Unit 1: Fundamentals",
    subTopics: [
      { name: "Introduction", questions: "3/335" },
      { name: "Core Concepts", questions: "4/1.5K" },
    ],
  },
  {
    name: "Unit 2: Advanced",
    subTopics: [
      { name: "Case Studies", questions: "2/410" },
      { name: "Practice Sets", questions: "5/890" },
    ],
  },
];

// ── Question bank filters ─────────────────────────────
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

// ── Progress chart data (last 30 days) ───────────────
export const PROGRESS_SERIES = [
  40, 52, 47, 61, 58, 70, 66, 74, 71, 82, 78, 85, 80, 88, 84, 91, 86, 83, 89, 94, 90, 87, 92, 88, 95, 91, 89, 93, 96, 91.6,
];

// ── Subject performance reports ───────────────────────
export const SUBJECT_REPORTS = [
  { name: "বাংলা ভাষা ও সাহিত্য", score: 86, attempted: 320, correct: 275, trend: "+8%" },
  { name: "English Language and Literature", score: 72, attempted: 245, correct: 176, trend: "+12%" },
  { name: "বাংলাদেশ বিষয়াবলি", score: 91, attempted: 412, correct: 375, trend: "+5%" },
  { name: "আন্তর্জাতিক বিষয়াবলী", score: 64, attempted: 198, correct: 127, trend: "+15%" },
  { name: "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা", score: 78, attempted: 156, correct: 122, trend: "+6%" },
  { name: "সাধারণ বিজ্ঞান", score: 82, attempted: 210, correct: 172, trend: "+9%" },
  { name: "কম্পিউটার ও তথ্য প্রযুক্তি", score: 75, attempted: 180, correct: 135, trend: "+7%" },
  { name: "গাণিতিক যুক্তি", score: 69, attempted: 240, correct: 166, trend: "+11%" },
  { name: "মানসিক দক্ষতা", score: 88, attempted: 233, correct: 205, trend: "+9%" },
  { name: "নৈতিকতা, মূল্যবোধ ও সু-শাসন", score: 74, attempted: 120, correct: 89, trend: "+4%" },
];
