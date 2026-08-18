"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Download, FileText, XCircle } from "lucide-react";

// ── Bilingual Categories (BN + EN) ───────────────────────────────
const CATEGORIES = [
  {
    id: "9grade-board",
    name: {
      bn: "৯ম শ্রেণি বোর্ড পরীক্ষা",
      en: "9th Grade Board Exams",
    },
    icon: "🏫",
    gradient: "from-blue-500/20 to-cyan-500/20",
    border: "border-blue-500/30",
    text: "text-blue-400",
    count: 41,
    description: {
      bn: "প্রিলি এবং ফাইনাল পরীক্ষা",
      en: "Prelims and Finals",
    },
  },
  {
    id: "sci-div",
    name: {
      bn: "বিজ্ঞান বিভাগ",
      en: "Science Division",
    },
    icon: "🧪",
    gradient: "from-green-500/20 to-emerald-500/20",
    border: "border-green-500/30",
    text: "text-green-400",
    count: 6,
    description: {
      bn: "প্রকৃতি ও বিজ্ঞান বিষয়ক",
      en: "Nature and Science topics",
    },
  },
  {
    id: "human-div",
    name: {
      bn: "মানবিক বিভাগ",
      en: "Humanities Division",
    },
    icon: "📚",
    gradient: "from-purple-500/20 to-pink-500/20",
    border: "border-purple-500/30",
    text: "text-purple-400",
    count: 83,
    description: {
      bn: "মানবিক জ্ঞান এবং সমাজ বিজ্ঞান",
      en: "Human knowledge and social sciences",
    },
  },
  {
    id: "business",
    name: {
      bn: "ব্যবসায় শিক্ষা",
      en: "Business Education",
    },
    icon: "💼",
    gradient: "from-orange-500/20 to-red-500/20",
    border: "border-orange-500/30",
    text: "text-orange-400",
    count: 5,
    description: {
      bn: "ব্যবসায় ও অর্থনীতি সম্পর্কিত",
      en: "Business and economics subjects",
    },
  },
];

// ── Helper: build accent from category id ─────────────────────────
function getCategoryAccent(id: string) {
  const map: Record<string, { bg: string; border: string; text: string }> = {
    "9grade-board": {
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-400",
    },
    "sci-div": {
      bg: "bg-green-500/10",
      border: "border-green-500/30",
      text: "text-green-400",
    },
    "human-div": {
      bg: "bg-purple-500/10",
      border: "border-purple-500/30",
      text: "text-purple-400",
    },
    business: {
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      text: "text-orange-400",
    },
  };
  return map[id] ?? map["9grade-board"];
}

export default function ArchiveTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return CATEGORIES.filter((cat) =>
      cat.name.bn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cat.name.en.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <div className="space-y-6">
      {/* Search CLI bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-terminal-rounded border border-terminal-border p-1 flex items-center gap-2"
      >
        <span className="text-emerald-500 font-mono pl-3">$</span>
        <Search className="w-4 h-4 text-zinc-500 ml-1" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="9Th-Grade AI প্রশ্নব্যাংক খুঁজুন"
          aria-label="Search archive"
          className="flex-1 bg-transparent px-2 py-3 font-mono text-sm text-white placeholder-zinc-500 focus:outline-none"
        />
        <span className="pr-3 text-xs text-zinc-500 font-mono cursor-blink"></span>
      </motion.div>

      {/* Category Filter Chips */}
      <div className="grid sm:grid-cols-4 gap-2 overflow-x-auto">
        {CATEGORIES.map((cat) => {
          const acc = getCategoryAccent(cat.id);
          const isActive = activeCategory === cat.id;
          return (
            <motion.button
              key={cat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              whileHover={{ y: -2 }}
              onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-sm transition-all ${
                isActive
                  ? `${acc.text} bg-emerald-500/20 border-emerald-500 shadow-neon-glow`
                  : `${acc.text} bg-zinc-900/50 border-emerald-500/20 hover:text-white hover:border-emerald-500/40`
              }`}
              aria-expanded={isActive}
            >
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${acc.text} opacity-50`} />
                <span>{cat.name.bn}</span>
                <span className="text-zinc-400 text-xs ml-1">/</span>
                <span className="text-zinc-400 text-xs ml-1">{cat.name.en}</span>
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Card-Based Exam & Course Grid */}
      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        {CATEGORIES.map((cat) => {
          const acc = getCategoryAccent(cat.id);
          const isExpanded = activeCategory === cat.id;

          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              whileHover={{ y: -3 }}
              className={`glass rounded-terminal-rounded border ${acc.border} p-5 text-left transition-all hover:shadow-neon-glow`}
            >
              {/* Category header with bilingual name */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {cat.name.bn}
                    <span className="text-zinc-400 text-xs font-mono ml-1">/{cat.name.en}</span>
                  </h3>
                  <p className="text-sm text-zinc-400 font-mono">{cat.description.bn}</p>
                </div>

                {/* Availability badge */}
                <span className={`w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-xs font-mono ${acc.text}`}>
                  {cat.count}
                </span>
              </div>

              {/* Expanded view */}
              <AnimatePresence>
                {isExpanded && (
                   <motion.div
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     transition={{ duration: 0.3 }}
                     className="overflow-hidden"
                   >
                    <div className="mt-4 pt-4 border-t border-emerald-500/10 space-y-2">
                      {/* 9th-Grade Exam Section header */}
                      <div className="mb-4 pt-3 border-b border-emerald-500/10">
                        <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider font-mono">
                          {cat.id === "9grade-board"
                            ? "9Th-Grade Exam Section"
                            : "Other Boards & Test Series"}
                        </h4>
                      </div>

                      {/* Exam cards within category */}
                      {["2025", "2024", "2023", "2022"]
                        .map((year) => (
                          <motion.div
                            key={year}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 }}
                            className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg hover:bg-emerald-500/5 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="w-4 h-4 text-zinc-500" />
                              <span className="text-sm text-zinc-300 font-mono">
                                {cat.name.bn} {year}.pdf
                              </span>
                            </div>
                            <Download className="w-4 h-4 text-emerald-400" />
                          </motion.div>
                        ))}

                      {/* Other Boards cards */}
                      {cat.id !== "9grade-board" && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                          className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-emerald-500/10"
                        >
                          {[
                            {
                              id: "model-test",
                              titleBN: "মডেল টেস্ট সিরিজ",
                              titleEN: "Model Test Series",
                              countBN: "✏️ 83",
                              countEN: "83 questions",
                              color: "bg-blue-500/10",
                              borderColor: "border-blue-500/30",
                            },
                            {
                              id: "chapter-based",
                              titleBN: "অধ্যায়ভিত্তিক চূড়ান্ত প্রস্তুতি",
                              titleEN: "Chapter-wise Prep",
                              countBN: "✏️ 5",
                              countEN: "5 questions",
                              color: "bg-green-500/10",
                              borderColor: "border-green-500/30",
                            },
                          ].map((card) => (
                            <motion.div
                              key={card.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.05 }}
                              className={`p-3 rounded-lg ${card.color} ${card.borderColor} hover:shadow-neon-glow transition-all`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm">{card.countBN}</span>
                                <span className="text-zinc-400 text-sm ml-1">/</span>
                                <span className="text-zinc-400 text-sm ml-1">{card.countEN}</span>
                              </div>
                              <div>
                                <h5 className="text-xs font-medium font-mono mt-0.5">
                                  {card.titleBN}
                                  <span className="text-zinc-400 text-xs ml-1">/</span>
                                  {card.titleEN}
                                </h5>
                              </div>
                            </motion.div>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12 text-zinc-500 font-mono"
        >
          <XCircle className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
           <p>$ no results found for &quot;{searchQuery}&quot;</p>
        </motion.div>
      )}
    </div>
  );
}