"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  BookOpen,
  CheckCircle,
  Clock,
  TrendingUp,
  Globe,
  Brain,
  Zap,
  Map,
  FlaskConical,
  Cpu,
  Calculator,
  Scale,
} from "lucide-react";
import SectionHeading from "./ui/SectionHeading";

const SYLLABUS_ICONS = [
  { icon: BookOpen, label: "Bangla Literature" },
  { icon: Globe, label: "English Language & Literature" },
  { icon: Brain, label: "Bangladesh Affairs" },
  { icon: TrendingUp, label: "International Affairs" },
  { icon: Map, label: "Geography & Environment" },
  { icon: FlaskConical, label: "General Science" },
  { icon: Cpu, label: "Computer & IT" },
  { icon: Calculator, label: "Mathematical Reasoning" },
  { icon: Zap, label: "Mental Ability" },
  { icon: Scale, label: "Ethics & Good Governance" },
];

const syllabusData = [
  {
    category: "১. বাংলা ভাষা ও সাহিত্য (30 Marks)",
    icon: BookOpen,
    topics: [
      {
        name: "ভাষা (১৫ নম্বর): প্রয়োগ-অপপ্রয়োগ, বানান ও বাক্য শুদ্ধি, পরিভাষা, সমার্থক ও বিপরীতার্থক শব্দ, ধ্বনি, বর্ণ, শব্দ, পদ, বাক্য, প্রত্যয়, সন্ধি ও সমাস",
        questions: 335,
        completed: 78,
        estimatedHours: 12,
      },
      {
        name: "সাহিত্য (১৫ নম্বর): প্রাচীন ও মধ্যযুগ (০৫ নম্বর)",
        questions: 198,
        completed: 90,
        estimatedHours: 8,
      },
      {
        name: "সাহিত্য (১৫ নম্বর): আধুনিক যুগ (১৮০০-বর্তমান পর্যন্ত) (১০ নম্বর)",
        questions: 267,
        completed: 45,
        estimatedHours: 10,
      },
    ],
  },
  {
    category: "২. English Language and Literature (30 Marks)",
    icon: Globe,
    topics: [
      {
        name: "PART-I: Language (15 Marks): Parts of Speech, Idioms & Phrases, Clauses, Corrections, Sentences & Transformations, Words, Composition",
        questions: 520,
        completed: 82,
        estimatedHours: 16,
      },
      {
        name: "PART-II: Literature (15 Marks): Anglo-Saxon, Middle English, Renaissance, Neoclassical, Romantic, Victorian, Modern, Post-Modern & Contemporary",
        questions: 520,
        completed: 68,
        estimatedHours: 24,
      },
    ],
  },
  {
    category: "৩. বাংলাদেশ বিষয়াবলি (25 Marks)",
    icon: Brain,
    topics: [
      {
        name: "জাতীয় বিষয়াবলি (06 Marks): প্রাচীনকাল হতে সম-সাময়িক ইতিহাস, ভাষা আন্দোলন, ১৯৫৪ নির্বাচন, ১৯৬৯ গণঅভ্যুত্থান, ১৯৭১ মুক্তিযুদ্ধ",
        questions: 456,
        completed: 85,
        estimatedHours: 16,
      },
      {
        name: "কৃষিজ সম্পদ (02 Marks): শস্য উৎপাদন, বহুমুখীকরণ, খাদ্য ব্যবস্থাপনা",
        questions: 142,
        completed: 60,
        estimatedHours: 5,
      },
      {
        name: "জনসংখ্যা (02 Marks): জনশুমারি, জাতি, গোষ্ঠী ও ক্ষুদ্র নৃগোষ্ঠী",
        questions: 125,
        completed: 48,
        estimatedHours: 5,
      },
      {
        name: "বাংলাদেশের অর্থনীতি (02 Marks): উন্নয়ন পরিকল্পনা, জাতীয় আয়-ব্যয়, বার্ষিক উন্নয়ন কর্মসূচি, দারিদ্র্য বিমোচন",
        questions: 167,
        completed: 52,
        estimatedHours: 6,
      },
      {
        name: "শিল্প ও বাণিজ্য (02 Marks): শিল্প উৎপাদন, পণ্য আমদানি-রপ্তানি, গার্মেন্টস শিল্প, ব্যাংক ও বীমা ব্যবস্থাপনা",
        questions: 189,
        completed: 45,
        estimatedHours: 6,
      },
      {
        name: "সংবিধান (03 Marks): প্রস্তাবনা, বৈশিষ্ট্য, মৌলিক অধিকার, রাষ্ট্র পরিচালনার মূলনীতি, সংশোধনীসমূহ",
        questions: 334,
        completed: 70,
        estimatedHours: 12,
      },
      {
        name: "রাজনৈতিক ব্যবস্থা (03 Marks): রাজনৈতিক দল, ভূমিকা, শাসক ও বিরোধী দল, সুশীল সমাজ ও চাপ সৃষ্টিকারী গোষ্ঠী",
        questions: 178,
        completed: 62,
        estimatedHours: 6,
      },
      {
        name: "সরকার ব্যবস্থা (03 Marks): আইন, শাসন ও বিচার বিভাগ, নীতি নির্ধারণ, প্রশাসনিক ব্যবস্থাপনা, স্থানীয় সরকার",
        questions: 210,
        completed: 58,
        estimatedHours: 8,
      },
      {
        name: "জাতীয় বিষয়াদি (02 Marks): জাতীয় অর্জন, বিশিষ্ট ব্যক্তিত্ব, গুরুত্বপূর্ণ প্রতিষ্ঠান, পুরস্কার, খেলাধুলা, চলচ্চিত্র ও গণমাধ্যম",
        questions: 195,
        completed: 64,
        estimatedHours: 7,
      },
    ],
  },
  {
    category: "৪. আন্তর্জাতিক বিষয়াবলি (25 Marks)",
    icon: TrendingUp,
    topics: [
      {
        name: "বৈশ্বিক ইতিহাস, আঞ্চলিক ও আন্তর্জাতিক ব্যবস্থা, ভূ-রাজনীতি (05 Marks)",
        questions: 389,
        completed: 38,
        estimatedHours: 14,
      },
      {
        name: "আন্তর্জাতিক নিরাপত্তা ও আন্তরাষ্ট্রীয় ক্ষমতা সম্পর্ক (05 Marks)",
        questions: 234,
        completed: 52,
        estimatedHours: 8,
      },
      {
        name: "বিশ্বের সাম্প্রতিক ও চলমান ঘটনাপ্রবাহ (05 Marks)",
        questions: 412,
        completed: 44,
        estimatedHours: 12,
      },
      {
        name: "আন্তর্জাতিক পরিবেশগত ইস্যু ও কূটনীতি (05 Marks)",
        questions: 178,
        completed: 65,
        estimatedHours: 6,
      },
      {
        name: "আন্তর্জাতিক সংগঠনসমূহ ও বৈশ্বিক অর্থনৈতিক প্রতিষ্ঠানাদি (05 Marks)",
        questions: 245,
        completed: 55,
        estimatedHours: 10,
      },
    ],
  },
  {
    category: "৫. ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা (10 Marks)",
    icon: Map,
    topics: [
      {
        name: "বাংলাদেশ ও অঞ্চলভিত্তিক ভৌগোলিক অবস্থান, সীমানা, পারিবেশিক, আর্থ-সামাজিক ও ভূ-রাজনৈতিক গুরুত্ব (02 Marks)",
        questions: 156,
        completed: 62,
        estimatedHours: 6,
      },
      {
        name: "অঞ্চলভিত্তিক ভৌত পরিবেশ (ভূ-প্রাকৃতিক), সম্পদের বণ্টন ও গুরুত্ব (02 Marks)",
        questions: 134,
        completed: 55,
        estimatedHours: 5,
      },
      {
        name: "বাংলাদেশের পরিবেশ: প্রকৃতি ও সম্পদ, প্রধান চ্যালেঞ্জসমূহ (02 Marks)",
        questions: 145,
        completed: 70,
        estimatedHours: 6,
      },
      {
        name: "বাংলাদেশ ও বৈশ্বিক পরিবেশ পরিবর্তন: আবহাওয়া ও জলবায়ু নিয়ামকসমূহের সেক্টরভিত্তিক প্রভাব (02 Marks)",
        questions: 112,
        completed: 48,
        estimatedHours: 4,
      },
      {
        name: "প্রাকৃতিক দুর্যোগ ও ব্যবস্থাপনা: দুর্যোগের ধরন, প্রকৃতি ও ব্যবস্থাপনা (02 Marks)",
        questions: 98,
        completed: 35,
        estimatedHours: 4,
      },
    ],
  },
  {
    category: "৬. সাধারণ বিজ্ঞান (15 Marks)",
    icon: FlaskConical,
    topics: [
      {
        name: "ভৌত বিজ্ঞান (05 Marks): পদার্থের অবস্থা, এটম, এসিড-ক্ষার-লবণ, তরঙ্গ ও শব্দ, তাপ, আলো, স্থির ও চল তড়িৎ, আধুনিক পদার্থবিজ্ঞান",
        questions: 312,
        completed: 76,
        estimatedHours: 10,
      },
      {
        name: "জীব বিজ্ঞান (05 Marks): টিস্যু, জেনেটিকস, জীববৈচিত্র্য, সালোক সংশ্লেষণ, ভাইরাস, ব্যাকটেরিয়া, রক্ত সঞ্চালন, খাদ্য ও পুষ্টি",
        questions: 289,
        completed: 70,
        estimatedHours: 10,
      },
      {
        name: "আধুনিক বিজ্ঞান (05 Marks): পৃথিবী সৃষ্টির ইতিহাস, কসমিক রে, ব্ল্যাক হোল, বায়ুমণ্ডল, টেকটোনিক প্লেট, সংক্রামক রোগ, ইম্যুনাইজেশন",
        questions: 245,
        completed: 55,
        estimatedHours: 8,
      },
    ],
  },
  {
    category: "৭. কম্পিউটার ও তথ্য প্রযুক্তি (15 Marks)",
    icon: Cpu,
    topics: [
      {
        name: "কম্পিউটার (10 Marks): পেরিফেরালস, কম্পিউটারের অঙ্গসংগঠন (CPU, ALU), পারঙ্গমতা, নম্বর ব্যবস্থা, মেমোরি",
        questions: 298,
        completed: 71,
        estimatedHours: 12,
      },
      {
        name: "কম্পিউটার (10 Marks): অপারেটিং সিস্টেমস, এমবেডেড কম্পিউটার, ইতিহাস, প্রকারভেদ, প্রোগ্রাম, ভাইরাস, ডেটাবেইস",
        questions: 267,
        completed: 65,
        estimatedHours: 10,
      },
      {
        name: "তথ্যপ্রযুক্তি (05 Marks): ই-কমার্স, সেলুলার নেটওয়ার্ক (2G/3G/4G/5G), নেটওয়ার্ক (LAN/MAN/WiFi), ক্লাউড কম্পিউটিং, সাইবার অপরাধ",
        questions: 234,
        completed: 48,
        estimatedHours: 8,
      },
    ],
  },
  {
    category: "৮. গাণিতিক যুক্তি (20 Marks)",
    icon: Calculator,
    topics: [
      {
        name: "বাস্তব সংখ্যা, ল.সা.গু, গ.সা.গু, শতকরা, সরল ও যৌগিক মুনাফা, অনুপাত ও সমানুপাত, লাভ ও ক্ষতি (04 Marks)",
        questions: 512,
        completed: 75,
        estimatedHours: 18,
      },
      {
        name: "বীজগাণিতিক সূত্রাবলি, বহুপদী উৎপাদক, সরল ও দ্বিপদী সমীকরণ, অসমতা, সহসমীকরণ (04 Marks)",
        questions: 367,
        completed: 68,
        estimatedHours: 14,
      },
      {
        name: "সূচক ও লগারিদম, সমান্তর ও গুণোত্তর অনুক্রম ও ধারা (04 Marks)",
        questions: 234,
        completed: 55,
        estimatedHours: 10,
      },
      {
        name: "রেখা, কোণ, ত্রিভুজ ও চতুর্ভুজ সংক্রান্ত উপপাদ্য, পিথাগোরাসের উপপাদ্য, বৃত্ত, পরিমিতি (04 Marks)",
        questions: 298,
        completed: 71,
        estimatedHours: 12,
      },
      {
        name: "সেট, বিন্যাস ও সমাবেশ, পরিসংখ্যান ও সম্ভাব্যতা (04 Marks)",
        questions: 245,
        completed: 55,
        estimatedHours: 10,
      },
    ],
  },
  {
    category: "৯. মানসিক দক্ষতা (15 Marks)",
    icon: Zap,
    topics: [
      {
        name: "ভাষাগত যৌক্তিক বিচার (Verbal Reasoning)",
        questions: 423,
        completed: 88,
        estimatedHours: 12,
      },
      {
        name: "সমস্যা সমাধান (Problem Solving)",
        questions: 367,
        completed: 82,
        estimatedHours: 10,
      },
      {
        name: "বানান ও ভাষা (Spelling and Language)",
        questions: 289,
        completed: 70,
        estimatedHours: 10,
      },
      {
        name: "যান্ত্রিক দক্ষতা (Mechanical Reasoning)",
        questions: 312,
        completed: 76,
        estimatedHours: 11,
      },
      {
        name: "স্থানাঙ্ক সম্পর্ক (Space Relation)",
        questions: 198,
        completed: 65,
        estimatedHours: 8,
      },
      {
        name: "সংখ্যাগত ক্ষমতা (Numerical Ability)",
        questions: 356,
        completed: 80,
        estimatedHours: 12,
      },
    ],
  },
  {
    category: "১০. নৈতিকতা, মূল্যবোধ ও সু-শাসন (15 Marks)",
    icon: Scale,
    topics: [
      {
        name: "Definition of Values and Good Governance",
        questions: 112,
        completed: 42,
        estimatedHours: 5,
      },
      {
        name: "Relation between Values and Good Governance",
        questions: 98,
        completed: 38,
        estimatedHours: 4,
      },
      {
        name: "General Perception of Values and Good Governance",
        questions: 120,
        completed: 55,
        estimatedHours: 6,
      },
      {
        name: "Importance of Values and Good Governance in the life of an individual as a citizen as well as in the making of society and national ideals",
        questions: 145,
        completed: 48,
        estimatedHours: 7,
      },
      {
        name: "Impact of Values and Good Governance in national development",
        questions: 134,
        completed: 40,
        estimatedHours: 6,
      },
      {
        name: "How the element of Good Governance and Values can be established in society in a given social context",
        questions: 112,
        completed: 35,
        estimatedHours: 5,
      },
      {
        name: "The benefit of Values and Good Governance and the cost society pays adversely in their absence",
        questions: 98,
        completed: 30,
        estimatedHours: 4,
      },
    ],
  },
];

export default function SyllabusExplorer() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const toggleCategory = (category: string) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  return (
    <section
      id="syllabus"
      className="py-20 md:py-32 px-4 sm:px-6 relative"
      aria-label="Syllabus explorer"
    >
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          eyebrow="SYLLABUS EXPLORER"
          title="Complete BCS & Competitive Exam"
          highlight="Syllabus Coverage"
          description="Interactive syllabus browser with real-time progress tracking, question counts, and estimated study hours per topic."
        />

        <div className="space-y-5">
          {syllabusData.map((category, catIndex) => {
            const Icon = SYLLABUS_ICONS[catIndex]?.icon ?? BookOpen;
            const totalQuestions = category.topics.reduce((sum, t) => sum + t.questions, 0);
            const totalCompleted = category.topics.reduce(
              (sum, t) => sum + Math.round((t.questions * t.completed) / 100),
              0
            );
            const overallProgress = Math.round((totalCompleted / totalQuestions) * 100);
            const totalHours = category.topics.reduce((sum, t) => sum + t.estimatedHours, 0);
            const isExpanded = expandedCategory === category.category;

            return (
              <motion.div
                key={category.category}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: catIndex * 0.04 }}
                className="glass-card rounded-2xl border border-white/10 overflow-hidden transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/30"
              >
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category.category)}
                  className="w-full p-4 md:p-6 flex items-center justify-between gap-4 hover:bg-white/[0.03] transition-colors text-left"
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-display text-base md:text-lg font-semibold text-white line-clamp-2">
                        {category.category}
                      </h4>
                      <div className="flex flex-wrap gap-2 sm:gap-4 mt-1 text-xs sm:text-sm text-zinc-500 font-mono">
                        <span>{totalQuestions.toLocaleString()} questions</span>
                        <span>{totalHours}h estimated</span>
                        <span>{overallProgress}% complete</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="text-emerald-400"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </motion.div>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center"
                    >
                      <span className="text-emerald-400 font-bold font-mono text-xs">
                        {overallProgress}%
                      </span>
                    </motion.div>
                  </div>
                </button>

                {/* Expanded Topics Section */}
                <motion.div
                  initial={false}
                  animate={{
                    gridTemplateRows: isExpanded ? "1fr" : "0fr",
                    opacity: isExpanded ? 1 : 0,
                  }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="grid"
                >
                  <div className="overflow-hidden">
                  <div className="border-t border-white/10 p-4 md:p-6 pt-4">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {category.topics.map((topic, topicIndex) => (
                        <motion.div
                          key={topic.name}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: topicIndex * 0.03 }}
                          className="glass-card rounded-xl border border-white/10 p-4 hover:border-emerald-400/30 hover:shadow-neon-glow transition-[border-color,box-shadow] flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h5 className="text-sm font-medium text-white line-clamp-2 pr-2">
                                {topic.name}
                              </h5>
                              {topic.completed >= 80 && (
                                <CheckCircle
                                  className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5"
                                  aria-label="Mastered"
                                />
                              )}
                            </div>
                          </div>

                          <div className="space-y-2 mt-3">
                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: `${topic.completed}%` }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.6, delay: 0.1 }}
                                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full"
                              />
                            </div>
                            <div className="flex justify-between text-xs text-zinc-500 font-mono">
                              <span>{topic.completed}% mastered</span>
                              <span>{topic.questions.toLocaleString()} Q</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                              <Clock className="w-3 h-3" aria-hidden="true" />
                              <span>~{topic.estimatedHours}h</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <motion.a
            href="/login?register=true"
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto px-8 py-3.5 rounded-full text-base font-semibold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 transition-colors shadow-[0_0_28px_rgba(16,185,129,0.3)]"
          >
            Access Full Syllabus & Start Practicing
            <TrendingUp className="w-4 h-4" aria-hidden="true" />
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
}