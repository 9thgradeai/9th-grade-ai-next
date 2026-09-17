"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Clock, Calendar, Target, ArrowUpRight, ArrowDownRight, Funnel, CaretDown, Download, Eye, Spinner, Warning, ChartBar, FileText } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";

type HistoryFilter = "all" | "custom" | "mock" | "daily";
type SortOrder = "newest" | "oldest" | "score-high" | "score-low";

const TYPE_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  custom: { label: "কাস্টম", color: "bg-[var(--dashboard-primary)]/20 text-[var(--dashboard-primary)]", icon: <Target className="w-3.5 h-3.5" /> },
  mock: { label: "মক টেস্ট", color: "bg-[var(--dashboard-warning)]/20 text-[var(--dashboard-warning)]", icon: <Trophy className="w-3.5 h-3.5" /> },
  daily: { label: "দৈনিক", color: "bg-[var(--dashboard-success)]/20 text-[var(--dashboard-success)]", icon: <Calendar className="w-3.5 h-3.5" /> },
  exam: { label: "পরীক্ষা", color: "bg-[var(--dashboard-info)]/20 text-[var(--dashboard-info)]", icon: <FileText className="w-3.5 h-3.5" /> },
};

const SCORE_COLORS = {
  high: "text-[var(--dashboard-success)]",
  medium: "text-[var(--dashboard-warning)]",
  low: "text-[var(--dashboard-danger)]",
};

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("bn-BD", {
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
    });
  } catch {
    return "অজানা";
  }
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}ঘ ${m}ম`;
  if (m > 0) return `${m}ম ${s}সেক`;
  return `${s}সেক`;
}

function getScoreColor(score: number): string {
  if (score >= 70) return SCORE_COLORS.high;
  if (score >= 40) return SCORE_COLORS.medium;
  return SCORE_COLORS.low;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "চমৎকার";
  if (score >= 60) return "ভালো";
  if (score >= 40) return "গড়";
  return "উন্নতি প্রয়োজন";
}

export default function ExamHistoryTab() {
  const [history, setHistory] = useState<Server.ExamHistoryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.examHistory();
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ইতিহাস লোড করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await fetchHistory();
    })();
  }, [fetchHistory]);

  const filteredPast = useMemo(() => {
    if (!history) return [];
    let items = [...history.past];

    if (filter !== "all") {
      items = items.filter((item) => item.type === filter);
    }

    switch (sortOrder) {
      case "oldest":
        items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "score-high":
        items.sort((a, b) => b.percentage - a.percentage);
        break;
      case "score-low":
        items.sort((a, b) => a.percentage - b.percentage);
        break;
      default:
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return items;
  }, [history, filter, sortOrder]);

  const stats = useMemo(() => {
    if (!history) return null;
    const past = history.past;
    if (past.length === 0) return { total: 0, avgScore: 0, bestScore: 0, totalQuestions: 0 };
    const total = past.length;
    const avgScore = Math.round(past.reduce((sum, p) => sum + p.percentage, 0) / total);
    const bestScore = Math.max(...past.map((p) => p.percentage));
    const totalQuestions = past.reduce((sum, p) => sum + p.total, 0);
    return { total, avgScore, bestScore, totalQuestions };
  }, [history]);

  const handleRetry = () => {
    void fetchHistory();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
          <Spinner className="w-10 h-10 mx-auto mb-3 text-[var(--accent)] animate-spin" aria-hidden="true" />
          <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">পরীক্ষা ইতিহাস লোড হচ্ছে...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
          <Warning className="w-10 h-10 mx-auto mb-3 text-[var(--warning)]" aria-hidden="true" />
          <p className="text-sm text-[var(--dashboard-text-muted)]">{error}</p>
          <button onClick={handleRetry} className="mt-4 px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors">
            আবার চেষ্টা করুন
          </button>
        </motion.div>
      </div>
    );
  }

  const isEmpty = !history || (history.past.length === 0 && history.upcoming.length === 0);

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl border border-terminal-border overflow-hidden">
        <div className="terminal-window-bar border-b border-terminal-border">
          <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
          <div className="flex-1 text-center text-xs text-[var(--dashboard-text-muted)] font-mono">
            {"// EXAM_HISTORY_DASHBOARD"}
          </div>
        </div>
        <div className="p-5 md:p-6">
          <div className="flex items-center gap-2 mb-1">
            <ChartBar className="w-5 h-5 text-[var(--dashboard-primary)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">পরীক্ষা ইতিহাস ও আপকামিং</h2>
          </div>
          <p className="text-xs text-[var(--dashboard-text-muted)] font-mono mb-4">
            গত পরীক্ষার ফলাফল, আপকামিং পরীক্ষার তালিকা ও পারফরম্যান্স ওভারভিউ
          </p>

          {stats && stats.total > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="glass-card rounded-xl border border-terminal-border p-4 text-center">
                <p className="text-2xl font-bold font-mono text-[var(--dashboard-primary)]">{stats.total}</p>
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">মোট পরীক্ষা</p>
              </div>
              <div className="glass-card rounded-xl border border-terminal-border p-4 text-center">
                <p className="text-2xl font-bold font-mono text-[var(--dashboard-warning)]">{stats.avgScore}%</p>
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">গড় স্কোর</p>
              </div>
              <div className="glass-card rounded-xl border border-terminal-border p-4 text-center">
                <p className="text-2xl font-bold font-mono text-[var(--dashboard-success)]">{stats.bestScore}%</p>
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">সেরা স্কোর</p>
              </div>
              <div className="glass-card rounded-xl border border-terminal-border p-4 text-center">
                <p className="text-2xl font-bold font-mono text-[var(--dashboard-info)]">{stats.totalQuestions}</p>
                <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">মোট প্রশ্ন</p>
              </div>
            </div>
          )}

          {/* Filter & Sort Controls */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 bg-[var(--surface-raised)] rounded-lg border border-[var(--dashboard-border-muted)] p-1">
              {(["all", "custom", "mock", "daily"] as HistoryFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md transition-all ${
                    filter === f
                      ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)]"
                      : "text-[var(--dashboard-text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {f === "all" ? "সব" : TYPE_LABELS[f]?.label ?? f}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--dashboard-border-muted)] bg-[var(--surface-raised)] text-[var(--dashboard-text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
              >
                <Funnel className="w-3.5 h-3.5" />
                <span>সাজান</span>
                <span className="font-mono">{sortOrder === "newest" ? "↓" : sortOrder === "oldest" ? "↑" : sortOrder === "score-high" ? "★" : "☆"}</span>
              </button>
            </div>
          </div>

          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)]"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs text-[var(--dashboard-text-muted)] font-mono">ক্রম:</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  className="px-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--dashboard-border-muted)] bg-[var(--surface-muted)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--dashboard-focus-ring)]"
                >
                  <option value="newest">সবচেয়ে নতুন আগে</option>
                  <option value="oldest">সবচেয়ে পুরনো আগে</option>
                  <option value="score-high">উচ্চ স্কোর প্রথমে</option>
                  <option value="score-low">নিম্ন স্কোর প্রথমে</option>
                </select>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Upcoming Exams */}
      {history?.upcoming.length && history.upcoming.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[var(--dashboard-warning)]" />
              <h3 className="text-lg font-bold text-[var(--text-primary)]">আপকামিং পরীক্ষা</h3>
            </div>
            <span className="px-2 py-0.5 rounded bg-[var(--dashboard-warning-subtle)] text-[var(--dashboard-warning)] text-xs font-mono">
              {history.upcoming.length}টি
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {history.upcoming.slice(0, 6).map((exam) => (
              <motion.div
                key={exam.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-2xl border border-terminal-border p-4 hover:border-[var(--dashboard-warning)]/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded bg-[var(--dashboard-warning-subtle)] text-[var(--dashboard-warning)] text-[10px] font-mono">
                        {exam.type}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[var(--dashboard-info-subtle)] text-[var(--dashboard-info)] text-[10px] font-mono">
                        {exam.year || "২০২৬"}
                      </span>
                    </div>
                    <h4 className="font-semibold text-[var(--text-primary)] truncate">{exam.titleBn}</h4>
                    {exam.titleEn && <p className="text-xs text-[var(--dashboard-text-muted)] truncate">{exam.titleEn}</p>}
                    {exam.note && <p className="text-xs text-[var(--dashboard-text-muted)] mt-1 line-clamp-2">{exam.note}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xl font-bold font-mono ${exam.daysUntil <= 7 ? "text-[var(--dashboard-danger)]" : exam.daysUntil <= 30 ? "text-[var(--dashboard-warning)]" : "text-[var(--dashboard-primary)]"}`}>
                      {exam.daysUntil} দিন
                    </p>
                    <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">বাকি</p>
                    <p className="text-[10px] text-[var(--dashboard-text-muted)] mt-1">{formatDate(exam.date)}</p>
                  </div>
                </div>
                {exam.sourceUrl && (
                  <a
                    href={exam.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary-hover)] font-mono"
                  >
                    <ArrowUpRight className="w-3 h-3" /> অফিসিয়াল নোটিশ
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Past Exams */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[var(--dashboard-primary)]" />
            <h3 className="text-lg font-bold text-[var(--text-primary)]">গত পরীক্ষার ফলাফল</h3>
          </div>
          {history?.past.length && (
            <span className="px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-xs font-mono text-[var(--dashboard-text-muted)]">
              {filteredPast.length} / {history.past.length}টি ফলাফল
            </span>
          )}
        </div>

        {isEmpty ? (
          <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-[var(--dashboard-text-muted)]/30" aria-hidden="true" />
            <h4 className="text-lg font-semibold text-[var(--text-primary)] mb-2">কোনো পরীক্ষার ইতিহাস নেই</h4>
            <p className="text-sm text-[var(--dashboard-text-muted)] max-w-xs mx-auto">
              এখনো কোনো পরীক্ষা দেননি। প্রথম পরীক্ষা দিতে প্র্যাকটিস বা মক টেস্ট ট্যাবে যান।
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPast.map((item, index) => (
              <motion.div
                key={`${item.id}-${item.type}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="glass-card rounded-2xl border border-terminal-border overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(expandedId === `${item.id}-${item.type}` ? null : `${item.id}-${item.type}`)}
                  className="w-full p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4 text-left"
                  style={{ background: "transparent" }}
                >
                  {/* Type Badge & Score */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-mono ${TYPE_LABELS[item.type]?.color ?? "bg-[var(--surface-raised)] text-[var(--dashboard-text-secondary)]"}`}>
                      {TYPE_LABELS[item.type]?.icon}
                      <span className="ml-1">{TYPE_LABELS[item.type]?.label ?? item.type}</span>
                    </span>
                    <div className="text-right min-w-[80px]">
                      <p className={`text-xl font-bold font-mono ${getScoreColor(item.percentage)}`}>
                        {item.percentage}%
                      </p>
                      <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">{getScoreLabel(item.percentage)}</p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-[var(--text-primary)] truncate">{item.title}</h4>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-[var(--dashboard-text-muted)] font-mono">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(item.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(item.durationSec)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          {item.correct}/{item.total} সঠিক
                        </span>
                      </div>
                    </div>

                    {/* Expand indicator */}
                    <div className="flex items-center gap-2 text-[var(--dashboard-text-muted)]">
                      <CaretDown className={`w-4 h-4 transition-transform ${expandedId === `${item.id}-${item.type}` ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                </button>

                {/* Expanded Details */}
                <AnimatePresence>
                  {expandedId === `${item.id}-${item.type}` && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-terminal-border bg-[var(--surface-muted)] p-4 md:p-5"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                        <div className="glass-card rounded-xl border border-terminal-border p-3 text-center">
                          <p className="text-2xl font-bold font-mono text-[var(--dashboard-primary)]">{item.correct}</p>
                          <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">সঠিক</p>
                        </div>
                        <div className="glass-card rounded-xl border border-terminal-border p-3 text-center">
                          <p className="text-2xl font-bold font-mono text-[var(--dashboard-danger)]">{Math.max(0, item.total - item.correct)}</p>
                          <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">ভুল / উত্তরহীন</p>
                        </div>
                        <div className="glass-card rounded-xl border border-terminal-border p-3 text-center">
                          <p className="text-2xl font-bold font-mono text-[var(--dashboard-warning)]">{item.total}</p>
                          <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">মোট প্রশ্ন</p>
                        </div>
                        <div className="glass-card rounded-xl border border-terminal-border p-3 text-center">
                          <p className="text-2xl font-bold font-mono text-[var(--dashboard-info)]">{formatTime(item.durationSec)}</p>
                          <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">সময় লেগেছে</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button className="px-3 py-1.5 rounded-lg border border-[var(--dashboard-border-muted)] bg-[var(--surface-raised)] text-xs font-mono text-[var(--dashboard-text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          বিস্তারিত দেখুন
                        </button>
                        <button className="px-3 py-1.5 rounded-lg border border-[var(--dashboard-border-muted)] bg-[var(--surface-raised)] text-xs font-mono text-[var(--dashboard-text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1">
                          <Download className="w-3.5 h-3.5" />
                          রিপোর্ট ডাউনলোড
                        </button>
                        <button className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--dashboard-text-inverse)] text-xs font-mono hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1">
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          রিভিশন শুরু করুন
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}

        {!history?.past.length && history?.upcoming.length ? null : (
          history?.past.length && filteredPast.length === 0 && (
            <div className="glass-card rounded-2xl border border-terminal-border p-6 text-center">
              <Funnel className="w-10 h-10 mx-auto mb-3 text-[var(--dashboard-text-muted)]/50" aria-hidden="true" />
              <p className="text-sm text-[var(--dashboard-text-muted)]">এই ফিল্টারে কোনো ফলাফল পাওয়া যায়নি।</p>
              <button
                onClick={() => setFilter("all")}
                className="mt-3 px-4 py-2 text-sm font-mono text-[var(--dashboard-primary)] hover:underline"
              >
                সব ফিল্টার খুলুন
              </button>
            </div>
          )
        )}
      </motion.div>
    </div>
  );
}