"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Brain, Zap, BookOpen, Flame, Target, Clock, Shield, Award } from "lucide-react";
import SpotlightCard from "./ui/SpotlightCard";
import SectionHeading from "./ui/SectionHeading";

const features = [
  {
    icon: Brain,
    title: "AI Doubt Solver",
    description: "Instant AI-powered explanations for any question. Upload images, type queries, or use voice — get step-by-step solutions in Bengali or English.",
    badge: "LLM-POWERED",
  },
  {
    icon: Zap,
    title: "Adaptive Mock Tests",
    description: "AI generates personalized mock tests based on your weak areas. Real exam interface with timer, negative marking, and instant analytics.",
    badge: "ADAPTIVE",
  },
  {
    icon: BookOpen,
    title: "Automated Flashcards",
    description: "Smart spaced-repetition flashcards auto-generated from your mistakes. Review optimization ensures maximum retention with minimum effort.",
    badge: "SRS",
  },
  {
    icon: Flame,
    title: "Daily Streak Tracking",
    description: "Gamified consistency tracking with streaks, badges, and leaderboards. Build habits that compound into exam success.",
    badge: "GAMIFIED",
  },
  {
    icon: Target,
    title: "Topic-Wise Practice",
    description: "Granular practice by subject, chapter, and topic. 14 subjects, 500+ topics, 100K+ questions with detailed solutions.",
    badge: "GRANULAR",
  },
  {
    icon: Clock,
    title: "Smart Study Planner",
    description: "AI creates personalized study schedules based on exam date, current level, and available hours. Adjusts dynamically as you progress.",
    badge: "DYNAMIC",
  },
  {
    icon: Shield,
    title: "Previous Year Archive",
    description: "Complete archive of BCS, Bank, and Teacher recruitment papers with solutions. Search, filter, and practice by year, subject, or difficulty.",
    badge: "COMPREHENSIVE",
  },
  {
    icon: Award,
    title: "Performance Analytics",
    description: "Deep-dive analytics: accuracy trends, time management, topic mastery, peer comparison, and predicted rank estimation.",
    badge: "INSIGHTS",
  },
];

export default function FeaturesGrid() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      id="features"
      className="py-24 md:py-32 px-4 sm:px-6 relative"
      aria-label="Core capabilities"
    >
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          eyebrow="CORE CAPABILITIES"
          title="Everything You Need to"
          highlight="Ace the Exam"
          description="Eight integrated modules designed to cover every aspect of competitive exam preparation — from learning to mastery."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: (index % 4) * 0.08 }}
            >
              <SpotlightCard
                className="h-full glass-card rounded-2xl border border-white/10 p-6 transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/40 hover:shadow-card-hover"
              >
                <div className="flex items-center justify-between mb-5">
                  <motion.div
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.1, rotate: 5 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <feature.icon className="w-6 h-6 text-emerald-400" />
                  </motion.div>
                  <span className="text-[10px] font-mono text-emerald-400/90 uppercase tracking-[0.14em] px-2.5 py-1 bg-emerald-500/8 border border-emerald-500/20 rounded-full">
                    {feature.badge}
                  </span>
                </div>

                <h4 className="font-display text-lg font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors">
                  {feature.title}
                </h4>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {feature.description}
                </p>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}