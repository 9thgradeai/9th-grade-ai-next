"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Clock, ArrowRight, Trophy, BookX, Brain, Flame, Target, ClipboardCheck, Sparkles, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useLanguage, t } from "@/lib/lang-ctx";
import { useToastSafe } from "@/lib/toast-ctx";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import StreakHeatmap from "./StreakHeatmap";
import HomeCoach from "./ai/HomeCoach";
import { deriveNextAction } from "@/lib/dashboard/recommend";
import { useExamDaysLeft } from "./HomeTabHelpers";
import PreparationScoreCard from "./command-center/PreparationScoreCard";
import AIRecommendationCard from "./command-center/AIRecommendationCard";
import PerformanceCard from "./command-center/PerformanceCard";
import SubjectMastery from "./command-center/SubjectMastery";
import FocusAreasCard from "./command-center/FocusAreasCard";
import AITutorCard from "./command-center/AITutorCard";
import TodayPlanCard from "./command-center/TodayPlanCard";
import QuickActions from "./command-center/QuickActions";
import ExamCountdownCard from "./command-center/ExamCountdownCard";

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WEEKDAY_SHORT_BN = ["শনি","রবি","সোম","মঙ্গল","বুধ","বৃহ","শুক্র"];

function lastSevenDayLabels(): string[] {
  const today = new Date().getDay();
  const out: string[] = [];
  for (let i=6;i>=0;i--) out.push(WEEKDAY_SHORT_BN[(today - i +7)%7]);
  return out;
}
const WEEKDAY_LABELS_7 = lastSevenDayLabels();

const STAGGER = { hidden:{}, show:{ transition:{ staggerChildren:0.06, delayChildren:0.04 } } };
const STAGGER_ITEM = { hidden:{ opacity:0, y:10 }, show:{ opacity:1, y:0, transition:{ type:"spring" as const, stiffness:260, damping:26 } } };

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeTab() {
  const { user } = useAuth();
  const { setActiveTab, setPracticeIntent, setMistakeIntent, setQuestionBankFilters } = useDashboardStore();
  const { lang } = useLanguage();
  const toast = useToastSafe();
  const coachRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState<Server.DashboardStatsDTO | null>(null);
  const [reports, setReports] = useState<Array<{ name:string; score:number; attempted:number; correct:number }>>([]);
  const [nextExam, setNextExam] = useState<Server.ExamScheduleDTO | null>(null);
  const [tasks, setTasks] = useState<Server.StudyTaskDTO[]>([]);
  const [results, setResults] = useState<Server.MockTestResultDTO[]>([]);
  const [pendingMistakes, setPendingMistakes] = useState(0);
  const [mistakeStatsData, setMistakeStatsData] = useState(0);
  const [mistakeSubjectsData, setMistakeSubjectsData] = useState<Server.SubjectMistakeCountDTO[]>([]);
  const [weakTopics, setWeakTopics] = useState<Server.WeakTopicDTO[]>([]);
  const [dailyQuiz, setDailyQuiz] = useState<Server.DailyQuizDTO | null>(null);
  const [flashcardsDue, setFlashcardsDue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [perfRange, setPerfRange] = useState<"7D"|"30D"|"ALL">("7D");
  const [perfStats, setPerfStats] = useState<Server.DashboardStatsDTO | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  useEffect(() => {
    let cancelled=false;
    void (async()=>{
      try{
        const [s,r,e,t,m,w,ms,msub,wt,dq,fc] = await Promise.allSettled([
          api.dashboardStats(),
          api.subjectReports(),
          api.examSchedule(),
          api.studyPlan(),
          api.mockTestResults(),
          api.wrongAnswers({limit:1}),
          api.mistakeStats(),
          api.mistakeSubjects(),
          api.weakTopics(),
          api.dailyQuiz(),
          api.flashcards().then(list => list.length).catch(()=>0),
        ]);
        if(cancelled) return;
        if(s.status==="fulfilled") { setStats(s.value); setPerfStats(s.value); }
        if(r.status==="fulfilled") setReports(r.value);
        if(e.status==="fulfilled"){ const upcoming=e.value.filter(ex=>new Date(ex.date).getTime()>Date.now()).sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime())[0]??null; setNextExam(upcoming); }
        if(t.status==="fulfilled") setTasks(t.value);
        if(m.status==="fulfilled") setResults(m.value);
        if(w.status==="fulfilled") setPendingMistakes(w.value.total);
        if(ms.status==="fulfilled") setMistakeStatsData(ms.value.totalMistakes);
        if(msub.status==="fulfilled") setMistakeSubjectsData(msub.value);
        if(wt.status==="fulfilled") setWeakTopics(wt.value.slice(0,4));
        if(dq.status==="fulfilled") setDailyQuiz(dq.value);
        if(fc.status==="fulfilled") setFlashcardsDue(fc.value as number);
        if([s,r,e,t,m,w].every(p=>p.status==="rejected")) setLoadFailed(true);
        setLoading(false);
      }catch{ if(!cancelled){ setLoadFailed(true); setLoading(false);} }
    })();
    return()=>{ cancelled=true; };
  },[reloadKey]);

  // perf range fetch
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{
    if(perfRange==="7D"){ queueMicrotask(()=>setPerfStats(stats)); return; }
    let cancelled=false;
    const days = perfRange==="30D" ? 30 : 365;
    queueMicrotask(()=>setPerfLoading(true));
    void api.dashboardStats(days).then(v=>{ if(!cancelled) setPerfStats(v); }).catch(()=>{ /* keep previous */ }).finally(()=>{ if(!cancelled) setPerfLoading(false); });
    return()=>{ cancelled=true; };
  },[perfRange, stats]);

  useEffect(()=>{ if(!stats) return; const s=stats.streak; const isMilestone=s===7||s===30||s===100||(s>0&&s%50===0); if(!isMilestone) return; const key=`streak-celebrated-${s}`; try{ if(sessionStorage.getItem(key)) return; sessionStorage.setItem(key,"1"); }catch{return;} toast.success(`অভিনন্দন! আপনি ${s} দিনের স্ট্রিক অর্জন করেছেন।`); },[stats,toast]);
  useEffect(()=>{ const onRefresh=()=>{ setLoading(true); setLoadFailed(false); setReloadKey(k=>k+1); }; window.addEventListener("ai:refresh-home", onRefresh); return()=>window.removeEventListener("ai:refresh-home", onRefresh); },[]);

  const weakest = useMemo(()=> [...reports].filter(r=>r.attempted>0).sort((a,b)=>a.score-b.score).slice(0,5), [reports]);
  const todaysTasks = useMemo(()=>{ const today=WEEKDAYS[new Date().getDay()]; return tasks.filter(t=>t.day===today); },[tasks]);
  const studiedToday = (stats?.activity?.[stats.activity.length-1]?.answered ?? 0) >0;
  const examDaysLeft = useExamDaysLeft(nextExam?.date ?? null);
  const nextAction = useMemo(()=> deriveNextAction({ weakest: weakest[0] ?? null, examTitle: nextExam ? t(lang, nextExam.titleBn, nextExam.titleEn) : null, examDaysLeft, streak: stats?.streak ?? 0, studiedToday, pendingMistakes }), [weakest,nextExam,examDaysLeft,stats?.streak,studiedToday,pendingMistakes,lang]);
  const activityDays = useMemo(()=>(stats?.activity ?? Array.from({length:7},()=>({answered:0})) ).map(a=>(a?.answered ??0)>0),[stats]);

  const toggleTask = async (taskId:number)=>{
    setTasks(prev=>prev.map(t=>t.id===taskId?{...t, completed:!t.completed}:t));
    try{ await api.toggleStudyTask(taskId); }catch{ setTasks(prev=>prev.map(t=>t.id===taskId?{...t, completed:!t.completed}:t)); toast.error("কাজ আপডেট করা যায়নি — আবার চেষ্টা করুন"); }
  };

  // helpers for wiring
  const practiceSubject = (subject: string) => {
    setPracticeIntent({ subject, mode: "quick" });
    setQuestionBankFilters({ category: subject });
    setActiveTab("practice");
  };
  const mistakeSubject = (subject?: string) => {
    if (subject) setMistakeIntent({ subject });
    else setMistakeIntent(null);
    setActiveTab("mistakes");
  };
  const focusIntent = weakest[0]?.name ?? null;
  const handleAIRecommendationFocus = () => {
    if (focusIntent && weakest[0] && weakest[0].score < 75) {
      practiceSubject(focusIntent);
    } else if (pendingMistakes>0) {
      mistakeSubject(focusIntent ?? undefined);
    } else {
      setActiveTab("practice");
    }
  };
  const handleAskTutor = () => {
    // scroll to AI coach and focus it
    coachRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // also fire a custom event so HomeCoach can auto-run if desired
    window.dispatchEvent(new CustomEvent("dashboard:ask-tutor", { detail: { subject: focusIntent } }));
  };
  const handleGuidedSession = () => {
    if (focusIntent) practiceSubject(focusIntent);
    else setActiveTab("practice");
  };

  const skeleton = loading && !stats;
  const prepScore = useMemo(()=>{
    if(!stats) return 0;
    const acc = stats.accuracy ?? 0;
    const comp = (stats.completion ?? 0);
    const streakBonus = Math.min(12, (stats.streak ?? 0) * 1.5);
    return Math.max(0, Math.min(100, Math.round(acc*0.55 + comp*0.35 + streakBonus)));
  },[stats]);

  if(loadFailed && !skeleton){
    return (
      <div role="alert" className="rounded-2xl border p-8 text-center" style={{ background:"var(--dashboard-surface)", borderColor:"var(--dashboard-danger)" }}>
        <p className="text-sm font-medium" style={{ color:"var(--dashboard-text-primary)" }}>ড্যাশবোর্ড ডেটা লোড করা যায়নি</p>
        <p className="mt-1 text-xs" style={{ color:"var(--dashboard-text-muted)" }}>ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।</p>
        <button onClick={()=>{ setLoading(true); setLoadFailed(false); setReloadKey(k=>k+1); }} className="mt-4 px-4 py-2 font-semibold text-sm rounded-lg" style={{ background:"var(--dashboard-primary)", color:"var(--dashboard-text-inverse)" }}>আবার চেষ্টা করুন</button>
      </div>
    );
  }

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show" className="space-y-5 pb-24 sm:pb-6">
      {/* ── Hero greeting + exam pill ── */}
      <motion.div variants={STAGGER_ITEM} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color:"var(--dashboard-primary)" }}>{timeGreeting()}, {user?.name ?? "Scholar"} —</p>
          <h1 className="font-display font-extrabold text-[26px] sm:text-[30px] leading-none tracking-tight mt-1.5" style={{ color:"var(--dashboard-text-primary)" }}>
            Your preparation is <span style={{ color:"var(--dashboard-primary)" }}>{prepScore >=70 ? "on track" : prepScore >=45 ? "in progress" : "just starting"}</span>
          </h1>
          <p className="text-sm mt-2 flex flex-wrap items-center gap-2" style={{ color:"var(--dashboard-text-secondary)" }}>
            <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {user?.examTarget ?? "Target not set"} {nextExam ? `· ${t(lang,nextExam.titleBn,nextExam.titleEn)}` : ""}</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold" style={{ background:"var(--dashboard-warning-subtle)", borderColor:"color-mix(in srgb, var(--dashboard-warning) 16%, transparent)", color:"var(--dashboard-warning)" }}>{stats?.streak ?? 0} day streak <span className="hidden sm:inline-flex"><StreakHeatmap activeDays={activityDays} labels={WEEKDAY_LABELS_7} /></span></span>
          </p>
        </div>
        {nextExam && examDaysLeft!=null && (
          <div className="shrink-0 rounded-2xl border px-4 py-3 flex items-center gap-4" style={{ background:"var(--dashboard-surface)", borderColor:"var(--dashboard-border-muted)", boxShadow:"var(--dashboard-shadow-sm)" }}>
            <div className="text-center">
              <p className="font-display font-extrabold text-2xl leading-none" style={{ color:"var(--dashboard-primary)" }}>{examDaysLeft}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color:"var(--dashboard-text-muted)" }}>Days left</p>
            </div>
            <div className="w-px h-10" style={{ background:"var(--dashboard-border-muted)" }} />
            <div>
              <p className="text-xs font-bold leading-tight" style={{ color:"var(--dashboard-text-primary)" }}>{t(lang,nextExam.titleBn,nextExam.titleEn)}</p>
              <p className="text-[11px]" style={{ color:"var(--dashboard-text-muted)" }}>{examDaysLeft <=7 ? "Final sprint" : examDaysLeft <=30 ? "Focused revision phase" : "Steady preparation window"}</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Primary command grid ── */}
      <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-5">
        <motion.div variants={STAGGER_ITEM}>
          <PreparationScoreCard score={skeleton? 0 : prepScore} accuracy={stats?.accuracy ?? 0} streak={stats?.streak ?? 0} solved={stats?.questionsAnswered ?? 0} rank={stats?.rank ?? null} />
        </motion.div>
        <motion.div variants={STAGGER_ITEM}>
          <AIRecommendationCard weakestName={weakest[0]?.name ?? null} weakestScore={weakest[0]?.score ?? null} weakestAttempts={weakest[0]?.attempted ?? null} pendingMistakes={pendingMistakes} onStartFocus={handleAIRecommendationFocus} onBrowse={()=>setActiveTab("practice")} />
        </motion.div>
      </div>

      {/* ── Quick actions ── */}
      <motion.div variants={STAGGER_ITEM}><QuickActions onAction={(tab)=>setActiveTab(tab)} /></motion.div>

      {/* ── Next best action ── */}
      <motion.div variants={STAGGER_ITEM} className="rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ background: nextAction.intensity==="high" ? "var(--dashboard-primary)" : "var(--dashboard-surface)", borderColor: nextAction.intensity==="high" ? "var(--dashboard-primary)" : "var(--dashboard-border-muted)", color: nextAction.intensity==="high" ? "var(--dashboard-text-inverse)" : "var(--dashboard-text-primary)" }}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">What should I do now?</p>
          <p className="font-semibold text-[14px] mt-0.5">{nextAction.title} — <span className="font-normal opacity-80">{nextAction.description}</span></p>
        </div>
        <button onClick={()=>setActiveTab(nextAction.tab)} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold" style={nextAction.intensity==="high" ? { background:"var(--dashboard-text-inverse)", color:"var(--dashboard-primary)" } : { background:"var(--dashboard-primary)", color:"var(--dashboard-text-inverse)" }}>{nextAction.cta} <ArrowRight className="w-4 h-4" /></button>
      </motion.div>

      <motion.div ref={coachRef as unknown as React.RefObject<HTMLDivElement>} variants={STAGGER_ITEM}><HomeCoach /></motion.div>

      {/* ── Performance + Today ── */}
      <div className="grid lg:grid-cols-[1.45fr_0.85fr] gap-5">
        <motion.div variants={STAGGER_ITEM}>
          <PerformanceCard activity={perfStats?.activity ?? stats?.activity ?? []} results={results} range={perfRange} onRangeChange={setPerfRange} loading={perfLoading} />
        </motion.div>
        <motion.div variants={STAGGER_ITEM}>
          <TodayPlanCard tasks={todaysTasks} onToggle={toggleTask} />
        </motion.div>
      </div>

      {/* ── Subject mastery (full width) ── */}
      <motion.div variants={STAGGER_ITEM}>
        <SubjectMastery reports={reports} onPractice={practiceSubject} />
      </motion.div>

      {/* ── Focus + AI Tutor ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <motion.div variants={STAGGER_ITEM}><FocusAreasCard reports={reports} onPractice={practiceSubject} onOpenMistakes={mistakeSubject} /></motion.div>
        <motion.div variants={STAGGER_ITEM}><AITutorCard weakestName={weakest[0]?.name ?? null} onAsk={handleAskTutor} onGuided={handleGuidedSession} /></motion.div>
      </div>

      {/* ── Futuristic helpers row: Daily Quiz / Weak Topics / Flashcards ── */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Daily Quiz */}
        <motion.div variants={STAGGER_ITEM} className="command-card p-5 flex flex-col">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:"var(--dashboard-info-subtle)", color:"var(--dashboard-info)", border:"1px solid color-mix(in srgb, var(--dashboard-info) 18%, transparent)" }}><Target className="w-4 h-4" /></span>
            <p className="command-eyebrow !text-[10px]">Daily Quiz</p>
            {dailyQuiz && <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: dailyQuiz.completed ? "var(--dashboard-success-subtle)" : "var(--dashboard-warning-subtle)", color: dailyQuiz.completed ? "var(--dashboard-success)" : "var(--dashboard-warning)" }}>{dailyQuiz.completed ? "Completed" : "Ready"}</span>}
          </div>
          {!dailyQuiz ? (
            <p className="mt-4 text-sm" style={{ color:"var(--dashboard-text-muted)" }}>Daily quiz is being prepared — check back shortly.</p>
          ) : dailyQuiz.completed ? (
            <>
              <p className="mt-3 text-sm font-semibold" style={{ color:"var(--dashboard-text-primary)" }}>You scored {dailyQuiz.score}% today</p>
              <p className="text-xs mt-1" style={{ color:"var(--dashboard-text-muted)" }}>{dailyQuiz.questions?.length ?? 0} questions · Come back tomorrow for a new set.</p>
              <button onClick={()=>setActiveTab("practice")} className="command-secondary-btn mt-4 w-full">Practice more <ChevronRight className="w-4 h-4" /></button>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm font-semibold" style={{ color:"var(--dashboard-text-primary)" }}>{dailyQuiz.title ?? "Today's Challenge"}</p>
              <p className="text-xs mt-1" style={{ color:"var(--dashboard-text-muted)" }}>{dailyQuiz.questions?.length ?? 5} questions · 5 min · Earn bonus points.</p>
              <button onClick={()=>setActiveTab("practice")} className="command-primary-btn mt-4 w-full"><ClipboardCheck className="w-4 h-4" /> Start Daily Quiz</button>
            </>
          )}
        </motion.div>

        {/* Weak topics */}
        <motion.div variants={STAGGER_ITEM} className="command-card p-5 flex flex-col">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:"var(--dashboard-danger-subtle)", color:"var(--dashboard-danger)", border:"1px solid color-mix(in srgb, var(--dashboard-danger) 18%, transparent)" }}><Flame className="w-4 h-4" /></span>
            <p className="command-eyebrow !text-[10px]">Weak Topics</p>
            <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full" style={{ background:"var(--dashboard-surface-muted)", color:"var(--dashboard-text-muted)", border:"1px solid var(--dashboard-border-muted)" }}>{weakTopics.length}</span>
          </div>
          {weakTopics.length===0 ? (
            <p className="mt-4 text-sm" style={{ color:"var(--dashboard-text-muted)" }}>Solve more to surface topic-level weaknesses. Top 4 weakest topics appear here.</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {weakTopics.map(wt=>(
                <button key={`${wt.subject}-${wt.topic}`} onClick={()=>practiceSubject(wt.subject)} className="w-full text-left rounded-xl border p-3 flex items-center justify-between gap-2 hover:border-[var(--dashboard-primary)]/30 transition-colors" style={{ background:"var(--dashboard-surface-muted)", borderColor:"var(--dashboard-border-muted)" }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color:"var(--dashboard-text-primary)" }}>{wt.topic}</p>
                    <p className="text-[11px] truncate" style={{ color:"var(--dashboard-text-muted)" }}>{wt.subject} · {wt.score}% · {wt.attempted} tried</p>
                  </div>
                  <span className="text-xs font-mono font-bold shrink-0" style={{ color:"var(--dashboard-danger)" }}>{wt.score}%</span>
                </button>
              ))}
              <button onClick={()=>setActiveTab("progress")} className="text-xs font-semibold inline-flex items-center gap-1 mt-1" style={{ color:"var(--dashboard-primary)" }}>See full weak analysis <ArrowRight className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </motion.div>

        {/* Flashcards due */}
        <motion.div variants={STAGGER_ITEM} className="command-card p-5 flex flex-col">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:"var(--dashboard-success-subtle)", color:"var(--dashboard-success)", border:"1px solid color-mix(in srgb, var(--dashboard-success) 18%, transparent)" }}><Brain className="w-4 h-4" /></span>
            <p className="command-eyebrow !text-[10px]">Flashcards</p>
            <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full" style={{ background:"var(--dashboard-surface-muted)", color:"var(--dashboard-text-muted)", border:"1px solid var(--dashboard-border-muted)" }}>{flashcardsDue ?? "—"} total</span>
          </div>
          <p className="mt-3 text-sm font-semibold" style={{ color:"var(--dashboard-text-primary)" }}>{flashcardsDue && flashcardsDue>0 ? `${flashcardsDue} cards in deck` : "Spaced repetition"}</p>
          <p className="text-xs mt-1" style={{ color:"var(--dashboard-text-muted)" }}>Review flashcards daily to lock in memory. SRS picks what you’re about to forget.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={()=>setActiveTab("flashcards")} className="command-primary-btn flex-1"><Sparkles className="w-4 h-4" /> Review Now</button>
            <button onClick={()=>setActiveTab("flashcards")} className="command-secondary-btn">Browse Deck</button>
          </div>
        </motion.div>
      </div>

      {/* ── Exam countdown (if exists) ── */}
      {nextExam && (
        <motion.div variants={STAGGER_ITEM}><ExamCountdownCard exam={nextExam} /></motion.div>
      )}

      {/* ── Mistakes + Recent activity ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <motion.div variants={STAGGER_ITEM} className="command-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:"var(--dashboard-danger-subtle)", color:"var(--dashboard-danger)", border:"1px solid color-mix(in srgb, var(--dashboard-danger) 18%, transparent)" }}><BookX className="w-4 h-4" /></span>
              <p className="command-eyebrow !text-[10px]">Wrong Answers</p>
            </div>
            <button onClick={()=>mistakeSubject()} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color:"var(--dashboard-primary)" }}>Open notebook <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
          {mistakeStatsData===0 ? (
            <div className="mt-4 rounded-xl border border-dashed p-6 text-center" style={{ borderColor:"var(--dashboard-border-muted)", background:"var(--dashboard-surface-muted)" }}>
              <p className="text-sm font-medium" style={{ color:"var(--dashboard-text-primary)" }}>No mistakes yet</p>
              <p className="text-xs mt-1" style={{ color:"var(--dashboard-text-muted)" }}>Mistakes will appear here for targeted revision.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-bold" style={{ color:"var(--dashboard-text-primary)" }}>{mistakeStatsData} questions need attention</p>
              {mistakeSubjectsData.slice(0,3).map(s=>(
                <button key={s.subject} onClick={()=>mistakeSubject(s.subject)} className="w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-left hover:border-[var(--dashboard-primary)]/30 transition-colors" style={{ background:"var(--dashboard-surface-muted)", borderColor:"var(--dashboard-border-muted)" }}>
                  <span className="text-sm font-medium truncate" style={{ color:"var(--dashboard-text-primary)" }}>{s.subject}</span>
                  <span className="text-xs font-mono font-bold shrink-0" style={{ color:"var(--dashboard-danger)" }}>{s.unmastered} unresolved</span>
                </button>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div variants={STAGGER_ITEM} className="command-card p-5">
          <div className="flex items-center justify-between">
            <p className="command-eyebrow !text-[10px]">Recent Activity</p>
            <button onClick={()=>setActiveTab("progress")} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color:"var(--dashboard-primary)" }}>View all <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
          {results.length===0 ? (
            <p className="mt-4 text-sm" style={{ color:"var(--dashboard-text-muted)" }}>No recent mock exams. Your activity timeline will build as you practice.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {results.slice(0,4).map(r=>(
                <button key={r.id} onClick={()=>setActiveTab("progress")} className="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left hover:border-[var(--dashboard-primary)]/30 transition-colors" style={{ background:"var(--dashboard-surface-muted)", borderColor:"var(--dashboard-border-muted)" }}>
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: r.score>=80?"var(--dashboard-success-subtle)":r.score>=50?"var(--dashboard-warning-subtle)":"var(--dashboard-danger-subtle)", color: r.score>=80?"var(--dashboard-success)":r.score>=50?"var(--dashboard-warning)":"var(--dashboard-danger)" }}><Trophy className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate font-medium" style={{ color:"var(--dashboard-text-primary)" }}>{r.title}</p>
                    <p className="text-[11px]" style={{ color:"var(--dashboard-text-muted)" }}>{r.correct}/{r.total} correct · {new Date(r.createdAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</p>
                  </div>
                  <span className="text-sm font-mono font-bold flex items-center gap-1" style={{ color:"var(--dashboard-text-primary)" }}>{r.score}% <ChevronRight className="w-3 h-3 opacity-40" /></span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
