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
        <h4 className="text-base font-semibold text-white">গত ৭ দিনের কার্যকলাপ</h4>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> সঠিক
          </span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-zinc-600 inline-block" /> মোট
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
              stroke="#27272a"
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
                  fill="#3f3f46"
                  className="cursor-pointer"
                  onClick={() => setSelectedDay(isSelected ? null : d.date)}
                />
                <rect
                  x={centerX - barWidth / 2}
                  y={baseY - correctH}
                  width={barWidth}
                  height={correctH}
                  rx={1.5}
                  fill="#10B981"
                  className="cursor-pointer"
                  onClick={() => setSelectedDay(isSelected ? null : d.date)}
                />
                <text
                  x={centerX}
                  y={chartHeight - 1}
                  textAnchor="middle"
                  className="text-[3px] fill-zinc-500 font-mono pointer-events-none"
                >
                  {new Date(d.date + "T00:00:00").toLocaleDateString("bn-BD", { day: "numeric", month: "short" })}
                </text>
                {(isSelected || d.answered > 0) && (
                  <circle
                    cx={centerX}
                    cy={baseY - totalH - 2}
                    r={1.2}
                    fill={isSelected ? "#10B981" : "transparent"}
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
                className="absolute top-4 right-4 bg-subtle border border-emerald-500/30 rounded-lg p-3 backdrop-blur-sm"
              >
                <div className="text-xs text-zinc-400 font-mono">
                  {new Date(d.date + "T00:00:00").toLocaleDateString("bn-BD", { weekday: "long" })}
                </div>
                <div className="text-sm font-bold text-emerald-400 font-mono mt-1">
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
      className="glass-card rounded-2xl border border-terminal-border overflow-hidden"
    >
      <motion.button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-emerald-500/5 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-white truncate">{report.name}</h4>
            <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400 font-mono">
              <span>{report.attempted}টি সমাধান</span>
              <span>•</span>
              <span>{report.correct}টি সঠিক</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xl font-bold text-emerald-400 font-mono">{report.score}%</div>
            <div className="text-[10px] text-zinc-500">সঠিকতার হার</div>
          </div>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="text-emerald-400"
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
            className="overflow-hidden border-t border-emerald-500/10"
          >
            <div className="p-4 grid grid-cols-3 gap-3">
              <div className="bg-subtle rounded-lg p-3 text-center border border-zinc-800">
                <div className="text-lg font-bold text-white font-mono">{accuracy}%</div>
                <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-1">নির্ভুলতা</div>
                <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{ scaleX: accuracy / 100 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    style={{ transformOrigin: "left" }}
                    className="h-full w-full bg-emerald-500 rounded-full"
                  />
                </div>
              </div>
              <div className="bg-subtle rounded-lg p-3 text-center border border-zinc-800">
                <div className="text-lg font-bold text-white font-mono">{report.attempted}</div>
                <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-1">মোট প্রশ্ন</div>
              </div>
              <div className="bg-subtle rounded-lg p-3 text-center border border-zinc-800">
                <div className="text-lg font-bold text-white font-mono">{report.correct}</div>
                <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-1">সঠিক উত্তর</div>
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
      { icon: Star, label: "পয়েন্ট", value: String(stats?.points ?? 0), color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
      { icon: Target, label: "নির্ভুলতা", value: `${stats?.accuracy ?? 0}%`, color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
      { icon: Trophy, label: "র‍্যাংক", value: `#${stats?.rank ?? 0}`, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
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
          className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300"
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
        className="glass-card rounded-2xl border border-terminal-border p-5"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-xl font-bold text-emerald-400 flex-shrink-0">
            {(user?.name ?? "S").charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-white truncate">{user?.name ?? "Student"}</h3>
              <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-[10px] font-mono text-emerald-400 whitespace-nowrap">
                @{user?.handle ?? "student"}
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-0.5">বিসিএস / ব্যাংক / চাকরির প্রস্তুতি</p>
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
            className={`glass-card rounded-2xl border ${metric.border} p-4 text-center`}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${metric.bg} ${metric.color}`}>
                <metric.icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">
                {metric.label}
              </span>
            </div>
            <div className={`text-xl md:text-2xl font-bold ${metric.color} font-mono tracking-tight`}>
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
        className="glass-card rounded-2xl border border-terminal-border p-5 md:p-6"
      >
        {loading && !stats ? (
          <div className="h-52 animate-pulse bg-subtle rounded-xl" />
        ) : stats && stats.activity.some((a) => a.answered > 0) ? (
          <WeeklyActivityChart data={stats.activity} />
        ) : (
          <div className="text-center py-10">
            <p className="text-3xl mb-3">📊</p>
            <p className="text-sm text-zinc-400">গত ৭ দিনে কোনো প্রশ্ন সমাধান করা হয়নি।</p>
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
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Swords className="w-5 h-5 text-rose-400" /> দুর্বল টপিক
          </h3>
          <span className="text-xs text-zinc-500 font-mono">নিম্ন নির্ভুলতা</span>
        </div>
        {weakTopics.length === 0 ? (
          <div className="glass-card rounded-2xl border border-terminal-border text-center py-10">
            <p className="text-3xl mb-3">💪</p>
            <p className="text-sm text-zinc-400">দুর্বল টপিক চিহ্নিত করতে কিছু প্রশ্ন সমাধান করুন।</p>
          </div>
        ) : (
          <div className="space-y-3">
            {weakTopics.map((t, i) => (
              <div
                key={`${t.subject}-${t.topic}`}
                className="glass-card rounded-2xl border border-terminal-border p-4"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium text-white truncate">{t.topic}</h4>
                    <p className="text-xs text-zinc-500 font-mono">{t.subject} • {t.attempted}টি সমাধান</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold font-mono text-rose-400">{t.score}%</span>
                    <button
                      onClick={() => void startTopicDrill(t)}
                      className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-mono hover:bg-emerald-500/20 transition-colors"
                    >
                      প্র্যাকটিস
                    </button>
                  </div>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: t.score / 100 }}
                    transition={{ duration: 0.6, delay: i * 0.05 }}
                    style={{ transformOrigin: "left" }}
                    className="h-full w-full bg-rose-500 rounded-full"
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
          <h3 className="text-lg font-semibold text-white">সাবজেক্ট ভিত্তিক রিপোর্ট</h3>
          <span className="text-xs text-zinc-500 font-mono">{reports.length}টি বিষয়</span>
        </div>
        {reports.length === 0 ? (
          <div className="glass-card rounded-2xl border border-terminal-border text-center py-10">
            <p className="text-3xl mb-3">📚</p>
            <p className="text-sm text-zinc-400">এখনো কোনো বিষয়ে প্রশ্ন সমাধান করা হয়নি।</p>
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
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Medal className="w-5 h-5 text-amber-400" /> লিডারবোর্ড
          </h3>
          {board?.me && (
            <span className="text-xs text-amber-300 font-mono">
              আপনার র‍্যাংক: #{board.me.rank} ({board.me.points} পয়েন্ট)
            </span>
          )}
        </div>
        {!board || board.entries.length === 0 ? (
          <div className="glass-card rounded-2xl border border-terminal-border text-center py-10">
            <p className="text-3xl mb-3">🏆</p>
            <p className="text-sm text-zinc-400">এখনো কোনো র‍্যাংকিং উপলব্ধ নয়।</p>
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
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-terminal-border bg-subtle"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold font-mono ${
                        e.rank === 1
                          ? "bg-amber-500/20 text-amber-300"
                          : e.rank === 2
                          ? "bg-zinc-400/20 text-zinc-300"
                          : e.rank === 3
                          ? "bg-orange-700/20 text-orange-300"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {e.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{e.name}</p>
                      <p className="text-xs text-zinc-500 font-mono">{e.streak} দিন স্ট্রিক</p>
                    </div>
                  </div>
                  <div className="text-sm font-bold font-mono text-emerald-400">{e.points}</div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}