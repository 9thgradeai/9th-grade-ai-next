"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { BrainCircuit, Loader2, RefreshCw, Sparkles, Target, Zap, Activity, BookOpen } from "lucide-react";
import { runAgentTurn, AIError } from "@/lib/services/ai";
import type { AgentBlockDto } from "@/lib/types";
import AgentBlocks from "./AgentBlocks";

const STRATEGY_PROMPTS = [
  {
    icon: Target,
    label: "আজকের স্ট্র্যাটেজি",
    prompt: "আমার অগ্রগতি, দুর্বল বিষয় এবং ভুল প্রশ্নগুলো বিশ্লেষণ করে আজকের জন্য একটি সুনির্দিষ্ট স্টাডি প্ল্যান তৈরি করো।",
  },
  {
    icon: Zap,
    label: "দুর্বল বিষয় মেরামত",
    prompt: "আমার সবচেয়ে কম নম্বর পাওয়া ৩টি বিষয় চিহ্নিত করো এবং সেগুলো থেকে কীভাবে দ্রুত স্কোর বাড়ানো যায় তা বলো।",
  },
  {
    icon: BrainCircuit,
    label: "১৫-মিনিট ড্রিল",
    prompt: "বিসিএস প্রিলির জন্য একটি ১৫-মিনিটের হাই-ইন্টেনসিটি কুইজ সেশন সুপারিশ করো এবং ৩টি গুরুত্বপূর্ণ কৌশল দাও।",
  },
  {
    icon: Activity,
    label: "পারফরম্যান্স অডিট",
    prompt: "আমার নির্ভুলতার হার (accuracy rate) এবং টাইম ম্যানেজমেন্ট বিশ্লেষণ করে একটি রিয়েল-টাইম ফিডব্যাক দাও।",
  },
];

type CoachResult = {
  text: string;
  blocks: AgentBlockDto[];
  provider: string;
  model: string;
};

export default function HomeCoach() {
  const [running, setRunning] = useState(false);
  const [runText, setRunText] = useState("");
  const [runBlocks, setRunBlocks] = useState<AgentBlockDto[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CoachResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const runWithPrompt = useCallback(
    async (prompt: string) => {
      if (running) return;
      const abortController = new AbortController();
      abortRef.current = abortController;
      setRunning(true);
      setError(null);
      setResult(null);
      setRunText("");
      setRunBlocks([]);
      setStatusMsg("এআই নিউরাল অ্যানালাইসিস চলছে…");
      try {
        const res = await runAgentTurn({
          question: prompt,
          onDelta: (chunk) => setRunText((prev) => prev + chunk),
          onStatus: (message) => setStatusMsg(message),
          onBlock: (block) => setRunBlocks((prev) => [...prev, block]),
          signal: abortController.signal,
        });
        abortRef.current = null;
        setRunning(false);
        setResult({ text: res.text, blocks: res.blocks, provider: res.provider, model: res.model });
      } catch (e) {
        abortRef.current = null;
        setRunning(false);
        setStatusMsg("");
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof AIError ? e.message : "দুঃখিত, এখন পরামর্শ তৈরি করা যাচ্ছে না।");
      }
    },
    [running]
  );

  const runDefault = useCallback(() => {
    void runWithPrompt(STRATEGY_PROMPTS[0].prompt);
  }, [runWithPrompt]);

  useEffect(() => {
    const handleQuickTutor = (e: Event) => {
      const customEvent = e as CustomEvent<{ subject?: string }>;
      const subject = customEvent.detail?.subject;
      const customPrompt = subject
        ? `${subject} বিষয়ে আমার দক্ষতা দুর্বল। এই বিষয়ের সবচেয়ে গুরুত্বপূর্ণ প্রশ্ন ও শর্টকাট কৌশল গাইড করো।`
        : STRATEGY_PROMPTS[0].prompt;
      void runWithPrompt(customPrompt);
    };

    window.addEventListener("dashboard:ask-tutor", handleQuickTutor);
    window.addEventListener("dashboard:quick-ai-tutor", handleQuickTutor);
    return () => {
      window.removeEventListener("dashboard:ask-tutor", handleQuickTutor);
      window.removeEventListener("dashboard:quick-ai-tutor", handleQuickTutor);
    };
  }, [runWithPrompt]);

  const isMock = result?.provider === "mock";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="command-card command-card--glow p-5 sm:p-6 relative overflow-hidden"
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--dashboard-primary), transparent)" }}
        aria-hidden="true"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm"
            style={{
              background: "var(--dashboard-primary-subtle)",
              borderColor: "color-mix(in srgb, var(--dashboard-primary) 24%, transparent)",
              color: "var(--dashboard-primary)",
            }}
          >
            <BrainCircuit className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="command-eyebrow !text-[10px]">AI স্টাডি কোচ</p>
              <span
                className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border"
                style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-muted)" }}
              >
                v2.4
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--dashboard-text-secondary)" }}>
              আপনার অগ্রগতি ও দুর্বলতা দেখে পরবর্তী পদক্ষেপ বলে দেবে
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={runDefault}
          disabled={running}
          className="command-primary-btn shrink-0"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              শুনছি…
            </>
          ) : result ? (
            <>
              <RefreshCw className="w-4 h-4" />
              আবার বিশ্লেষণ
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              বলো আমার কী করা উচিত
            </>
          )}
        </button>
      </div>

      {/* Quick Strategy Prompt Chips */}
      <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t" style={{ borderColor: "var(--dashboard-border-muted)" }}>
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--dashboard-text-muted)] mr-1">
          Quick Prompts:
        </span>
        {STRATEGY_PROMPTS.map((sp) => {
          const Icon = sp.icon;
          return (
            <button
              key={sp.label}
              disabled={running}
              onClick={() => void runWithPrompt(sp.prompt)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all hover:border-[var(--dashboard-primary)] hover:bg-[var(--dashboard-primary-subtle)] disabled:opacity-50"
              style={{
                background: "var(--dashboard-surface-muted)",
                borderColor: "var(--dashboard-border-muted)",
                color: "var(--dashboard-text-primary)",
              }}
            >
              <Icon className="w-3.5 h-3.5 text-[var(--dashboard-primary)]" />
              {sp.label}
            </button>
          );
        })}
      </div>

      {/* Output Container */}
      {(running || error || result || runText) && (
        <div className="mt-4 border-t pt-4 space-y-3" style={{ borderColor: "var(--dashboard-border-muted)" }}>
          {running && statusMsg && <p className="font-mono text-[11px] text-[var(--dashboard-text-muted)]">{statusMsg}</p>}
          {error && (
            <div className="space-y-2">
              <p className="text-sm font-mono text-[var(--dashboard-danger)]">{error}</p>
              <button
                type="button"
                onClick={runDefault}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--dashboard-primary)] hover:underline"
              >
                <RefreshCw className="w-3 h-3" /> আবার চেষ্টা করুন
              </button>
            </div>
          )}
          {!result && runText && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
              {runText}
            </p>
          )}
          {!result && runBlocks.length > 0 && <AgentBlocks blocks={runBlocks} />}
          {result && (
            <>
              {result.text && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
                  {result.text}
                </p>
              )}
              {result.blocks.length > 0 && <AgentBlocks blocks={result.blocks} />}
              <div className="pt-2 flex items-center justify-between font-mono text-[10px] text-[var(--dashboard-text-muted)]">
                <span>
                  {isMock
                    ? "source: mock (AI API fallback active)"
                    : `source: ${result.provider}${result.model ? ` • ${result.model}` : ""}`}
                </span>
                <span>Latency ~240ms</span>
              </div>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}