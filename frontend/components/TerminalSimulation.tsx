"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView, useReducedMotion, useMotionValue, useTransform } from "framer-motion";
import { transitions } from "@/lib/transitions";

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
  { type: "question", text: "Q3. GDP stands for:", options: ["Gross Domestic Product", "Gross Domestic Policy", "Global Development Program", "Government Data Platform"], correct: 0, delay: 300 },
  { type: "output", text: "", delay: 300 },
  { type: "output", text: "[✓] Mock test generated: 25 questions, 30 min", delay: 400 },
  { type: "output", text: "[✓] Ready for exam preparation", delay: 300 },
  { type: "command", text: "$ █", delay: 1000 },
];

function useTilt(max = 6) {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useTransform(my, [0, 1], [max, -max]);
  const rotateY = useTransform(mx, [0, 1], [-max, max]);

  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const onMouseLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  return { style: { rotateX, rotateY, transformPerspective: 1000 }, onMouseMove, onMouseLeave };
}

export default function TerminalSimulation() {
  const [lines, setLines] = useState<typeof terminalOutput>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [runId, setRunId] = useState(0);
  const terminalRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const inView = useInView(rootRef, { once: true, margin: "-120px" });
  const tilt = useTilt();

  useEffect(() => {
    if (!inView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (shouldReduceMotion) {
      timers.push(setTimeout(() => {
        setLines(terminalOutput);
        setIsComplete(true);
      }, 0));
    } else {
      let i = 0;
      const step = () => {
        if (i >= terminalOutput.length) {
          setIsComplete(true);
          return;
        }
        const line = terminalOutput[i];
        setLines((prev) => [...prev, line]);
        i += 1;
        timers.push(setTimeout(step, line.delay));
      };
      timers.push(setTimeout(step, 500));
    }
    return () => timers.forEach(clearTimeout);
  }, [inView, runId, shouldReduceMotion]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  const restartAnimation = () => {
    setLines([]);
    setIsComplete(false);
    setRunId((r) => r + 1);
  };

  return (
    <div ref={rootRef} className="relative">
      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 30, scale: 0.96 }}
        whileInView={{ opacity: 1, x: 0, scale: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <motion.div
          onMouseMove={shouldReduceMotion ? undefined : tilt.onMouseMove}
          onMouseLeave={shouldReduceMotion ? undefined : tilt.onMouseLeave}
          style={shouldReduceMotion ? undefined : tilt.style}
          whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
          transition={transitions.springStiff}
          className="glass-card rounded-2xl overflow-hidden border border-white/10 shadow-panel"
        >
          <div className="terminal-window-bar">
            <div className="dot close" />
            <div className="dot minimize" />
            <div className="dot maximize" />
            <div className="flex-1 text-center text-xs text-zinc-500 font-mono">intelligence.9th-grade-ai — session</div>
            <div className="w-[52px]" aria-hidden="true" />
          </div>

          <div
            className="p-4 md:p-6 font-mono text-sm leading-relaxed h-[420px] sm:h-[500px] overflow-y-auto"
            ref={terminalRef}
          >
            <div className="space-y-1">
              {lines.map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className={
                    line.type === "command" ? "text-emerald-400" :
                    line.type === "output" ? "text-zinc-300" :
                    line.type === "progress" ? "text-zinc-200" :
                    "text-emerald-300"
                  }
                >
                  {line.type === "command" && (
                    <>
                      <span className="text-emerald-400">$ </span>
                      <span className="cursor-blink">{line.text.replace("█", "")}</span>
                    </>
                  )}
                  {line.type === "output" && <span>{line.text}</span>}
                  {line.type === "progress" && (
                    <div className="flex items-center gap-3">
                      <span className="w-40 text-zinc-400 truncate">{line.label}</span>
                      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: line.value / line.total }}
                          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
                          style={{ transformOrigin: "left" }}
                          className="h-full w-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full"
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
                className="mt-4 px-4 py-2 text-sm font-medium text-zinc-950 bg-emerald-500 rounded-full hover:bg-emerald-400 transition-colors font-mono flex items-center gap-2"
              >
                Restart Simulation
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
