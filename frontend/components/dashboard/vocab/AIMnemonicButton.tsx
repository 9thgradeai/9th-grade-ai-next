"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkle, Copy, ArrowClockwise, Check } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useToastSafe } from "@/lib/toast-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";

interface AIMnemonicButtonProps {
  word: string;
  bengaliMeaning: string;
  context?: string;
  existingMnemonic?: string;
  onMnemonicGenerated?: (mnemonic: string) => void;
}

type MnemonicState = "idle" | "loading" | "generated" | "error";

export default function AIMnemonicButton({ word, bengaliMeaning, context, existingMnemonic, onMnemonicGenerated }: AIMnemonicButtonProps) {
  const toast = useToastSafe();
  const { lang } = useLanguage();
  const [state, setState] = useState<MnemonicState>("idle");
  const [aiMnemonic, setAiMnemonic] = useState("");
  const [showSeed, setShowSeed] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    if (state === "generated") {
      setState("idle");
      setAiMnemonic("");
      return;
    }
    setState("loading");
    try {
      const result = await api.vocabAiMnemonic(word, bengaliMeaning, context);
      setAiMnemonic(result.mnemonic);
      setState("generated");
      onMnemonicGenerated?.(result.mnemonic);
    } catch {
      toast.error(t(lang, "AI মনেমন্ত্র তৈরি করা যায়নি", "Failed to generate AI mnemonic"));
      setState("error");
    }
  }, [word, bengaliMeaning, context, state, lang, toast, onMnemonicGenerated]);

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(aiMnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  }, [aiMnemonic]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => void generate()}
          disabled={state === "loading"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs transition-all ${
            state === "generated"
              ? "bg-amber-500/10 border-amber-500/30 text-amber-600"
              : "bg-[var(--surface-raised)] border-terminal-border text-[var(--dashboard-text-muted)] hover:border-amber-500/40 hover:text-amber-600"
          } ${state === "loading" ? "opacity-60 cursor-wait" : ""}`}
        >
          {state === "loading" ? (
            <span className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          ) : state === "generated" ? (
            <ArrowClockwise className="w-3 h-3" />
          ) : (
            <Sparkle className="w-3 h-3" />
          )}
          {state === "loading"
            ? t(lang, "তৈরি হচ্ছে...", "Generating...")
            : state === "generated"
              ? t(lang, "আবার তৈরি করুন", "Regenerate")
              : t(lang, "AI মনেমন্ত্র", "AI Mnemonic")}
        </button>

        {existingMnemonic && (
          <button
            onClick={() => setShowSeed(!showSeed)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-terminal-border bg-[var(--surface-raised)] text-[var(--dashboard-text-muted)] font-mono text-[10px] hover:border-[var(--accent)]/40 transition-colors"
          >
            <Lightbulb className="w-2.5 h-2.5" />
            {showSeed ? t(lang, "সিড লুকান", "Hide Seed") : t(lang, "সিড দেখুন", "Show Seed")}
          </button>
        )}
      </div>

      <AnimatePresence>
        {state === "generated" && aiMnemonic && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-3 relative"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkle className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] font-mono text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">AI</span>
                </div>
                <p className="text-sm text-[var(--dashboard-text-secondary)] leading-relaxed">{aiMnemonic}</p>
              </div>
              <button
                onClick={() => void copyToClipboard()}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-raised)] transition-colors text-[var(--dashboard-text-muted)] hover:text-[var(--accent)]"
                aria-label="Copy"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </motion.div>
        )}

        {showSeed && existingMnemonic && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl bg-[var(--surface-raised)] border border-terminal-border p-3"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Lightbulb className="w-3 h-3 text-[var(--accent)]" />
              <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)]">{t(lang, "সিড মনেমন্ত্র", "Seed Mnemonic")}</span>
            </div>
            <p className="text-sm text-[var(--dashboard-text-secondary)]">{existingMnemonic}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Lightbulb(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" width="1em" height="1em" {...props}>
      <path d="M176,24H80A16,16,0,0,0,64,40V216a16,16,0,0,0,16,16h96a16,16,0,0,0,16-16V40A16,16,0,0,0,176,24ZM128,208a12,12,0,1,1,12-12A12,12,0,0,1,128,208Zm16-48H112V112h32Z" />
    </svg>
  );
}
