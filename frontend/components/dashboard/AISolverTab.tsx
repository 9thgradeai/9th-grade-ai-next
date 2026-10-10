"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Camera, X, Copy, Check, Spinner, Lightbulb, Chat, Target } from "@phosphor-icons/react";
import { SOLVER_EXAMPLES } from "@/lib/data/study";
import { solve } from "@/lib/services/ai";
import { api } from "@/lib/services/api";
import { launchAI } from "@/lib/ai-launcher";
import Markdown from "@/components/chat/Markdown";
import AiLogo from "@/components/ui/AiLogo";
import AISourceFooter from "./ai/AISourceFooter";
import RichText, { truncateMathSafe } from "@/components/ui/RichText";

export default function AISolverTab() {
  const [inputType, setInputType] = useState<"text" | "image">("text");
  const [textInput, setTextInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [solution, setSolution] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [explanation, setExplanation] = useState<string>("");
  const [relatedConcept, setRelatedConcept] = useState<string>("");
  const [sourceMeta, setSourceMeta] = useState<{ source: string; model?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [drilling, setDrilling] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [solverError, setSolverError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("General");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  // Timers must never fire after unmount (stale setState + Test double-fire).
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const subjects = ["General", "Physics", "Mathematics", "Biology", "Chemistry", "English", "বাংলা", "বাংলাদেশ বিষয়াবলি", "Computer"];
  const MAX_TEXT = 2000;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(null);
    if (!file.type.startsWith("image/")) { setFileError("শুধু ছবি ফাইল দিন (image/*)।"); return; }
    if (file.size > 5 * 1024 * 1024) { setFileError("ছবি ৫MB-এর কম হতে হবে।"); return; }
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === "string") {
          setImagePreview(result);
        } else {
          setFileError("ছবি পড়া যায়নি — অন্য ফাইল চেষ্টা করুন।");
        }
      };
      reader.onerror = () => {
        setFileError("ছবি পড়া যায়নি — অন্য ফাইল চেষ্টা করুন।");
      };
      reader.readAsDataURL(file);
  };

  const solveQuestion = async () => {
    if (!textInput.trim() && !imagePreview) return;
    if (textInput.trim().length < 3) { setSolverError("প্রশ্নটি একটু বিস্তারিত লিখুন (কমপক্ষে ৩ অক্ষর)।"); return; }

    setIsSolving(true);
    setSolution(null);
    setSolverError(null);
    setDrillError(null);
    setSteps([]);
    setSourceMeta(null);

    try {
      const result = await solve({
        text: textInput,
        subject: selectedSubject !== "General" ? selectedSubject : undefined,
        imageBase64: imagePreview ? imagePreview.split(",")[1] ?? undefined : undefined,
      });
      setSolution(result.solution);
      setSteps(result.steps ?? []);
      setExplanation(result.explanation ?? "");
      setRelatedConcept(result.relatedConcept ?? "");
      setSourceMeta({ source: result.source, model: result.model });
    } catch {
      setSolverError("AI solver সাময়িকভাবে unavailable। আবার চেষ্টা করুন।");
      setSolution(null);
      setSteps([]);
      setExplanation("");
      setRelatedConcept("");
      setSourceMeta(null);
    } finally {
      setIsSolving(false);
    }
  };

  const askTutorToExplain = () => {
    launchAI({
      mode: "tutor",
      prompt: `The question was: ${textInput || "the uploaded image question"}. Please teach me the concept behind this solution step by step.`,
    });
  };

  const drillSimilar = async () => {
    const query = relatedConcept.trim() || textInput.trim().split(/\s+/).slice(0, 8).join(" ");
    if (!query || drilling) return;
    setDrilling(true);
    setDrillError(null);
    try {
      const qs = await api.questions({ q: query, limit: 5 });
      if (qs.length === 0) {
        setDrillError("এই বিষয়ে প্রশ্নব্যাংকে কিছু পাওয়া যায়নি।");
        return;
      }
      window.dispatchEvent(
        new CustomEvent("ai:start-practice", {
          detail: { questionIds: qs.map((q) => q.id), title: "AI সুপারিশকৃত ড্রিল" },
        }),
      );
    } catch {
      setDrillError("ড্রিল লোড করা যায়নি — আবার চেষ্টা করুন।");
    } finally {
      setDrilling(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard failures
    }
  };

  const clearAll = () => {
    setTextInput("");
    setImagePreview(null);
    setSolution(null);
    setSteps([]);
    setExplanation("");
    setRelatedConcept("");
    setSourceMeta(null);
    setDrillError(null);
  };

  return (
    <div className="space-y-6 bg-transparent">
      {/* Header — transparent glass: dashboard world-map shows through */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border p-5 backdrop-blur-xl"
        style={{ background: "color-mix(in srgb, var(--surface-raised) 62%, transparent)" }}
      >
        <p className="command-eyebrow mb-3">AI Solver</p>
        <div className="flex items-center gap-2 mb-4">
          <AiLogo className="w-5 h-5" />
          <h2 className="text-lg font-bold text-text-primary">AI Question Solver</h2>
          <span className="text-xs text-text-muted">Text & Image Input</span>
        </div>

        <p className="text-sm text-text-muted mb-4">
          Type or upload a photo of any question. Our AI will solve it step by step.
        </p>

        {/* Subject Selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {subjects.map((subject) => (
            <button
              key={subject}
              onClick={() => setSelectedSubject(subject)}
              className={`px-3 py-1.5 rounded-lg border border-border text-xs font-mono transition-all ${
                selectedSubject === subject
                  ? "bg-primary-subtle border-primary/30 text-primary"
                  : "bg-subtle border-border-muted text-text-muted hover:border-primary/20"
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
            className={`flex-1 py-2.5 rounded-lg border border-border font-mono text-sm transition-all ${
              inputType === "text"
                ? "bg-primary-subtle border-primary/30 text-primary"
                : "bg-subtle border-border-muted text-text-muted"
            }`}
          >
            Text Input
          </button>
          <button
            onClick={() => setInputType("image")}
            className={`flex-1 py-2.5 rounded-lg border border-border font-mono text-sm transition-all ${
              inputType === "image"
                ? "bg-primary-subtle border-primary/30 text-primary"
                : "bg-subtle border-border-muted text-text-muted"
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
                onChange={(e) => setTextInput(e.target.value.slice(0, MAX_TEXT))}
                maxLength={MAX_TEXT}
                placeholder="আপনার প্রশ্ন লিখুন... (e.g., 'Solve: 2x + 5 = 15')"
                aria-label="প্রশ্ন লিখুন"
                className="w-full h-32 bg-subtle border border-primary/20 rounded-2xl p-4 text-sm text-text-secondary font-mono resize-none focus:outline-none focus:border-primary/40"
              />
              <div className="mt-1 text-right text-[11px] font-mono text-text-muted">{textInput.length}/{MAX_TEXT}</div>
              {textInput && (
                <button
                  onClick={clearAll}
                  className="absolute top-3 right-3 p-1 text-text-muted hover:text-text-primary transition-colors"
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
                  {/* eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not optimizable */}
                  <img
                    src={imagePreview}
                    alt="Uploaded question"
                    className="w-full max-h-64 object-contain rounded-2xl border border-primary/20"
                  />
                  <button
                    type="button"
                    onClick={clearAll}
                    aria-label="Remove uploaded image"
                    className="absolute top-3 right-3 p-1.5 bg-subtle border border-border rounded-lg text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-primary/20 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-primary/40 transition-colors"
                >
                  <ArrowUp className="w-8 h-8 text-primary" />
                  <span className="text-sm text-text-muted font-mono">Click to upload question image</span>
                </button>
              )}
            </div>
          )}

          {/* Example Questions */}
          <div className="space-y-2">
            <p className="text-xs text-text-muted font-mono">Try an example:</p>
            <div className="flex flex-wrap gap-2">
              {SOLVER_EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  disabled={isSolving}
                  onClick={() => { setTextInput(ex.question); setInputType("text"); }}
                  className="px-3 py-1.5 bg-subtle border border-border rounded-lg text-xs text-text-muted hover:border-primary/20 hover:text-text-primary transition-all"
                >
                  {ex.subject}: <RichText text={truncateMathSafe(ex.question, 40)} />
                </button>
              ))}
            </div>
          </div>

          {fileError && <p role="alert" className="text-xs font-mono text-red-400">{fileError}</p>}
          {solverError && (
            <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-center justify-between gap-2">
              <p className="text-xs font-mono text-red-300">{solverError}</p>
              <button type="button" onClick={() => void solveQuestion()} className="px-3 py-1.5 rounded-lg border border-red-500/30 text-xs font-mono">আবার চেষ্টা করুন</button>
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void solveQuestion()}
            disabled={isSolving || (!textInput.trim() && !imagePreview)}
            className="w-full py-3 bg-accent text-text-inverse font-mono rounded-lg hover:bg-accent-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSolving ? (
              <>
                <Spinner className="w-5 h-5 animate-spin" />
                Solving...
              </>
            ) : (
              <>
                <AiLogo solid={false} className="w-5 h-5" />
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
            transition={{ type: "spring" }}
            className="rounded-2xl border border-primary/30 p-5 backdrop-blur-xl"
            style={{ background: "color-mix(in srgb, var(--surface-raised) 62%, transparent)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-dashboard-warning" />
                <h3 className="text-sm font-medium text-text-primary">Solution</h3>
              </div>
              <button
                onClick={() => {
                  void copyToClipboard(solution);
                }}
                aria-label={copied ? "Copied!" : "Copy solution"}
                className="p-1.5 text-text-muted hover:text-primary transition-colors"
                title={copied ? "Copied!" : "Copy solution"}
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
                    transition={{ type: "spring", stiffness: 200, damping: 30 }}
                    className="flex items-start gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-primary-subtle border border-primary/20 flex items-center justify-center text-xs font-mono text-primary flex-shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-sm text-text-secondary font-mono">{step}</p>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Final Answer */}
            <div className="p-4 bg-subtle border border-primary/20 rounded-2xl">
              <Markdown text={solution} />
            </div>

            {/* Concept explanation + tutor handoff */}
            {(explanation || relatedConcept) && (
              <div className="mt-4 space-y-2 text-sm text-text-muted">
                {explanation && (
                  <p>
                    <span className="text-primary font-mono text-xs">CONCEPT: </span>
                    {explanation}
                  </p>
                )}
                {relatedConcept && (
                  <p>
                    <span className="text-primary font-mono text-xs">NEXT: </span>
                    Study related concept — {relatedConcept}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={askTutorToExplain}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-surface-raised border border-primary/20 text-primary rounded-lg text-sm font-mono hover:bg-primary-subtle transition-colors"
            >
              <Chat className="w-4 h-4" />
              Ask the AI Tutor to explain this step by step
            </button>
            <button
              onClick={() => void drillSimilar()}
              disabled={drilling}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-surface-raised border border-primary/20 text-primary rounded-lg text-sm font-mono hover:bg-primary-subtle transition-colors disabled:opacity-60"
            >
              {drilling ? <Spinner className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
              {drilling ? "ড্রিল তৈরি হচ্ছে…" : "একই বিষয়ে ড্রিল করো"}
            </button>
            {drillError && (
              <p role="alert" className="mt-2 text-xs font-mono text-[var(--dashboard-danger)]">{drillError}</p>
            )}
            {sourceMeta && (
              <AISourceFooter provider={sourceMeta.source} model={sourceMeta.model} className="mt-3" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}