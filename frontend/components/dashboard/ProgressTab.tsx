"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Swords, Medal, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useLanguage, t } from "@/lib/lang-ctx";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import QuestionDrill from "./QuestionDrill";
import HomeCoach from "./ai/HomeCoach";
import ProgressOverview from "./command-center/ProgressOverview";
import PerformanceCard from "./command-center/PerformanceCard";
import type { PerfRange } from "./command-center/PerformanceCard";
import SubjectMasteryMatrix from "./command-center/SubjectMasteryMatrix";
import MistakeRecoveryCard from "./command-center/MistakeRecoveryCard";
import ReadinessIndicatorCard from "./command-center/ReadinessIndicatorCard";

export default function ProgressTab() {
  const { user } = useAuth();
  const { setActiveTab, setMistakeIntent } = useDashboardStore();
  const { lang } = useLanguage();

  const [intelligence, setIntelligence] = useState<Server.PreparationIntelligenceDTO | null>(null);
  const [board, setBoard] = useState<{ entries: Server.LeaderboardEntryDTO[]; me: { rank: number; points: number } | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [perfRange, setPerfRange] = useState<PerfRange>("30D");
  const [drillQuestions, setDrillQuestions] = useState<Server.QuestionDTO[] | null>(null);
  const [drillTitle, setDrillTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [i, l] = await Promise.allSettled([api.preparationIntelligence(), api.leaderboard()]);
        if (cancelled) return;
        if (i.status === "fulfilled") setIntelligence(i.value);
        if (l.status === "fulfilled") setBoard(l.value);
        if (i.status === "rejected") setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const startTopicDrill = async (subject: string, topic: string) => {
    try {
      const qs = await api.questions({ subject, topic, limit: 50 });
      setDrillTitle(t(lang, `${topic} — অনুশীলন`, `${topic} — practice`));
      setDrillQuestions(qs);
    } catch {
      /* ignore — section simply won't open */
    }
  };

  const weakTopics = useMemo(() => intelligence?.weakTopics ?? [], [intelligence]);
  const results = useMemo(() => intelligence?.recentResults ?? [], [intelligence]);

  const skeleton = loading && !intelligence;

  if (loadFailed && !skeleton) {
    return (
      <div
        role="alert"
        className="rounded-2xl border p-8 text-center command-card"
        style={{ borderColor: "var(--dashboard-danger)" }}
      >
        <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
          {t(lang, "প্রগ্রেস ডেটা লোড করা যায়নি", "Progress data could not be loaded")}
        </p>
        <button
          onClick={() => {
            setLoading(true);
            setLoadFailed(false);
            setReloadKey((k) => k + 1);
          }}
          className="command-primary-btn mt-4"
        >
          <RefreshCw className="w-4 h-4" /> {t(lang, "আবার চেষ্টা করুন", "Try again")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24 sm:pb-6">
      {drillQuestions && (
        <QuestionDrill questions={drillQuestions} title={drillTitle} onExit={() => setDrillQuestions(null)} />
      )}

      {/* Total-outage banner — data failure must be visible, not silent zeros */}
      {loadFailed && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border p-4 text-sm"
          style={{ background: "var(--dashboard-danger-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-danger) 30%, transparent)", color: "var(--dashboard-danger)" }}
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            {t(
              lang,
              "অংশবিশেষ লোড করা যায়নি — কিছুক্ষণ পরে রিফ্রেশ করুন।",
              "Some sections could not be loaded — refresh shortly.",
            )}
          </div>
          <button
            onClick={() => {
              setLoading(true);
              setLoadFailed(false);
              setReloadKey((k) => k + 1);
            }}
            className="text-xs font-bold underline"
          >
            {t(lang, "রিফ্রেশ", "Refresh")}
          </button>
        </div>
      )}

      {/* ── Profile header ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border p-5"
        style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
            style={{ background: "var(--dashboard-primary-subtle)", border: "1px solid color-mix(in srgb, var(--dashboard-primary) 30%, transparent)", color: "var(--dashboard-primary)" }}
          >
            {(user?.name ?? "S").charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                {user?.name ?? "Student"}
              </h3>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap"
                style={{ background: "var(--dashboard-primary-subtle)", border: "1px solid color-mix(in srgb, var(--dashboard-primary) 30%, transparent)", color: "var(--dashboard-primary)" }}
              >
                @{user?.handle ?? "student"}
              </span>
            </div>
            <p className="text-sm mt-0.5" style={{ color: "var(--dashboard-text-secondary)" }}>
              {t(lang, "বিসিএস / ব্যাংক / চাকরির প্রস্তুতি", "BCS / Bank / Job preparation")}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Overview KPIs ── */}
      <section className={skeleton ? "opacity-60 pointer-events-none" : ""} aria-busy={loading}>
        <ProgressOverview intelligence={intelligence} />
      </section>

      {/* ── Performance Trend ── */}
      <section className="grid lg:grid-cols-[1.4fr_0.85fr] gap-5">
        <PerformanceCard
          activity={intelligence?.activity ?? []}
          results={results}
          range={perfRange}
          onRangeChange={setPerfRange}
          loading={loading}
        />
        <ReadinessIndicatorCard intelligence={intelligence} />
      </section>

      {/* ── Weakness Analysis ── */}
      {weakTopics.length > 0 && (
        <section aria-label={t(lang, "দুর্বলতা বিশ্লেষণ", "Weakness analysis")}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold font-display flex items-center gap-2" style={{ color: "var(--dashboard-text-primary)" }}>
              <Swords className="w-5 h-5" style={{ color: "var(--dashboard-danger)" }} /> {t(lang, "দুর্বল টপিক", "Weak topics")}
            </h3>
            <span className="text-xs font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
              {t(lang, "ন্যূনতম ৩টি প্রচেষ্টার ভিত্তিতে", "based on ≥3 attempts")}
            </span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {weakTopics.map((wt) => (
              <div key={`${wt.subject}-${wt.topic}`} className="rounded-2xl border p-4" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium truncate" style={{ color: "var(--dashboard-text-primary)" }}>{wt.topic}</h4>
                    <p className="text-xs font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                      {wt.subject} · {wt.attempted} {t(lang, "টি সমাধান", "attempts")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-lg font-bold font-mono" style={{ color: "var(--dashboard-danger)" }}>{wt.score}%</span>
                    <button
                      onClick={() => void startTopicDrill(wt.subject, wt.topic)}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono transition-colors"
                      style={{ border: "1px solid color-mix(in srgb, var(--dashboard-primary) 30%, transparent)", background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)" }}
                    >
                      {t(lang, "অভ্যাস", "Practice")}
                    </button>
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--dashboard-surface-muted)" }}>
                  <div className="h-full" style={{ width: `${wt.score}%`, background: "var(--dashboard-danger)" }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Subject Mastery + Topic Drilldown ── */}
      <section aria-label={t(lang, "বিষয়ভিত্তিক নিপুণতা", "Subject mastery")}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold font-display" style={{ color: "var(--dashboard-text-primary)" }}>
            {t(lang, "বিষয়ভিত্তিক নিপুণতা", "Subject mastery")}
          </h3>
          <span className="text-xs font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
            {t(lang, "টপিক খুলতে ক্লিক করুন", "click to drill into topics")}
          </span>
        </div>
        <SubjectMasteryMatrix intelligence={intelligence} onDrill={(s, tp) => void startTopicDrill(s, tp)} />
      </section>

      {/* ── Mistake Recovery ── */}
      <MistakeRecoveryCard
        intelligence={intelligence}
        onOpenMistakes={(subject) => {
          setMistakeIntent(subject ? { subject } : null);
          setActiveTab("mistakes");
        }}
      />

      {/* ── AI Preparation Analysis ── */}
      <section
        className="rounded-2xl border p-5"
        style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
        aria-label={t(lang, "AI প্রস্তুতি বিশ্লেষণ", "AI preparation analysis")}
        id="dashboard-ai-coach-progress"
      >
        <HomeCoach />
      </section>

      {/* ── Leaderboard (real ranks) ── */}
      <section aria-label={t(lang, "লিডারবোর্ড", "Leaderboard")}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold font-display flex items-center gap-2" style={{ color: "var(--dashboard-text-primary)" }}>
            <Medal className="w-5 h-5" style={{ color: "var(--dashboard-warning)" }} /> {t(lang, "লিডারবোর্ড", "Leaderboard")}
          </h3>
          {board?.me && (
            <span className="text-xs font-mono" style={{ color: "var(--dashboard-warning)" }}>
              {t(lang, `আপনার র‍্যাংক: #${board.me.rank} (${board.me.points} পয়েন্ট)`, `Your rank: #${board.me.rank} (${board.me.points} points)`)}
            </span>
          )}
        </div>
        {!board || board.entries.length === 0 ? (
          <div className="rounded-2xl border text-center py-10" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
            <p className="text-3xl mb-3" aria-hidden="true">🏆</p>
            <p className="text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>
              {t(lang, "এখনো কোনো র‍্যাংকিং উপলব্ধ নয়।", "No rankings available yet.")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {board.entries.map((e) => {
              const isMe = board.me?.rank === e.rank;
              return (
                <div
                  key={e.rank}
                  className={`flex items-center justify-between rounded-xl border p-3`}
                  style={{
                    background: isMe ? "var(--dashboard-primary-subtle)" : "var(--dashboard-surface-muted)",
                    borderColor: isMe ? "color-mix(in srgb, var(--dashboard-primary) 40%, transparent)" : "var(--dashboard-border-muted)",
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold font-mono"
                      style={{
                        background: e.rank === 1 ? "var(--dashboard-warning-subtle)" : "var(--dashboard-surface)",
                        color: e.rank === 1 ? "var(--dashboard-warning)" : "var(--dashboard-text-secondary)",
                      }}
                    >
                      {e.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--dashboard-text-primary)" }}>{e.name}</p>
                      <p className="text-xs font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                        {e.streak} {t(lang, "দিন স্ট্রিক", "day streak")}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm font-bold font-mono" style={{ color: "var(--dashboard-primary)" }}>{e.points}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}