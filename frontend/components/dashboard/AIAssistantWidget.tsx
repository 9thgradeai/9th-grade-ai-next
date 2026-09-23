"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, Sparkle, ArrowRight, BookOpen, Target, Brain, ChatCircleDots, Lightbulb, TrendUp, Flame, HandWaving, Waveform } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-ctx";
import { useLanguage, t } from "@/lib/lang-ctx/index";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useEcosystem } from "@/lib/ecosystem-ctx";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import { launchAI } from "@/lib/ai-launcher";

type Greeting = { en: string; bn: string; timeEn: string; timeBn: string };

function getGreeting(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return { en: "Good morning", bn: "শুভ সকাল", timeEn: "Morning", timeBn: "সকাল" };
  if (hour >= 12 && hour < 17) return { en: "Good afternoon", bn: "শুভ দুপুর", timeEn: "Afternoon", timeBn: "দুপুর" };
  if (hour >= 17 && hour < 21) return { en: "Good evening", bn: "শুভ সন্ধ্যা", timeEn: "Evening", timeBn: "সন্ধ্যা" };
  return { en: "Good night", bn: "শুভ রাত্রি", timeEn: "Night", timeBn: "রাত্রি" };
}

const STORAGE_DISMISS = "9th-grade-ai:ai-widget:dismissed-v2";

export default function AIAssistantWidget() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { ecosystem } = useEcosystem();
  const { setActiveTab, setPracticeIntent, setQuestionBankFilters } = useDashboardStore();
  const reduceMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [waving, setWaving] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [intelligence, setIntelligence] = useState<Server.PreparationIntelligenceDTO | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setWaving(false), 2800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    try { if (localStorage.getItem(STORAGE_DISMISS) === "1") setDismissed(true); } catch {}
  }, []);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(STORAGE_DISMISS, "1"); } catch {}
    setDismissed(true);
    setOpen(false);
  }, []);

  const reopen = useCallback(() => {
    try { localStorage.removeItem(STORAGE_DISMISS); } catch {}
    setDismissed(false);
    setOpen(true);
    setWaving(true);
    setTimeout(() => setWaving(false), 2600);
  }, []);

  useEffect(() => {
    if (dismissed) return;
    const key = "ai-widget-auto-open-v2";
    try { if (sessionStorage.getItem(key)) return; } catch {}
    const id = setTimeout(() => {
      setOpen(true);
      setWaving(true);
      setTimeout(() => setWaving(false), 2600);
      try { sessionStorage.setItem(key, "1"); } catch {}
    }, 1100);
    return () => clearTimeout(id);
  }, [dismissed]);

  useEffect(() => {
    let cancelled = false;
    void api.preparationIntelligence().then((v) => { if (!cancelled) setIntelligence(v); }).catch(() => {});
    return () => { cancelled = true; };
  }, [ecosystem]);

  const greeting = useMemo(() => getGreeting(now.getHours()), [now]);
  const firstName = useMemo(() => user?.name?.split(" ")[0] ?? "", [user?.name]);
  const timeLabel = now.toLocaleTimeString(lang === "bn" ? "bn-BD" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  const weak = useMemo(() => {
    const w = intelligence?.weakTopics?.[0] as unknown as { subject: string; topic: string; score?: number; accuracy?: number } | undefined;
    if (w) return { subject: w.subject, topic: w.topic, accuracy: (w.score ?? w.accuracy ?? 0) };
    const bySubj = intelligence?.subjectPerformance?.slice().sort((a,b)=>a.accuracy-b.accuracy)[0];
    if (bySubj && bySubj.accuracy < 70) return { subject: bySubj.subject, topic: bySubj.topics[0]?.topic ?? "", accuracy: bySubj.accuracy };
    return null;
  }, [intelligence]);

  const streak = intelligence?.streak ?? 0;
  const accuracy = intelligence?.overall?.accuracy ?? 0;
  const totalAnswered = intelligence?.overall?.questionsAttempted ?? 0;

  const suggestions = useMemo(() => {
    const out: Array<{ labelEn: string; labelBn: string; icon: React.ReactNode; action: () => void; variant: "primary" | "ghost" }> = [];
    if (weak) {
      out.push({
        labelEn: `Practice ${weak.subject}`,
        labelBn: `${weak.subject} প্র্যাকটিস`,
        icon: <Target className="w-3.5 h-3.5" weight="bold" />,
        variant: "primary",
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
        icon: <Brain className="w-3.5 h-3.5" weight="bold" />,
        variant: "ghost",
        action: () => { setActiveTab("mistakes"); setOpen(false); },
      });
    }
    const subjMap: Record<string, { en: string; bn: string }> = {
      "বাংলা ব্যাকরণ ও সাহিত্য": { en: "Bangla", bn: "বাংলা" },
      "English Grammar & Literature": { en: "English", bn: "ইংরেজি" },
      "সাধারণ গণিত": { en: "Math", bn: "গণিত" },
      "তথ্য ও যোগাযোগ প্রযুক্তি": { en: "ICT", bn: "আইসিটি" },
      "General Knowledge": { en: "GK", bn: "জিকে" },
      "সাধারণ জ্ঞান": { en: "GK", bn: "জিকে" },
    };
    const weakSubj = weak?.subject ?? "";
    const hintSubj = subjMap[weakSubj] ?? subjMap["সাধারণ গণিত"];
    out.push({
      labelEn: `Ask AI about ${hintSubj.en}`,
      labelBn: `${hintSubj.bn} নিয়ে জিজ্ঞেস করুন`,
      icon: <ChatCircleDots className="w-3.5 h-3.5" weight="bold" />,
      variant: out.length === 0 ? "primary" : "ghost",
      action: () => { launchAI({ mode: "tutor", prompt: `Help me with ${weakSubj || hintSubj.en}` }); setOpen(false); },
    });
    return out.slice(0, 3);
  }, [weak, intelligence, setActiveTab, setPracticeIntent, setQuestionBankFilters]);

  // Collapsed reopen handle — Apple-style pill
  if (dismissed && !open) {
    return (
      <motion.button
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={reopen}
        className="fixed bottom-[88px] lg:bottom-6 right-4 z-40 h-10 pl-3 pr-3.5 rounded-full bg-white border border-zinc-200 shadow-[0_8px_24px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)] flex items-center gap-2 hover:shadow-[0_12px_32px_rgba(0,0,0,0.14)] hover:border-zinc-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        aria-label="Open AI assistant"
      >
        <span className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
          <Sparkle className="w-3.5 h-3.5 text-white" weight="fill" />
        </span>
        <span className="text-[11px] font-semibold tracking-wide text-zinc-700">AI Assistant</span>
      </motion.button>
    );
  }

  return (
    <>
      {/* FAB — Google/Apple grade: 56px, 16px radius, layered shadow, ring, waving HandWaving icon */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-[88px] lg:bottom-6 right-4 z-40 w-[56px] h-[56px] rounded-[18px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        style={{
          background: "linear-gradient(135deg, #10b981 0%, #06b6d4 55%, #0ea5e9 100%)",
          boxShadow: "0 12px 28px rgba(16,185,129,0.32), 0 4px 12px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.28)",
          border: "1px solid rgba(255,255,255,0.65)",
        }}
        whileHover={reduceMotion ? undefined : { scale: 1.04, y: -1 }}
        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        aria-expanded={open}
      >
        {/* Subtle inner highlight */}
        <span className="absolute inset-[1px] rounded-[17px] pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 55%)" }} aria-hidden />
        {/* Waving icon — Phosphor HandWaving for crisp vector */}
        <motion.span
          className="relative text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
          animate={waving && !reduceMotion ? { rotate: [0, 16, -10, 16, -8, 0] } : { rotate: 0 }}
          transition={waving ? { duration: 1.3, repeat: 1, ease: [0.4, 0, 0.2, 1] } : { duration: 0.25 }}
          style={{ display: "inline-block", transformOrigin: "75% 75%" }}
        >
          <HandWaving className="w-[28px] h-[28px]" weight="fill" />
        </motion.span>
        {/* Live dot */}
        <span className="absolute -top-1 -right-1 w-[13px] h-[13px] rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] flex items-center justify-center">
          <span className="w-[7px] h-[7px] rounded-full bg-emerald-500 animate-[pulse_1.8s_ease-in-out_infinite]" />
        </span>
        {/* Tooltip on hover (desktop) */}
        <span className="hidden lg:flex absolute right-[64px] top-1/2 -translate-y-1/2 whitespace-nowrap px-2.5 py-1.5 rounded-full bg-zinc-900 text-white text-[11px] font-medium shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
          {open ? "Close" : `${greeting.en} — need help?`}
        </span>
      </motion.button>

      {/* Backdrop — subtle, Apple-style */}
      <AnimatePresence>
        {open && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-zinc-950/[0.04] backdrop-blur-[1px] lg:bg-transparent lg:backdrop-blur-none"
            aria-label="Close assistant"
          />
        )}
      </AnimatePresence>

      {/* Panel — production card: 380px, 20px radius, 1px hairline, layered shadow, responsive bottom-sheet on mobile */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.7 }}
            className="fixed z-40 w-[calc(100vw-16px)] max-w-[380px] max-h-[min(78vh,560px)] flex flex-col overflow-hidden"
            style={{
              right: "16px",
              bottom: "calc(88px + 64px)",
              borderRadius: "20px",
              background: "rgba(255,255,255,0.96)",
              backdropFilter: "blur(20px) saturate(1.2)",
              WebkitBackdropFilter: "blur(20px) saturate(1.2)",
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 24px 48px rgba(0,0,0,0.16), 0 12px 24px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)",
            }}
          >
            {/* Drag handle — mobile */}
            <div className="lg:hidden flex justify-center pt-2 pb-1">
              <span className="w-9 h-1 rounded-full bg-zinc-200" />
            </div>

            {/* Header — 64px, precise grid */}
            <div className="px-4 pt-3 pb-3 flex items-start gap-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%)", border: "1px solid rgba(16,185,129,0.18)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" }}>
                <motion.span animate={waving && !reduceMotion ? { rotate: [0, 14, -10, 14, 0] } : {}} transition={{ duration: 1.1, repeat: 1 }} style={{ display: "inline-block", color: "#059669" }}>
                  <HandWaving className="w-5 h-5" weight="fill" />
                </motion.span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[13px] font-semibold tracking-[-0.01em] leading-none" style={{ color: "#111827", fontFamily: "var(--font-geist-sans), ui-sans-serif" }}>
                    {t(lang, `${greeting.bn} ${firstName ? firstName + "!" : ""}`, `${greeting.en} ${firstName ? firstName + "!" : ""}`)}
                  </h2>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border" style={{ background: "#f0fdf4", borderColor: "rgba(16,185,129,0.18)", color: "#15803d" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
                  </span>
                </div>
                <p className="text-[11px] leading-[1.35] mt-1 line-clamp-2" style={{ color: "#6b7280" }}>
                  {t(lang, "তোমার প্যাটার্ন বুঝে সাজেশন দিচ্ছি — ", "Picking up your patterns — ")}
                  <span className="font-medium" style={{ color: "#374151" }}>{timeLabel}</span>
                  <span className="mx-1">·</span>
                  {intelligence ? `${totalAnswered > 0 ? `${totalAnswered} Qs` : "Start today"} · ${Math.round(accuracy)}% · ${streak}d` : t(lang, "লোড হচ্ছে…", "loading…")}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 hover:bg-zinc-100 active:bg-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300" aria-label="Close">
                <X className="w-3.5 h-3.5" style={{ color: "#6b7280" }} weight="bold" />
              </button>
            </div>

            {/* Content — 16px padding, 12px gaps, 8pt grid */}
            <div className="px-4 py-3.5 space-y-3 overflow-y-auto overscroll-contain" style={{ scrollbarWidth: "thin" }}>
              {weak && (
                <div className="rounded-[14px] p-3 flex gap-3" style={{ background: "#fffbeb", border: "1px solid rgba(245,158,11,0.22)", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5" style={{ background: "white", border: "1px solid rgba(245,158,11,0.18)" }}>
                    <TrendUp className="w-4 h-4" style={{ color: "#d97706" }} weight="bold" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold tracking-wide" style={{ color: "#92400e" }}>{t(lang, "ফোকাস দরকার", "Focus recommended")}</p>
                    <p className="text-[12px] leading-[1.45] mt-0.5" style={{ color: "#78350f" }}>
                      <span className="font-semibold">{weak.subject}</span>
                      {weak.topic ? <span style={{ color: "#a16207" }}> · {weak.topic}</span> : null}
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "white", border: "1px solid rgba(245,158,11,0.24)", color: "#b45309" }}>{Math.round(weak.accuracy)}%</span>
                    </p>
                  </div>
                </div>
              )}

              {streak >= 3 && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border" style={{ background: "#fff7ed", borderColor: "rgba(249,115,22,0.18)", color: "#9a3412" }}>
                  <Flame className="w-3.5 h-3.5" weight="fill" style={{ color: "#f97316" }} /> {t(lang, `${streak} দিন স্ট্রিক — ছন্দে আছো!`, `${streak}-day streak — keep it up!`)}
                </div>
              )}

              <p className="text-[12px] leading-[1.6]" style={{ color: "#4b5563" }}>
                {t(lang,
                  "আমি তোমার ভুল, শক্তি ও পড়ার ধরন শিখে পরামর্শ দিই — সাধারণ চ্যাটবট নয়, একজন ইন্টারেক্টিভ এজেন্ট।",
                  "I learn your mistakes, strengths and rhythm to suggest the next best step — not a chatbot, but an interactive agent.")}
              </p>

              {/* Primary actions — 44px touch target, 10px radius, Apple HIG */}
              <div className="grid grid-cols-1 gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.labelEn}
                    onClick={s.action}
                    className={`w-full h-11 px-3.5 rounded-[11px] flex items-center gap-2.5 text-[13px] font-medium text-left transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${s.variant === "primary" ? "text-white shadow-[0_4px_12px_rgba(16,185,129,0.24)] hover:shadow-[0_6px_16px_rgba(16,185,129,0.28)]" : "bg-white hover:bg-zinc-50"}`}
                    style={s.variant === "primary" ? { background: "#10b981", border: "1px solid #0d9d6e", boxShadow: "0 1px 0 rgba(255,255,255,0.2) inset" } : { border: "1px solid #e5e7eb", color: "#1f2937" }}
                  >
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${s.variant === "primary" ? "bg-white/18" : "bg-zinc-100"}`}>{s.icon}</span>
                    <span className="flex-1 truncate">{t(lang, s.labelBn, s.labelEn)}</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-70" weight="bold" />
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { launchAI({ mode: "tutor", prompt: "Explain my weak topics" }); setOpen(false); }} className="h-10 rounded-[11px] bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300" style={{ color: "#1f2937" }}>
                  <ChatCircleDots className="w-4 h-4" style={{ color: "#6b7280" }} weight="bold" /> {t(lang, "AI টিউটর", "AI Tutor")}
                </button>
                <button onClick={() => { setActiveTab("question-bank"); setOpen(false); }} className="h-10 rounded-[11px] bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300" style={{ color: "#1f2937" }}>
                  <BookOpen className="w-4 h-4" style={{ color: "#6b7280" }} weight="bold" /> {t(lang, "প্রশ্ন ব্যাংক", "Question Bank")}
                </button>
              </div>
            </div>

            {/* Footer — 36px, hairline, caption */}
            <div className="px-4 py-2.5 flex items-center justify-between gap-3" style={{ borderTop: "1px solid rgba(0,0,0,0.06)", background: "rgba(249,250,251,0.7)" }}>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide" style={{ color: "#9ca3af" }}>
                <Waveform className="w-3 h-3" /> {t(lang, "ইন্টারেক্টিভ এজেন্ট", "Interactive agent")} · {ecosystem === "BANGLADESH_BANK" ? "Bank" : "BCS"}
              </span>
              <button onClick={dismiss} className="text-[11px] font-medium hover:underline underline-offset-4" style={{ color: "#6b7280" }}>{t(lang, "লুকাও", "Dismiss")}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
