"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

type TerminalLine =
  | { type: "command"; text: string; delay: number }
  | { type: "output"; text: string; delay: number }
  | { type: "progress"; label: string; value: number; total: number; delay: number }
  | { type: "question"; text: string; options: string[]; correct: number; delay: number };

const terminalOutput: TerminalLine[] = [
  { type: "command", text: "$ 9th-grade-ai --prepare --bcs-51", delay: 500 },
  { type: "output", text: "[✓] System initialized", delay: 300 },
  { type: "output", text: "[✓] Loading syllabus: BCS 51st Prelim", delay: 300 },
  { type: "output", text: "[✓] AI models loaded: llama-3.1-70b, gpt-4o-mini", delay: 400 },
  { type: "output", text: "", delay: 200 },
  { type: "progress", label: "Bangla Literature", value: 78, total: 100, delay: 300 },
  { type: "progress", label: "English Language", value: 65, total: 100, delay: 250 },
  { type: "progress", label: "Bangladesh Affairs", value: 82, total: 100, delay: 250 },
  { type: "progress", label: "International Affairs", value: 45, total: 100, delay: 250 },
  { type: "progress", label: "Mathematical Reasoning", value: 71, total: 100, delay: 250 },
  { type: "progress", label: "Mental Ability", value: 88, total: 100, delay: 250 },
  { type: "output", text: "", delay: 300 },
  { type: "output", text: "[✓] Generating adaptive mock test...", delay: 400 },
  { type: "question", text: "Q1. Who was the first President of Bangladesh?", options: ["Sheikh Mujibur Rahman", "Syed Nazrul Islam", "Abu Sayeed Chowdhury", "Justice Abu Sadat Mohammad Sayem"], correct: 1, delay: 300 },
  { type: "question", text: "Q2. The Battle of Plassey was fought in:", options: ["1757", "1764", "1770", "1789"], correct: 0, delay: 300 },
  { type: "question", text: "Q3. GDP stands for:", options: ["Gross Domestic Product", "General Development Plan", "Global Domestic Policy", "Government Development Program"], correct: 0, delay: 300 },
  { type: "output", text: "", delay: 300 },
  { type: "output", text: "[✓] Mock test generated: 25 questions, 30 min", delay: 400 },
  { type: "output", text: "[✓] Ready for exam preparation", delay: 300 },
  { type: "command", text: "$ █", delay: 1000 },
];

export default function TerminalHero() {
  const [lines, setLines] = useState<typeof terminalOutput>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const typeNextLine = () => {
      if (currentIndex >= terminalOutput.length) {
        setIsComplete(true);
        return;
      }

      setLines((prev) => [...prev, terminalOutput[currentIndex]]);
      setCurrentIndex((prev) => prev + 1);

      const nextDelay = terminalOutput[currentIndex]?.delay ?? 300;
      const t = setTimeout(typeNextLine, nextDelay);
      timers.push(t);
    };

    const initialTimer = setTimeout(typeNextLine, 800);
    timers.push(initialTimer);

    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [currentIndex]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  const restartAnimation = () => {
    setLines([]);
    setCurrentIndex(0);
    setIsComplete(false);
  };

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center pt-16 pb-20 px-4 overflow-hidden">
      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-5" aria-hidden="true">
         <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2760%27 height=%2760%27 viewBox=%270 0 60 60%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cg fill=%27none%27 fill-rule=%27evenodd%27%3E%3Cpath d=%27M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%27 fill=%27%2310B981%27 fill-opacity=%270.4%27/%3E%3C/g%3E%3C/svg%3E')]" />
      </div>

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" aria-hidden="true" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} aria-hidden="true" />

      <div className="relative max-w-7xl mx-auto w-full">
        {/* Hero Content */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-6"
            >
              <span className="text-emerald-500 font-mono text-sm tracking-wider uppercase">
              {"// NEXT-GEN EXAM INTELLIGENCE"}
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.1] mb-6"
            >
              Master Competitive Exams with
              <br />
              <span className="text-emerald-500">AI-Driven Precision</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-lg md:text-xl text-zinc-300 max-w-xl mb-8 leading-relaxed"
            >
              Adaptive mock tests, automated flashcards, AI doubt solving, and daily streak tracking —
              all powered by cutting-edge AI to help you ace BCS, Bank, and Teacher recruitment exams.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4"
            >
              <a
                href="/login?register=true"
                className="w-full sm:w-auto px-6 py-3.5 text-base font-medium text-zinc-950 bg-emerald-500 rounded hover:bg-emerald-400 transition-colors font-mono shadow-neon-glow flex items-center justify-center gap-2"
              >
                [ Start Free Prep ]
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              </a>
              <a
                href="#features"
                className="w-full sm:w-auto px-6 py-3.5 text-base font-medium text-zinc-100 border border-emerald-500/30 rounded hover:bg-emerald-500/10 transition-colors font-mono flex items-center justify-center gap-2"
              >
                [ Explore Features ]
              </a>
            </motion.div>

            {/* Stats bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-12 grid grid-cols-2 gap-6 sm:flex sm:flex-wrap sm:gap-8 text-center"
            >
              <div>
                <div className="text-3xl font-bold text-emerald-500 font-mono">50K+</div>
                <div className="text-sm text-zinc-400">Active Students</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-emerald-500 font-mono">2.5M+</div>
                <div className="text-sm text-zinc-400">Questions Practiced</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-emerald-500 font-mono">94%</div>
                <div className="text-sm text-zinc-400">Success Rate</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-emerald-500 font-mono">14</div>
                <div className="text-sm text-zinc-400">Subjects Covered</div>
              </div>
            </motion.div>
          </motion.div>

          {/* Right: Terminal Simulation */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <div className="glass rounded-terminal-rounded overflow-hidden border border-terminal-border shadow-neon-glow">
              {/* Terminal window bar */}
              <div className="terminal-window-bar">
                <div className="dot close" aria-label="Close" />
                <div className="dot minimize" aria-label="Minimize" />
                <div className="dot maximize" aria-label="Maximize" />
                <div className="flex-1 text-center text-xs text-zinc-500 font-mono">terminal.emulator.9th-grade-ai</div>
              </div>

              {/* Terminal content */}
              <div className="p-4 md:p-6 font-mono text-sm leading-relaxed h-[420px] sm:h-[500px] overflow-y-auto" ref={terminalRef}>
                <div className="space-y-1">
                  {lines.map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className={line.type === "command" ? "text-emerald-400" :
                                line.type === "output" ? "text-zinc-300" :
                                line.type === "progress" ? "text-zinc-200" :
                                "text-emerald-300"}
                    >
                      {line.type === "command" && (
                        <>
                          <span className="text-emerald-500">$ </span>
                          <span className="cursor-blink">{line.text.replace("█", "")}</span>
                        </>
                      )}
                      {line.type === "output" && <span>{line.text}</span>}
                      {line.type === "progress" && (
                        <div className="flex items-center gap-3">
                          <span className="w-40 text-zinc-400">{line.label}</span>
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(line.value / line.total) * 100}%` }}
                              transition={{ duration: 0.5, delay: 0.1 }}
                              className="h-full bg-emerald-500 rounded-full"
                            />
                          </div>
                          <span className="text-emerald-400 w-16 text-right font-mono">
                            {line.value}/{line.total}
                          </span>
                        </div>
                      )}
                      {line.type === "question" && (
                        <div className="ml-4 mt-2 space-y-1 border-l border-emerald-500/30 pl-3">
                          <p className="text-emerald-300">{line.text}</p>
                          {line.options.map((opt, oi) => (
                            <p key={oi} className={`text-sm ${oi === line.correct ? "text-emerald-400" : "text-zinc-400"}`}>
                              {oi === line.correct ? "▸ " : "  "}{opt}
                            </p>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {isComplete && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={restartAnimation}
                    className="mt-4 px-4 py-2 text-sm font-medium text-zinc-950 bg-emerald-500 rounded hover:bg-emerald-400 transition-colors font-mono flex items-center gap-2"
                  >
                    [ Restart Simulation ]
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-zinc-500"
        aria-hidden="true"
      >
        <span className="text-xs font-mono uppercase tracking-wider">Scroll</span>
        <ChevronDown className="w-5 h-5" />
      </motion.div>
    </section>
  );
}