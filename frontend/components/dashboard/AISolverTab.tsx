"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Camera, Sparkles, X, Copy, Check, Loader2, Lightbulb } from "lucide-react";
import { SOLVER_EXAMPLES } from "@/lib/data/study";

export default function AISolverTab() {
  const [inputType, setInputType] = useState<"text" | "image">("text");
  const [textInput, setTextInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [solution, setSolution] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState("General");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subjects = ["General", "Physics", "Mathematics", "Biology", "Chemistry", "English", "বাংলা", "বাংলাদেশ বিষয়াবলি", "Computer"];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const solveQuestion = async () => {
    if (!textInput.trim() && !imagePreview) return;

    setIsSolving(true);
    setSolution(null);
    setSteps([]);

    try {
      const body: { text?: string; subject?: string; imageBase64?: string } = {
        text: textInput,
        subject: selectedSubject !== "General" ? selectedSubject : undefined,
      };
      if (imagePreview) {
        body.imageBase64 = imagePreview.split(",")[1] ?? undefined;
      }

      const res = await fetch("/api/ai/solver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Solver request failed");
      const data = await res.json();
      setSolution(data.solution);
      setSteps(data.steps ?? []);
    } catch {
      setSolution("Sorry, the AI solver is temporarily unavailable. Please try again.");
      setSteps([]);
    } finally {
      setIsSolving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearAll = () => {
    setTextInput("");
    setImagePreview(null);
    setSolution(null);
    setSteps([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-terminal-rounded border border-terminal-border p-5"
      >
        <div className="terminal-window-bar mb-4 border-b border-terminal-border">
          <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
          <div className="flex-1 text-center text-xs text-zinc-400 font-mono">{"// AI_QUESTION_SOLVER"}</div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-white">AI Question Solver</h2>
          <span className="text-xs text-zinc-500 font-mono">Text & Image Input</span>
        </div>

        <p className="text-sm text-zinc-400 font-mono mb-4">
          Type or upload a photo of any question. Our AI will solve it step by step.
        </p>

        {/* Subject Selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {subjects.map((subject) => (
            <button
              key={subject}
              onClick={() => setSelectedSubject(subject)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                selectedSubject === subject
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-emerald-500/20"
              }`}
            >
              {subject}
            </button>
          ))}
        </div>

        {/* Input Type Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setInputType("text")}
            className={`flex-1 py-2.5 rounded-lg border font-mono text-sm transition-all ${
              inputType === "text"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400"
            }`}
          >
            Text Input
          </button>
          <button
            onClick={() => setInputType("image")}
            className={`flex-1 py-2.5 rounded-lg border font-mono text-sm transition-all ${
              inputType === "image"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400"
            }`}
          >
            <Camera className="w-4 h-4 inline mr-1" />
            Photo Upload
          </button>
        </div>

        {/* Input Area */}
        <div className="space-y-4">
          {inputType === "text" ? (
            <div className="relative">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type your question here... (e.g., 'Solve: 2x + 5 = 15')"
                className="w-full h-32 bg-zinc-900/50 border border-emerald-500/20 rounded-terminal-rounded p-4 text-sm text-zinc-300 font-mono resize-none focus:outline-none focus:border-emerald-500/40"
              />
              {textInput && (
                <button
                  onClick={clearAll}
                  className="absolute top-3 right-3 p-1 text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              {imagePreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data/blob URL preview, not a static asset */}
                  <img
                    src={imagePreview}
                    alt="Uploaded question"
                    className="w-full max-h-64 object-contain rounded-terminal-rounded border border-emerald-500/20"
                  />
                  <button
                    onClick={clearAll}
                    className="absolute top-3 right-3 p-1.5 bg-zinc-900/80 border border-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-emerald-500/20 rounded-terminal-rounded flex flex-col items-center justify-center gap-2 hover:border-emerald-500/40 transition-colors"
                >
                  <Upload className="w-8 h-8 text-emerald-400" />
                  <span className="text-sm text-zinc-400 font-mono">Click to upload question image</span>
                </button>
              )}
            </div>
          )}

          {/* Example Questions */}
          <div className="space-y-2">
            <p className="text-xs text-zinc-500 font-mono">Try an example:</p>
            <div className="flex flex-wrap gap-2">
              {SOLVER_EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => { setTextInput(ex.question); setInputType("text"); }}
                  className="px-3 py-1.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-xs text-zinc-400 hover:border-emerald-500/20 hover:text-emerald-400 transition-all"
                >
                  {ex.subject}: {ex.question.slice(0, 40)}...
                </button>
              ))}
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={solveQuestion}
            disabled={isSolving || (!textInput.trim() && !imagePreview)}
            className="w-full py-3 bg-emerald-500 text-zinc-950 font-mono rounded-lg hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSolving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Solving...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Solve with AI
              </>
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Solution Display */}
      <AnimatePresence>
        {solution && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-terminal-rounded border border-emerald-500/30 p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-medium text-white">Solution</h3>
              </div>
              <button
                onClick={() => copyToClipboard(solution)}
                className="p-1.5 text-zinc-400 hover:text-emerald-400 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Steps */}
            {steps.length > 0 && (
              <div className="space-y-3 mb-4">
                {steps.map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xs font-mono text-emerald-400 flex-shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-sm text-zinc-300 font-mono">{step}</p>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Final Answer */}
            <div className="p-4 bg-zinc-900/50 border border-emerald-500/20 rounded-terminal-rounded">
              <pre className="text-sm text-emerald-300 font-mono whitespace-pre-wrap">{solution}</pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
