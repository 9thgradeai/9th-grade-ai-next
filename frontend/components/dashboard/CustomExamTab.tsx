"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  Play,
  Timer,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  Trophy,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Minus,
  Plus,
  Layers,
  ListOrdered,
  Clock,
  Flag,
  CircleDashed,
} from "lucide-react";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";

type ExamPhase = "config" | "exam" | "result";

type GroupSelection = { groupName: string; subTopics: string[] };
type SubjectSelection = { groups: GroupSelection[] };
type Selection = Record<number, SubjectSelection>;

const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: "সহজ",
  MEDIUM: "মাঝারি",
  HARD: "কঠিন",
};

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

const STORAGE_KEY = "ninth-grade-ai:exam:active";

type PersistedExam = {
  examId: string;
  questions: Server.ExamQuestionDTO[];
  answers: Record<number, string>;
  startsAt: number;
  durationSec: number;
  requested: number;
  available: number;
  shortfall: number;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function performanceLabel(percentage: number): { label: string; tone: string } {
  if (percentage >= 80) return { label: "চমৎকার", tone: "text-amber-400" };
  if (percentage >= 60) return { label: "ভালো", tone: "text-emerald-400" };
  if (percentage >= 40) return { label: "গড়", tone: "text-yellow-400" };
  return { label: "উন্নতি প্রয়োজন", tone: "text-red-400" };
}

export default function CustomExamTab() {
  // ── Config state ──
  const [subjects, setSubjects] = useState<Server.ExamSubjectDTO[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({});
  const [questionCount, setQuestionCount] = useState(10);
  const [durationMin, setDurationMin] = useState(15);
  const [showConfirm, setShowConfirm] = useState(false);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  // ── Exam state ──
  const [exam, setExam] = useState<PersistedExam | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [phase, setPhase] = useState<ExamPhase>("config");
  const [showUnansweredConfirm, setShowUnansweredConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const submittingRef = useRef(false);

  // ── Result state ──
  const [result, setResult] = useState<Server.ExamResultDTO | null>(null);

  // Load the exam configuration tree. State changes happen after `await`, so
  // no render-phase impurity or effect-driven cascade is introduced.
  const fetchConfig = useCallback(async () => {
    try {
      const list = await api.examConfig();
      setSubjects(list.filter((s) => s.questionCount > 0));
    } catch {
      setConfigError("কনফিগারেশন লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await api.examConfig();
        setSubjects(list.filter((s) => s.questionCount > 0));
      } catch {
        setConfigError("কনফিগারেশন লোড করা যায়নি। আবার চেষ্টা করুন।");
      } finally {
        setConfigLoading(false);
      }
    })();
  }, []);

  const handleRetryConfig = () => {
    setConfigLoading(true);
    setConfigError(null);
    void fetchConfig();
  };

  // Resume an in-progress exam from localStorage so refresh/navigation does not
  // corrupt an active attempt. Runs after an async boundary; the countdown
  // effect auto-submits if the timer already ran out while away.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as PersistedExam;
        if (!saved?.questions?.length) return;
        setExam(saved);
        setAnswers(saved.answers ?? {});
        const elapsed = Math.floor((Date.now() - saved.startsAt) / 1000);
        const remaining = saved.durationSec > 0 ? Math.max(0, saved.durationSec - elapsed) : 0;
        setTimeRemaining(remaining);
        setPhase("exam");
      } catch {
        /* corrupt storage — ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Selection helpers ──
  const selectedSubjects = useMemo(
    () => subjects.filter((s) => selection[s.id] !== undefined),
    [subjects, selection],
  );

  const availableTotal = useMemo(() => {
    let total = 0;
    for (const s of selectedSubjects) {
      const sel = selection[s.id];
      if (sel.groups.length === 0) {
        total += s.questionCount;
        continue;
      }
      for (const g of sel.groups) {
        const group = s.groups.find((x) => x.groupName === g.groupName);
        if (!group) continue;
        if (g.subTopics.length === 0) {
          total += group.questionCount;
        } else {
          for (const st of g.subTopics) {
            total += group.subTopics.find((x) => x.name === st)?.questionCount ?? 0;
          }
        }
      }
    }
    return total;
  }, [selectedSubjects, selection]);

  const selectedGroupCount = useMemo(
    () =>
      selectedSubjects.reduce((acc, s) => {
        const sel = selection[s.id];
        return acc + (sel.groups.length === 0 ? s.groups.length : sel.groups.length);
      }, 0),
    [selectedSubjects, selection],
  );

  const selectedSubTopicCount = useMemo(
    () =>
      selectedSubjects.reduce((acc, s) => {
        const sel = selection[s.id];
        if (sel.groups.length === 0) {
          return acc + s.groups.reduce((n, g) => n + g.subTopics.length, 0);
        }
        return (
          acc +
          sel.groups.reduce((n, g) => n + (g.subTopics.length === 0 ? 0 : g.subTopics.length), 0)
        );
      }, 0),
    [selectedSubjects, selection],
  );

  const clampedQuestionCount = Math.min(Math.max(questionCount, 1), Math.max(availableTotal, 1));
  const insufficient = questionCount > availableTotal;

  const toggleSubject = (subject: Server.ExamSubjectDTO) => {
    setSelection((prev) => {
      const next = { ...prev };
      if (next[subject.id]) {
        delete next[subject.id];
      } else {
        next[subject.id] = { groups: [] };
      }
      return next;
    });
  };

  const toggleWholeSubject = (subject: Server.ExamSubjectDTO) => {
    setSelection((prev) => {
      const next = { ...prev };
      next[subject.id] = { groups: [] };
      return next;
    });
  };

  const toggleGroup = (subject: Server.ExamSubjectDTO, groupName: string) => {
    setSelection((prev) => {
      const existing = prev[subject.id] ?? { groups: [] as GroupSelection[] };
      const exists = existing.groups.some((g) => g.groupName === groupName);
      const groups = exists
        ? existing.groups.filter((g) => g.groupName !== groupName)
        : [...existing.groups, { groupName, subTopics: [] }];
      return { ...prev, [subject.id]: { groups } };
    });
  };

  const toggleSubTopic = (
    subject: Server.ExamSubjectDTO,
    groupName: string,
    subTopicName: string,
  ) => {
    setSelection((prev) => {
      const existing = prev[subject.id] ?? { groups: [] as GroupSelection[] };
      const groupIdx = existing.groups.findIndex((g) => g.groupName === groupName);

      let groups: GroupSelection[];
      if (groupIdx === -1) {
        // Selecting a subtopic implies the whole group is included.
        groups = [...existing.groups, { groupName, subTopics: [subTopicName] }];
      } else {
        const group = existing.groups[groupIdx];
        const inList = group.subTopics.includes(subTopicName);
        const subTopics = inList
          ? group.subTopics.filter((t) => t !== subTopicName)
          : [...group.subTopics, subTopicName];
        // Removing the last explicit subtopic keeps the whole group selected.
        const cleaned = inList && subTopics.length === 0 ? [] : subTopics;
        groups = existing.groups.map((g, i) => (i === groupIdx ? { ...g, subTopics: cleaned } : g));
      }

      return { ...prev, [subject.id]: { groups } };
    });
  };

  const adjustQuestionCount = (delta: number) => {
    setQuestionCount((c) => Math.max(1, Math.min(200, c + delta)));
  };

  const adjustDuration = (delta: number) => {
    setDurationMin((d) => Math.max(1, Math.min(180, d + delta)));
  };

  const buildSelectionRequest = (): Server.ExamSelectionRequest => ({
    subjects: selectedSubjects.map((s) => ({
      subjectId: s.id,
      groups: selection[s.id].groups,
    })),
    questionCount: clampedQuestionCount,
    durationSec: durationMin * 60,
  });

  const confirmAndStart = async () => {
    setBuildLoading(true);
    setBuildError(null);
    try {
      const built = await api.buildExam(buildSelectionRequest());
      if (built.questions.length === 0) {
        setBuildError("এই কনফিগারেশনে কোনো প্রশ্ন পাওয়া যায়নি।");
        return;
      }
      const persisted: PersistedExam = {
        examId: built.examId,
        questions: built.questions,
        answers: {},
        startsAt: Date.now(),
        durationSec: built.durationSec,
        requested: built.requested,
        available: built.available,
        shortfall: built.shortfall,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      } catch {
        /* storage full/blocked — exam still works, just not resumable */
      }
      setExam(persisted);
      setAnswers({});
      setTimeRemaining(built.durationSec);
      setShowConfirm(false);
      setPhase("exam");
    } catch {
      setBuildError("পরীক্ষা তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBuildLoading(false);
    }
  };

  const selectAnswer = (questionId: number, option: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: option };
      if (exam) {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...exam, answers: next }),
          );
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = exam?.questions.length ?? 0;
  const unanswered = totalQuestions - answeredCount;

  const scrollToQuestion = (questionId: number) => {
    questionRefs.current[questionId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = useCallback(
    async (qs: Server.ExamQuestionDTO[], ans: Record<number, string>) => {
      if (qs.length === 0 || submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const payload = qs.map((q) => ({ questionId: q.id, selected: ans[q.id] ?? "" }));
        const res = await api.submitExam(payload);
        setResult(res);
        setPhase("result");
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      } catch {
        setSubmitError("ফলাফল জমা দেওয়া যায়নি। আবার চেষ্টা করুন।");
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleSubmitRequest = () => {
    if (unanswered > 0) {
      setShowUnansweredConfirm(true);
    } else if (exam) {
      void submit(exam.questions, answers);
    }
  };

  const finalizeSubmit = () => {
    setShowUnansweredConfirm(false);
    if (exam) void submit(exam.questions, answers);
  };

  // Countdown — wall-clock based so it survives refreshes.
  useEffect(() => {
    if (phase !== "exam" || !exam || exam.durationSec <= 0) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - exam.startsAt) / 1000);
      const remaining = Math.max(0, exam.durationSec - elapsed);
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        void submit(exam.questions, answers);
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, exam, answers]);

  const resetAll = () => {
    setPhase("config");
    setExam(null);
    setAnswers({});
    setResult(null);
    setSubmitError(null);
    setShowUnansweredConfirm(false);
    setQuestionCount(10);
    setDurationMin(15);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  // ═══════════════ CONFIG PHASE ═══════════════
  if (phase === "config") {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl border border-terminal-border overflow-hidden"
        >
          <div className="terminal-window-bar border-b border-terminal-border">
            <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
            <div className="flex-1 text-center text-xs text-zinc-400 font-mono">
              {"// CUSTOM_BCS_EXAM_BUILDER"}
            </div>
          </div>
          <div className="p-5 md:p-6">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">কাস্টম বিসিএস পরীক্ষা</h2>
            </div>
            <p className="text-xs text-zinc-500 font-mono">
              বিষয়, টপিক ও সাবটপিক বেছে নিয়ে নিজের পছন্দের পরীক্ষা তৈরি করুন — নেগেটিভ মার্কিং সহ বাস্তব বিসিএস ধাঁচে।
            </p>
          </div>
        </motion.div>

        {configLoading && (
          <div className="glass rounded-2xl border border-terminal-border p-10 text-center">
            <p className="text-3xl mb-3 animate-pulse">⏳</p>
            <p className="text-sm text-zinc-400 font-mono">বিষয় লোড হচ্ছে...</p>
          </div>
        )}

        {configError && (
          <div className="glass rounded-2xl border border-terminal-border p-10 text-center">
            <p className="text-3xl mb-3">⚠️</p>
            <p className="text-sm text-zinc-400">{configError}</p>
            <button
              onClick={handleRetryConfig}
              className="mt-4 px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors"
            >
              আবার চেষ্টা করুন
            </button>
          </div>
        )}

        {!configLoading && !configError && (
          <>
            {/* Subject multi-select */}
            <div>
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest mb-2">
                ১. বিষয় নির্বাচন করুন
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {subjects.map((subject, i) => {
                  const selected = selection[subject.id] !== undefined;
                  return (
                    <motion.button
                      key={subject.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.03 }}
                      whileHover={{ y: -2 }}
                      onClick={() => toggleSubject(subject)}
                      className={`glass rounded-2xl border p-3 text-left transition-all ${
                        selected
                          ? "border-emerald-500/40 bg-emerald-500/10 shadow-neon-glow"
                          : "border-terminal-border hover:border-emerald-500/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-8 h-8 rounded-lg ${subject.bg} flex items-center justify-center text-base flex-shrink-0`}>
                          {subject.icon}
                        </span>
                        <span className={`text-[11px] font-mono leading-tight line-clamp-2 ${subject.color}`}>
                          {subject.nameBn}
                        </span>
                        <span
                          className={`ml-auto w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                            selected ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"
                          }`}
                        >
                          {selected && <Check className="w-3 h-3 text-zinc-950" />}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 font-mono mt-1.5">
                        {subject.questionCount}টি প্রশ্ন
                      </p>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Topic / subtopic drill-down per selected subject */}
            <AnimatePresence>
              {selectedSubjects.map((subject) => {
                const sel = selection[subject.id];
                const allSelected = sel.groups.length === 0;
                return (
                  <motion.div
                    key={subject.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="glass rounded-2xl border border-emerald-500/20 p-4 md:p-5"
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">{subject.icon}</span>
                        <h3 className="text-sm font-semibold text-white truncate">{subject.nameBn}</h3>
                      </div>
                      <button
                        onClick={() => toggleWholeSubject(subject)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-colors flex-shrink-0 ${
                          allSelected
                            ? "bg-emerald-500 text-zinc-950 border-emerald-500"
                            : "border-zinc-700 text-zinc-400 hover:border-emerald-500/40"
                        }`}
                      >
                        {allSelected ? "পুরো বিষয় ✓" : "সব টপিক নির্বাচন"}
                      </button>
                    </div>

                    {allSelected ? (
                      <p className="text-xs text-zinc-500 font-mono">
                        বিষয়ের সব টপিক নির্বাচিত — {subject.questionCount}টি প্রশ্ন
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {subject.groups.map((group) => {
                          const groupSel = sel.groups.find((g) => g.groupName === group.groupName);
                          const groupOn = !!groupSel;
                          return (
                            <div
                              key={group.groupName}
                              className={`rounded-xl border p-3 transition-colors ${
                                groupOn ? "border-emerald-500/30 bg-emerald-500/5" : "border-zinc-800"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleGroup(subject, group.groupName)}
                                  className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                                    groupOn ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"
                                  }`}
                                  aria-label={groupOn ? "Remove group" : "Select group"}
                                >
                                  {groupOn && <Check className="w-3 h-3 text-zinc-950" />}
                                </button>
                                <button
                                  onClick={() => toggleGroup(subject, group.groupName)}
                                  className="flex-1 text-left"
                                >
                                  <span className="text-xs font-medium text-white">{group.groupName}</span>
                                  <span className="block text-[10px] text-zinc-500 font-mono">
                                    {group.questionCount}টি প্রশ্ন
                                  </span>
                                </button>
                                {groupOn && groupSel!.subTopics.length === 0 && (
                                  <span className="text-[10px] text-emerald-400 font-mono">সম্পূর্ণ টপিক</span>
                                )}
                              </div>

                              {groupOn && (
                                <div className="mt-2.5 pl-6 flex flex-wrap gap-1.5">
                                  {group.subTopics.map((st) => {
                                    const stOn = groupSel!.subTopics.includes(st.name);
                                    return (
                                      <button
                                        key={st.name}
                                        onClick={() => toggleSubTopic(subject, group.groupName, st.name)}
                                        className={`px-2 py-1 rounded-md text-[10px] font-mono border transition-colors ${
                                          stOn
                                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                                            : "border-zinc-700 text-zinc-400 hover:border-emerald-500/30"
                                        }`}
                                      >
                                        {st.name} ({st.questionCount})
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Question count + duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass rounded-xl border border-terminal-border p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-300 font-mono">প্রশ্নের সংখ্যা</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    উপলব্ধ:{" "}
                    <span className={`font-mono ${insufficient ? "text-red-400" : "text-emerald-400"}`}>
                      {availableTotal}টি
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustQuestionCount(-1)}
                    className="w-8 h-8 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                    aria-label="কমান"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-2xl font-bold text-emerald-400 font-mono w-9 text-center">{questionCount}</span>
                  <button
                    onClick={() => adjustQuestionCount(1)}
                    className="w-8 h-8 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                    aria-label="বাড়ান"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="glass rounded-xl border border-terminal-border p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-300 font-mono">সময়সীমা</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {durationMin} মিনিট (প্রশ্নপ্রতি ~{Math.max(1, Math.round(durationMin / Math.max(1, clampedQuestionCount)))} মি.)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustDuration(-1)}
                    className="w-8 h-8 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                    aria-label="সময় কমান"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-2xl font-bold text-emerald-400 font-mono w-8 text-center">{durationMin}</span>
                  <button
                    onClick={() => adjustDuration(1)}
                    className="w-8 h-8 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                    aria-label="সময় বাড়ান"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {insufficient && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  শুধু <span className="font-mono">{availableTotal}টি</span> প্রশ্ন পাওয়া যায়। পরীক্ষা
                  শুরু হলে <span className="font-mono">{clampedQuestionCount}টি</span> প্রশ্ন দেওয়া হবে।
                </p>
              </div>
            )}

            {buildError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{buildError}</p>
              </div>
            )}

            {/* Live config summary */}
            <motion.div
              layout
              className="glass rounded-2xl border border-emerald-500/30 p-4"
            >
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-2">লাইভ কনফিগারেশন সামারি</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <ListOrdered className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
                  <p className="text-lg font-bold text-white font-mono">{selectedSubjects.length}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">বিষয়</p>
                </div>
                <div>
                  <BookOpen className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
                  <p className="text-lg font-bold text-white font-mono">{selectedGroupCount}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">টপিক</p>
                </div>
                <div>
                  <CircleDashed className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
                  <p className="text-lg font-bold text-white font-mono">{selectedSubTopicCount}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">সাবটপিক</p>
                </div>
                <div>
                  <Clock className="w-4 h-4 mx-auto text-emerald-400 mb-1" />
                  <p className="text-lg font-bold text-white font-mono">
                    {clampedQuestionCount}
                    <span className="text-xs text-zinc-500 ml-1">প্র.</span>
                  </p>
                  <p className="text-[10px] text-zinc-500 font-mono">{durationMin} মিনিট</p>
                </div>
              </div>
            </motion.div>

            <button
              onClick={() => setShowConfirm(true)}
              disabled={selectedSubjects.length === 0 || buildLoading}
              className="mt-4 w-full py-3 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              কনফিগারেশন রিভিউ করে শুরু করুন
            </button>

            {/* Confirm modal */}
            <AnimatePresence>
              {showConfirm && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                  onClick={() => !buildLoading && setShowConfirm(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, y: 10 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 10 }}
                    onClick={(e) => e.stopPropagation()}
                    className="glass rounded-2xl border border-emerald-500/30 p-6 w-full max-w-md"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-white">পরীক্ষা নিশ্চিত করুন</h3>
                      <button
                        onClick={() => setShowConfirm(false)}
                        disabled={buildLoading}
                        className="text-zinc-500 hover:text-white transition-colors"
                        aria-label="বন্ধ করুন"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="space-y-2 mb-5">
                      <p className="flex justify-between text-xs">
                        <span className="text-zinc-500 font-mono">বিষয়</span>
                        <span className="text-white font-mono">{selectedSubjects.map((s) => s.nameBn).join(", ")}</span>
                      </p>
                      <p className="flex justify-between text-xs">
                        <span className="text-zinc-500 font-mono">টপিক / সাবটপিক</span>
                        <span className="text-white font-mono">{selectedGroupCount} / {selectedSubTopicCount}</span>
                      </p>
                      <p className="flex justify-between text-xs">
                        <span className="text-zinc-500 font-mono">প্রশ্ন</span>
                        <span className="text-emerald-400 font-mono">{clampedQuestionCount}টি</span>
                      </p>
                      <p className="flex justify-between text-xs">
                        <span className="text-zinc-500 font-mono">সময়</span>
                        <span className="text-emerald-400 font-mono">{durationMin} মিনিট</span>
                      </p>
                      <p className="flex justify-between text-xs">
                        <span className="text-zinc-500 font-mono">স্কোরিং</span>
                        <span className="text-white font-mono">সঠিক +১ • ভুল −০.৫ • না দেওয়া ০</span>
                      </p>
                    </div>

                    {insufficient && (
                      <p className="text-[11px] text-amber-300 mb-4">
                        ⚠️ শুধু {availableTotal}টি প্রশ্ন উপলব্ধ — {clampedQuestionCount}টি দেওয়া হবে।
                      </p>
                    )}

                    <button
                      onClick={() => void confirmAndStart()}
                      disabled={buildLoading}
                      className="w-full py-3 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40"
                    >
                      {buildLoading ? "তৈরি হচ্ছে..." : (
                        <>
                          <Play className="w-4 h-4" /> পরীক্ষা শুরু করুন
                        </>
                      )}
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    );
  }

  // ═══════════════ EXAM PHASE ═══════════════
  if (phase === "exam" && exam) {
    const timeLow = timeRemaining > 0 && timeRemaining <= 60;
    const progressPct = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

    return (
      <div className="space-y-4">
        {/* Sticky header: timer + progress + submit */}
        <div className="sticky top-0 z-40 -mx-1 px-1">
          <div className="glass rounded-2xl border border-emerald-500/30 px-4 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Timer className={`w-4 h-4 ${timeLow ? "text-red-400 animate-pulse" : "text-emerald-400"}`} />
                <span className={`font-mono text-lg font-bold ${timeLow ? "text-red-400" : "text-emerald-400"}`}>
                  {formatTime(timeRemaining)}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                  {exam.durationSec > 0 ? "" : "সময় সীমাহীন"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-mono">
                  উত্তর: <span className="text-emerald-400">{answeredCount}</span> / {totalQuestions}
                </span>
                <button
                  onClick={handleSubmitRequest}
                  disabled={submitting || totalQuestions === 0}
                  className="px-4 py-1.5 bg-emerald-500 text-zinc-950 font-mono text-xs rounded-lg hover:bg-emerald-400 transition-colors shadow-neon-glow flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Flag className="w-3.5 h-3.5" />
                  {submitting ? "জমা হচ্ছে..." : "জমা দিন"}
                </button>
              </div>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Question palette (jump navigation) */}
        <div className="glass rounded-2xl border border-terminal-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <CircleDashed className="w-3.5 h-3.5 text-emerald-400" />
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">প্রশ্ন তালিকা</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {exam.questions.map((q, i) => {
              const isAnswered = answers[q.id] !== undefined;
              return (
                <button
                  key={q.id}
                  onClick={() => scrollToQuestion(q.id)}
                  className={`w-8 h-8 rounded-lg border text-xs font-mono transition-all ${
                    isAnswered
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
                  }`}
                  aria-label={`প্রশ্ন ${i + 1}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* All questions, vertically scrollable */}
        <div className="space-y-4">
          {exam.questions.map((q, index) => {
            const userAnswer = answers[q.id];
            return (
              <div
                key={q.id}
                ref={(el) => { questionRefs.current[q.id] = el; }}
                id={`exam-q-${q.id}`}
                className="glass rounded-2xl border border-terminal-border p-4 md:p-5 scroll-mt-32"
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300">
                    প্রশ্ন {index + 1}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-400">
                    {q.subject}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                    q.difficulty === "EASY"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : q.difficulty === "MEDIUM"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-red-500/10 text-red-400"
                  }`}>
                    {DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}
                  </span>
                  {q.topic && (
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-500">
                      {q.topic}
                    </span>
                  )}
                  {userAnswer !== undefined && (
                    <span className="ml-auto px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400">
                      ✓ উত্তর দেওয়া হয়েছে
                    </span>
                  )}
                </div>

                <h3 className="text-sm md:text-base font-medium text-white mb-4">{q.question}</h3>

                <div className="space-y-2.5">
                  {q.options.map((option, i) => {
                    const isSelected = userAnswer === option;
                    return (
                      <button
                        key={i}
                        onClick={() => selectAnswer(q.id, option)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          isSelected
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:border-emerald-500/20"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-mono ${
                            isSelected ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 border border-zinc-700 text-zinc-400"
                          }`}>
                            {OPTION_LABELS[i] ?? i + 1}
                          </span>
                          <span className="text-sm">{option}</span>
                          {isSelected && <Check className="w-4 h-4 text-emerald-400 ml-auto" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky submit bar */}
        <div className="sticky bottom-0 z-40 -mx-1 px-1 pb-1">
          <div className="glass rounded-2xl border border-emerald-500/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-zinc-400 font-mono">
              {unanswered > 0 ? (
                <>
                  <span className="text-amber-400">{unanswered}টি</span> উত্তর দেওয়া বাকি
                </>
              ) : (
                <span className="text-emerald-400">সব প্রশ্নের উত্তর দেওয়া হয়েছে ✓</span>
              )}
            </div>
            <button
              onClick={handleSubmitRequest}
              disabled={submitting}
              className="px-6 py-2.5 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors shadow-neon-glow flex items-center gap-2 disabled:opacity-40"
            >
              {submitting ? "জমা হচ্ছে..." : (
                <>
                  <Flag className="w-4 h-4" /> পরীক্ষা জমা দিন
                </>
              )}
            </button>
          </div>
        </div>

        {submitError && (
          <p className="text-xs text-red-400 text-center">{submitError}</p>
        )}

        {/* Unanswered confirmation modal */}
        <AnimatePresence>
          {showUnansweredConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setShowUnansweredConfirm(false)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                onClick={(e) => e.stopPropagation()}
                className="glass rounded-2xl border border-amber-500/30 p-6 w-full max-w-sm"
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">উত্তর দেওয়া বাকি আছে</h3>
                </div>
                <p className="text-sm text-zinc-400 mb-5">
                  <span className="text-amber-400 font-mono">{unanswered}টি</span> প্রশ্নে উত্তর দেওয়া হয়নি।
                  নিশ্চিতভাবে জমা দিতে চান? না দেওয়া প্রশ্নে ০ নম্বর পাবেন।
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowUnansweredConfirm(false)}
                    className="flex-1 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-sm rounded-xl hover:bg-zinc-800 transition-colors"
                  >
                    ফিরে যান
                  </button>
                  <button
                    onClick={finalizeSubmit}
                    className="flex-1 py-2.5 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors shadow-neon-glow"
                  >
                    জমা দিন
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ═══════════════ RESULT PHASE ═══════════════
  if (phase === "result" && result) {
    const { summary } = result;
    const perf = performanceLabel(summary.percentage);

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-2xl border border-emerald-500/30 overflow-hidden"
        >
          <div className="p-6 text-center border-b border-terminal-border">
            <Trophy className={`w-12 h-12 mx-auto mb-3 ${summary.percentage >= 80 ? "text-amber-400" : summary.percentage >= 50 ? "text-emerald-400" : "text-red-400"}`} />
            <h3 className="text-xl font-bold text-white mb-1">পরীক্ষা সম্পন্ন!</h3>
            <p className={`text-sm font-mono mb-4 ${perf.tone}`}>{perf.label}</p>

            <div className="inline-flex flex-col items-center mb-4">
              <div className="text-5xl font-bold font-mono text-emerald-400">{summary.finalScore}</div>
              <div className="text-xs text-zinc-500 font-mono mt-1">মোট নম্বর: {summary.total}</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-md mx-auto text-left">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                <p className="text-[10px] text-zinc-500 font-mono">সঠিক</p>
                <p className="text-lg font-bold text-emerald-400 font-mono">+{summary.correct}</p>
              </div>
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                <p className="text-[10px] text-zinc-500 font-mono">ভুল</p>
                <p className="text-lg font-bold text-red-400 font-mono">−{summary.wrong}</p>
              </div>
              <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-3">
                <p className="text-[10px] text-zinc-500 font-mono">উত্তর দেওয়া হয়নি</p>
                <p className="text-lg font-bold text-zinc-400 font-mono">{summary.unanswered}</p>
              </div>
              <div className="rounded-xl bg-emerald-500/5 border border-zinc-800 p-3">
                <p className="text-[10px] text-zinc-500 font-mono">ইতিবাচক</p>
                <p className="text-lg font-bold text-emerald-400 font-mono">+{summary.positiveMarks}</p>
              </div>
              <div className="rounded-xl bg-red-500/5 border border-zinc-800 p-3">
                <p className="text-[10px] text-zinc-500 font-mono">নেতিবাচক</p>
                <p className="text-lg font-bold text-red-400 font-mono">−{summary.negativeMarks}</p>
              </div>
              <div className="rounded-xl bg-emerald-500/5 border border-zinc-800 p-3">
                <p className="text-[10px] text-zinc-500 font-mono">অ্যাকুরেসি</p>
                <p className="text-lg font-bold text-white font-mono">{summary.accuracy}%</p>
              </div>
            </div>

            <div className="mt-4 h-2 bg-zinc-800 rounded-full overflow-hidden max-w-md mx-auto">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  summary.percentage >= 80 ? "bg-gradient-to-r from-amber-500 to-amber-400" : summary.percentage >= 50 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-red-500 to-red-400"
                }`}
                style={{ width: `${summary.percentage}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 font-mono mt-2">
              স্কোর: <span className="text-white">{summary.percentage}%</span> • সূত্র: সঠিক×১ − ভুল×০.৫
            </p>
            {summary.pointsEarned > 0 && (
              <p className="text-xs text-emerald-400 font-mono mt-1">+{summary.pointsEarned} পয়েন্ট অর্জিত</p>
            )}

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={resetAll}
                className="px-5 py-2.5 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors flex items-center gap-2 shadow-neon-glow"
              >
                <RotateCcw className="w-4 h-4" /> নতুন পরীক্ষা
              </button>
            </div>
          </div>
        </motion.div>

        {/* Question-by-question review */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-zinc-400 font-mono uppercase tracking-wider">
            প্রশ্ন-ভিত্তিক রিভিউ
          </h4>
          {result.review.map((item, i) => {
            const isCorrect = item.status === "correct";
            const isUnanswered = item.status === "unanswered";
            return (
              <motion.div
                key={item.questionId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.5) }}
                className={`glass rounded-2xl border p-4 ${
                  isCorrect ? "border-emerald-500/20" : isUnanswered ? "border-zinc-700" : "border-red-500/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isCorrect ? "bg-emerald-500/10 text-emerald-400" : isUnanswered ? "bg-zinc-700/40 text-zinc-400" : "bg-red-500/10 text-red-400"
                  }`}>
                    {isCorrect ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : isUnanswered ? (
                      <CircleDashed className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-mono text-zinc-500">প্রশ্ন {i + 1}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        isCorrect
                          ? "bg-emerald-500/10 text-emerald-400"
                          : isUnanswered
                            ? "bg-zinc-800 text-zinc-400"
                            : "bg-red-500/10 text-red-400"
                      }`}>
                        {isCorrect ? "+১" : isUnanswered ? "০" : "−০.৫"}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">{item.subject}</span>
                    </div>

                    <p className="text-sm text-white mb-2">{item.question}</p>

                    {/* Options with correct/user highlighting */}
                    <div className="space-y-1 mb-2">
                      {item.options.map((option, oi) => {
                        const isUser = option === item.userAnswer;
                        const isRight = option === item.correctAnswer;
                        let cls = "border-zinc-800 text-zinc-500";
                        if (isRight) cls = "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
                        else if (isUser) cls = "border-red-500/40 bg-red-500/10 text-red-300";
                        return (
                          <div key={oi} className={`rounded-lg border px-3 py-1.5 text-xs flex items-center gap-2 ${cls}`}>
                            <span className="font-mono">{OPTION_LABELS[oi] ?? oi + 1}</span>
                            <span className="flex-1">{option}</span>
                            {isRight && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                            {isUser && !isRight && <X className="w-3.5 h-3.5 text-red-400" />}
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-xs text-zinc-500 font-mono">
                      আপনার উত্তর:{" "}
                      <span className={isCorrect ? "text-emerald-400" : isUnanswered ? "text-zinc-400" : "text-red-400"}>
                        {item.userAnswer || "উত্তর দেওয়া হয়নি"}
                      </span>
                      {!isCorrect && !isUnanswered && (
                        <>
                          {" "}• সঠিক উত্তর: <span className="text-emerald-400">{item.correctAnswer}</span>
                        </>
                      )}
                    </p>

                    {item.explanation && (
                      <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{item.explanation}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={resetAll}
            className="px-6 py-3 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-xl hover:bg-emerald-400 transition-colors flex items-center gap-2 shadow-neon-glow"
          >
            <RotateCcw className="w-4 h-4" /> নতুন পরীক্ষা শুরু করুন
          </button>
        </div>
      </div>
    );
  }

  return null;
}