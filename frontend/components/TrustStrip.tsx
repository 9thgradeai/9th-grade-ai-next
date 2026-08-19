"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Landmark,
  GraduationCap,
  Building2,
  Scale,
  FileText,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";

const tracks = [
  { icon: Landmark, label: "BCS Preliminary" },
  { icon: Landmark, label: "BCS Written" },
  { icon: Building2, label: "Bank Jobs" },
  { icon: GraduationCap, label: "Teacher Recruitment" },
  { icon: Scale, label: "PSC & Govt. Jobs" },
  { icon: FileText, label: "Admission Tests" },
  { icon: Sparkles, label: "9th-Grade Pay Scale" },
];

export default function TrustStrip() {
  const shouldReduceMotion = useReducedMotion();
  const items = [...tracks, ...tracks];

  return (
    <section className="relative py-14 px-4 sm:px-6 border-y border-white/5 bg-white/[0.015]" aria-label="Supported exam tracks">
      <div className="max-w-7xl mx-auto">
        <p className="section-eyebrow justify-center mb-8">
          <span aria-hidden="true">{"//"}</span>
          ONE PLATFORM · EVERY COMPETITIVE EXAM
        </p>
        <div className="marquee-paused overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
          <div className={`marquee-track gap-4 ${shouldReduceMotion ? "flex-wrap justify-center" : ""}`}>
            {items.map((t, i) => {
              const Icon = t.icon;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2.5 px-5 py-2.5 rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-300 font-mono whitespace-nowrap ${
                    shouldReduceMotion ? "" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  <Icon className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  {t.label}
                  <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}