"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChatCircleText,
  MagnifyingGlass,
  CaretDown,
  SpeakerSimpleHigh,
} from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useToastSafe } from "@/lib/toast-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";
import type { Server } from "@/lib/types";

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/**
 * Idioms & Phrases — exam-focused phrase browser.
 *
 * Reads from the same VocabWord store filtered to partOfSpeech
 * Idiom/Phrase (`?kind=idioms`), so future imports only need to seed
 * rows — no UI or API changes required.
 */
export default function IdiomsTab() {
  const toast = useToastSafe();
  const { lang } = useLanguage();
  const [items, setItems] = useState<Server.VocabWordDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const ws = await api.vocabWords({ limit: 100, kind: "idioms" });
        if (!cancelled) setItems(ws);
      } catch {
        if (!cancelled) toast.error(t(lang, "ইডিয়ম লোড করা যায়নি", "Failed to load idioms"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lang, toast]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (w) =>
        w.word.toLowerCase().includes(q) ||
        w.bengaliMeaning.toLowerCase().includes(q),
    );
  }, [items, query]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center" role="status">
        <span className="sr-only">লোড হচ্ছে…</span>
        <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">
          {t(lang, "ইডিয়ম লোড হচ্ছে...", "Loading idioms...")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--dashboard-text-muted)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(lang, "ইডিয়ম খুঁজুন... (e.g. break the ice)", "Search idioms... (e.g. break the ice)")}
          aria-label="Search idioms and phrases"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--surface-raised)] border border-terminal-border text-sm text-[var(--text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none focus:border-[var(--accent)]/50 font-mono"
        />
        {query && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--dashboard-text-muted)] font-mono">
            {visible.length} hits
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="glass-card rounded-2xl border border-dashed border-terminal-border p-10 text-center">
          <ChatCircleText className="w-10 h-10 mx-auto text-[var(--dashboard-text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)] mt-3">
            {t(lang, "শীঘ্রই আসছে", "Coming soon")}
          </p>
          <p className="text-xs text-[var(--dashboard-text-muted)] font-mono mt-1 max-w-md mx-auto">
            {t(
              lang,
              "ইডিয়ম ও ফ্রেজের সংগ্রহ শীঘ্রই যোগ হবে — BCS ও ব্যাংক পরীক্ষার জন্য বাছাই করা তালিকা।",
              "The idioms & phrases collection is on its way — a curated list for BCS & Bank exams.",
            )}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
          <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">
            {t(lang, "কিছু পাওয়া যায়নি", "No idioms match your search.")}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence mode="popLayout">
            {visible.map((w, i) => {
              const open = expanded === w.id;
              return (
                <motion.div
                  key={w.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: Math.min(i * 0.03, 0.25) }}
                  className="glass-card rounded-2xl border border-terminal-border overflow-hidden"
                >
                  <button
                    onClick={() => setExpanded(open ? null : w.id)}
                    aria-expanded={open}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <span className="px-1.5 py-0.5 bg-[var(--surface-overlay)] rounded text-[10px] font-mono text-[var(--dashboard-text-muted)]">
                      #{String(i + 1).padStart(3, "0")}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-bold text-[var(--dashboard-primary)] truncate">
                        {w.word}
                      </span>
                      <span className="block text-xs text-[var(--dashboard-text-secondary)] truncate mt-0.5">
                        {w.bengaliMeaning}
                      </span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[10px] font-mono text-[var(--accent)] shrink-0">
                      {w.partOfSpeech}
                    </span>
                    <CaretDown className={`w-4 h-4 text-[var(--dashboard-text-muted)] transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => speak(w.word)}
                              className="p-1.5 rounded-lg hover:bg-[var(--surface-raised)] transition-colors text-[var(--dashboard-text-muted)] hover:text-[var(--accent)]"
                              aria-label={`Pronounce ${w.word}`}
                            >
                              <SpeakerSimpleHigh className="w-4 h-4" />
                            </button>
                            {w.examRelevance?.map((e) => (
                              <span key={e} className="px-2 py-0.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[10px] font-mono text-[var(--accent)]">
                                {e}
                              </span>
                            ))}
                          </div>
                          {w.exampleSentence && (
                            <div className="rounded-xl bg-[var(--surface-raised)] border border-terminal-border p-3">
                              <p className="text-sm text-[var(--dashboard-text-primary)]">“{w.exampleSentence}”</p>
                              {w.exampleSentenceBn && (
                                <p className="text-xs text-[var(--dashboard-text-muted)] mt-1">{w.exampleSentenceBn}</p>
                              )}
                            </div>
                          )}
                          {w.context && (
                            <p className="text-sm text-[var(--dashboard-text-secondary)]">{w.context}</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
