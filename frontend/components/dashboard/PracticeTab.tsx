"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Check, Minus, ChevronDown, ChevronRight, Play, BookOpen, Timer, Zap } from "lucide-react";
import { SUBJECTS, TOPIC_TREES, DEFAULT_TOPICS } from "@/lib/data";
import { api } from "@/lib/services/api";

type PracticeMode = "mock" | "quick";

const MODES: { id: PracticeMode; label: string }[] = [
  { id: "mock", label: "MOCK_TEST" },
  { id: "quick", label: "QUICK_PRACTICE" },
];

export default function PracticeTab() {
  const [mode, setMode] = useState<PracticeMode>("quick");
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(25);
  const [subjects, setSubjects] = useState(SUBJECTS);

  // Load subjects from the database (fallback to static data).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.subjects();
        if (!cancelled && list.length) {
          setSubjects(
            list.map((s) => ({
              name: s.nameBn,
              icon: s.icon,
              color: s.color,
              bg: s.bg,
            })),
          );
        }
      } catch {
        /* keep static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openDrawer = (subject: string) => {
    setSelectedSubject(subject);
    setStep(1);
    setSelectedTopics(new Set());
    setExpandedGroup(null);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => setIsDrawerOpen(false);

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  const topics = selectedSubject ? (TOPIC_TREES[selectedSubject] ?? DEFAULT_TOPICS) : [];

  const totalSelectedQuestions = () => {
    let count = 0;
    topics.forEach((group) => {
      group.subTopics.forEach((st) => {
        if (selectedTopics.has(st.name)) {
          const match = st.questions.match(/\/\s*([\d.,]+K?)/);
          if (match) {
            const val = match[1];
            count += val.endsWith("K") ? parseFloat(val) * 1000 : parseInt(val);
          }
        }
      });
    });
    return count.toLocaleString();
  };

  const adjustQuantity = (delta: number) => {
    setQuantity((q) => Math.min(100, Math.max(5, q + delta)));
  };

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-2 bg-zinc-900/50 border border-emerald-500/20 rounded-lg p-1 w-fit"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-mono rounded-md transition-all ${
              mode === m.id
                ? "bg-emerald-500 text-zinc-950 shadow-neon-glow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {m.id === "mock" ? <Timer className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            [ {m.label} ]
          </button>
        ))}
      </motion.div>

      {mode === "mock" ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-terminal-rounded border border-terminal-border p-6 text-center"
        >
          <BookOpen className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white mb-1">Adaptive Mock Test</h3>
          <p className="text-sm text-zinc-400 mb-4">AI generates a full mock test based on your weak areas.</p>
          <button className="px-6 py-3 bg-emerald-500 text-zinc-950 font-mono rounded hover:bg-emerald-400 transition-colors shadow-neon-glow">
            [ Generate Mock Test ]
          </button>
        </motion.div>
      ) : (
        <>
          {/* Subject grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {subjects.map((subject, i) => (
              <motion.button
                key={subject.name}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03, type: "spring", stiffness: 300, damping: 20 }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => openDrawer(subject.name)}
                className="glass rounded-terminal-rounded border border-terminal-border p-4 flex flex-col items-center gap-2 hover:border-emerald-500/40 hover:shadow-neon-glow transition-all"
              >
                <div className={`w-12 h-12 rounded-lg ${subject.bg} flex items-center justify-center text-2xl`}>
                  {subject.icon}
                </div>
                <span className={`text-xs font-mono text-center leading-tight ${subject.color}`}>
                  {subject.name}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">SELECT_TOPICS →</span>
              </motion.button>
            ))}
          </div>
        </>
      )}

      {/* Drawer / Modal */}
      <AnimatePresence>
        {isDrawerOpen && selectedSubject && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDrawer}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />

            {/* Drawer */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[90vh] overflow-y-auto bg-zinc-950 border-t-2 border-emerald-500/30 rounded-t-2xl shadow-neon-glow md:inset-0 md:m-auto md:max-w-lg md:max-h-[80vh] md:rounded-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Topic selector"
            >
              {/* Header */}
              <div className="terminal-window-bar sticky top-0 z-10">
                <div className="dot close" onClick={closeDrawer} role="button" />
                <div className="dot minimize" /><div className="dot maximize" />
                <div className="flex-1 text-center text-xs text-zinc-400 font-mono">
                   {"// STEP " + step + "/2: " + (step === 1 ? "SELECT_TOPICS" : "CONFIGURE")}
                </div>
                <button onClick={closeDrawer} className="text-zinc-500 hover:text-white transition-colors" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 md:p-5">
                <h3 className="text-lg font-bold text-white mb-1">{selectedSubject}</h3>
                <p className="text-sm text-zinc-400 font-mono mb-4">
                  {step === 1 ? "Select topics to practice" : "Configure your practice set"}
                </p>

                {/* STEP 1: Topics */}
                {step === 1 && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <div className="space-y-3 mb-24">
                      {topics.map((group) => (
                        <div key={group.name} className="glass rounded-terminal-rounded border border-terminal-border overflow-hidden">
                          <button
                            onClick={() => setExpandedGroup(expandedGroup === group.name ? null : group.name)}
                            className="w-full flex items-center justify-between p-3 hover:bg-emerald-500/5 transition-colors"
                          >
                            <span className="text-sm font-medium text-white">{group.name}</span>
                            <ChevronDown
                              className={`w-4 h-4 text-emerald-400 transition-transform ${expandedGroup === group.name ? "rotate-180" : ""}`}
                            />
                          </button>
                          <AnimatePresence>
                            {expandedGroup === group.name && (
                               <motion.div
                                 initial={{ opacity: 0 }}
                                 animate={{ opacity: 1 }}
                                 exit={{ opacity: 0 }}
                                 transition={{ duration: 0.25 }}
                                 className="overflow-hidden"
                               >
                                <div className="divide-y divide-emerald-500/10">
                                  {group.subTopics.map((st) => {
                                    const isSelected = selectedTopics.has(st.name);
                                    return (
                                      <label
                                        key={st.name}
                                        className="flex items-center justify-between gap-3 p-3 cursor-pointer hover:bg-emerald-500/5 transition-colors"
                                      >
                                        <div className="flex items-center gap-3 flex-1">
                                          <button
                                            onClick={() => toggleTopic(st.name)}
                                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                              isSelected
                                                ? "bg-emerald-500 border-emerald-500 text-zinc-950"
                                                : "border-emerald-500/30 text-transparent"
                                            }`}
                                            aria-label={`Toggle ${st.name}`}
                                          >
                                            <Check className="w-3.5 h-3.5" />
                                          </button>
                                          <span className={`text-sm ${isSelected ? "text-white" : "text-zinc-400"}`}>
                                            {st.name}
                                          </span>
                                        </div>
                                        <span className="text-xs text-emerald-400 font-mono">{st.questions}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* STEP 2: Quantity */}
                {step === 2 && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="mb-24"
                  >
                    <div className="glass rounded-terminal-rounded border border-terminal-border p-5 text-center">
                      <p className="text-sm text-zinc-400 font-mono mb-4">SELECT_QUESTION_QUANTITY</p>
                      <div className="flex items-center justify-center gap-4 mb-4">
                        <button
                          onClick={() => adjustQuantity(-5)}
                          className="w-10 h-10 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="text-4xl font-bold text-emerald-400 font-mono">{quantity}</div>
                        <button
                          onClick={() => adjustQuantity(5)}
                          className="w-10 h-10 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-sm text-zinc-400 font-mono">
                        Questions: <span className="text-emerald-400">{quantity}</span> • Time:{" "}
                        <span className="text-emerald-400">{Math.round(quantity * 1.2)} min</span>
                      </div>
                      <div className="mt-4 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                        <p className="text-xs text-zinc-400">
                          <span className="text-emerald-400 font-mono">{selectedTopics.size}</span> topics selected •{" "}
                          <span className="text-emerald-400 font-mono">{totalSelectedQuestions()}</span> questions available
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Sticky footer */}
                <div className="sticky bottom-0 -mx-4 -mb-4 px-4 py-3 bg-zinc-950/95 backdrop-blur-md border-t border-emerald-500/20 flex items-center gap-2">
                  {step === 2 && (
                    <button
                      onClick={() => setStep(1)}
                      className="px-4 py-2.5 bg-transparent border border-emerald-500/30 text-zinc-300 font-mono text-sm rounded-lg hover:bg-emerald-500/10 transition-colors"
                    >
                      ← Back
                    </button>
                  )}
                  <button
                    onClick={() => setStep((s) => s + 1)}
                    disabled={step === 1 && selectedTopics.size === 0}
                    className="flex-1 py-2.5 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {step === 1 ? (
                      <>Next: Configure <ChevronRight className="w-4 h-4" /></>
                    ) : (
                      <>Execute → <Play className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}