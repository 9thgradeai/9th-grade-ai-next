"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, BookOpen } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";
import { LITERARY_QUOTES, quoteOfTheDay } from "@/lib/data/quotes";

function greetingKey(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

const GREETINGS: Record<string, { bn: string; en: string }> = {
  morning: { bn: "সুপ্রভাত", en: "Good morning" },
  afternoon: { bn: "শুভ অপরাহ্ণ", en: "Good afternoon" },
  evening: { bn: "শুভ সন্ধ্যা", en: "Good evening" },
};

export default function HomeWelcome({ onStartPractice }: { onStartPractice?: () => void }) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const seed = useMemo(() => quoteOfTheDay(), []);
  const startIndex = Math.max(
    0,
    LITERARY_QUOTES.findIndex((q) => q.id === seed.id),
  );
  const [index, setIndex] = useState(startIndex);
  const quote = LITERARY_QUOTES[index % LITERARY_QUOTES.length];

  const hour = new Date().getHours();
  const greet = GREETINGS[greetingKey(hour)];
  const firstName = user?.name?.split(" ")[0] ?? "";

  const prev = () => setIndex((i) => (i - 1 + LITERARY_QUOTES.length) % LITERARY_QUOTES.length);
  const next = () => setIndex((i) => (i + 1) % LITERARY_QUOTES.length);

  return (
    <section
      aria-label={t(lang, "স্বাগতম", "Welcome")}
      className="command-card relative overflow-hidden p-5 sm:p-6"
    >
      {/* Decorative ink-wash band — pointer-events none, never blocks content */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{
          background:
            "linear-gradient(90deg, var(--dashboard-primary), transparent 70%)",
          opacity: 0.6,
        }}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="command-eyebrow">
            {t(lang, greet.bn, greet.en)}
            {firstName ? `, ${firstName}` : ""} ✦
          </p>
          <h2
            className="font-display mt-1 text-lg sm:text-xl font-semibold tracking-tight"
            style={{ color: "var(--dashboard-text-primary)" }}
          >
            {t(
              lang,
              "আজ কী পড়বেন? ছোট একটা শুরুই যথেষ্ট।",
              "What will you study today? A small start is enough.",
            )}
          </h2>

          {/* Quote of the day — Bangla + English literature */}
          <motion.figure
            key={quote.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="mt-3 rounded-xl border px-4 py-3"
            style={{
              background: "var(--dashboard-surface-muted)",
              borderColor: "var(--dashboard-border-muted)",
            }}
          >
            <div className="flex items-start gap-2.5">
              <BookOpen
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: "var(--dashboard-primary)" }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <blockquote
                  className="text-sm leading-relaxed font-medium"
                  style={{ color: "var(--dashboard-text-primary)" }}
                >
                  “{t(lang, quote.textBn, quote.textEn)}”
                </blockquote>
                <figcaption
                  className="mt-1.5 text-xs"
                  style={{ color: "var(--dashboard-text-muted)" }}
                >
                  — {t(lang, quote.authorBn, quote.authorEn)}
                  {quote.workBn && (
                    <span> · {t(lang, quote.workBn, quote.workEn ?? "")}</span>
                  )}
                  <span className="ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    {quote.lang === "bn" ? t(lang, "বাংলা", "Bangla") : "English"}
                  </span>
                </figcaption>
              </div>
            </div>
          </motion.figure>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={prev}
              aria-label={t(lang, "আগের উক্তি", "Previous quote")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border min-h-[36px] min-w-[36px]"
              style={{
                borderColor: "var(--dashboard-border-muted)",
                color: "var(--dashboard-text-secondary)",
                background: "var(--dashboard-surface-muted)",
              }}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={next}
              aria-label={t(lang, "পরের উক্তি", "Next quote")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border min-h-[36px] min-w-[36px]"
              style={{
                borderColor: "var(--dashboard-border-muted)",
                color: "var(--dashboard-text-secondary)",
                background: "var(--dashboard-surface-muted)",
              }}
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <span
              className="text-[11px] font-mono tabular-nums"
              style={{ color: "var(--dashboard-text-muted)" }}
              aria-live="polite"
            >
              {(index % LITERARY_QUOTES.length) + 1} / {LITERARY_QUOTES.length}
            </span>
          </div>
        </div>

        {onStartPractice && (
          <div className="shrink-0 sm:pt-8">
            <button
              onClick={onStartPractice}
              className="command-primary-btn !py-2.5 text-sm"
            >
              {t(lang, "পড়া শুরু করুন", "Start studying")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}