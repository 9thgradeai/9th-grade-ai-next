"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileDown,
  FileText,
  FilePlus2,
  Layers,
  Minus,
  Plus,
  Play,
  Check,
  Clock,
  Loader2,
  AlertTriangle,
  Download,
  Eye,
  EyeOff,
  Shuffle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import SubjectTopicSelect from "./SubjectTopicSelect";
import {
  type Selection,
  flattenNodes,
  findNodeByPath,
  availableForSubject,
} from "./TopicTreePicker";

type PaperMeta = {
  id: number;
  titleBn: string;
  titleEn: string;
  examId: number;
  examNameBn: string;
  examNameEn: string;
  examType: string;
  year: number | null;
  heldOn: string | null;
  durationMin: number | null;
  totalQuestions: number | null;
  availableQuestions: number;
  provenance: string;
  subjectId: number | null;
  subjectNameBn: string | null;
};

type RealExamPhase = "papers" | "build" | "preview" | "offline";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

// Maximum questions the PDF exporter accepts (matches /api/real-exam/export).
const MAX_PDF_QUESTIONS = 200;

/** Unbiased Fisher-Yates shuffle — used to pick a random sample for a paper. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function formatMinutes(min: number | null): string {
  if (!min || min <= 0) return "সময় সীমাহীন";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h} ঘণ্টা${m > 0 ? ` ${m} মিনিট` : ""}`;
  return `${m} মিনিট`;
}

export default function RealExamTab() {
  const [papers, setPapers] = useState<PaperMeta[]>([]);
  const [papersLoading, setPapersLoading] = useState(true);
  const [papersError, setPapersError] = useState<string | null>(null);

  const [selectedPaper, setSelectedPaper] = useState<PaperMeta | null>(null);
  const [questions, setQuestions] = useState<Server.RealExamQuestionDTO[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [includeExplanations, setIncludeExplanations] = useState(false);
  // Null = original order; a timestamp seed = shuffled. Seeded shuffle keeps
  // the render pure (no Math.random/Date.now during render).
  const [shuffleSeed, setShuffleSeed] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [phase, setPhase] = useState<RealExamPhase>("papers");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  // ── Custom paper builder state (subject → topic → subtopic picker) ──
  const [subjects, setSubjects] = useState<Server.ExamSubjectDTO[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({});
  const [customDurationMin, setCustomDurationMin] = useState(60);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [generatedMeta, setGeneratedMeta] = useState<{
    title: string;
    examName: string;
    durationMin: number;
  } | null>(null);

  const fetchPapers = useCallback(async () => {
    try {
      setPapersLoading(true);
      setPapersError(null);
      const list = await api.examPapers();
      setPapers(list);
    } catch {
      setPapersError("পরীক্ষার তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setPapersLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await fetchPapers();
    })();
  }, [fetchPapers]);

  // ── Custom paper builder derived state ──
  const selectedSubjects = useMemo(
    () => subjects.filter((s) => Object.prototype.hasOwnProperty.call(selection, s.id)),
    [subjects, selection],
  );

  const availableTotal = useMemo(
    () => selectedSubjects.reduce((acc, s) => acc + availableForSubject(s, selection), 0),
    [selectedSubjects, selection],
  );

  const totalCount = useMemo(
    () => selectedSubjects.reduce((acc, s) => acc + (selection[s.id].count ?? 0), 0),
    [selectedSubjects, selection],
  );

  const selectedGroupCount = useMemo(
    () =>
      selectedSubjects.reduce((acc, s) => {
        const sel = selection[s.id];
        const nodes = flattenNodes(s.nodes);
        if (sel.paths.length === 0) return acc + nodes.filter((n) => n.depth === 1).length;
        return acc + sel.paths.filter((p) => findNodeByPath(s.nodes, p)?.depth === 1).length;
      }, 0),
    [selectedSubjects, selection],
  );

  const selectedSubTopicCount = useMemo(
    () =>
      selectedSubjects.reduce((acc, s) => {
        const sel = selection[s.id];
        const nodes = flattenNodes(s.nodes);
        if (sel.paths.length === 0) return acc + nodes.filter((n) => n.depth > 1).length;
        return acc + sel.paths.filter((p) => (findNodeByPath(s.nodes, p)?.depth ?? 1) > 1).length;
      }, 0),
    [selectedSubjects, selection],
  );

  const insufficient = totalCount > availableTotal;

  const enterBuild = useCallback(async () => {
    setPhase("build");
    setBuildError(null);
    setSelection({});
    setGeneratedMeta(null);
    setConfigLoading(true);
    setConfigError(null);
    try {
      const list = await api.examConfig();
      setSubjects(list.filter((s) => s.questionCount > 0));
    } catch {
      setConfigError("কনফিগারেশন লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const buildCustomPaper = useCallback(async () => {
    if (selectedSubjects.length === 0 || totalCount === 0) return;
    setBuildLoading(true);
    setBuildError(null);
    try {
      // Same data flow as the Practice tab: fetch the full question DTOs for
      // every selected subject/topic/subtopic, merge, then sample the count.
      const pools = await Promise.all(
        selectedSubjects.map(async (s) => {
          const sel = selection[s.id];
          return api.questions({
            subject: s.nameBn,
            paths: sel.paths.length > 0 ? sel.paths : undefined,
            limit: 200,
          });
        }),
      );
      const merged = pools.flat().filter(Boolean);
      if (merged.length === 0) {
        setBuildError("নির্বাচিত টপিক থেকে কোনো প্রশ্ন পাওয়া যায়নি।");
        return;
      }
      const requested = Math.min(totalCount > 0 ? totalCount : merged.length, MAX_PDF_QUESTIONS);
      const picked = shuffled(merged).slice(0, Math.min(requested, merged.length));
      const qs: Server.RealExamQuestionDTO[] = picked.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        subject: q.subject,
        topic: q.topic,
        subtopic: q.subtopic,
        difficulty: q.difficulty,
        year: q.year,
        sourceExam: q.sourceExam || undefined,
        questionNumber: q.questionNumber ?? undefined,
      }));
      setQuestions(qs);
      setAnswers({});
      setChecked(false);
      setTimeLeft(customDurationMin * 60);
      setShuffleSeed(null);
      setIncludeAnswers(false);
      setIncludeExplanations(false);
      setGeneratedMeta({
        title: "কাস্টম রিয়েল এক্সাম প্রশ্নপত্র",
        examName: selectedSubjects.map((s) => s.nameBn).join(", ") || "বহু বিষয়",
        durationMin: customDurationMin,
      });
      setPhase("preview");
    } catch {
      setBuildError("প্রশ্ন লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBuildLoading(false);
    }
  }, [selectedSubjects, selection, totalCount, customDurationMin]);

  const openPaper = useCallback(async (paper: PaperMeta) => {
    try {
      setSelectedPaper(paper);
      setQuestionsLoading(true);
      setQuestionsError(null);
      setAnswers({});
      setChecked(false);
      const qs = await api.examPaperQuestions(paper.id);
      setQuestions(qs);
      setTimeLeft((paper.durationMin ?? 60) * 60);
      setPhase("preview");
    } catch {
      setQuestionsError("প্রশ্ন লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setQuestionsLoading(false);
    }
  }, []);

  // Offline countdown — client-local only, no server calls.
  useEffect(() => {
    if (phase !== "offline" || timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [phase, timeLeft]);

  const visibleQuestions = useMemo(() => {
    if (shuffleSeed === null) return questions;
    // Deterministic mulberry32 shuffle keyed by the seed state.
    let a = shuffleSeed >>> 0;
    const rand = () => {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const arr = [...questions];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [questions, shuffleSeed]);

  const score = useMemo(() => {
    let correct = 0;
    let attempted = 0;
    for (const q of questions) {
      const a = answers[q.id];
      if (a && a.trim().length > 0) {
        attempted += 1;
        if (a.trim() === (q.correctAnswer ?? "").trim()) correct += 1;
      }
    }
    return { correct, attempted, total: questions.length };
  }, [answers, questions]);

  const doExport = useCallback(async () => {
    if (questions.length === 0) return;
    if (!generatedMeta && !selectedPaper) return;
    const title = generatedMeta
      ? generatedMeta.title
      : `${selectedPaper?.titleBn ?? "প্রশ্নপত্র"} — প্রশ্নপত্র`;
    const examName = generatedMeta
      ? generatedMeta.examName
      : `${selectedPaper?.examNameBn ?? ""} (${selectedPaper?.examType ?? ""})`;
    const durationMin = generatedMeta
      ? generatedMeta.durationMin
      : (selectedPaper?.durationMin ?? 120);
    setExporting(true);
    setExportError(null);
    try {
      const blob = await api.exportRealExam({
        questions,
        title,
        examName,
        exportOptions: { includeAnswers, includeExplanations, shuffleQuestions: shuffleSeed !== null },
        durationMin,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = includeAnswers ? "with-answers" : "questions-only";
      a.download = generatedMeta
        ? `real-exam-custom-paper-${suffix}.pdf`
        : `real-exam-paper-${selectedPaper?.id ?? "custom"}-${suffix}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setExportError("PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setExporting(false);
    }
  }, [selectedPaper, questions, includeAnswers, includeExplanations, shuffleSeed, generatedMeta]);

  const selectAnswer = (questionId: number, option: string) => {
    if (checked) return;
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const backToPapers = () => {
    setPhase("papers");
    setSelectedPaper(null);
    setQuestions([]);
    setAnswers({});
    setChecked(false);
    setGeneratedMeta(null);
    setSelection({});
  };

  const backToBuild = () => {
    setPhase("build");
    setQuestions([]);
    setAnswers({});
    setChecked(false);
  };

  const formatClock = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h > 0 ? `${h}:` : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ═══════════ PAPERS LIST ═══════════
  if (phase === "papers") {
    return (
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl border border-terminal-border overflow-hidden">
          <div className="terminal-window-bar border-b border-terminal-border">
            <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
            <div className="flex-1 text-center text-xs text-[var(--dashboard-text-muted)] font-mono">{"// REAL_EXAM_OFFLINE_CENTER"}</div>
          </div>
          <div className="p-5 md:p-6">
            <div className="flex items-center gap-2 mb-1">
              <FileDown className="w-5 h-5 text-[var(--dashboard-primary)]" />
              <h2 className="text-lg font-bold text-[var(--text-primary)]">রিয়েল এক্সাম (অফলাইন)</h2>
            </div>
            <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
              আসল পরীক্ষার প্রশ্নপত্র PDF-এ ডাউনলোড করুন, প্রিন্ট করে অফলাইনে পরীক্ষা দিন — উত্তরসহ বা উত্তর ছাড়া।
            </p>
          </div>
        </motion.div>

        {/* Custom paper builder CTA — selects subject → topic → subtopic like Practice */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="glass-card rounded-2xl border border-[var(--primary)]/30 bg-gradient-to-br from-[var(--dashboard-primary-subtle)] via-transparent to-transparent p-4 md:p-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center flex-shrink-0">
              <FilePlus2 className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">নিজের রিয়েল এক্সাম প্রশ্নপত্র বানান</h3>
              <p className="text-xs text-[var(--dashboard-text-muted)] font-mono mt-0.5">
                সব বিষয়ের টপিক ও সাবটপিক থেকে নিজের প্রশ্নপত্র তৈরি করুন — PDF-এ ডাউনলোড করে প্রিন্ট করুন।
              </p>
            </div>
            <button
              onClick={() => void enterBuild()}
              className="px-4 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-2 shadow-neon-glow flex-shrink-0"
            >
              <Layers className="w-4 h-4" /> নতুন প্রশ্নপত্র তৈরি করুন
            </button>
          </div>
        </motion.div>

        {papersLoading && (
          <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
            <Loader2 className="w-10 h-10 mx-auto mb-3 text-[var(--accent)] animate-spin" aria-hidden="true" />
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">পরীক্ষার তালিকা লোড হচ্ছে...</p>
          </div>
        )}

        {papersError && (
          <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-[var(--warning)]" aria-hidden="true" />
            <p className="text-sm text-[var(--dashboard-text-muted)]">{papersError}</p>
            <button onClick={() => void fetchPapers()} className="mt-4 px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors">
              আবার চেষ্টা করুন
            </button>
          </div>
        )}

        {!papersLoading && !papersError && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest whitespace-nowrap">অথবা অফিসিয়াল প্রশ্নপত্র থেকে</p>
              <div className="flex-1 h-px bg-[var(--border-subtle)]" />
            </div>
            {papers.length === 0 ? (
            <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-[var(--dashboard-text-muted)]/30" aria-hidden="true" />
              <h4 className="text-lg font-semibold text-[var(--text-primary)] mb-2">কোনো প্রশ্নপত্র নেই</h4>
              <p className="text-sm text-[var(--dashboard-text-muted)] max-w-xs mx-auto">যাচাইকৃত প্রশ্নপত্র এখনো যোগ করা হয়নি।</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {papers.map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-card rounded-2xl border border-terminal-border p-4 hover:border-[var(--primary)]/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] text-[10px] font-mono">{p.examType}</span>
                        {p.year && <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-muted)]">{p.year}</span>}
                        <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-muted)]">{p.provenance}</span>
                      </div>
                      <h4 className="font-semibold text-[var(--text-primary)]">{p.titleBn}</h4>
                      <p className="text-xs text-[var(--dashboard-text-muted)] truncate">{p.examNameBn} • {p.examNameEn}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[var(--dashboard-text-muted)] font-mono">
                        <span>{p.availableQuestions}টি প্রশ্ন</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatMinutes(p.durationMin)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => void openPaper(p)} className="flex-1 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs rounded-lg hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> খুলুন ও PDF নিন
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )
        }
        </>
        )}
      </div>
    );
  }

  // ═══════════ BUILD CUSTOM PAPER ═══════════
  if (phase === "build") {
    return (
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl border border-terminal-border overflow-hidden">
          <div className="terminal-window-bar border-b border-terminal-border">
            <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
            <div className="flex-1 text-center text-xs text-[var(--dashboard-text-muted)] font-mono">{"// REAL_EXAM_PAPER_BUILDER"}</div>
          </div>
          <div className="p-5 md:p-6">
            <button onClick={backToPapers} className="text-xs font-mono text-[var(--dashboard-primary)] hover:underline mb-3">← সব প্রশ্নপত্রে ফিরুন</button>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-[var(--dashboard-primary)]" />
              <h2 className="text-lg font-bold text-[var(--text-primary)]">নতুন প্রশ্নপত্র তৈরি করুন</h2>
            </div>
            <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
              যেকোনো বিষয়ের টপিক ও সাবটপিক বেছে নিয়ে নিজের রিয়েল এক্সাম প্রশ্নপত্র বানান — PDF-এ ডাউনলোড করে প্রিন্ট করে আসল পরীক্ষার মতো দিন।
            </p>
          </div>
        </motion.div>

        {configLoading && (
          <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
            <Loader2 className="w-10 h-10 mx-auto mb-3 text-[var(--accent)] animate-spin" aria-hidden="true" />
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">বিষয় লোড হচ্ছে...</p>
          </div>
        )}

        {configError && (
          <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-[var(--warning)]" aria-hidden="true" />
            <p className="text-sm text-[var(--dashboard-text-muted)]">{configError}</p>
            <button onClick={() => void enterBuild()} className="mt-4 px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors">
              আবার চেষ্টা করুন
            </button>
          </div>
        )}

        {!configLoading && !configError && (
          <>
            <SubjectTopicSelect
              subjects={subjects}
              selection={selection}
              onSelectionChange={setSelection}
            />

            {/* Total questions + duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass-card rounded-xl border border-terminal-border p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-[var(--dashboard-text-secondary)] font-mono">মোট প্রশ্ন</p>
                  <p className="text-xs text-[var(--dashboard-text-muted)] mt-0.5">
                    উপলব্ধ:{" "}
                    <span className={`font-mono ${insufficient ? "text-[var(--dashboard-danger)]" : "text-[var(--dashboard-primary)]"}`}>
                      {availableTotal}টি
                    </span>
                  </p>
                </div>
                <span className={`text-2xl font-bold font-mono ${totalCount > 0 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-text-secondary)]"}`}>
                  {totalCount}
                  <span className="text-xs text-[var(--dashboard-text-muted)] ml-1">প্র.</span>
                </span>
              </div>

              <div className="glass-card rounded-xl border border-terminal-border p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--dashboard-text-secondary)] font-mono">সময়সীমা</p>
                  <p className="text-xs text-[var(--dashboard-text-muted)] mt-0.5">
                    {customDurationMin} মিনিট (PDF-এর হেডারে দেখানো হবে)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCustomDurationMin((d) => Math.max(5, d - 5))}
                    aria-label="সময় কমান"
                    className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--primary)]/40"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-2xl font-bold text-[var(--dashboard-primary)] font-mono w-8 text-center">{customDurationMin}</span>
                  <button
                    onClick={() => setCustomDurationMin((d) => Math.min(180, d + 5))}
                    aria-label="সময় বাড়ান"
                    className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--primary)]/40"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {insufficient && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--warning)]/30 bg-[var(--dashboard-warning-subtle)] p-3 text-xs text-[var(--dashboard-warning)]">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  নির্বাচিত টপিক থেকে শুধু <span className="font-mono">{availableTotal}টি</span> প্রশ্ন
                  পাওয়া যায় — মোট <span className="font-mono">{totalCount}টি</span> চাওয়া হয়েছে।
                </p>
              </div>
            )}

            {totalCount > MAX_PDF_QUESTIONS && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--warning)]/30 bg-[var(--dashboard-warning-subtle)] p-3 text-xs text-[var(--dashboard-warning)]">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  PDF-এ সর্বোচ্চ <span className="font-mono">200টি</span> প্রশ্ন যায় — সবার আগের ২০০টি অন্তর্ভুক্ত হবে।
                </p>
              </div>
            )}

            {buildError && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--dashboard-danger-subtle)] p-3 text-xs text-[var(--dashboard-danger)]">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{buildError}</p>
              </div>
            )}

            {/* Live config summary */}
            <motion.div layout className="glass-card rounded-2xl border border-[var(--primary)]/30 p-4">
              <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest mb-2">লাইভ কনফিগারেশন সামারি</p>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)] font-mono">{selectedSubjects.length}</p>
                  <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">বিষয়</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)] font-mono">{selectedGroupCount}</p>
                  <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">টপিক</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)] font-mono">{selectedSubTopicCount}</p>
                  <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">সাবটপিক</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)] font-mono">
                    {totalCount}
                    <span className="text-xs text-[var(--dashboard-text-muted)] ml-1">প্র.</span>
                  </p>
                  <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">{customDurationMin} মিনিট</p>
                </div>
              </div>
            </motion.div>

            <button
              onClick={() => void buildCustomPaper()}
              disabled={selectedSubjects.length === 0 || totalCount === 0 || buildLoading}
              className="mt-4 w-full py-3 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {buildLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {buildLoading ? "প্রশ্নপত্র তৈরি হচ্ছে..." : "প্রশ্নপত্র তৈরি করুন ও PDF নিন"}
            </button>
          </>
        )}
      </div>
    );
  }

  // ═══════════ PREVIEW + EXPORT + OFFLINE ═══════════
  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl border border-terminal-border p-5 md:p-6">
        <button onClick={generatedMeta ? backToBuild : backToPapers} className="text-xs font-mono text-[var(--dashboard-primary)] hover:underline mb-3">
          {generatedMeta ? "← কনফিগারেশনে ফিরুন" : "← সব প্রশ্নপত্রে ফিরুন"}
        </button>
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-5 h-5 text-[var(--dashboard-primary)]" />
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {generatedMeta ? generatedMeta.title : (selectedPaper?.titleBn ?? "প্রশ্নপত্র")}
          </h2>
        </div>
        <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
          {generatedMeta ? generatedMeta.examName : (selectedPaper?.examNameBn ?? "")} • {questions.length}টি প্রশ্ন • {formatMinutes(generatedMeta ? generatedMeta.durationMin : (selectedPaper?.durationMin ?? null))}
        </p>

        {questionsLoading && (
          <div className="mt-4 text-center py-8">
            <Loader2 className="w-8 h-8 mx-auto mb-2 text-[var(--accent)] animate-spin" aria-hidden="true" />
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">প্রশ্ন লোড হচ্ছে...</p>
          </div>
        )}
        {questionsError && (
          <div className="mt-4 p-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--dashboard-danger-subtle)] text-xs text-[var(--dashboard-danger)]">{questionsError}</div>
        )}

        {!questionsLoading && !questionsError && questions.length > 0 && (
          <>
            {/* Export options */}
            <div className="mt-4 p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)]">
              <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest mb-3">PDF এক্সপোর্ট অপশন</p>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center flex-wrap">
                <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
                  <input type="checkbox" checked={includeAnswers} onChange={(e) => setIncludeAnswers(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                  উত্তরসহ
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
                  <input type="checkbox" checked={includeExplanations} onChange={(e) => setIncludeExplanations(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                  ব্যাখ্যাসহ
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
                  <input type="checkbox" checked={shuffleSeed !== null} onChange={(e) => setShuffleSeed(e.target.checked ? Date.now() : null)} className="w-4 h-4 accent-emerald-500" />
                  <Shuffle className="w-3.5 h-3.5" /> প্রশ্ন এলোমেলো করুন
                </label>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <button onClick={() => void doExport()} disabled={exporting} className="flex-1 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-2 disabled:opacity-40">
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {exporting ? "PDF তৈরি হচ্ছে..." : includeAnswers ? "উত্তরসহ PDF ডাউনলোড" : "উত্তর ছাড়া PDF ডাউনলোড"}
                </button>
                <button
                  onClick={() => { setPhase(phase === "offline" ? "preview" : "offline"); setChecked(false); }}
                  className="flex-1 py-2.5 bg-[var(--surface-raised)] border border-[var(--primary)]/30 text-[var(--dashboard-primary)] font-mono text-sm rounded-xl hover:bg-[var(--dashboard-primary-subtle)] transition-colors flex items-center justify-center gap-2"
                >
                  {phase === "offline" ? <EyeOff className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {phase === "offline" ? "প্রিভিউতে ফিরুন" : "অফলাইনে পরীক্ষা দিন"}
                </button>
              </div>
              {exportError && <p className="text-xs text-[var(--dashboard-danger)] mt-2">{exportError}</p>}
              <p className="text-[11px] text-[var(--dashboard-text-muted)] mt-2">
                {includeAnswers ? "✓ উত্তর থাকবে" : "✗ উত্তর থাকবে না"} • {includeExplanations ? "✓ ব্যাখ্যা থাকবে" : "✗ ব্যাখ্যা থাকবে না"} • প্রিন্ট করে খাতায় পরীক্ষা দিন
              </p>
            </div>

            {/* Offline exam header */}
            {phase === "offline" && (
              <div className="mt-4 glass-card rounded-2xl border border-[var(--primary)]/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${timeLeft <= 60 ? "text-[var(--dashboard-danger)] animate-pulse motion-reduce:animate-none" : "text-[var(--dashboard-primary)]"}`} />
                  <span className="font-mono text-lg font-bold text-[var(--dashboard-primary)]">{formatClock(timeLeft)}</span>
                  <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">উত্তর: {Object.keys(answers).length} / {questions.length}</span>
                </div>
                <div className="flex gap-2">
                  {!checked ? (
                    <button onClick={() => setChecked(true)} className="px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs rounded-lg hover:bg-[var(--accent-hover)] transition-colors">
                      উত্তর মিলিয়ে দেখুন
                    </button>
                  ) : (
                    <span className="px-4 py-2 rounded-lg bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] font-mono text-xs">
                      স্কোর: {score.correct}/{score.total} ({score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0}%)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Questions */}
            <div className="space-y-4 mt-4">
              {visibleQuestions.map((q, index) => {
                const userAnswer = answers[q.id];
                const isCorrect = checked && userAnswer && userAnswer.trim() === (q.correctAnswer ?? "").trim();
                const isWrong = checked && userAnswer && !isCorrect;
                return (
                  <div key={q.id} className="glass-card rounded-2xl border border-terminal-border p-4 md:p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-secondary)]">প্রশ্ন {index + 1}</span>
                      <span className="px-2 py-0.5 rounded bg-[var(--surface-overlay)] text-[10px] font-mono text-[var(--dashboard-text-muted)]">{q.subject}</span>
                      {checked && userAnswer && (
                        isCorrect
                          ? <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--dashboard-primary-subtle)] text-[10px] font-mono text-[var(--dashboard-primary)]"><CheckCircle2 className="w-3 h-3" /> সঠিক</span>
                          : <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--dashboard-danger-subtle)] text-[10px] font-mono text-[var(--dashboard-danger)]"><XCircle className="w-3 h-3" /> ভুল</span>
                      )}
                    </div>
                    <h3 className="text-sm md:text-[15px] font-semibold leading-relaxed text-[var(--dashboard-text-primary)] mb-4">{q.question}</h3>
                    <div className="space-y-2.5">
                      {q.options.map((option, i) => {
                        if (!option || option.trim() === "") return null;
                        const isSelected = userAnswer === option;
                        const isAnswer = checked && option.trim() === (q.correctAnswer ?? "").trim();
                        return (
                          <button
                            key={i}
                            onClick={() => selectAnswer(q.id, option)}
                            disabled={phase !== "offline" || checked}
                            className="w-full text-left p-3 rounded-xl border transition-all disabled:cursor-default"
                            style={
                              isAnswer
                                ? { background: "var(--dashboard-primary-subtle)", borderColor: "var(--dashboard-primary)", color: "var(--dashboard-primary)" }
                                : isSelected && isWrong
                                  ? { background: "var(--dashboard-danger-subtle)", borderColor: "var(--dashboard-danger)", color: "var(--dashboard-danger)" }
                                  : isSelected
                                    ? { background: "var(--dashboard-primary-subtle)", borderColor: "var(--dashboard-primary)", color: "var(--dashboard-primary)" }
                                    : { background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-primary)" }
                            }
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-mono border border-current">{OPTION_LABELS[i] ?? i + 1}</span>
                              <span className="text-sm font-medium">{option}</span>
                              {isSelected && <Check className="w-4 h-4 ml-auto" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {checked && includeExplanations !== false && q.explanation && q.explanation.trim() !== "" && (
                      <div className="mt-3 p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)]">
                        <p className="text-xs font-mono text-[var(--dashboard-text-muted)] mb-1">ব্যাখ্যা:</p>
                        <p className="text-xs text-[var(--dashboard-text-secondary)]">{q.explanation}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </motion.div>

      <AnimatePresence>
        {exporting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed bottom-6 right-6 z-50 glass-card rounded-xl border border-[var(--primary)]/30 px-4 py-3 flex items-center gap-2 shadow-2xl">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--dashboard-primary)]" />
            <span className="text-xs font-mono text-[var(--text-primary)]">PDF তৈরি হচ্ছে...</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
