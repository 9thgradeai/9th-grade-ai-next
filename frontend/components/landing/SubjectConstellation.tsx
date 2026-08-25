"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_OUT_EXPO } from "@/lib/motion/variants";
import { ORBITS, SUBJECTS, orbitPosition } from "./subjects";

/**
 * Subject constellation. Desktop renders an orbital system around the
 * knowledge core; mobile and touch get an intentionally designed grid.
 * Both share one selection state and one accessible detail panel, so no
 * information is ever hover-only.
 */
export default function SubjectConstellation() {
  const [selected, setSelected] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const select = (name: string) => setSelected((prev) => (prev === name ? null : name));
  const activeSubject = SUBJECTS.find((s) => s.name === selected) ?? null;

  return (
    <div className="relative">
      {/* Desktop constellation */}
      <div
        className="relative mx-auto hidden aspect-square w-full max-w-[620px] lg:block"
        aria-hidden="true"
      >
        {/* Connection lines */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <defs>
            <radialGradient id="su-core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill="url(#su-core-glow)" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#1c2340" strokeWidth="0.22" strokeDasharray="1 2.2" />
          <circle cx="50" cy="50" r="45" fill="none" stroke="#1c2340" strokeWidth="0.22" strokeDasharray="1 2.2" />
          {ORBITS.map(({ name, angle, radius }) => {
            const pos = orbitPosition(angle, radius);
            const isActive = selected === name;
            return (
              <line
                key={`line-${name}`}
                x1="50" y1="50"
                x2={pos.x} y2={pos.y}
                stroke={isActive ? "#2dd4bf" : "#232a44"}
                strokeWidth={isActive ? 0.5 : 0.25}
                opacity={selected && !isActive ? 0.25 : 0.8}
                className="transition-all duration-500"
              />
            );
          })}
        </svg>

        {/* Core */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <div
            className={`glass-card flex h-28 w-28 flex-col items-center justify-center rounded-full border-emerald-500/30 transition-shadow duration-500 sm:h-32 sm:w-32 ${
              activeSubject ? "shadow-glow-sm" : ""
            }`}
          >
            <span className={`mb-1.5 h-1.5 w-1.5 rounded-full transition-colors duration-500 ${activeSubject ? "bg-violet-400 shadow-glow-sm" : "pulse-soft bg-emerald-400"}`} />
            <span className="px-3 text-center font-mono text-[0.55rem] uppercase tracking-[0.18em] text-zinc-400">
              Knowledge Core
            </span>
          </div>
        </motion.div>

        {/* Subject nodes */}
        {ORBITS.map(({ name, angle, radius }, i) => {
          const pos = orbitPosition(angle, radius);
          const isActive = selected === name;
          const isDimmed = selected !== null && !isActive;
          return (
            <motion.button
              key={name}
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: isDimmed ? 0.45 : 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              animate={{ opacity: isDimmed ? 0.45 : 1 }}
              transition={{
                duration: shouldReduceMotion ? 0 : 0.45,
                delay: shouldReduceMotion ? 0 : 0.15 + i * 0.06,
                ease: EASE_OUT_EXPO,
              }}
              onMouseEnter={() => setSelected(name)}
              onMouseLeave={() => setSelected(null)}
              onFocus={() => setSelected(name)}
              onClick={() => select(name)}
              aria-hidden="true"
              tabIndex={-1}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
            >
              <span
                className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 font-mono text-xs backdrop-blur-sm transition-all duration-300 ${
                  isActive
                    ? "-translate-y-0.5 border-emerald-400/70 bg-emerald-500/12 text-white shadow-glow-sm"
                    : "border-white/12 bg-[#0a0e20]/80 text-zinc-300 hover:border-emerald-400/40"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-400" : "bg-zinc-600"}`} />
                {name}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Mobile / tablet grid — same data, intentionally designed */}
      <div className="mx-auto flex max-w-xl flex-wrap justify-center gap-2.5 lg:hidden">
        {SUBJECTS.map((subject) => (
          <button
            key={`grid-${subject.name}`}
            type="button"
            aria-pressed={selected === subject.name}
            onClick={() => select(subject.name)}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 font-mono text-sm transition-colors duration-200 ${
              selected === subject.name
                ? "border-emerald-400/70 bg-emerald-500/12 text-white"
                : "border-white/12 bg-white/[0.03] text-zinc-300 active:bg-white/[0.06]"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${selected === subject.name ? "bg-emerald-400" : "bg-zinc-600"}`} />
            {subject.name}
          </button>
        ))}
      </div>

      {/* Shared detail panel — the accessible source of truth */}
      <div aria-live="polite" className="mx-auto mt-8 max-w-md text-center">
        {activeSubject ? (
          <div key={activeSubject.name} className="glass-card rounded-2xl p-5">
            <h3 className="font-display text-lg font-semibold text-white">{activeSubject.name}</h3>
            <p className="mt-1 text-sm text-zinc-400">{activeSubject.blurb}</p>
            <p className="mt-3 font-mono text-xs text-emerald-400">
              {activeSubject.questions !== null
                ? `${activeSubject.questions.toLocaleString()} questions · ~${activeSubject.estimatedHours}h guided study`
                : "Updated daily · linked to the current-affairs feed"}
            </p>
          </div>
        ) : (
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-zinc-600">
            Select a subject to inspect its coverage
          </p>
        )}
      </div>
    </div>
  );
}
