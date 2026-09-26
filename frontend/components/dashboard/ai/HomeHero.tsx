"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Spinner, Stop, Sparkle } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";
import { runAgentTurn, AIError } from "@/lib/services/ai";
import type { AgentBlockDto } from "@/lib/types";
import AiLogo from "@/components/ui/AiLogo";
import AgentBlocks from "./AgentBlocks";

export type HomeHeroSignals = {
  weakSubject?: string;
  weakTopic?: string;
  weakAccuracy?: number;
  unmasteredMistakes?: number;
  flashcardsDue?: number;
  dailyQuizAvailable?: boolean;
  streak?: number;
};

type HeroResult = {
  text: string;
  blocks: AgentBlockDto[];
  provider: string;
  model: string;
};

function greeting(lang: "bn" | "en", name?: string | null): string {
  const hour = new Date().getHours();
  const part =
    hour < 4
      ? t(lang, "গভীর রাত", "late night")
      : hour < 12
        ? t(lang, "সুপ্রভাত", "Good morning")
        : hour < 17
          ? t(lang, "শুভ অপরাহ্ণ", "Good afternoon")
          : hour < 20
            ? t(lang, "শুভ সন্ধ্যা", "Good evening")
            : t(lang, "শুভ রাত্রি", "Good night");
  return name ? `${part}, ${name}` : part;
}

/**
 * AI Hero command bar (Phase 2) — the conversational entry point of Home.
 * Asks the `home_brief` agent turn (grounded on todayPlan/exam/mistakes/
 * revision/mockPerformance slices) and streams prose + executable blocks.
 * Suggested chips are deterministic, built from live Home signals — the LLM
 * never invents the numbers, it only narrates the next step.
 */
export default function HomeHero({ signals }: { signals: HomeHeroSignals }) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [runText, setRunText] = useState("");
  const [runBlocks, setRunBlocks] = useState<AgentBlockDto[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HeroResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || running) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      setError(null);
      setResult(null);
      setRunText("");
      setRunBlocks([]);
      setStatusMsg(t(lang, "এআই ব্রিফ তৈরি হচ্ছে…", "Drafting your AI brief…"));
      try {
        const res = await runAgentTurn({
          question: q,
          intent: "home_brief",
          onDelta: (chunk) => setRunText((prev) => prev + chunk),
          onStatus: (message) => setStatusMsg(message),
          onBlock: (block) => setRunBlocks((prev) => [...prev, block]),
          signal: controller.signal,
        });
        abortRef.current = null;
        setRunning(false);
        setStatusMsg("");
        setResult({ text: res.text, blocks: res.blocks, provider: res.provider, model: res.model });
      } catch (e) {
        abortRef.current = null;
        setRunning(false);
        setStatusMsg("");
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(
          e instanceof AIError
            ? e.message
            : t(lang, "দুঃখিত, এখন ব্রিফ তৈরি করা যাচ্ছে না।", "Sorry, the brief is unavailable right now."),
        );
      }
    },
    [running, lang],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const chips = useCallback((): { label: string; prompt: string }[] => {
    const out: { label: string; prompt: string }[] = [];
    if (signals.weakSubject) {
      out.push({
        label: t(lang, `${signals.weakSubject}-এ ফোকাস`, `Fix ${signals.weakSubject}`),
        prompt: t(
          lang,
          `আমার দুর্বল বিষয় ${signals.weakSubject}${signals.weakTopic ? ` (${signals.weakTopic})` : ""}-এ আজ কীভাবে দ্রুত স্কোর বাড়াবো? সংক্ষিপ্ত অ্যাকশন প্ল্যান দাও।`,
          `My weak subject is ${signals.weakSubject}${signals.weakTopic ? ` (${signals.weakTopic})` : ""}. Give me a short action plan to raise my score today.`,
        ),
      });
    }
    if (signals.unmasteredMistakes && signals.unmasteredMistakes > 0) {
      out.push({
        label: t(lang, `${signals.unmasteredMistakes}টি ভুল সারাও`, `Fix ${signals.unmasteredMistakes} mistakes`),
        prompt: t(
          lang,
          `আমার ${signals.unmasteredMistakes}টি অমীমাংসিত ভুল আছে। কোনগুলো আগে রিভিউ করবো এবং কীভাবে?`,
          `I have ${signals.unmasteredMistakes} unmastered mistakes. Which should I review first and how?`,
        ),
      });
    }
    if (signals.flashcardsDue && signals.flashcardsDue > 0) {
      out.push({
        label: t(lang, `${signals.flashcardsDue}টি ফ্ল্যাশকার্ড`, `${signals.flashcardsDue} flashcards`),
        prompt: t(
          lang,
          `আজ ${signals.flashcardsDue}টি ফ্ল্যাশকার্ড রিভিউ বাকি। সবচেয়ে কার্যকর রিভিশন ক্রমটা বলো।`,
          `${signals.flashcardsDue} flashcards are due today. Tell me the most effective review order.`,
        ),
      });
    }
    if (signals.dailyQuizAvailable) {
      out.push({
        label: t(lang, "আজকের কুইজ", "Today's quiz"),
        prompt: t(
          lang,
          "আজকের ডেইলি কুইজ দিয়ে ওয়ার্ম-আপ করতে চাই। কৌশলসহ গাইড করো।",
          "I want to warm up with today's daily quiz. Guide me with a strategy.",
        ),
      });
    }
    return out.slice(0, 4);
  }, [signals, lang]);

  const chipList = chips();

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label={t(lang, "AI কমান্ড", "AI command")}
      className="command-card command-card--hero p-5 sm:p-6 relative overflow-hidden"
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--dashboard-primary), transparent)" }}
        aria-hidden="true"
      />
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0"
          style={{
            background: "var(--dashboard-primary-subtle)",
            borderColor: "color-mix(in srgb, var(--dashboard-primary) 24%, transparent)",
            color: "var(--dashboard-primary)",
          }}
        >
          <AiLogo solid={false} className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-base font-semibold tracking-tight" style={{ color: "var(--dashboard-text-primary)" }}>
            {greeting(lang, user?.name.split(" ")[0])} ✦
          </p>
          <p className="text-xs truncate" style={{ color: "var(--dashboard-text-muted)" }}>
            {t(lang, "জিজ্ঞেস করো — আজকের সেরা পরবর্তী ধাপ বলে দিচ্ছি", "Ask — I'll name your best next step today")}
          </p>
        </div>
      </div>

      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
          setInput("");
          inputRef.current?.focus();
        }}
      >
        <label htmlFor="home-hero-input" className="sr-only">
          {t(lang, "AI-কে জিজ্ঞেস করো", "Ask the AI")}
        </label>
        <input
          ref={inputRef}
          id="home-hero-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && running) stop();
          }}
          disabled={running}
          placeholder={t(lang, "যেমন: ২০ মিনিট আছে, কী পড়ব?", "E.g. I have 20 minutes — what should I study?")}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--dashboard-primary)] disabled:opacity-60"
          style={{
            background: "var(--dashboard-surface-muted)",
            borderColor: "var(--dashboard-border-muted)",
            color: "var(--dashboard-text-primary)",
          }}
        />
        {running ? (
          <button
            type="button"
            onClick={stop}
            aria-label={t(lang, "থামাও", "Stop")}
            className="command-primary-btn shrink-0"
          >
            <Stop className="w-4 h-4" />
            <span className="hidden sm:inline">{t(lang, "থামাও", "Stop")}</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label={t(lang, "পাঠাও", "Send")}
            className="command-primary-btn shrink-0 disabled:opacity-50"
          >
            <ArrowRight className="w-4 h-4" />
            <span className="hidden sm:inline">{t(lang, "জিজ্ঞেস করো", "Ask")}</span>
          </button>
        )}
      </form>

      {chipList.length > 0 && !running && !result && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chipList.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => void ask(c.prompt)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all hover:border-[var(--dashboard-primary)] disabled:opacity-50"
              style={{
                background: "var(--dashboard-surface-muted)",
                borderColor: "var(--dashboard-border-muted)",
                color: "var(--dashboard-text-primary)",
              }}
            >
              <Sparkle className="w-3.5 h-3.5 text-[var(--dashboard-primary)]" />
              {c.label}
            </button>
          ))}
        </div>
      )}

      {(running || error || result || runText) && (
        <div className="mt-4 border-t pt-4 space-y-3" style={{ borderColor: "var(--dashboard-border-muted)" }}>
          {running && (
            <p className="font-mono text-[11px] flex items-center gap-2" style={{ color: "var(--dashboard-text-muted)" }}>
              <Spinner className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span aria-live="polite">{statusMsg}</span>
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-mono" style={{ color: "var(--dashboard-danger)" }}>
              {error}
            </p>
          )}
          {(runText || result?.text) && (
            <p aria-live="polite" className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
              {result?.text ?? runText}
            </p>
          )}
          {(result?.blocks ?? runBlocks).length > 0 && <AgentBlocks blocks={result?.blocks ?? runBlocks} />}
          {result && (
            <p className="pt-1 font-mono text-[10px]" style={{ color: "var(--dashboard-text-muted)" }}>
              {result.provider === "mock"
                ? t(lang, "source: mock (AI API fallback active)", "source: mock (AI API fallback active)")
                : `source: ${result.provider}${result.model ? ` • ${result.model}` : ""}`}
            </p>
          )}
        </div>
      )}
    </motion.section>
  );
}
