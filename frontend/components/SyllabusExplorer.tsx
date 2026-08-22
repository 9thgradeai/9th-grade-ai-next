"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Clock, TrendingUp } from "lucide-react";
import SectionHeading from "./ui/SectionHeading";
import Button from "./ui/Button";
import Reveal from "./ui/Reveal";
import {
  SYLLABUS_DATA,
  SYLLABUS_ICONS,
  type SyllabusCategory,
} from "@/lib/data/syllabus";

function CategoryCard({
  category,
  catIndex,
  expanded,
  onToggle,
}: {
  category: SyllabusCategory;
  catIndex: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const panelId = useId();
  const Icon = SYLLABUS_ICONS[category.icon];

  const totalQuestions = category.topics.reduce((sum, t) => sum + t.questions, 0);
  const totalHours = category.topics.reduce((sum, t) => sum + t.estimatedHours, 0);

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, delay: Math.min(catIndex, 3) * 0.04 }}
      className="glass-card rounded-2xl border border-white/10 overflow-hidden transition-[border-color] duration-300 hover:border-emerald-400/30"
    >
      {/* Category Header */}
      <h3>
        <button
          onClick={onToggle}
          className="w-full p-4 md:p-6 flex items-center justify-between gap-4 hover:bg-white/[0.03] focus-visible:bg-white/[0.03] transition-colors text-left"
          aria-expanded={expanded}
          aria-controls={panelId}
        >
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div
              className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0"
              aria-hidden="true"
            >
              <Icon className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <span className="block font-display text-base md:text-lg font-semibold text-white line-clamp-2">
                {category.category}
              </span>
              <div className="flex flex-wrap gap-2 sm:gap-4 mt-1 text-xs sm:text-sm text-zinc-500 font-mono">
                <span>{totalQuestions.toLocaleString()} questions</span>
                <span>~{totalHours}h study time</span>
              </div>
            </div>
          </div>

          <motion.span
            animate={shouldReduceMotion ? undefined : { rotate: expanded ? 90 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="text-emerald-400 flex-shrink-0"
            aria-hidden="true"
          >
            <ChevronRight className="w-5 h-5" />
          </motion.span>
        </button>
      </h3>

      {/* Expanded topics — mounted only while open so collapsed cards stay cheap */}
      {expanded && (
        <motion.div
          id={panelId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
          className="border-t border-white/10 p-4 md:p-6"
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {category.topics.map((topic, topicIndex) => (
              <motion.article
                key={topic.name}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  shouldReduceMotion ? { duration: 0 } : { delay: topicIndex * 0.03 }
                }
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-emerald-400/30 transition-colors flex flex-col justify-between"
              >
                <p className="text-sm font-medium text-white line-clamp-3 pr-2">
                  {topic.name}
                </p>

                <div className="space-y-2 mt-3">
                  <div className="flex justify-between text-xs text-zinc-500 font-mono">
                    <span>{topic.questions.toLocaleString()} questions</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    <span>~{topic.estimatedHours}h recommended</span>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function SyllabusExplorer() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  return (
    <section
      id="syllabus"
      className="py-24 md:py-32 px-4 sm:px-6 relative scroll-mt-16"
      aria-label="Syllabus explorer"
    >
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          eyebrow="SYLLABUS EXPLORER"
          title="Complete BCS & Competitive Exam"
          highlight="Syllabus Coverage"
          description="Browse the full preliminary syllabus by subject and topic — with question-bank coverage counts and estimated study hours for every unit."
        />

        <div className="space-y-5">
          {SYLLABUS_DATA.map((category, catIndex) => (
            <CategoryCard
              key={category.category}
              category={category}
              catIndex={catIndex}
              expanded={expandedCategory === category.category}
              onToggle={() =>
                setExpandedCategory(
                  expandedCategory === category.category ? null : category.category,
                )
              }
            />
          ))}
        </div>

        {/* CTA */}
        <Reveal delay={0.15}>
          <div className="mt-12 text-center">
            <Button href="/login?register=true" size="lg" className="font-semibold glow-border">
              Access Full Syllabus & Start Practicing
              <TrendingUp className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
