/* src/components/dashboard/ProgressTab.tsx */
"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Trophy, Flame, BookOpenCheck, BrainCircuit, Target, ChevronDown, BarChart3, AlertTriangle, Swords, Medal } from "lucide-react";
import { useAuth } from "@/lib/auth-ctx";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import QuestionDrill from "./QuestionDrill";

/* --------------------------------------------------------------
   Weekly activity chart (real, from QuestionAttempt records)
   -------------------------------------------------------------- */
function WeeklyActivityChart({ data }: { data: { date: string; answered: number; correct: number }[] }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const max = Math.max(1, ...data.map((d) => d.answered));
  const chartWidth = 100;
  const chartHeight = 100;
  const padding = 10;

  return (
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>গত ৭ দিনের কার্যকলাপ</h4>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5" style={{ color: "var(--dashboard-text-muted)" }}>
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--dashboard-chart-1)" }} /> সঠিক
          </span>
          <span className="flex items-center gap-1.5" style={{ color: "var(--dashboard-text-muted)" }}>
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--dashboard-chart-grid)" }} /> মোট
          </span>
        </div>
      </div>

      <div className="relative h-52 md:h-60">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full" preserveAspectRatio="none">
          {[0, 25, 50, 75, 100].map((y) => (
            <line
              key={y}
              x1={padding}
              y1={padding + (y / 100) * (chartHeight - padding * 2)}
              x2={chartWidth - padding}
              y2={padding + (y / 100) * (chartHeight - padding * 2)}
              style={{ stroke: "var(--dashboard-chart-grid)" }}
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
          ))}

          {data.map((d, i) => {
            const slotWidth = (chartWidth - padding * 2) / data.length;
            const barWidth = slotWidth * 0.55;
            const centerX = padding + i * slotWidth + slotWidth / 2;
            const totalH = (d.answered / max) * (chartHeight - padding * 2);
            const correctH = (d.correct / max) * (chartHeight - padding * 2);
            const baseY = chartHeight - padding;
            const isSelected = selectedDay === d.date;

            return (
              <g
                key={d.date}
                role="button"
                tabIndex={0}
                aria-label={`${new Date(d.date + "T00:00:00").toLocaleDateString("bn-BD", { day: "numeric", month: "long" })} — ${d.answered}টি প্রশ্ন, ${d.correct}টি সঠিক${isSelected ? " (নির্বাচিত)" : ""}`}
                aria-pressed={isSelected}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedDay(isSelected ? null : d.date);
                  }
                }}
              >
                <rect
                  x={centerX - barWidth / 2}
                  y={baseY - totalH}
                  width={barWidth}
                  height={totalH}
                  rx={1.5}
                  style={{ fill: "var(--dashboard-chart-grid)" }}
                  className="cursor-pointer"
                  onClick={() => setSelectedDay(isSelected ? null : d.date)}
                />
                <rect
                  x={centerX - barWidth / 2}
                  y={baseY - correctH}
                  width={barWidth}
                  height={correctH}
                  rx={1.5}
                  style={{ fill: "var(--dashboard-chart-1)" }}
                  className="cursor-pointer"
                  onClick={() => setSelectedDay(isSelected ? null : d.date)}
                />
                <text
                  x={centerX}
                  y={chartHeight - 1}
                  textAnchor="middle"
                  className="text-[3px] font-mono pointer-events-none"
                  style={{ fill: "var(--dashboard-text-muted)" }}
                >
                  {new Date(d.date + "T00:00:00").toLocaleDateString("bn-BD", { day: "numeric", month: "short" })}
                </text>
                {(isSelected || d.answered > 0) && (
                  <circle
                    cx={centerX}
                    cy={baseY - totalH - 2}
                    r={1.2}
                    fill={isSelected ? "var(--dashboard-chart-1)" : "transparent"}
                  />
                )}
              </g>
            );
          })}
        </svg>

        <AnimatePresence>
          {selectedDay && (() => {
            const d = data.find((x) => x.date === selectedDay);
            if (!d) return null;
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-4 right-4 rounded-lg p-3 backdrop-blur-sm"
                style={{ background: "var(--dashboard-surface-raised)", border: "1px solid color-mix(in srgb, var(--dashboard-primary) 30%, transparent)" }}
              >
                <div className="text-xs font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                  {new Date(d.date + "T00:00:00").toLocaleDateString("bn-BD", { weekday: "long" })}
                </div>
                <div className="text-sm font-bold font-mono mt-1" style={{ color: "var(--dashboard-primary)" }}>
                  {d.correct}/{d.answered} সঠিক
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------
   Subject report row (real data only)
   -------------------------------------------------------------- */
function SubjectReportRow({ report, index }: { report: { name: string; score: number; attempted: number; correct: number }; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const accuracy = report.attempted > 0 ? Math.round((report.correct / report.attempted) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.05 }}
      className="rounded-2xl border overflow-hidden"
      style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
    >
      <motion.button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 transition-colors"
        style={{ background: "transparent" }}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--dashboard-primary-subtle)", border: "1px solid color-mix(in srgb, var(--dashboard-primary) 20%, transparent)" }}>
            <BarChart3 className="w-5 h-5" style={{ color: "var(--dashboard-primary)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate" style={{ color: "var(--dashboard-text-primary)" }}>{report.name}</h4>
            <div className="flex items-center gap-2 mt-1 text-xs font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
              <span>{report.attempted}টি সমাধান</span>
              <span>•</span>
              <span>{report.correct}টি সঠিক</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xl font-bold font-mono" style={{ color: "var(--dashboard-primary)" }}>{report.score}%</div>
            <div className="text-[10px]" style={{ color: "var(--dashboard-text-muted)" }}>সঠিকতার হার</div>
          </div>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="text-[var(--dashboard-primary)]"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </div>
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden border-t"
            style={{ borderColor: "color-mix(in srgb, var(--dashboard-primary) 10%, transparent)" }}
          >
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--dashboard-surface-muted)", border: "1px solid var(--dashboard-border-muted)" }}>
                <div className="text-lg font-bold font-mono" style={{ color: "var(--dashboard-text-primary)" }}>{accuracy}%</div>
                <div className="text-[10px] font-mono uppercase tracking-wider mt-1" style={{ color: "var(--dashboard-text-muted)" }}>নির্ভুলতা</div>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--dashboard-surface-muted)" }}>
                  <motion.div
                    initial={false}
                    animate={{ scaleX: accuracy / 100 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    style={{ transformOrigin: "left", background: "var(--dashboard-success)" }}
                    className="h-full w-full rounded-full"
                  />
                </div>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--dashboard-surface-muted)", border: "1px solid var(--dashboard-border-muted)" }}>
                <div className="text-lg font-bold font-mono" style={{ color: "var(--dashboard-text-primary)" }}>{report.attempted}</div>
                <div className="text-[10px] font-mono uppercase tracking-wider mt-1" style={{ color: "var(--dashboard-text-muted)" }}>মোট প্রশ্ন</div>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--dashboard-surface-muted)", border: "1px solid var(--dashboard-border-muted)" }}>
                <div className="text-lg font-bold font-mono" style={{ color: "var(--dashboard-text-primary)" }}>{report.correct}</div>
                <div className="text-[10px] font-mono uppercase tracking-wider mt-1" style={{ color: "var(--dashboard-text-muted)" }}>সঠিক উত্তর</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* --------------------------------------------------------------
   Main Progress Tab
   -------------------------------------------------------------- */
export default function ProgressTab() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Server.DashboardStatsDTO | null>(null);
  const [reports, setReports] = useState<Array<{ name: string; score: number; attempted: number; correct: number }>>([]);
  const [weakTopics, setWeakTopics] = useState<Server.WeakTopicDTO[]>([]);
  const [board, setBoard] = useState<{ entries: Server.LeaderboardEntryDTO[]; me: { rank: number; points: number } | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [drillQuestions, setDrillQuestions] = useState<Server.QuestionDTO[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [s, r, w, l] = await Promise.allSettled([
          api.dashboardStats(),
          api.subjectReports(),
          api.weakTopics(),
          api.leaderboard(),
        ]);
        if (cancelled) return;
        const failed = s.status === "rejected" && r.status === "rejected";
        setLoadFailed(failed);
        if (s.status === "fulfilled") setStats(s.value);
        if (r.status === "fulfilled") setReports(r.value);
        if (w.status === "fulfilled") setWeakTopics(w.value);
        if (l.status === "fulfilled") setBoard(l.value);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startTopicDrill = async (topic: Server.WeakTopicDTO) => {
    try {
      const qs = await api.questions({ subject: topic.subject, topic: topic.topic, limit: 50 });
      setDrillQuestions(qs);
    } catch {
      /* ignore — section simply won't open */
    }
  };

  const kpis = useMemo(
    () => [
      { icon: Star, label: "পয়েন্ট", value: String(stats?.points ?? 0), color: "text-[var(--dashboard-warning)]", bg: "bg-[var(--dashboard-warning-subtle)]", border: "border-amber-500/20" },
      { icon: Target, label: "নির্ভুলতা", value: `${stats?.accuracy ?? 0}%`, color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
      { icon: Trophy, label: "র‍্যাংক", value: `#${stats?.rank ?? 0}`, color: "text-[var(--dashboard-primary)]", bg: "bg-[var(--dashboard-primary-subtle)]", border: "border-emerald-500/20" },
      { icon: Flame, label: "স্ট্রিক", value: `${stats?.streak ?? 0} দিন`, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
      { icon: BookOpenCheck, label: "মোট প্রশ্ন", value: String(stats?.questionsAnswered ?? 0), color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
      { icon: BrainCircuit, label: "AI প্রশ্ন", value: String(stats?.aiQuestionsAsked ?? 0), color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
    ],
    [stats],
  );

  return (
    <div className="space-y-6">
      {drillQuestions && (
        <QuestionDrill
          questions={drillQuestions}
          title="দুর্বল টপিক প্র্যাকটিস"
          onExit={() => setDrillQuestions(null)}
        />
      )}

      {/* Total-outage banner — data failure must be visible, not silent zeros */}
      {loadFailed && !loading && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border p-4 text-sm"
          style={{ background: "var(--dashboard-danger-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-danger) 30%, transparent)", color: "var(--dashboard-danger)" }}
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            আপনার প্রোগ্রেস লোড করা যায়নি। সার্ভারে সমস্যা হতে পারে — কিছুক্ষণ পরে আবার চেষ্টা করুন।
          </div>
        </div>
      )}

      {/* Profile header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border p-5"
        style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0" style={{ background: "var(--dashboard-primary-subtle)", border: "1px solid color-mix(in srgb, var(--dashboard-primary) 30%, transparent)", color: "var(--dashboard-primary)" }}>
            {(user?.name ?? "S").charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold truncate" style={{ color: "var(--dashboard-text-primary)" }}>{user?.name ?? "Student"}</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap" style={{ background: "var(--dashboard-primary-subtle)", border: "1px solid color-mix(in srgb, var(--dashboard-primary) 30%, transparent)", color: "var(--dashboard-primary)" }}>
                @{user?.handle ?? "student"}
              </span>
            </div>
            <p className="text-sm mt-0.5" style={{ color: "var(--dashboard-text-secondary)" }}>বিসিএস / ব্যাংক / চাকরির প্রস্তুতি</p>
          </div>
        </div>
      </motion.div>

      {/* KPI grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
      >
        {kpis.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.06 }}
            className={`rounded-2xl border p-4 text-center`}
            style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg" style={{ background: "var(--dashboard-surface-muted)" }}>
                <metric.icon className="w-4 h-4" style={{ color: "var(--dashboard-text-secondary)" }} />
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--dashboard-text-muted)" }}>
                {metric.label}
              </span>
            </div>
            <div className="text-xl md:text-2xl font-bold font-mono tracking-tight" style={{ color: "var(--dashboard-text-primary)" }}>
              {metric.value}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Weekly activity chart */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl border p-5 md:p-6"
        style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
      >
        {loading && !stats ? (
          <div className="h-52 animate-pulse rounded-xl" style={{ background: "var(--dashboard-surface-muted)" }} />
        ) : stats && stats.activity.some((a) => a.answered > 0) ? (
          <WeeklyActivityChart data={stats.activity} />
        ) : (
          <div className="rounded-2xl border text-center py-10" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
            <p className="text-3xl mb-3">📊</p>
            <p className="text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>গত ৭ দিনে কোনো প্রশ্ন সমাধান করা হয়নি।</p>
          </div>
        )}
      </motion.div>

      {/* Weak topics (lowest accuracy) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: "var(--dashboard-text-primary)" }}>
            <Swords className="w-5 h-5" style={{ color: "var(--dashboard-danger)" }} /> দুর্বল টপিক
          </h3>
          <span className="text-xs font-mono" style={{ color: "var(--dashboard-text-muted)" }}>নিম্ন নির্ভুলতা</span>
        </div>
        {weakTopics.length === 0 ? (
          <div className="rounded-2xl border text-center py-10" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
            <p className="text-3xl mb-3">💪</p>
            <p className="text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>দুর্বল টপিক চিহ্নিত করতে কিছু প্রশ্ন সমাধান করুন।</p>
          </div>
        ) : (
          <div className="space-y-3">
            {weakTopics.map((t, i) => (
              <div
                key={`${t.subject}-${t.topic}`}
                className="rounded-2xl border p-4"
                style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
              >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium truncate" style={{ color: "var(--dashboard-text-primary)" }}>{t.topic}</h4>
                      <p className="text-xs font-mono" style={{ color: "var(--dashboard-text-muted)" }}>{t.subject} • {t.attempted}টি সমাধান</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold font-mono" style={{ color: "var(--dashboard-danger)" }}>{t.score}%</span>
                      <button
                        onClick={() => void startTopicDrill(t)}
                        className="px-3 py-1.5 rounded-lg text-xs font-mono transition-colors"
                        style={{ border: "1px solid color-mix(in srgb, var(--dashboard-primary) 30%, transparent)", background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)" }}
                      >
                      প্র্যাকটিস
                    </button>
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--dashboard-surface-muted)" }}>
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: t.score / 100 }}
                    transition={{ duration: 0.6, delay: i * 0.05 }}
                    style={{ transformOrigin: "left", background: "var(--dashboard-danger)" }}
                    className="h-full w-full rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Subject reports */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>সাবজেক্ট ভিত্তিক রিপোর্ট</h3>
          <span className="text-xs font-mono" style={{ color: "var(--dashboard-text-muted)" }}>{reports.length}টি বিষয়</span>
        </div>
        {reports.length === 0 ? (
          <div className="rounded-2xl border text-center py-10" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
            <p className="text-3xl mb-3">📚</p>
            <p className="text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>এখনো কোনো বিষয়ে প্রশ্ন সমাধান করা হয়নি।</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report, i) => (
              <SubjectReportRow key={report.name} report={report} index={i} />
            ))}
          </div>
        )}
      </motion.div>

      {/* Leaderboard */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: "var(--dashboard-text-primary)" }}>
            <Medal className="w-5 h-5" style={{ color: "var(--dashboard-warning)" }} /> লিডারবোর্ড
          </h3>
          {board?.me && (
            <span className="text-xs font-mono" style={{ color: "var(--dashboard-warning)" }}>
              আপনার র‍্যাংক: #{board.me.rank} ({board.me.points} পয়েন্ট)
            </span>
          )}
        </div>
        {!board || board.entries.length === 0 ? (
          <div className="rounded-2xl border text-center py-10" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
            <p className="text-3xl mb-3">🏆</p>
            <p className="text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>এখনো কোনো র‍্যাংকিং উপলব্ধ নয়।</p>
          </div>
        ) : (
          <div className="space-y-2">
            {board.entries.map((e) => {
              const isMe = board.me?.rank === e.rank;
              return (
                <div
                  key={e.rank}
                  className={`flex items-center justify-between rounded-xl border p-3 ${
                    isMe
                      ? "border-[color-mix(in_srgb,var(--dashboard-primary)_40%,transparent)]"
                      : ""
                  }`}
                  style={{ background: isMe ? "var(--dashboard-primary-subtle)" : "var(--dashboard-surface-muted)", borderColor: isMe ? undefined : "var(--dashboard-border-muted)" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold font-mono"
                      style={{
                        background: e.rank === 1 ? "var(--dashboard-warning-subtle)" : e.rank <= 3 ? "var(--dashboard-surface-muted)" : "var(--dashboard-surface-muted)",
                        color: e.rank === 1 ? "var(--dashboard-warning)" : e.rank <= 3 ? "var(--dashboard-text-secondary)" : "var(--dashboard-text-muted)",
                      }}
                    >
                      {e.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--dashboard-text-primary)" }}>{e.name}</p>
                      <p className="text-xs font-mono" style={{ color: "var(--dashboard-text-muted)" }}>{e.streak} দিন স্ট্রিক</p>
                    </div>
                  </div>
                  <div className="text-sm font-bold font-mono" style={{ color: "var(--dashboard-primary)" }}>{e.points}</div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}