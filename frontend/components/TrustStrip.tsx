"use client";

import { useReducedMotion } from "framer-motion";
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

function TrackChip({ icon: Icon, label }: { icon: typeof Landmark; label: string }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-300 font-mono whitespace-nowrap">
      <Icon className="w-4 h-4 text-emerald-400" aria-hidden="true" />
      {label}
      <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
    </div>
  );
}

export default function TrustStrip() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      className="relative py-14 px-4 sm:px-6 border-y border-white/5 bg-white/[0.015]"
      aria-label="Supported exam tracks"
    >
      <div className="max-w-7xl mx-auto">
        <p className="section-eyebrow justify-center mb-8">
          <span aria-hidden="true">{"//"}</span>
          ONE PLATFORM · EVERY COMPETITIVE EXAM
        </p>

        {shouldReduceMotion ? (
          // Static wrapped row — no marquee for reduced motion.
          <div className="flex flex-wrap justify-center gap-4">
            {tracks.map((t) => (
              <TrackChip key={t.label} icon={t.icon} label={t.label} />
            ))}
          </div>
        ) : (
          <div className="marquee-paused overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <div className="marquee-track gap-4">
              {tracks.map((t) => (
                <TrackChip key={t.label} icon={t.icon} label={t.label} />
              ))}
              {/* Duplicated set drives the seamless loop — hidden from AT */}
              <div aria-hidden="true" className="contents">
                {tracks.map((t) => (
                  <TrackChip key={`${t.label}-dup`} icon={t.icon} label={t.label} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
