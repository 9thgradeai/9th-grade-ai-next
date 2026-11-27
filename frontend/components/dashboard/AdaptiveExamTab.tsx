"use client";

// Standalone Adaptive Exam V2 surface. This tab owns the full candidate flow:
// hierarchy selection → config → blueprint → generation → exam → report →
// answer-key review, plus the shared published/upcoming mock library.
// Candidate answers live in the browser only until autosave; no answer key is
// present in a paper or a submit response.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Flag,
  ArrowClockwise,
  Play,
  Spinner,
  Warning,
} from "@phosphor-icons/react";
import { adaptiveExam, ApiError } from "@/lib/services/api";
import {
  ADAPTIVE_EXAM_KEY,
  clearOtherExams,
  dropExamSnapshot,
  loadExamSnapshot,
  saveExamSnapshot,
} from "@/lib/exam-persist";
import {
  recoverAdaptiveSubmission,
  submitAdaptiveExam,
  type PendingAdaptiveSubmission,
} from "@/lib/services/adaptive-exam-submission";
import { isAdaptiveExamV2Enabled } from "@/lib/flags";
import type { AdaptiveExam } from "@/lib/types";

type Stage = "select" | "configure" | "preview" | "generating" | "runner" | "report" | "library";

type AdaptiveSnapshot = {
  attemptId: string;
  paperId: string;
  blueprintId: string;
  questions: AdaptiveExam.CandidateQuestion[];
  answers: Record<number, AdaptiveExam.OptionKey>;
  flags: number[];
  startedAt: number;
  expiresAt: string;
  version: number;
};

type SnapshotCandidate = PendingAdaptiveSubmission & {
  questions: AdaptiveExam.CandidateQuestion[];
  blueprintId: string;
  startedAt: number;
  expiresAt: string;
};

const MODES: AdaptiveExam.BlueprintMode[] = [
  "HISTORICAL_PATTERN",
  "BALANCED",
  "HIGH_YIELD",
  "ADAPTIVE",
  "WEAKNESS_FOCUSED",
  "FULL_EXAM_SIMULATION",
];

const CARD = "glass-card rounded-2xl border border-[var(--dashboard-border)] p-5";
const MUTED = "text-[var(--dashboard-text-muted)]";
const BTN =
  "min-h-11 px-4 py-2 rounded-lg border border-[var(--dashboard-border-muted)] font-mono text-sm hover:bg-[var(--accent)]/10 disabled:opacity-40 disabled:cursor-not-allowed";
const PRIMARY =
  "min-h-11 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed";

function describeError(error: unknown): string {
  if (error instanceof ApiError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "unknown error";
}

function formatRemaining(seconds: number): string {
  const safe = Math.max(0, seconds);
  const min = Math.floor(safe / 60).toString().padStart(2, "0");
  const sec = (safe % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function optionEntries(question: AdaptiveExam.CandidateQuestion) {
  return (["A", "B", "C", "D"] as const).map((key) => ({ key, text: question.options[key] }));
}

export default function AdaptiveExamTab() {
  const enabled = isAdaptiveExamV2Enabled();
  const [stage, setStage] = useState<Stage>("select");
  const [catalog, setCatalog] = useState<AdaptiveExam.ExamCatalog | null>(null);
  const [profiles, setProfiles] = useState<AdaptiveExam.ProfileSummary[]>([]);
  const [library, setLibrary] = useState<AdaptiveExam.LibraryEntry[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [family, setFamily] = useState<AdaptiveExam.Family>("BCS");
  const [organizationCode, setOrganizationCode] = useState("");
  const [postId, setPostId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [topics, setTopics] = useState("");
  const [questionCount, setQuestionCount] = useState(20);
  const [durationMin, setDurationMin] = useState(30);
  const [mode, setMode] = useState<AdaptiveExam.BlueprintMode>("BALANCED");
  const [difficulty, setDifficulty] = useState<AdaptiveExam.DifficultyBand | "MIXED">("MIXED");
  const [adaptationEnabled, setAdaptationEnabled] = useState(false);

  const [prepared, setPrepared] = useState<AdaptiveExam.PreparedExam | null>(null);
  const [job, setJob] = useState<AdaptiveExam.GenerationJob | null>(null);
  const [paper, setPaper] = useState<AdaptiveExam.Paper | null>(null);
  const [session, setSession] = useState<AdaptiveExam.Session | null>(null);
  const [score, setScore] = useState<AdaptiveExam.Score | null>(null);
  const [report, setReport] = useState<AdaptiveExam.Report | null>(null);
  const [answerKey, setAnswerKey] = useState<AdaptiveExam.AnswerKey | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [answers, setAnswers] = useState<Record<number, AdaptiveExam.OptionKey>>({});
  const [flags, setFlags] = useState<number[]>([]);
  const [serverVersion, setServerVersion] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<PendingAdaptiveSubmission | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const submitLock = useRef(false);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === profileId) ?? null,
    [profiles, profileId],
  );
  const organizations = useMemo(
    () => catalog?.organizations.filter((org) => org.family === family) ?? [],
    [catalog, family],
  );
  const posts = useMemo(
    () => catalog?.posts.filter((post) => post.organizationId === organizationCode) ?? [],
    [catalog, organizationCode],
  );
  const types = useMemo(
    () => catalog?.types.filter((type) => type.postId === postId) ?? [],
    [catalog, postId],
  );
  const familyProfiles = useMemo(
    () => profiles.filter((profile) => profile.family === family),
    [profiles, family],
  );
  const remainingSec = useMemo(() => {
    if (!session) return 0;
    return Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - now) / 1000));
  }, [session, now]);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setError(null);
    try {
      const [catalogResult, profileResult, libraryResult] = await Promise.all([
        adaptiveExam.catalog(),
        adaptiveExam.profiles(),
        adaptiveExam.library(),
      ]);
      setCatalog(catalogResult.catalog);
      setProfiles(profileResult.profiles);
      setLibrary(libraryResult.entries);
    } catch (loadError) {
      setError(describeError(loadError));
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  const startExam = useCallback(async (paperId: string, blueprintId: string) => {
    setError(null);
    try {
      const result = await adaptiveExam.startSession({
        paperId,
        blueprintId,
        idempotencyKey: `adaptive-session-${crypto.randomUUID()}`,
      });
      if (!result.paper) throw new Error("Paper snapshot missing after generation.");
      setPaper(result.paper);
      setSession(result.session);
      setAnswers({ ...result.session.answers });
      setFlags([...result.session.flags]);
      setServerVersion(result.session.version);
      setStartedAt(Date.now());
      setNow(Date.now());
      setCurrentIndex(0);
      saveExamSnapshot<AdaptiveSnapshot>(ADAPTIVE_EXAM_KEY, {
        attemptId: result.session.attemptId,
        paperId,
        blueprintId,
        questions: result.paper.questions,
        answers: result.session.answers,
        flags: result.session.flags,
        startedAt: Date.now(),
        expiresAt: result.session.expiresAt,
        version: result.session.version,
      });
      setStage("runner");
    } catch (startError) {
      setError(describeError(startError));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Defer state writes out of the effect's own commit pass so the compiler
    // can preserve memoization and the recovery paths can be cancelled.
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      clearOtherExams(ADAPTIVE_EXAM_KEY);
      await loadMeta();
      if (cancelled) return;

      const recovery = await recoverAdaptiveSubmission().catch(() => ({ outcome: "none" as const }));
      if (cancelled) return;
      if (recovery.outcome === "resumed") {
        setScore(recovery.score);
        setStage("report");
        const reportResult = await adaptiveExam.report(recovery.score.attemptId).catch(() => null);
        if (cancelled) return;
        if (reportResult) setReport(reportResult.report);
        const keyResult = await adaptiveExam.answerKey(recovery.score.attemptId).catch(() => null);
        if (cancelled) return;
        if (keyResult?.answerKey) setAnswerKey(keyResult.answerKey);
        setNotice("আগের অসমাপ্ত জমা পুনরুদ্ধার করা হয়েছে।");
      } else if (recovery.outcome === "pending") {
        setPendingRecovery(recovery.submission);
        setNotice("আগের জমা অসমাপ্ত আছে। পুনরায় চেষ্টা করুন।");
      } else if (recovery.outcome === "expired") {
        setNotice("আগের প্রচেষ্টার সময় শেষ হয়ে গেছে।");
      }

      const restored = loadExamSnapshot<AdaptiveSnapshot>(ADAPTIVE_EXAM_KEY);
      if (!restored || !restored.attemptId || !restored.paperId || restored.questions.length === 0) {
        return;
      }
      const { session: liveSession, paper: livePaper } = await adaptiveExam
        .session(restored.attemptId)
        .catch(() => ({ session: null, paper: null }));
      if (cancelled || !liveSession) return;
      if (liveSession.status === "COMPLETED") {
        const status = await adaptiveExam.submissionStatus(liveSession.attemptId).catch(() => null);
        if (!cancelled && status?.score) {
          setScore(status.score);
          setStage("report");
        }
        return;
      }
      if (liveSession.status === "EXPIRED") {
        setNotice("এই পরীক্ষার সময় শেষ হয়ে গেছে।");
        return;
      }
      setSession(liveSession);
      setPaper(livePaper ?? ({ questions: restored.questions } as AdaptiveExam.Paper));
      setAnswers({ ...restored.answers, ...liveSession.answers });
      setFlags(liveSession.flags.length > 0 ? liveSession.flags : restored.flags);
      setServerVersion(liveSession.version);
      setStartedAt(restored.startedAt);
      setStage("runner");
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMeta]);

  useEffect(() => {
    if (stage !== "runner" || !session) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [stage, session]);

  useEffect(() => {
    if (stage !== "generating" || !job || job.status === "COMPLETED" || job.status === "FAILED") return;
    const timer = window.setInterval(() => {
      void adaptiveExam
        .job(job.id)
        .then(async ({ job: latest }) => {
          if (!latest) return;
          setJob(latest);
          if (latest.status === "COMPLETED" && latest.paperId) {
            await startExam(latest.paperId, latest.blueprintId);
          } else if (latest.status === "FAILED") {
            setError(`generation failed: ${JSON.stringify(latest.error ?? {})}`);
            setStage("preview");
          }
        })
        .catch((pollError) => setError(describeError(pollError)));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [stage, job, startExam]);

  const toggleSubject = (subjectId: string) => {
    setSubjects((current) =>
      current.includes(subjectId)
        ? current.filter((id) => id !== subjectId)
        : [...current, subjectId],
    );
  };

  const prepare = useCallback(async () => {
    if (!profileId || subjects.length === 0) {
      setError("প্রোফাইল ও অন্তত একটি বিষয় নির্বাচন করুন।");
      return;
    }
    setLoadingMeta(true);
    setError(null);
    try {
      const result = await adaptiveExam.prepare({
        family,
        profileId,
        subjects,
        ...(topics.trim()
          ? { topics: topics.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean) }
          : {}),
        requestedQuestionCount: questionCount,
        durationMin,
        mode,
        difficulty,
        adaptationEnabled,
        idempotencyKey: `adaptive-prepare-${crypto.randomUUID()}`,
      });
      setPrepared(result.prepared);
      setStage("preview");
    } catch (prepareError) {
      setError(describeError(prepareError));
    } finally {
      setLoadingMeta(false);
    }
  }, [adaptationEnabled, difficulty, durationMin, family, mode, profileId, questionCount, subjects, topics]);

  const generate = useCallback(async () => {
    if (!prepared) return;
    setError(null);
    setStage("generating");
    try {
      const result = await adaptiveExam.generate({
        blueprintId: prepared.blueprint.id,
        idempotencyKey: `adaptive-generate-${crypto.randomUUID()}`,
      });
      setJob(result.job);
      if (result.job.status === "COMPLETED" && result.job.paperId) {
        await startExam(result.job.paperId, prepared.blueprint.id);
      } else if (result.job.status === "FAILED") {
        setError(`generation failed: ${JSON.stringify(result.job.error ?? {})}`);
        setStage("preview");
      }
    } catch (generateError) {
      setError(describeError(generateError));
      setStage("preview");
    }
  }, [prepared, startExam]);

  const saveAnswer = useCallback(async (position: number, option: AdaptiveExam.OptionKey) => {
    if (!session || session.status !== "IN_PROGRESS") return;
    setAnswers((current) => ({ ...current, [position]: option }));
    try {
      const result = await adaptiveExam.answer(session.attemptId, {
        position,
        option,
        expectedVersion: serverVersion,
      });
      setSession(result.session);
      setServerVersion(result.session.version);
      setAnswers((current) => ({ ...current, ...result.session.answers }));
      saveExamSnapshot<AdaptiveSnapshot>(ADAPTIVE_EXAM_KEY, {
        attemptId: session.attemptId,
        paperId: session.paperId,
        blueprintId: session.blueprintId,
        questions: paper?.questions ?? [],
        answers: result.session.answers,
        flags: result.session.flags,
        startedAt,
        expiresAt: session.expiresAt,
        version: result.session.version,
      });
    } catch (saveError) {
      const latest = await adaptiveExam.session(session.attemptId).catch(() => null);
      if (latest?.session) {
        setSession(latest.session);
        setServerVersion(latest.session.version);
        setAnswers({ ...latest.session.answers, [position]: option });
      }
      setError(describeError(saveError));
    }
  }, [paper, serverVersion, session, startedAt]);

  const toggleFlag = useCallback(async (position: number) => {
    if (!session || session.status !== "IN_PROGRESS") return;
    const flagged = !flags.includes(position);
    setFlags((current) => (flagged ? [...current, position] : current.filter((p) => p !== position)));
    try {
      const result = await adaptiveExam.flag(session.attemptId, {
        position,
        flagged,
        expectedVersion: serverVersion,
      });
      setSession(result.session);
      setServerVersion(result.session.version);
      setFlags(result.session.flags);
    } catch (flagError) {
      setError(describeError(flagError));
    }
  }, [flags, serverVersion, session]);

  const finishSubmission = useCallback(async (attemptId: string, finalScore: AdaptiveExam.Score) => {
    setScore(finalScore);
    dropExamSnapshot(ADAPTIVE_EXAM_KEY);
    setStage("report");
    const [reportResult, keyResult] = await Promise.all([
      adaptiveExam.report(attemptId).catch(() => null),
      adaptiveExam.answerKey(attemptId).catch(() => null),
    ]);
    if (reportResult) setReport(reportResult.report);
    if (keyResult?.answerKey) setAnswerKey(keyResult.answerKey);
  }, []);

  const submit = useCallback(async () => {
    if (!session || !paper || submitting || submitLock.current) return;
    const unanswered = paper.questions.length - Object.keys(answers).length;
    if (
      unanswered > 0 &&
      !window.confirm(`${unanswered}টি প্রশ্নের উত্তর দেওয়া হয়নি। জমা দিতে চান?`)
    ) {
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitAdaptiveExam({
        attemptId: session.attemptId,
        paperId: paper.id,
        answers,
        durationSec: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
        idempotencyKey: session.idempotencyKey,
      });
      await finishSubmission(session.attemptId, result.score);
    } catch (submitError) {
      setError(describeError(submitError));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }, [answers, finishSubmission, paper, session, startedAt, submitting]);

  useEffect(() => {
    if (stage === "runner" && remainingSec === 0 && session?.status === "IN_PROGRESS") {
      void submit();
    }
  }, [remainingSec, session?.status, stage, submit]);

  const retryRecovery = useCallback(async () => {
    if (!pendingRecovery) return;
    setSubmitting(true);
    try {
      const result = await submitAdaptiveExam({
        attemptId: pendingRecovery.attemptId,
        paperId: pendingRecovery.paperId,
        answers: Object.fromEntries(pendingRecovery.answers.map((a) => [a.position, a.option])),
        durationSec: pendingRecovery.durationSec,
        idempotencyKey: pendingRecovery.idempotencyKey,
      });
      setPendingRecovery(null);
      await finishSubmission(pendingRecovery.attemptId, result.score);
    } catch (recoveryError) {
      setError(describeError(recoveryError));
    } finally {
      setSubmitting(false);
    }
  }, [finishSubmission, pendingRecovery]);

  const startLibraryMock = useCallback(async (entry: AdaptiveExam.LibraryEntry) => {
    if (!entry.paper) return;
    await startExam(entry.paperId, entry.paper.blueprintId);
  }, [startExam]);

  if (!enabled) {
    return (
      <div className={CARD} role="status">
        <h1 className="text-lg font-bold">Adaptive Exam</h1>
        <p className={`mt-2 text-sm ${MUTED}`}>এই ফিচারটি বর্তমানে বন্ধ আছে।</p>
      </div>
    );
  }

  const question = paper?.questions[currentIndex] ?? null;

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className={`font-mono text-[11px] uppercase tracking-widest ${MUTED}`}>Adaptive Exam V2</p>
          <h1 className="text-xl font-bold">অ্যাডাপ্টিভ এক্সাম</h1>
          <p className={`mt-1 text-sm ${MUTED}`}>
            প্রোফাইল, ইতিহাস ও ক্যান্ডিডেট প্রমাণ থেকে তৈরি প্রশ্নপত্র — সব স্কোর সার্ভারে রাখা হয়।
          </p>
        </div>
        <button
          type="button"
          className={BTN}
          onClick={() => {
            setStage(stage === "library" ? "select" : "library");
            void adaptiveExam.library().then((result) => setLibrary(result.entries)).catch(() => undefined);
          }}
        >
          <BookOpen className="inline h-4 w-4 mr-1" />
          {stage === "library" ? "সেটিংসে ফিরুন" : "মক লাইব্রেরি"}
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm" role="alert">
          <Warning className="inline h-4 w-4 mr-2" /> {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm" role="status">
          <Check className="inline h-4 w-4 mr-2" /> {notice}
        </div>
      )}
      {pendingRecovery && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          অসমাপ্ত জমা আছে (attempt {pendingRecovery.attemptId}).
          <button type="button" className={`${BTN} ml-3`} onClick={() => void retryRecovery()} disabled={submitting}>
            পুনরায় জমা দিন
          </button>
        </div>
      )}

      {loadingMeta && stage === "select" && (
        <div className={CARD} role="status"><Spinner className="animate-spin h-5 w-5" /> লোড হচ্ছে…</div>
      )}

      {stage === "select" && !loadingMeta && (
        <section className={`${CARD} grid gap-4 md:grid-cols-2`}>
          <label className="space-y-2">
            <span className={`text-xs font-mono ${MUTED}`}>ফ্যামিলি</span>
            <select
              className="w-full rounded-lg border border-[var(--dashboard-border)] bg-transparent p-2"
              value={family}
              onChange={(event) => {
                const nextFamily = event.target.value as AdaptiveExam.Family;
                setFamily(nextFamily);
                setOrganizationCode("");
                setPostId("");
                setTypeId("");
                setProfileId("");
                setSubjects([]);
              }}
            >
              {(catalog?.families ?? ["BCS", "BANK", "OTHERS"]).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className={`text-xs font-mono ${MUTED}`}>অর্গানাইজেশন</span>
            <select
              className="w-full rounded-lg border border-[var(--dashboard-border)] bg-transparent p-2"
              value={organizationCode}
              onChange={(event) => { setOrganizationCode(event.target.value); setPostId(""); setTypeId(""); }}
            >
              <option value="">নির্বাচন করুন</option>
              {organizations.map((org) => <option key={org.id} value={org.code}>{org.nameBn} / {org.nameEn}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className={`text-xs font-mono ${MUTED}`}>পোস্ট</span>
            <select
              className="w-full rounded-lg border border-[var(--dashboard-border)] bg-transparent p-2"
              value={postId}
              onChange={(event) => { setPostId(event.target.value); setTypeId(""); }}
              disabled={!organizationCode}
            >
              <option value="">নির্বাচন করুন</option>
              {posts.map((post) => <option key={post.id} value={post.id}>{post.nameBn} / {post.nameEn}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className={`text-xs font-mono ${MUTED}`}>টাইপ</span>
            <select
              className="w-full rounded-lg border border-[var(--dashboard-border)] bg-transparent p-2"
              value={typeId}
              onChange={(event) => setTypeId(event.target.value)}
              disabled={!postId}
            >
              <option value="">নির্বাচন করুন</option>
              {types.map((type) => <option key={type.id} value={type.id}>{type.nameBn} / {type.nameEn}</option>)}
            </select>
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className={`text-xs font-mono ${MUTED}`}>প্রোফাইল ভার্সন</span>
            <select
              className="w-full rounded-lg border border-[var(--dashboard-border)] bg-transparent p-2"
              value={profileId}
              onChange={(event) => { setProfileId(event.target.value); setSubjects([]); }}
            >
              <option value="">নির্বাচন করুন</option>
              {familyProfiles.map((profile) => (
                <option key={`${profile.id}:${profile.version}`} value={profile.id}>
                  {profile.labelBn} / {profile.labelEn} — v{profile.version}
                  {profile.provisional ? " (provisional)" : ""}
                </option>
              ))}
            </select>
            {selectedProfile?.provisional && (
              <span className="text-xs text-amber-500">সরবরাহকৃত অস্থায়ী মার্ক; অফিশিয়াল নয়।</span>
            )}
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="button"
              className={PRIMARY}
              disabled={!profileId}
              onClick={() => setStage("configure")}
            >
              পরবর্তী <ArrowRight className="inline h-4 w-4 ml-1" />
            </button>
          </div>
        </section>
      )}

      {stage === "configure" && (
        <section className={`${CARD} space-y-5`}>
          <button type="button" className={BTN} onClick={() => setStage("select")}>
            <ArrowLeft className="inline h-4 w-4 mr-1" /> পেছনে
          </button>
          <div>
            <p className="text-sm font-semibold">বিষয় নির্বাচন</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(selectedProfile?.subjects ?? []).map((subject) => (
                <label
                  key={subject.subjectId}
                  className="flex items-center gap-2 rounded-lg border border-[var(--dashboard-border)] px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={subjects.includes(subject.subjectId)}
                    onChange={() => toggleSubject(subject.subjectId)}
                  />
                  {subject.nameBn} / {subject.nameEn}
                  <span className={`ml-auto font-mono text-xs ${MUTED}`}>{subject.count}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="block space-y-2">
            <span className={`text-xs font-mono ${MUTED}`}>চ্যাপ্টার/টপিক পাথ (কমা দ্বারা আলাদা)</span>
            <input
              className="w-full rounded-lg border border-[var(--dashboard-border)] bg-transparent p-2"
              value={topics}
              onChange={(event) => setTopics(event.target.value)}
              placeholder="ganit/ Songkhyā, bangla/sahitya"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-2">
              <span className={`text-xs font-mono ${MUTED}`}>প্রশ্ন সংখ্যা</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={300}
                className="w-full rounded-lg border border-[var(--dashboard-border)] bg-transparent p-2"
                value={questionCount}
                onChange={(event) => setQuestionCount(Number(event.target.value))}
              />
            </label>
            <label className="space-y-2">
              <span className={`text-xs font-mono ${MUTED}`}>সময় (মিনিট)</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={300}
                className="w-full rounded-lg border border-[var(--dashboard-border)] bg-transparent p-2"
                value={durationMin}
                onChange={(event) => setDurationMin(Number(event.target.value))}
              />
            </label>
            <label className="space-y-2">
              <span className={`text-xs font-mono ${MUTED}`}>মোড</span>
              <select
                className="w-full rounded-lg border border-[var(--dashboard-border)] bg-transparent p-2"
                value={mode}
                onChange={(event) => setMode(event.target.value as AdaptiveExam.BlueprintMode)}
              >
                {MODES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className={`text-xs font-mono ${MUTED}`}>ডিফিকাল্টি</span>
              <select
                className="w-full rounded-lg border border-[var(--dashboard-border)] bg-transparent p-2"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as AdaptiveExam.DifficultyBand | "MIXED")}
              >
                {["MIXED", "EASY", "MEDIUM", "HARD"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={adaptationEnabled}
              onChange={(event) => setAdaptationEnabled(event.target.checked)}
            />
            ক্যান্ডিডেট দুর্বলতা অনুযায়ী অ্যাডাপ্টেশন চালু করুন
          </label>
          <div className="flex justify-end">
            <button type="button" className={PRIMARY} onClick={() => void prepare()} disabled={loadingMeta}>
              {loadingMeta ? "প্রস্তুত হচ্ছে…" : "ব্লুপ্রিন্ট দেখুন"}
            </button>
          </div>
        </section>
      )}

      {stage === "preview" && prepared && (
        <section className={`${CARD} space-y-4`}>
          <button type="button" className={BTN} onClick={() => setStage("configure")}>
            <ArrowLeft className="inline h-4 w-4 mr-1" /> পেছনে
          </button>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className={`text-xs ${MUTED}`}>প্রশ্ন</p><p className="font-mono text-lg">{prepared.blueprint.totalQuestionCount}</p></div>
            <div><p className={`text-xs ${MUTED}`}>মার্ক</p><p className="font-mono text-lg">{prepared.blueprint.totalMarks}</p></div>
            <div><p className={`text-xs ${MUTED}`}>সময়</p><p className="font-mono text-lg">{Math.round(prepared.blueprint.durationSec / 60)} মি.</p></div>
          </div>
          <div>
            <p className="text-sm font-semibold">বিষয় বণ্টন</p>
            <ul className="mt-2 space-y-1 text-sm">
              {prepared.blueprint.allocations.map((allocation) => (
                <li key={allocation.subjectId} className="flex justify-between">
                  <span>{allocation.subjectId}</span>
                  <span className="font-mono">{allocation.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-[var(--dashboard-border)] p-3 text-sm">
            <p>
              historical: {prepared.estimatedHistoricalCount}, generated: {prepared.estimatedGeneratedCount},
              verified share: {Math.round(prepared.blueprint.dataSufficiency.coverage.verifiedShare * 100)}%
            </p>
            {!prepared.blueprint.dataSufficiency.sufficient && (
              <p className="text-amber-500">অপর্যাপ্ত তথ্য: {prepared.blueprint.dataSufficiency.reasons.join("; ")}</p>
            )}
            {(prepared.warnings.length > 0 || prepared.blueprint.warnings.length > 0) && (
              <ul className="mt-2 list-disc list-inside text-amber-500">
                {[...prepared.warnings, ...prepared.blueprint.warnings].map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end">
            <button type="button" className={PRIMARY} onClick={() => void generate()}>
              <Play className="inline h-4 w-4 mr-1" /> প্রশ্নপত্র তৈরি করুন
            </button>
          </div>
        </section>
      )}

      {stage === "generating" && job && (
        <section className={CARD} role="status">
          <p className="text-sm font-semibold">প্রশ্নপত্র তৈরি হচ্ছে…</p>
          <p className={`mt-2 text-xs font-mono ${MUTED}`}>
            stage: {job.stage} — {job.progress}/{job.total} (attempt {job.attempts})
          </p>
          <div className="mt-3 h-2 w-full rounded-full bg-[var(--dashboard-border)]">
            <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${(job.progress / Math.max(1, job.total)) * 100}%` }} />
          </div>
          <p className={`mt-3 text-xs ${MUTED}`}>প্রতিটি প্রশ্ন যাচাই ও ডুপ্লিকেট গেটের মধ্য দিয়ে যায়; ব্যর্থ হলে কোনো প্রশ্নপত্র প্রকাশ হয় না।</p>
        </section>
      )}

      {stage === "runner" && session && paper && (
        <section className="space-y-4">
          <div className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <p className="font-mono text-xs">attempt {session.attemptId}</p>
              <p className={`text-xs ${MUTED}`}>সংস্করণ {serverVersion} · {Object.keys(answers).length}/{paper.questions.length} উত্তর</p>
            </div>
            <div className="flex items-center gap-2 font-mono text-lg">
              <Clock className="h-5 w-5" />
              {formatRemaining(remainingSec)}
            </div>
            <button type="button" className={PRIMARY} onClick={() => void submit()} disabled={submitting}>
              {submitting ? "জমা দেওয়া হচ্ছে…" : "পরীক্ষা জমা দিন"}
            </button>
          </div>

          <div className={`${CARD} space-y-4`}>
            <div className="flex flex-wrap gap-2">
              {paper.questions.map((item, index) => (
                <button
                  key={item.position}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  className={`h-9 w-9 rounded-lg border font-mono text-xs ${
                    index === currentIndex ? "border-[var(--accent)]" : "border-[var(--dashboard-border)]"
                  } ${answers[item.position] ? "bg-emerald-500/20" : ""} ${flags.includes(item.position) ? "ring-2 ring-amber-400" : ""}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            {question && (
              <div className="space-y-4 border-t border-[var(--dashboard-border)] pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-xs font-mono ${MUTED}`}>
                      {question.subjectName} · {question.topicPath} · {question.difficulty} · {question.sourceType}
                    </p>
                    <p className="mt-2 text-sm">{question.questionText}</p>
                  </div>
                  <button
                    type="button"
                    className={BTN}
                    onClick={() => void toggleFlag(question.position)}
                    aria-label="mark for review"
                  >
                    <Flag className={`h-4 w-4 ${flags.includes(question.position) ? "text-amber-400" : ""}`} />
                  </button>
                </div>
                <div className="grid gap-2">
                  {optionEntries(question).map(({ key, text }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => void saveAnswer(question.position, key)}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-left text-sm ${
                        answers[question.position] === key
                          ? "border-[var(--accent)] bg-[var(--accent)]/10"
                          : "border-[var(--dashboard-border)]"
                      }`}
                    >
                      <span className="font-mono font-bold">{key}.</span>
                      <span>{text}</span>
                    </button>
                  ))}
                </div>
                <div className="flex justify-between">
                  <button
                    type="button"
                    className={BTN}
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                  >
                    <ArrowLeft className="inline h-4 w-4 mr-1" /> আগের প্রশ্ন
                  </button>
                  <button
                    type="button"
                    className={BTN}
                    disabled={currentIndex >= paper.questions.length - 1}
                    onClick={() => setCurrentIndex((index) => Math.min(paper.questions.length - 1, index + 1))}
                  >
                    পরের প্রশ্ন <ArrowRight className="inline h-4 w-4 ml-1" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {stage === "report" && score && (
        <section className="space-y-4">
          <div className={`${CARD} grid gap-3 sm:grid-cols-4`}>
            <div><p className={`text-xs ${MUTED}`}>প্রাপ্ত মার্ক</p><p className="font-mono text-xl">{score.obtainedMarks}/{score.maxMarks}</p></div>
            <div><p className={`text-xs ${MUTED}`}>সঠিক</p><p className="font-mono text-xl">{score.correct}</p></div>
            <div><p className={`text-xs ${MUTED}`}>ভুল</p><p className="font-mono text-xl">{score.incorrect}</p></div>
            <div><p className={`text-xs ${MUTED}`}>নির্ভুলতা</p><p className="font-mono text-xl">{Math.round(score.accuracy * 100)}%</p></div>
          </div>
          <div className={CARD}>
            <p className="text-sm font-semibold">বিষয়ভিত্তিক ফলাফল</p>
            <div className="mt-3 space-y-2">
              {score.subjectPerformance.map((slice, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span>{slice.subjectId ?? "—"}</span>
                  <span className="font-mono">{slice.correct}/{slice.attempted} ({Math.round(slice.accuracy * 100)}%)</span>
                </div>
              ))}
            </div>
          </div>
          {report && (
            <div className={`${CARD} space-y-3`}>
              <p className="text-sm font-semibold">রিভিশন অগ্রাধিকার</p>
              {report.revisionPriorities.slice(0, 8).map((priority, index) => (
                <div key={index} className="rounded-lg border border-[var(--dashboard-border)] p-3 text-sm">
                  <p className="font-mono">{priority.subjectId} · {priority.topicPath}</p>
                  <p className={MUTED}>{priority.reason} (confidence {Math.round(priority.confidence * 100)}%)</p>
                </div>
              ))}
              {report.limitations.length > 0 && (
                <ul className="list-disc list-inside text-xs text-amber-500">
                  {report.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className={CARD}>
            <button type="button" className={BTN} onClick={() => setShowKey((value) => !value)}>
              {showKey ? "উত্তর কী লুকান" : "উত্তর কী দেখুন"}
            </button>
            {showKey && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(answerKey?.entries ?? []).map((entry) => (
                  <div key={entry.position} className="rounded-lg border border-[var(--dashboard-border)] p-3 text-sm">
                    <p className="font-mono">#{entry.position} — {entry.correctOption}</p>
                    <p className={MUTED}>{entry.explanation}</p>
                  </div>
                ))}
                {!answerKey && <p className={`text-sm ${MUTED}`}>এই প্রচেষ্টার জন্য উত্তর কী উপলব্ধ নেই।</p>}
              </div>
            )}
          </div>
          <button type="button" className={BTN} onClick={() => { setStage("select"); void loadMeta(); }}>
            <ArrowClockwise className="inline h-4 w-4 mr-1" /> নতুন প্রচেষ্টা
          </button>
        </section>
      )}

      {stage === "library" && (
        <section className="space-y-3">
          <div className={CARD}>
            <p className="text-sm font-semibold">প্রকাশিত ও আসন্ন মক</p>
            <p className={`mt-1 text-xs ${MUTED}`}>আসন্ন মকের শুধু মেটাডেটা দেখা যায়; প্রশ্নপত্র সময় শেষে প্রকাশিত হয়।</p>
          </div>
          {library.length === 0 && <div className={CARD}><p className={MUTED}>এখনো কোনো প্রকাশিত মক নেই।</p></div>}
          {library.map((entry) => (
            <article key={entry.id} className={CARD}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{entry.titleBn} / {entry.titleEn}</p>
                  <p className={`text-xs font-mono ${MUTED}`}>
                    {entry.status}
                    {entry.availableFrom ? ` · ${new Date(entry.availableFrom).toLocaleString()}` : ""}
                  </p>
                </div>
                {entry.status === "PUBLISHED" && entry.paper && (
                  <button type="button" className={PRIMARY} onClick={() => void startLibraryMock(entry)}>
                    শুরু করুন
                  </button>
                )}
              </div>
              {entry.status === "UPCOMING" && (
                <p className="mt-2 text-xs text-amber-500">প্রশ্নপত্র এখনো লocked; শুধু তফসিল দৃশ্যমান।</p>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
