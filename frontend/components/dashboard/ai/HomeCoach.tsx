"use client";

// Home tab AI study coach — a discrete card (dockerized next to the
// NextBestAction hero) that runs a single agent turn on demand. It streams the
// coach's prose + typed blocks from /api/ai/agent into the same AgentBlocks
// renderer used by the full AI workspace, and clearly labels mock fallback.

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { BrainCircuit, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { runAgentTurn, AIError } from "@/lib/services/ai";
import type { AgentBlockDto } from "@/lib/types";
import AgentBlocks from "./AgentBlocks";

const HOME_COACH_PROMPT =
  "আমার পড়াশোনার পরবর্তী ধাপ কী হওয়া উচিত? আমার অগ্রগতি, দুর্বল বিষয় এবং ভুল প্রশ্নগুলো বিশ্লেষণ করে পরামর্শ দাও — প্রয়োজন হলে একটি ছোট প্র্যাকটিস সেশন সুপারিশ করো।";

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

  const run = useCallback(async () => {
    if (running) return;
    const abortController = new AbortController();
    abortRef.current = abortController;
    setRunning(true);
    setError(null);
    setResult(null);
    setRunText("");
    setRunBlocks([]);
    setStatusMsg("বিশ্লেষণ চলছে…");
    try {
      const res = await runAgentTurn({
        question: HOME_COACH_PROMPT,
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
      setError(
        e instanceof AIError ? e.message : "দুঃখিত, এখন পরামর্শ তৈরি করা যাচ্ছে না।",
      );
    }
  }, [running]);

  const isMock = result?.provider === "mock";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border p-5 sm:p-6 relative overflow-hidden"
      style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
    >
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, var(--dashboard-border-muted), transparent)" }} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{ background: "var(--dashboard-primary-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-primary) 18%, transparent)", color: "var(--dashboard-primary)" }}
          >
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--dashboard-primary)" }}>
              AI স্টাডি কোচ
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--dashboard-text-secondary)" }}>
              আপনার অগ্রগতি ও দুর্বলতা দেখে পরবর্তী পদক্ষেপ বলে দেবে
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
          style={{
            background: "var(--dashboard-primary-subtle)",
            borderColor: "color-mix(in srgb, var(--dashboard-primary) 20%, var(--dashboard-border-muted))",
            color: "var(--dashboard-primary)",
          }}
        >
          {running ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              শুনছি…
            </>
          ) : result ? (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              আবার বিশ্লেষণ
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              বলো আমার কী করা উচিত
            </>
          )}
        </button>
      </div>

      {(running || error || result) && (
        <div className="mt-4 border-t pt-4 space-y-3" style={{ borderColor: "var(--dashboard-border-muted)" }}>
          {running && statusMsg && (
            <p className="font-mono text-[11px] text-[var(--dashboard-text-muted)]">{statusMsg}</p>
          )}
          {error && (
            <div className="space-y-2">
              <p className="text-sm font-mono text-[var(--dashboard-danger)]">{error}</p>
              <button
                type="button"
                onClick={() => void run()}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--dashboard-primary)] hover:underline"
              >
                <RefreshCw className="w-3 h-3" /> আবার চেষ্টা করুন
              </button>
            </div>
          )}
          {/* During streaming: show live text + blocks; after completion: show final result (no duplicates). */}
          {!result && runText && (
            <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>
              {runText}
            </p>
          )}
          {!result && runBlocks.length > 0 && <AgentBlocks blocks={runBlocks} />}
          {result && (
            <>
              {result.text && (
                <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>
                  {result.text}
                </p>
              )}
              {result.blocks.length > 0 && <AgentBlocks blocks={result.blocks} />}
              <p className="font-mono text-[10px] text-[var(--dashboard-text-muted)]">
                {isMock
                  ? "source: mock (কোনো API কী সেট নেই)"
                  : `source: ${result.provider}${result.model ? ` • ${result.model}` : ""}`}
              </p>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}