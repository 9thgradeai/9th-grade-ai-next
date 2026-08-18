/* src/components/dashboard/ProgressTab.tsx */
"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  Edit,
  Trophy,
  Flame,
  Share,
  Settings,
  Bell,
  ChevronDown,
  Info,
  Bookmark,
  BookmarkCheck,
  BarChart3,
} from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useAuth } from "@/lib/auth-ctx";
import { SUBJECT_REPORTS } from "@/lib/data";
import { api } from "@/lib/services/api";

/* --------------------------------------------------------------
   Types
   -------------------------------------------------------------- */
type DailyPoints = {
  date: string;
  day: string;
  dayLabel: string;
  points: number;
};

type SubjectReport = {
  name: string;
  score: number;
  attempted: number;
  correct: number;
  trend: string;
  topics?: { name: string; score: number }[];
};

/* --------------------------------------------------------------
   SVG Line/Area Chart Component
   -------------------------------------------------------------- */
function DailyPointsChart({ data }: { data: DailyPoints[] }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const chartWidth = 100;
  const chartHeight = 100;
  const padding = 8;

  const points = useMemo(() => {
    return data.map((d, i) => ({
      x: padding + (i / (data.length - 1)) * (chartWidth - padding * 2),
      y: padding + ((100 - d.points) / 100) * (chartHeight - padding * 2),
    }));
  }, [data]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    return [
      `M ${points[0].x} ${chartHeight - padding}`,
      ...points.map((p) => `L ${p.x} ${p.y}`),
      `L ${points[points.length - 1].x} ${chartHeight - padding}`,
      "Z",
    ].join(" ");
  }, [points]);

  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  }, [points]);

  const peak = useMemo(() => {
    return data.reduce((max, d) => (d.points > max.points ? d : max), data[0]);
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Chart header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-lg font-semibold text-white flex items-center gap-2">
            দৈনিক পয়েন্ট
            <button className="p-1 text-zinc-400 hover:text-emerald-400 transition-colors" aria-label="Info">
              <Info className="w-4 h-4" />
            </button>
          </h4>
          <p className="text-sm text-zinc-400 font-mono">আগস্ট ৯ - আগস্ট ১৫</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500 font-mono">PEAK</div>
          <div className="text-sm font-bold text-emerald-400 font-mono">{peak.points.toFixed(2)}</div>
        </div>
      </div>

      {/* Chart container */}
      <div className="relative h-52 md:h-64">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="area-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Grid lines */}
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

          {/* Area fill */}
          <path d={areaPath} fill="url(#area-grad)" />

          {/* Line */}
          <motion.path
            d={linePath}
            fill="none"
            stroke="#10B981"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
          />

          {/* Data points */}
          {points.map((point, i) => {
            const isSelected = selectedDay === data[i].day;
            const isPeak = data[i].points === peak.points;

            return (
              <g key={i}>
                <motion.circle
                  cx={point.x}
                  cy={point.y}
                  r={isPeak || isSelected ? 3.5 : 1.5}
                  fill={isPeak || isSelected ? "#10B981" : "#10B981"}
                  stroke="#0f172a"
                  strokeWidth={isPeak || isSelected ? 1.5 : 0.5}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  onClick={() => setSelectedDay(isSelected ? null : data[i].day)}
                  className="cursor-pointer"
                />
                <text
                  x={point.x}
                  y={chartHeight - 1.5}
                  textAnchor="middle"
                  className="text-[3px] fill-zinc-500 font-mono"
                >
                  {data[i].date}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected day tooltip */}
        <AnimatePresence>
          {selectedDay && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute top-4 right-4 bg-zinc-800/90 border border-emerald-500/30 rounded-lg p-3 backdrop-blur-sm"
            >
              <div className="text-xs text-zinc-400 font-mono">
                {selectedDay}
              </div>
              <div className="text-lg font-bold text-emerald-400 font-mono">
                {data.find((d) => d.day === selectedDay)?.points.toFixed(2)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Date legend */}
      <div className="flex justify-between text-xs text-zinc-500 font-mono px-1">
        {data.map((d) => (
          <span
            key={d.day}
            className={`cursor-pointer transition-colors ${
              selectedDay === d.day ? "text-emerald-400" : "hover:text-emerald-400"
            }`}
            onClick={() => setSelectedDay(selectedDay === d.day ? null : d.day)}
          >
            {d.dayLabel}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------
   Subject Report Row Component
   -------------------------------------------------------------- */
function SubjectReportRow({ report, index }: { report: SubjectReport; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const { toggleBookmark, bookmarkedQuestions } = useDashboardStore();

  const questionId = `subject-${report.name}`;
  const isBookmarked = bookmarkedQuestions.includes(questionId);

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleBookmark(questionId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.05 }}
      className="glass rounded-terminal-rounded border border-terminal-border overflow-hidden"
    >
      <motion.button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-emerald-500/5 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-white truncate">{report.name}</h4>
            <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400 font-mono">
              <span>{report.attempted} attempted</span>
              <span>•</span>
              <span>{report.correct} correct</span>
              <span
                className={`px-1.5 py-0.5 rounded ${
                  report.trend.startsWith("+")
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {report.trend}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xl font-bold text-emerald-400 font-mono">{report.score}%</div>
            <div className="text-[10px] text-zinc-500">Score</div>
          </div>
          <button
            onClick={handleBookmark}
            className={`p-1.5 rounded-lg transition-colors ${
              isBookmarked
                ? "text-emerald-400 bg-emerald-500/10"
                : "text-zinc-500 hover:text-emerald-400"
            }`}
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark subject"}
          >
            {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </button>
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
            <div className="p-4 space-y-4">
              {/* Accuracy, Total Questions, Topic Mastery */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-900/50 rounded-lg p-3 text-center border border-zinc-800">
                  <div className="text-lg font-bold text-white font-mono">
                    {report.attempted > 0 ? ((report.correct / report.attempted) * 100).toFixed(1) : "0.0"}%
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-1">Accuracy</div>
                  <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${report.attempted > 0 ? (report.correct / report.attempted) * 100 : 0}%` }}
                      transition={{ duration: 0.6, delay: 0.1 }}
                      className="h-full bg-emerald-500 rounded-full"
                    />
                  </div>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-3 text-center border border-zinc-800">
                  <div className="text-lg font-bold text-white font-mono">{report.attempted}</div>
                  <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-1">Total Questions</div>
                  <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (report.attempted / 500) * 100)}%` }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                      className="h-full bg-sky-500 rounded-full"
                    />
                  </div>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-3 text-center border border-zinc-800">
                  <div className="text-lg font-bold text-white font-mono">{report.score}%</div>
                  <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-1">Topic Mastery</div>
                  <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${report.score}%` }}
                      transition={{ duration: 0.6, delay: 0.3 }}
                      className="h-full bg-amber-500 rounded-full"
                    />
                  </div>
                </div>
              </div>

              {/* Topic breakdown */}
              {report.topics && report.topics.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-zinc-800">
                  <h5 className="text-xs font-medium text-zinc-400 uppercase tracking-wider font-mono">Topic Breakdown</h5>
                  {report.topics.map((topic, i) => (
                    <div key={topic.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 truncate">{topic.name}</span>
                        <span className="text-emerald-400 font-mono font-medium">{topic.score}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${topic.score}%` }}
                          transition={{ duration: 0.5, delay: i * 0.1 }}
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* --------------------------------------------------------------
   Toast Notification Component
   -------------------------------------------------------------- */
function Toast({ message, type = "success", onClose }: { message: string; type?: "success" | "error" | "info"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor =
    type === "success"
      ? "bg-emerald-500/10 border-emerald-500/30"
      : type === "error"
      ? "bg-red-500/10 border-red-500/30"
      : "bg-blue-500/10 border-blue-500/30";

  const textColor =
    type === "success"
      ? "text-emerald-400"
      : type === "error"
      ? "text-red-400"
      : "text-blue-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 ${bgColor} border rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg backdrop-blur-sm`}
    >
      <span className={`${textColor} text-sm font-medium font-mono`}>{message}</span>
      <button
        onClick={onClose}
        className={`${textColor} hover:opacity-80 transition-opacity text-lg leading-none`}
        aria-label="Close notification"
      >
        ×
      </button>
    </motion.div>
  );
}

/* --------------------------------------------------------------
   Main Progress Tab Component
   -------------------------------------------------------------- */
export default function ProgressTab() {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "info">("success");
  const [subjectReportsData, setSubjectReportsData] = useState(SUBJECT_REPORTS);

  // Load subject reports from the database (fallback to static data).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.subjectReports();
        if (!cancelled && list.length) setSubjectReportsData(list);
      } catch {
        /* keep static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { user } = useAuth();
  const {
    totalPoints,
    streakCount,
  } = useDashboardStore();

  const triggerToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  };

  // Sync profile from store
  const profile = useMemo(
    () => ({
      name: user?.name ?? "Guest User",
      handle: user?.handle ?? "guest",
      track: "Grade 9 Science",
      points: totalPoints,
      exams: 52,
      rank: 25,
      streak: streakCount,
    }),
    [user?.name, user?.handle, totalPoints, streakCount]
  );

  // Daily points data (Bengali dates, Aug 9 - Aug 15)
  const dailyPointsData: DailyPoints[] = useMemo(
    () => [
      { date: "৯", day: "Sat", dayLabel: "9 S", points: 42 },
      { date: "১০", day: "Sun", dayLabel: "10 M", points: 55 },
      { date: "১১", day: "Mon", dayLabel: "11 T", points: 38 },
      { date: "১২", day: "Tue", dayLabel: "12 W", points: 48 },
      { date: "১৩", day: "Wed", dayLabel: "13 T", points: 62 },
      { date: "১৪", day: "Thu", dayLabel: "14 F", points: 82.20 },
      { date: "১৫", day: "Fri", dayLabel: "15 S", points: 71.5 },
    ],
    []
  );

  // Subject reports with Bengali names and correct percentages
  const subjectReports: SubjectReport[] = useMemo(
    () => [
      ...subjectReportsData.map((r) => ({
        name: r.name,
        score: r.score,
        attempted: r.attempted,
        correct: r.correct,
        trend: r.trend,
        topics: [
          { name: "Unit 1: Fundamentals", score: Math.max(0, r.score - 5) },
          { name: "Unit 2: Advanced", score: Math.max(0, r.score - 10) },
        ],
      })),
      {
        name: "পদার্থবিজ্ঞান",
        score: 1,
        attempted: 10,
        correct: 0,
        trend: "+0%",
        topics: [
          { name: "গতি ও বল", score: 0 },
          { name: "শক্তি ও কাজ", score: 0 },
        ],
      },
      {
        name: "উচ্চতর গণিত",
        score: 1,
        attempted: 10,
        correct: 0,
        trend: "+0%",
        topics: [
          { name: "ত্রিকোণমিতি", score: 0 },
          { name: "জ্যামিতি", score: 0 },
        ],
      },
    ],
    []
  );

  const handleShare = () => {
    triggerToast("প্রগতি শেয়ার করা হয়েছে", "success");
  };

  const handleSettings = () => {
    triggerToast("সেটিংস খোলা হয়েছে", "info");
  };

  const handleNotification = () => {
    triggerToast("নোটিফিকেশন দেখা হচ্ছে", "info");
  };

  return (
    <div className="space-y-6">
      {/* User Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-terminal-rounded border border-terminal-border p-4 md:p-5"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-xl md:text-2xl font-bold text-emerald-400 flex-shrink-0">
              {profile.name.charAt(0)}
            </div>

            {/* Name and Track */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg md:text-xl font-semibold text-white truncate">{profile.name}</h3>
                <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-[10px] font-mono text-emerald-400 whitespace-nowrap">
                  {user?.role === "admin" ? "9Th-Grade AI Admin" : "9Th-Grade AI"}
                </span>
              </div>
              <p className="text-sm text-zinc-400 font-mono mt-0.5">{profile.track}</p>
            </div>
          </div>

          {/* Utility Buttons */}
          <div className="flex items-center gap-1 md:gap-2">
            <button
              onClick={handleShare}
              className="p-2 text-zinc-400 hover:text-emerald-400 transition-colors rounded-lg hover:bg-emerald-500/5"
              title="Share"
            >
              <Share className="w-5 h-5" />
            </button>
            <button
              onClick={handleSettings}
              className="p-2 text-zinc-400 hover:text-emerald-400 transition-colors rounded-lg hover:bg-emerald-500/5"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={handleNotification}
              className="p-2 text-zinc-400 hover:text-emerald-400 transition-colors rounded-lg hover:bg-emerald-500/5 relative"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* 4-Column KPI Metrics Grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {[
          { icon: Star, label: "পয়েন্ট", value: profile.points.toFixed(1), color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
          { icon: Edit, label: "পরীক্ষা", value: profile.exams.toString(), color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
          { icon: Trophy, label: "র‍্যাংক", value: `#${profile.rank}`, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
          { icon: Flame, label: "স্ট্রাইক", value: profile.streak.toString(), color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
        ].map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.08 }}
            className={`glass rounded-terminal-rounded border ${metric.border} p-4 text-center hover:shadow-neon-glow transition-all cursor-default group`}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${metric.bg} ${metric.color}`}>
                <metric.icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">
                {metric.label}
              </span>
            </div>
            <div className={`text-2xl md:text-3xl font-bold ${metric.color} font-mono tracking-tight`}>
              {metric.value}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {metric.label === "পয়েন্ট" && "Total Points"}
              {metric.label === "পরীক্ষা" && "Exams Taken"}
              {metric.label === "র‍্যাংক" && "Class Rank"}
              {metric.label === "স্ট্রাইক" && "Daily Streak"}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Daily Points Chart */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-terminal-rounded border border-terminal-border p-5 md:p-6"
      >
        <DailyPointsChart data={dailyPointsData} />
      </motion.div>

      {/* Subject-Wise Report */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-emerald-500 font-mono">$</span> সাবজেক্ট ভিত্তিক রিপোর্ট
          </h3>
          <span className="text-xs text-zinc-500 font-mono">{subjectReports.length} subjects</span>
        </div>
        <div className="space-y-3">
          {subjectReports.map((report, i) => (
            <SubjectReportRow key={report.name} report={report} index={i} />
          ))}
        </div>
      </motion.div>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <Toast
            message={toastMessage}
            type={toastType}
            onClose={() => setShowToast(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
