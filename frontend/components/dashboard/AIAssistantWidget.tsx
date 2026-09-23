"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkle, ArrowRight, BookOpen, Target, Brain, ChatCircleDots, Lightbulb, TrendUp, Flame } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-ctx";
import { useLanguage, t } from "@/lib/lang-ctx/index";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useEcosystem } from "@/lib/ecosystem-ctx";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import { launchAI } from "@/lib/ai-launcher";

type Greeting = { en: string; bn: string; emoji: string };

function getGreeting(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return { en: "Good Morning", bn: "শুভ সকাল", emoji: "🌅" };
  if (hour >= 12 && hour < 17) return { en: "Good Afternoon", bn: "শুভ দুপুর", emoji: "☀️" };
  if (hour >= 17 && hour < 21) return { en: "Good Evening", bn: "শুভ সন্ধ্যা", emoji: "🌆" };
  return { en: "Good Night", bn: "শুভ রাত্রি", emoji: "🌙" };
}

const STORAGE_DISMISS = "9th-grade-ai:ai-widget:dismissed";

export default function AIAssistantWidget() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { ecosystem } = useEcosystem();
  const { setActiveTab, setPracticeIntent, setQuestionBankFilters } = useDashboardStore();

  const [open, setOpen] = useState(false);
  const [waving, setWaving] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [intelligence, setIntelligence] = useState<Server.PreparationIntelligenceDTO | null>(null);

  // Auto-wave for 3s on mount, then subtle pulse
  useEffect(() => {
    const t = setTimeout(() => setWaving(false), 3200);
    return () => clearTimeout(t);
  }, []);

  // Check dismissed
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_DISMISS) === "1") setDismissed(true);
    } catch {}
  }, []);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(STORAGE_DISMISS, "1"); } catch {}
    setDismissed(true);
    setOpen(false);
  }, []);

  // Auto-open greeting bubble after 1.2s (only once per session)
  useEffect(() => {
    if (dismissed) return;
    const key = "ai-widget-auto-open";
    try { if (sessionStorage.getItem(key)) return; } catch {}
    const id = setTimeout(() => {
      setOpen(true);
      setWaving(true);
      setTimeout(() => setWaving(false), 2800);
      try { sessionStorage.setItem(key, "1"); } catch {}
    }, 1200);
    return () => clearTimeout(id);
  }, [dismissed]);

  // Fetch intelligence for behavior-aware suggestions
  useEffect(() => {
    let cancelled = false;
    void api.preparationIntelligence().then((v) => { if (!cancelled) setIntelligence(v); }).catch(() => {});
    return () => { cancelled = true; };
  }, [ecosystem]);

  const greeting = useMemo(() => getGreeting(new Date().getHours()), []);
  const firstName = useMemo(() => user?.name?.split(" ")[0] ?? "", [user?.name]);

  const weak = useMemo(() => {
    const w = intelligence?.weakTopics?.[0] as unknown as { subject: string; topic: string; score?: number; accuracy?: number } | undefined;
    if (w) return { subject: w.subject, topic: w.topic, accuracy: (w.score ?? w.accuracy ?? 0) };
    const bySubj = intelligence?.subjectPerformance?.slice().sort((a,b)=>a.accuracy-b.accuracy)[0];
    if (bySubj && bySubj.accuracy < 70) return { subject: bySubj.subject, topic: bySubj.topics[0]?.topic ?? "", accuracy: bySubj.accuracy };
    return null;
  }, [intelligence]);

  const strong = useMemo(() => {
    const s = intelligence?.subjectPerformance?.slice().sort((a,b)=>b.accuracy-a.accuracy)[0];
    if (s && s.accuracy >= 75) return s;
    return null;
  }, [intelligence]);

  const streak = intelligence?.streak ?? 0;
  const accuracy = intelligence?.overall?.accuracy ?? 0;
  const totalAnswered = intelligence?.overall?.questionsAttempted ?? 0;

  const suggestions = useMemo(() => {
    const out: Array<{ labelEn: string; labelBn: string; icon: React.ReactNode; action: () => void }> = [];
    if (weak) {
      out.push({
        labelEn: `Practice ${weak.subject} — ${Math.round(weak.accuracy)}%`,
        labelBn: `${weak.subject} প্র্যাকটিস — ${Math.round(weak.accuracy)}%`,
        icon: <Target className="w-3.5 h-3.5" />,
        action: () => {
          setPracticeIntent({ subject: weak.subject, mode: "quick" });
          setQuestionBankFilters({ category: weak.subject });
          setActiveTab("practice");
          setOpen(false);
        },
      });
    }
    if ((intelligence?.mistakes?.totalMistakes ?? 0) > 0) {
      const m = intelligence!.mistakes.totalMistakes;
      out.push({
        labelEn: `Review ${m} mistakes`,
        labelBn: `${m}টি ভুল রিভিউ`,
        icon: <Brain className="w-3.5 h-3.5" />,
        action: () => { setActiveTab("mistakes"); setOpen(false); },
      });
    }
    // Subject-specific quick help
    const subjMap: Record<string, { en: string; bn: string }> = {
      "বাংলা ব্যাকরণ ও সাহিত্য": { en: "Bangla", bn: "বাংলা" },
      "English Grammar & Literature": { en: "English", bn: "ইংরেজি" },
      "সাধারণ গণিত": { en: "Math", bn: "গণিত" },
      "তথ্য ও যোগাযোগ প্রযুক্তি": { en: "ICT", bn: "তথ্য প্রযুক্তি" },
      "General Knowledge": { en: "GK", bn: "সাধারণ জ্ঞান" },
      "সাধারণ জ্ঞান": { en: "GK", bn: "সাধারণ জ্ঞান" },
    };
    const weakSubj = weak?.subject ?? "";
    const hintSubj = subjMap[weakSubj] ?? subjMap["সাধারণ গণিত"];
    out.push({
      labelEn: `Ask AI about ${hintSubj.en}`,
      labelBn: `${hintSubj.bn} নিয়ে AI কে জিজ্ঞেস করুন`,
      icon: <ChatCircleDots className="w-3.5 h-3.5" />,
      action: () => { launchAI({ mode: "tutor", prompt: `Help me with ${weakSubj || hintSubj.en}` }); setOpen(false); },
    });
    if (out.length < 3) {
      out.push({
        labelEn: "Daily warm-up (5 Qs)",
        labelBn: "ডেইলি ওয়ার্ম-আপ (৫ প্রশ্ন)",
        icon: <Lightbulb className="w-3.5 h-3.5" />,
        action: () => { setActiveTab("practice"); setOpen(false); },
      });
    }
    return out.slice(0, 3);
  }, [weak, intelligence, setActiveTab, setPracticeIntent, setQuestionBankFilters]);

  const statusLine = useMemo(() => {
    if (!intelligence) return lang === "bn" ? "তোমার প্রগ্রেস লোড হচ্ছে…" : "Loading your progress…";
    const parts: string[] = [];
    if (totalAnswered > 0) parts.push(lang === "bn" ? `${totalAnswered}টি প্রশ্ন` : `${totalAnswered} questions`);
    if (accuracy > 0) parts.push(`${Math.round(accuracy)}% ${lang === "bn" ? "নির্ভুল" : "accuracy"}`);
    if (streak > 0) parts.push(lang === "bn" ? `${streak} দিন স্ট্রিক` : `${streak}-day streak`);
    if (weak) parts.push(lang === "bn" ? `দুর্বল: ${weak.subject}` : `Focus: ${weak.subject}`);
    else if (strong) parts.push(lang === "bn" ? `শক্তিশালী: ${strong.subject}` : `Strong: ${strong.subject}`);
    return parts.join(" · ") || (lang === "bn" ? "চলো আজকের টার্গেট ঠিক করি" : "Let's set today's target");
  }, [intelligence, lang, totalAnswered, accuracy, streak, weak, strong]);

  if (dismissed && !open) {
    // Keep a tiny reopen handle
    return (
      <button
        onClick={() => { try { localStorage.removeItem(STORAGE_DISMISS); } catch {}; setDismissed(false); setOpen(true); }}
        className="fixed bottom-20 lg:bottom-6 right-4 z-40 w-10 h-10 rounded-full bg-[var(--dashboard-surface)] border border-[var(--dashboard-border-muted)] shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        aria-label="Open AI assistant"
      >
        <Sparkle className="w-5 h-5 text-[var(--dashboard-primary)]" />
      </button>
    );
  }

  return (
    <>
      {/* Floating waving button */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-20 lg:bottom-6 right-4 z-40 w-14 h-14 rounded-full shadow-xl flex items-center justify-center border-2 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)]"
        style={{ background: "linear-gradient(135deg, var(--dashboard-primary) 0%, #10b981 100%)", borderColor: "white" }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        aria-expanded={open}
      >
        {/* Waving hand */}
        <motion.span
          className="text-2xl select-none"
          animate={waving ? { rotate: [0, 18, -12, 18, -8, 0] } : { rotate: 0 }}
          transition={waving ? { duration: 1.4, repeat: 1, ease: "easeInOut" } : { duration: 0.3 }}
          style={{ display: "inline-block", transformOrigin: "70% 70%" }}
        >
          👋
        </motion.span>
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white animate-pulse" aria-hidden />
      </motion.button>

      {/* Greeting bubble + panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed bottom-36 lg:bottom-24 right-4 z-40 w-[92vw] max-w-[360px] rounded-2xl border shadow-2xl overflow-hidden"
            style={{ background: "var(--dashboard-surface-solid)", borderColor: "var(--dashboard-border-muted)" }}
            role="dialog"
            aria-label="AI Assistant"
          >
            {/* Header with gradient */}
            <div className="px-4 py-3 flex items-start justify-between gap-3" style={{ background: "linear-gradient(135deg, var(--dashboard-primary-subtle) 0%, rgba(16,185,129,0.12) 100%)", borderBottom: "1px solid var(--dashboard-border-muted)" }}>
              <div className="flex gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border" style={{ background: "white", borderColor: "var(--dashboard-border-muted)" }}>
                  <motion.span animate={waving ? { rotate: [0, 14, -10, 14, 0] } : {}} transition={{ duration: 1.2 }} style={{ display: "inline-block" }}>👋</motion.span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-tight" style={{ color: "var(--dashboard-text-primary)" }}>
                    {t(lang, `${greeting.bn} ${firstName ? firstName + "!" : ""}`, `${greeting.en} ${firstName ? firstName + "!" : ""}`)} {greeting.emoji}
                  </p>
                  <p className="text-xs mt-0.5 leading-snug" style={{ color: "var(--dashboard-text-secondary)" }}>
                    {t(lang,
                      `আমি তোমার AI স্টাডি পার্টনার — ${statusLine}`,
                      `I'm your AI study partner — ${statusLine}`)}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors shrink-0" aria-label="Close"><X className="w-4 h-4" style={{ color: "var(--dashboard-text-muted)" }} /></button>
            </div>

            {/* Behavior-aware insight */}
            <div className="px-4 py-3 space-y-3">
              {weak && (
                <div className="rounded-xl border px-3 py-2.5 flex items-start gap-2.5" style={{ background: "var(--dashboard-warning-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-warning) 18%, transparent)" }}>
                  <TrendUp className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--dashboard-warning)" }} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold" style={{ color: "var(--dashboard-warning)" }}>{t(lang, "দুর্বলতা শনাক্ত", "Weakness spotted")}</p>
                    <p className="text-xs leading-snug" style={{ color: "var(--dashboard-text-secondary)" }}>
                      {t(lang, `${weak.subject}${weak.topic ? ` · ${weak.topic}` : ""} — ${Math.round(weak.accuracy)}% নির্ভুল। চলো এটাকে শক্তিতে বদলাই!`, `${weak.subject}${weak.topic ? ` · ${weak.topic}` : ""} — ${Math.round(weak.accuracy)}% accuracy. Let's turn it into strength!`)}
                    </p>
                  </div>
                </div>
              )}
              {streak >= 3 && (
                <div className="flex items-center gap-2 text-xs font-mono px-2.5 py-1.5 rounded-full w-fit border" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}>
                  <Flame className="w-3.5 h-3.5 text-orange-500" /> {t(lang, `${streak} দিন স্ট্রিক — দারুণ ছন্দ!`, `${streak}-day streak — great momentum!`)}
                </div>
              )}
              <p className="text-xs leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
                {t(lang,
                  "তোমার প্যাটার্ন, ভুল, আর শক্তির জায়গা বুঝে আমি সাজেশন দিই — চ্যাটবট নয়, একজন ইন্টারেক্টিভ এজেন্ট। নিচে একটা বেছে নাও বা আমাকে যেকোনো প্রশ্ন করো।",
                  "I learn your patterns, mistakes and strengths to suggest what helps most — not a chatbot, but an interactive agent. Pick one below or ask me anything.")}
              </p>

              {/* Action chips */}
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.labelEn}
                    onClick={s.action}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: "var(--dashboard-primary)", color: "white", borderColor: "var(--dashboard-primary)" }}
                  >
                    {s.icon} {t(lang, s.labelBn, s.labelEn)} <ArrowRight className="w-3 h-3 opacity-80" />
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => { launchAI({ mode: "tutor" }); setOpen(false); }} className="flex-1 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[var(--dashboard-surface-muted)] transition-colors" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)", background: "var(--dashboard-surface)" }}>
                  <ChatCircleDots className="w-4 h-4" /> {t(lang, "AI টিউটরের সাথে কথা বলো", "Chat with AI Tutor")}
                </button>
                <button onClick={() => { setActiveTab("question-bank"); setOpen(false); }} className="flex-1 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[var(--dashboard-surface-muted)] transition-colors" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)", background: "var(--dashboard-surface)" }}>
                  <BookOpen className="w-4 h-4" /> {t(lang, "প্রশ্ন ব্যাংক", "Question Bank")}
                </button>
              </div>
              <button onClick={dismiss} className="w-full text-center text-[11px] font-mono py-1 hover:underline" style={{ color: "var(--dashboard-text-muted)" }}>
                {t(lang, "আপাতত লুকাও", "Hide for now")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
