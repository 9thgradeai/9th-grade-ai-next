"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap, Lock } from "lucide-react";
import Reveal from "./ui/Reveal";

const trustPoints = [
  { icon: Zap, label: "Free forever — no credit card required" },
  { icon: Lock, label: "Your progress is private & encrypted" },
  { icon: ShieldCheck, label: "AI-assisted, aligned to official syllabi" },
];

export default function FinalCTA() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="relative py-24 md:py-32 px-4 sm:px-6" aria-labelledby="cta-heading">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.06] to-transparent p-8 md:p-16 text-center shadow-panel">
            {/* Ambient glow */}
            <motion.div
              className="absolute -top-24 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] bg-emerald-500/12 rounded-full blur-[130px]"
              aria-hidden="true"
              animate={shouldReduceMotion ? { opacity: 0.5 } : { opacity: [0.35, 0.7, 0.35] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            />

            <div className="relative">
              <p className="section-eyebrow justify-center mb-4">
                <span aria-hidden="true">{"//"}</span>
                BEGIN YOUR PREPARATION
              </p>
              <h2
                id="cta-heading"
                className="font-display text-3xl sm:text-5xl font-semibold text-white leading-tight tracking-tight"
              >
                Your exam, prepared by <span className="text-gradient">intelligence.</span>
              </h2>
              <p className="mt-5 text-base sm:text-lg text-[var(--text-muted)] max-w-2xl mx-auto leading-relaxed">
                Join thousands of aspirants mastering BCS, Bank, and Teacher
                recruitment exams with AI-driven precision — from your first
                question to your final mock test.
              </p>

              <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
                <motion.a
                  href="/login?register=true"
                  whileHover={shouldReduceMotion ? undefined : { scale: 1.04, y: -2 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                  className="glow-border inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-emerald-500 text-zinc-950 font-mono font-semibold text-sm tracking-wide"
                >
                  Start Free Preparation
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </motion.a>
                <motion.a
                  href="/login"
                  whileHover={shouldReduceMotion ? undefined : { scale: 1.04, y: -2 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-white/15 text-white font-mono text-sm hover:border-emerald-400/50 hover:bg-white/5 transition-colors"
                >
                  Sign In
                </motion.a>
              </div>

              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-x-8 gap-y-3">
                {trustPoints.map((p) => (
                  <div key={p.label} className="flex items-center gap-2 text-xs sm:text-sm text-zinc-400 font-mono">
                    <p.icon className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                    {p.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}