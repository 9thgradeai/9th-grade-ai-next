// BCS preliminary syllabus structure rendered by the landing SyllabusExplorer.
// Question counts reflect the seeded question bank; study hours are editorial
// estimates for planning purposes. No personal progress data lives here —
// authenticated progress comes from /api/progress.

import {
  BookOpen,
  Globe,
  Brain,
  TrendingUp,
  Map,
  FlaskConical,
  Cpu,
  Calculator,
  Zap,
  Scale,
} from "lucide-react";

export const SYLLABUS_ICONS = {
  book: BookOpen,
  globe: Globe,
  brain: Brain,
  trend: TrendingUp,
  map: Map,
  flask: FlaskConical,
  cpu: Cpu,
  calculator: Calculator,
  zap: Zap,
  scale: Scale,
} as const;

export type SyllabusTopic = {
  name: string;
  questions: number;
  estimatedHours: number;
};

export type SyllabusCategory = {
  category: string;
  icon: keyof typeof SYLLABUS_ICONS;
  topics: SyllabusTopic[];
};

export const SYLLABUS_DATA: SyllabusCategory[] = [
  {
    category: "১. বাংলা ভাষা ও সাহিত্য (30 Marks)",
    icon: "book",
    topics: [
      {
        name: "ভাষা (১৫ নম্বর): প্রয়োগ-অপপ্রয়োগ, বানান ও বাক্য শুদ্ধি, পরিভাষা, সমার্থক ও বিপরীতার্থক শব্দ, ধ্বনি, বর্ণ, শব্দ, পদ, বাক্য, প্রত্যয়, সন্ধি ও সমাস",
        questions: 335,
        estimatedHours: 12,
      },
      {
        name: "সাহিত্য (১৫ নম্বর): প্রাচীন ও মধ্যযুগ (০৫ নম্বর)",
        questions: 198,
        estimatedHours: 8,
      },
      {
        name: "সাহিত্য (১৫ নম্বর): আধুনিক যুগ (১৮০০-বর্তমান পর্যন্ত) (১০ নম্বর)",
        questions: 267,
        estimatedHours: 10,
      },
    ],
  },
  {
    category: "২. English Language and Literature (30 Marks)",
    icon: "globe",
    topics: [
      {
        name: "PART-I: Language (15 Marks): Parts of Speech, Idioms & Phrases, Clauses, Corrections, Sentences & Transformations, Words, Composition",
        questions: 520,
        estimatedHours: 16,
      },
      {
        name: "PART-II: Literature (15 Marks): Anglo-Saxon, Middle English, Renaissance, Neoclassical, Romantic, Victorian, Modern, Post-Modern & Contemporary",
        questions: 520,
        estimatedHours: 24,
      },
    ],
  },
  {
    category: "৩. বাংলাদেশ বিষয়াবলি (25 Marks)",
    icon: "brain",
    topics: [
      {
        name: "জাতীয় বিষয়াবলি (06 Marks): প্রাচীনকাল হতে সম-সাময়িক ইতিহাস, ভাষা আন্দোলন, ১৯৫৪ নির্বাচন, ১৯৬৯ গণঅভ্যুত্থান, ১৯৭১ মুক্তিযুদ্ধ",
        questions: 456,
        estimatedHours: 16,
      },
      {
        name: "কৃষিজ সম্পদ (02 Marks): শস্য উৎপাদন, বহুমুখীকরণ, খাদ্য ব্যবস্থাপনা",
        questions: 142,
        estimatedHours: 5,
      },
      {
        name: "জনসংখ্যা (02 Marks): জনশুমারি, জাতি, গোষ্ঠী ও ক্ষুদ্র নৃগোষ্ঠী",
        questions: 125,
        estimatedHours: 5,
      },
      {
        name: "বাংলাদেশের অর্থনীতি (02 Marks): উন্নয়ন পরিকল্পনা, জাতীয় আয়-ব্যয়, বার্ষিক উন্নয়ন কর্মসূচি, দারিদ্র্য বিমোচন",
        questions: 167,
        estimatedHours: 6,
      },
      {
        name: "শিল্প ও বাণিজ্য (02 Marks): শিল্প উৎপাদন, পণ্য আমদানি-রপ্তানি, গার্মেন্টস শিল্প, ব্যাংক ও বীমা ব্যবস্থাপনা",
        questions: 189,
        estimatedHours: 6,
      },
      {
        name: "সংবিধান (03 Marks): প্রস্তাবনা, বৈশিষ্ট্য, মৌলিক অধিকার, রাষ্ট্র পরিচালনার মূলনীতি, সংশোধনীসমূহ",
        questions: 334,
        estimatedHours: 12,
      },
      {
        name: "রাজনৈতিক ব্যবস্থা (03 Marks): রাজনৈতিক দল, ভূমিকা, শাসক ও বিরোধী দল, সুশীল সমাজ ও চাপ সৃষ্টিকারী গোষ্ঠী",
        questions: 178,
        estimatedHours: 6,
      },
      {
        name: "সরকার ব্যবস্থা (03 Marks): আইন, শাসন ও বিচার বিভাগ, নীতি নির্ধারণ, প্রশাসনিক ব্যবস্থাপনা, স্থানীয় সরকার",
        questions: 210,
        estimatedHours: 8,
      },
      {
        name: "জাতীয় বিষয়াদি (02 Marks): জাতীয় অর্জন, বিশিষ্ট ব্যক্তিত্ব, গুরুত্বপূর্ণ প্রতিষ্ঠান, পুরস্কার, খেলাধুলা, চলচ্চিত্র ও গণমাধ্যম",
        questions: 195,
        estimatedHours: 7,
      },
    ],
  },
  {
    category: "৪. আন্তর্জাতিক বিষয়াবলি (25 Marks)",
    icon: "trend",
    topics: [
      {
        name: "বৈশ্বিক ইতিহাস, আঞ্চলিক ও আন্তর্জাতিক ব্যবস্থা, ভূ-রাজনীতি (05 Marks)",
        questions: 389,
        estimatedHours: 14,
      },
      {
        name: "আন্তর্জাতিক নিরাপত্তা ও আন্তরাষ্ট্রীয় ক্ষমতা সম্পর্ক (05 Marks)",
        questions: 234,
        estimatedHours: 8,
      },
      {
        name: "বিশ্বের সাম্প্রতিক ও চলমান ঘটনাপ্রবাহ (05 Marks)",
        questions: 412,
        estimatedHours: 12,
      },
      {
        name: "আন্তর্জাতিক পরিবেশগত ইস্যু ও কূটনীতি (05 Marks)",
        questions: 178,
        estimatedHours: 6,
      },
      {
        name: "আন্তর্জাতিক সংগঠনসমূহ ও বৈশ্বিক অর্থনৈতিক প্রতিষ্ঠানাদি (05 Marks)",
        questions: 245,
        estimatedHours: 10,
      },
    ],
  },
  {
    category: "৫. ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা (10 Marks)",
    icon: "map",
    topics: [
      {
        name: "বাংলাদেশ ও অঞ্চলভিত্তিক ভৌগোলিক অবস্থান, সীমানা, পারিবেশিক, আর্থ-সামাজিক ও ভূ-রাজনৈতিক গুরুত্ব (02 Marks)",
        questions: 156,
        estimatedHours: 6,
      },
      {
        name: "অঞ্চলভিত্তিক ভৌত পরিবেশ (ভূ-প্রাকৃতিক), সম্পদের বণ্টন ও গুরুত্ব (02 Marks)",
        questions: 134,
        estimatedHours: 5,
      },
      {
        name: "বাংলাদেশের পরিবেশ: প্রকৃতি ও সম্পদ, প্রধান চ্যালেঞ্জসমূহ (02 Marks)",
        questions: 145,
        estimatedHours: 6,
      },
      {
        name: "বাংলাদেশ ও বৈশ্বিক পরিবেশ পরিবর্তন: আবহাওয়া ও জলবায়ু নিয়ামকসমূহের সেক্টরভিত্তিক প্রভাব (02 Marks)",
        questions: 112,
        estimatedHours: 4,
      },
      {
        name: "প্রাকৃতিক দুর্যোগ ও ব্যবস্থাপনা: দুর্যোগের ধরন, প্রকৃতি ও ব্যবস্থাপনা (02 Marks)",
        questions: 98,
        estimatedHours: 4,
      },
    ],
  },
  {
    category: "৬. সাধারণ বিজ্ঞান (15 Marks)",
    icon: "flask",
    topics: [
      {
        name: "ভৌত বিজ্ঞান (05 Marks): পদার্থের অবস্থা, এটম, এসিড-ক্ষার-লবণ, তরঙ্গ ও শব্দ, তাপ, আলো, স্থির ও চল তড়িৎ, আধুনিক পদার্থবিজ্ঞান",
        questions: 312,
        estimatedHours: 10,
      },
      {
        name: "জীব বিজ্ঞান (05 Marks): টিস্যু, জেনেটিকস, জীববৈচিত্র্য, সালোক সংশ্লেষণ, ভাইরাস, ব্যাকটেরিয়া, রক্ত সঞ্চালন, খাদ্য ও পুষ্টি",
        questions: 289,
        estimatedHours: 10,
      },
      {
        name: "আধুনিক বিজ্ঞান (05 Marks): পৃথিবী সৃষ্টির ইতিহাস, কসমিক রে, ব্ল্যাক হোল, বায়ুমণ্ডল, টেকটোনিক প্লেট, সংক্রামক রোগ, ইম্যুনাইজেশন",
        questions: 245,
        estimatedHours: 8,
      },
    ],
  },
  {
    category: "৭. কম্পিউটার ও তথ্য প্রযুক্তি (15 Marks)",
    icon: "cpu",
    topics: [
      {
        name: "কম্পিউটার (10 Marks): পেরিফেরালস, কম্পিউটারের অঙ্গসংগঠন (CPU, ALU), পারঙ্গমতা, নম্বর ব্যবস্থা, মেমোরি",
        questions: 298,
        estimatedHours: 12,
      },
      {
        name: "কম্পিউটার (10 Marks): অপারেটিং সিস্টেমস, এমবেডেড কম্পিউটার, ইতিহাস, প্রকারভেদ, প্রোগ্রাম, ভাইরাস, ডেটাবেইস",
        questions: 267,
        estimatedHours: 10,
      },
      {
        name: "তথ্যপ্রযুক্তি (05 Marks): ই-কমার্স, সেলুলার নেটওয়ার্ক (2G/3G/4G/5G), নেটওয়ার্ক (LAN/MAN/WiFi), ক্লাউড কম্পিউটিং, সাইবার অপরাধ",
        questions: 234,
        estimatedHours: 8,
      },
    ],
  },
  {
    category: "৮. গাণিতিক যুক্তি (20 Marks)",
    icon: "calculator",
    topics: [
      {
        name: "বাস্তব সংখ্যা, ল.সা.গু, গ.সা.গু, শতকরা, সরল ও যৌগিক মুনাফা, অনুপাত ও সমানুপাত, লাভ ও ক্ষতি (04 Marks)",
        questions: 512,
        estimatedHours: 18,
      },
      {
        name: "বীজগাণিতিক সূত্রাবলি, বহুপদী উৎপাদক, সরল ও দ্বিপদী সমীকরণ, অসমতা, সহসমীকরণ (04 Marks)",
        questions: 367,
        estimatedHours: 14,
      },
      {
        name: "সূচক ও লগারিদম, সমান্তর ও গুণোত্তর অনুক্রম ও ধারা (04 Marks)",
        questions: 234,
        estimatedHours: 10,
      },
      {
        name: "রেখা, কোণ, ত্রিভুজ ও চতুর্ভুজ সংক্রান্ত উপপাদ্য, পিথাগোরাসের উপপাদ্য, বৃত্ত, পরিমিতি (04 Marks)",
        questions: 298,
        estimatedHours: 12,
      },
      {
        name: "সেট, বিন্যাস ও সমাবেশ, পরিসংখ্যান ও সম্ভাব্যতা (04 Marks)",
        questions: 245,
        estimatedHours: 10,
      },
    ],
  },
  {
    category: "৯. মানসিক দক্ষতা (15 Marks)",
    icon: "zap",
    topics: [
      { name: "ভাষাগত যৌক্তিক বিচার (Verbal Reasoning)", questions: 423, estimatedHours: 12 },
      { name: "সমস্যা সমাধান (Problem Solving)", questions: 367, estimatedHours: 10 },
      { name: "বানান ও ভাষা (Spelling and Language)", questions: 289, estimatedHours: 10 },
      { name: "যান্ত্রিক দক্ষতা (Mechanical Reasoning)", questions: 312, estimatedHours: 11 },
      { name: "স্থানাঙ্ক সম্পর্ক (Space Relation)", questions: 198, estimatedHours: 8 },
      { name: "সংখ্যাগত ক্ষমতা (Numerical Ability)", questions: 356, estimatedHours: 12 },
    ],
  },
  {
    category: "১০. নৈতিকতা, মূল্যবোধ ও সু-শাসন (15 Marks)",
    icon: "scale",
    topics: [
      { name: "Definition of Values and Good Governance", questions: 112, estimatedHours: 5 },
      { name: "Relation between Values and Good Governance", questions: 98, estimatedHours: 4 },
      { name: "General Perception of Values and Good Governance", questions: 120, estimatedHours: 6 },
      {
        name: "Importance of Values and Good Governance in the life of an individual as a citizen as well as in the making of society and national ideals",
        questions: 145,
        estimatedHours: 7,
      },
      { name: "Impact of Values and Good Governance in national development", questions: 134, estimatedHours: 6 },
      {
        name: "How the element of Good Governance and Values can be established in society in a given social context",
        questions: 112,
        estimatedHours: 5,
      },
      {
        name: "The benefit of Values and Good Governance and the cost society pays adversely in their absence",
        questions: 98,
        estimatedHours: 4,
      },
    ],
  },
];
