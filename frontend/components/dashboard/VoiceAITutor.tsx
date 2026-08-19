"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Send, X, Volume2, Loader2, Sparkles, Bot, User, GraduationCap, Lightbulb, Calculator, FlaskConical } from "lucide-react";
import { PRESET_PROMPTS } from "@/lib/data/ai";
import type { TutorMessage } from "@/lib/types";

const PRESET_ICONS: Record<string, typeof Lightbulb> = {
  "physics-formulas": Lightbulb,
  "math-shortcuts": Calculator,
  "chemistry-table": FlaskConical,
};

// Minimal typings for the (vendor-prefixed) Web Speech API, which isn't in
// the standard DOM lib yet.
type SpeechRecognitionResultLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export default function VoiceAITutor() {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Per-instance counter kept in a ref so multiple mounts never collide.
  const nextMsgId = useRef(0);

  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      const Ctor = (window as unknown as { webkitSpeechRecognition: SpeechRecognitionCtor })
        .webkitSpeechRecognition;
      const recognition = new Ctor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "bn-BD";

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
    }
  }, []);

  const addMessage = (msg: Omit<TutorMessage, "id" | "timestamp">) => {
    const newId = `msg-${nextMsgId.current++}`;
    setMessages((prev) => [...prev, { ...msg, id: newId, timestamp: Date.now() }]);
  };

  const speakResponse = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "bn-BD";
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    speechSynthesis.speak(utterance);
  };

  const generateAIResponse = (prompt: string): Omit<TutorMessage, "id" | "timestamp"> => {
    const lower = prompt.toLowerCase();
    if (lower.includes("motion") || lower.includes("formula")) {
      return {
        role: "ai",
        text: "For motion problems, use s = ut + 1/2 at^2. For projectile motion, consider initial velocity and angle. Remember: v = u + at. Let me know if you need a step-by-step derivation!",
      };
    } else if (lower.includes("trig") || lower.includes("triangle")) {
      return {
        role: "ai",
        text: "sin = opposite/hypotenuse, cos = adjacent/hypotenuse, tan = opposite/adjacent. For quick recall, remember SOH-CAH-TOA. Need a full derivation?",
      };
    } else if (lower.includes("periodic")) {
      return {
        role: "ai",
        text: "The periodic table is organized by atomic number. Elements are grouped by similar chemical properties. Use mnemonics like HHeLiBeB to remember the first five elements.",
      };
    } else if (lower.includes("bangladesh") || lower.includes("liberation")) {
      return {
        role: "ai",
        text: "Bangladesh Liberation War started on 26 March 1971 and ended on 16 December 1971. Key figures: Sheikh Mujibur Rahman, Ziaur Rahman, and Tajuddin Ahmad.",
      };
    } else if (lower.includes("english") || lower.includes("grammar")) {
      return {
        role: "ai",
        text: "For English grammar, remember: Subject + Auxiliary + Main Verb. For negative: Subject + do/does + not + verb. For questions: Auxiliary + Subject + Main Verb.",
      };
    } else {
      return {
        role: "ai",
        text: "I'm here to help you with any subject! Ask me about Physics formulas, Math shortcuts, Chemistry, Biology, English grammar, Bangladesh history, or Computer basics. I can explain concepts step by step.",
      };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    addMessage({ role: "user", text: input.trim() });
    const userInput = input.trim();
    setInput("");
    setIsGenerating(true);

    const aiResponse = generateAIResponse(userInput);
    setTimeout(() => {
      addMessage(aiResponse);
      setIsGenerating(false);
      speakResponse(aiResponse.text);
    }, 1200);
  };

  const handlePresetClick = (prompt: { bn: string }) => {
    addMessage({ role: "user", text: prompt.bn });
    setIsGenerating(true);
    const aiResponse = generateAIResponse(prompt.bn);
    setTimeout(() => {
      addMessage(aiResponse);
      setIsGenerating(false);
      speakResponse(aiResponse.text);
    }, 1200);
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const stopSpeaking = () => {
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Focus management for the modal: trap Tab within the dialog and close on
  // Escape. Effect runs only while the modal is open.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showModal) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const prevFocused = document.activeElement as HTMLElement | null;
    const focusable = dialog.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowModal(false);
        stopSpeaking();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      prevFocused?.focus?.();
    };
  }, [showModal]);

  return (
    <>
      {/* Floating Voice Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setShowModal(true)}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 bg-emerald-500 rounded-full shadow-neon-glow flex items-center justify-center text-zinc-950 hover:bg-emerald-400 transition-colors"
      >
        <Sparkles className="w-6 h-6" />
      </motion.button>

      {/* Voice Tutor Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-tutor-title"
            className="fixed inset-0 z-50 flex flex-col bg-[var(--surface-solid)] bg-opacity-95 backdrop-filter backdrop-blur-sm outline-none"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-[var(--surface-solid)] border-b border-emerald-500/30">
              <div className="flex items-center gap-3 min-w-0">
                <Bot className="w-6 h-6 text-emerald-500 flex-shrink-0" aria-hidden="true" />
                <span id="voice-tutor-title" className="text-emerald-500 font-bold truncate">9Th-Grade AI Tutor</span>
                <span
                  aria-live="polite"
                  className={`px-2 py-0.5 rounded-full text-xs font-mono hidden sm:inline-flex items-center gap-1 ${
                    isListening ? "bg-red-500/10 text-red-400 animate-pulse" :
                    isSpeaking ? "bg-emerald-500/10 text-emerald-400 animate-pulse" :
                    "bg-emerald-500/10 text-emerald-400"
                  }`}
                >
                  {isListening ? <Mic className="w-3 h-3" /> : isSpeaking ? <Volume2 className="w-3 h-3" /> : null}
                  {isListening ? "LISTENING..." : isSpeaking ? "SPEAKING..." : "STATUS: ONLINE"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isSpeaking && (
                  <button
                    onClick={stopSpeaking}
                    className="p-2 text-red-400 hover:text-red-300 transition-colors"
                    title="Stop speaking"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => { setShowModal(false); stopSpeaking(); }}
                  className="p-2 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Prompts */}
            <div className="px-4 py-2 bg-subtle border-b border-emerald-500/10">
              <div className="flex gap-2 overflow-x-auto">
                {PRESET_PROMPTS.map((p, i) => {
                  const PresetIcon = PRESET_ICONS[p.id] ?? Lightbulb;
                  return (
                    <motion.button
                      key={p.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      whileHover={{ scale: 1.05 }}
                      onClick={() => handlePresetClick(p.label)}
                      className="flex-shrink-0 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-mono text-zinc-300 hover:bg-emerald-400 hover:text-zinc-950 transition-colors flex items-center gap-1.5"
                    >
                      <PresetIcon className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                      <span>{p.label.bn}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Chat Console */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="terminal-window-bar mb-4">
                <div className="dot close" onClick={() => setShowModal(false)} role="button" />
                <div className="dot minimize" /><div className="dot maximize" />
                <div className="flex-1 text-center text-xs text-zinc-400 font-mono">voice.tutor.9th-grade-ai</div>
              </div>

              <div className="space-y-3" ref={terminalRef} aria-live="polite" role="log">
                {messages.length === 0 && (
                  <div className="text-center py-12">
                    <GraduationCap className="w-12 h-12 mx-auto mb-3 text-emerald-500/60" aria-hidden="true" />
                    <p className="text-sm text-zinc-400 font-mono">
                      Hi! I&apos;m your AI Tutor. Ask me anything about your subjects.
                    </p>
                    <p className="text-xs text-zinc-600 font-mono mt-2">
                      Use the microphone to speak in Bengali or type your question.
                    </p>
                  </div>
                )}
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: msg.role === "user" ? -20 : 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex items-start gap-3 p-3 rounded-terminal-rounded max-w-3xl ${
                      msg.role === "user"
                        ? "bg-zinc-900 text-emerald-300 ml-auto"
                        : "bg-emerald-500/10 text-zinc-300"
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      msg.role === "ai" ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                    }`}>
                      {msg.role === "ai" ? (
                        <Bot className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <User className="w-4 h-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Input area */}
            <form
              onSubmit={(e) => {
                void handleSubmit(e);
              }}
              className="p-4 bg-[var(--surface-solid)] border-t border-emerald-500/20"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-3 rounded-lg border transition-all ${
                    isListening
                      ? "bg-red-500/10 border-red-500/30 text-red-400 animate-pulse"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                  title={isListening ? "Stop listening" : "Start voice input"}
                  aria-label={isListening ? "Stop listening" : "Start voice input"}
                  aria-pressed={isListening}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <input
                  type="text"
                  value={input}
                  aria-label="Type your question or use voice input"
                  placeholder={isListening ? "Listening..." : "Type your question or use voice..."}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 bg-subtle border border-emerald-500/20 rounded-lg px-4 py-2.5 text-sm text-zinc-300 font-mono focus:outline-none focus:border-emerald-500/40"
                  disabled={isGenerating}
                />
                <button
                  type="submit"
                  disabled={isGenerating || !input.trim()}
                  className="p-3 bg-emerald-500 text-zinc-950 rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
