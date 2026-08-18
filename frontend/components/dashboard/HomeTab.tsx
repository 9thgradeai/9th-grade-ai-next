"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Flame, ChevronRight, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-ctx";
import {
  QUICK_ACTIONS,
  UPCOMING_EXAM,
  FLASH_NEWS,
  DASHBOARD_STATS,
} from "@/lib/data";
import { api } from "@/lib/services/api";
import DailyQuizWidget from "./DailyQuizWidget";

function useCountdown(target: string) {
  const [remaining, setRemaining] = useState("00:00:00:00");
  useEffect(() => {
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("00:00:00:00");
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setRemaining(`${pad(d)}:${pad(h)}:${pad(m)}:${pad(s)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return remaining;
}

// Progress gauge (SVG arc)
function ProgressGauge({ value }: { value: number }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <div className="relative w-44 h-44 mx-auto">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#6ee7b7" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx="80" cy="80" r={radius}
          fill="none" stroke="rgba(16,185,129,0.1)" strokeWidth="12"
        />
        {/* Progress arc */}
        <motion.circle
          cx="80" cy="80" r={radius}
          fill="none" stroke="url(#gauge-grad)" strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.4 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-emerald-400 font-mono">{value}%</span>
        <span className="text-xs text-zinc-400 uppercase tracking-wider">Completion</span>
      </div>
    </div>
  );
}

export default function HomeTab() {
  const countdown = useCountdown(UPCOMING_EXAM.date);
  const { user } = useAuth();
  const [stats, setStats] = useState(DASHBOARD_STATS);
  const [news, setNews] = useState(FLASH_NEWS);

   // Load dashboard stats + flash news from the database (fallback to static).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.dashboardStats();
        if (!cancelled && s) setStats(s);
      } catch {
        /* keep static fallback */
      }
      try {
        const n = await api.news();
        if (!cancelled && n.length) {
          setNews(
            n.map((item) => ({
              tag: item.tag,
              time: item.date || item.readTime + "d",
              text: item.text,
            })),
          );
        }
      } catch {
        /* keep static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Terminal User Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-terminal-rounded border border-terminal-border p-4 md:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-400 font-mono">
              <span className="text-emerald-500">{user?.handle ?? "guest"}@9th-grade-ai</span>:~$
              <span className="cursor-blink text-white ml-1"></span>
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs font-mono text-emerald-400">
                [TRACK: BCS-51]
              </span>
              <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded text-xs font-mono text-orange-400 flex items-center gap-1">
                <Flame className="w-3 h-3" /> 02_DAYS
              </span>
              <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs font-mono text-zinc-400">
                rank #{stats.rank}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-emerald-400 font-mono">⭐ {stats.points}</div>
            <div className="text-xs text-zinc-500 font-mono">total points</div>
          </div>
        </div>
      </motion.div>

      {/* Upcoming Exam Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-terminal-rounded border border-emerald-500/30 overflow-hidden"
      >
        <div className="terminal-window-bar">
          <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
          <div className="flex-1 text-center text-xs text-zinc-400 font-mono">            {"// UPCOMING_EXAM"}</div>
        </div>
        <div className="p-5 md:p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CalendarClock className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-400 font-mono mb-1">Next exam scheduled</p>
                <h3 className="text-xl md:text-2xl font-bold text-white">{UPCOMING_EXAM.name}</h3>
                <p className="text-sm text-zinc-400 mt-1">{UPCOMING_EXAM.papers}</p>
              </div>
            </div>
            <div className="flex flex-col items-start md:items-end gap-3">
              <div className="flex items-center gap-2 font-mono">
                <span className="text-xs text-zinc-400 uppercase tracking-wider">Countdown</span>
                <span className="px-3 py-1 bg-zinc-900 border border-emerald-500/20 rounded text-emerald-400 font-bold text-lg tracking-widest">
                  {countdown}
                </span>
              </div>
              <button className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded hover:bg-emerald-400 transition-colors flex items-center gap-2 shadow-neon-glow">
                [ VIEW_ROUTINE ] <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 8-Icon Quick Grid */}
      <div className="grid grid-cols-4 gap-3 md:gap-4">
        {QUICK_ACTIONS.map((action, i) => (
          <motion.button
            key={action.label}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 + i * 0.05, type: "spring", stiffness: 300, damping: 20 }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.95 }}
            className="glass rounded-terminal-rounded border border-terminal-border p-3 md:p-4 flex flex-col items-center gap-2 hover:border-emerald-500/40 hover:shadow-neon-glow transition-all"
          >
            <span className="text-2xl md:text-3xl" aria-hidden="true">{action.icon}</span>
            <span className={`text-[10px] md:text-xs font-mono text-center leading-tight ${action.color}`}>
              {action.label}
            </span>
          </motion.button>
        ))}
      </div>

      {/* Progress Gauge + Flash News */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Progress Gauge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-terminal-rounded border border-terminal-border p-5"
        >
          <div className="terminal-window-bar mb-4 border-b border-terminal-border">
            <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
            <div className="flex-1 text-center text-xs text-zinc-400 font-mono">            {"// COMPLETION"}</div>
          </div>
          <ProgressGauge value={stats.completion} />
          <p className="text-center text-sm text-zinc-400 mt-4">
            You&apos;ve answered <span className="text-emerald-400 font-mono">{stats.questionsAnswered.toLocaleString()}</span> questions
          </p>
        </motion.div>

        {/* Flash News Terminal Feed */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass rounded-terminal-rounded border border-terminal-border overflow-hidden"
        >
          <div className="terminal-window-bar">
            <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
            <div className="flex-1 text-center text-xs text-zinc-400 font-mono">            {"// FLASH_NEWS"}</div>
          </div>
          <div className="divide-y divide-emerald-500/10 max-h-72 overflow-y-auto">
            {news.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.55 + i * 0.08 }}
                className="flex items-start gap-3 p-3 hover:bg-emerald-500/5 transition-colors"
              >
                <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-mono text-emerald-400 flex-shrink-0 mt-0.5">
                  {item.tag}
                </span>
                <p className="text-sm text-zinc-300 flex-1">{item.text}</p>
                <span className="text-xs text-zinc-500 font-mono flex-shrink-0">{item.time}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* AI suggestion strip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-terminal-rounded"
      >
        <Sparkles className="w-5 h-5 text-emerald-400 flex-shrink-0" />
        <p className="text-sm text-zinc-300">
          <span className="text-emerald-400 font-mono">চর্চা AI:</span> Your weakest area is{" "}
          <span className="text-white font-mono">আন্তর্জাতিক বিষয়াবলী</span>. Suggested: 25 questions today.
        </p>
      </motion.div>

      {/* Daily Quiz Widget */}
      <DailyQuizWidget />
    </div>
  );
}