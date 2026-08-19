"use client";

import { motion } from "framer-motion";
import { Brain, Zap, Target, Flame, BookOpen, Clock, Shield, Award } from "lucide-react";

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
  return (
    <section
      id="features"
      className="py-20 md:py-32 px-4 sm:px-6"
      aria-labelledby="features-heading"
    >
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2
            id="features-heading"
            className="text-emerald-500 font-mono text-sm tracking-wider uppercase mb-4"
          >
              {"// CORE CAPABILITIES"}
          </h2>
          <h3 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
            Everything You Need to
            <br />
            <span className="text-emerald-500">Ace the Exam</span>
          </h3>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            Eight integrated modules designed to cover every aspect of competitive exam preparation — from learning to mastery.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="group glass rounded-terminal-rounded border border-terminal-border p-6 transition-all duration-300 hover:border-emerald-500/40 hover:shadow-neon-glow"
            >
              {/* Terminal window bar */}
              <div className="terminal-window-bar mb-4">
                <div className="dot close" />
                <div className="dot minimize" />
                <div className="dot maximize" />
              </div>

              <div className="flex items-center gap-3 mb-4">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <feature.icon className="w-6 h-6 text-emerald-500" />
                </motion.div>
                <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
                  {feature.badge}
                </span>
              </div>

              <h4 className="text-xl font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors">
                {feature.title}
              </h4>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}