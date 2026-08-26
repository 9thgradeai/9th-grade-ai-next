"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { account } from "@/lib/services/api";
import BrandMark from "@/components/ui/BrandMark";

type PrepLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "";

export default function OnboardingPage() {
  const router = useRouter();
  const [examTarget, setExamTarget] = useState("");
  const [examDate, setExamDate] = useState("");
  const [prepLevel, setPrepLevel] = useState<PrepLevel>("");
  const [studyHoursPerDay, setStudyHoursPerDay] = useState("");
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMessage("");
    try {
      await account.completeOnboarding({
        examTarget: examTarget.trim() || undefined,
        examDate: examDate || undefined,
        prepLevel: prepLevel || undefined,
        studyHoursPerDay: studyHoursPerDay ? Number(studyHoursPerDay) : undefined,
        goal: goal.trim() || undefined,
      });
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      // Not signed in — send the user to sign in, then they can onboard after.
      if (msg.includes("Authentication") || msg.includes("401")) {
        router.push("/login?register=true");
        return;
      }
      setMessage(msg);
      setStatus("error");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-semibold text-[var(--foreground)]">
        <BrandMark className="h-8 w-8 rounded-lg shadow-[0_0_18px_rgba(16,185,129,0.35)]" />
        9Th-Grade AI
      </Link>

      <div className="glass-card w-full max-w-md rounded-3xl border border-white/10 p-6 shadow-panel sm:p-8">
        <h1 className="font-display text-xl font-semibold text-[var(--foreground)]">Tell us about your goal</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          This helps tailor your study plan. Everything here is optional — you can skip and set it later.
        </p>

        <form onSubmit={(e) => { void onSubmit(e); }} className="mt-6 space-y-4">
          {status === "error" && message && (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {message}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="examTarget">
              Target exam
            </label>
            <input
              id="examTarget"
              type="text"
              value={examTarget}
              onChange={(e) => setExamTarget(e.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
              placeholder="e.g. 46th BCS"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="examDate">
              Exam date
            </label>
            <input
              id="examDate"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="prepLevel">
              Preparation level
            </label>
            <select
              id="prepLevel"
              value={prepLevel}
              onChange={(e) => setPrepLevel(e.target.value as PrepLevel)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
            >
              <option value="">Prefer not to say</option>
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="studyHoursPerDay">
              Study hours per day
            </label>
            <input
              id="studyHoursPerDay"
              type="number"
              min={0}
              max={24}
              value={studyHoursPerDay}
              onChange={(e) => setStudyHoursPerDay(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
              placeholder="e.g. 3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="goal">
              Your goal
            </label>
            <textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={280}
              rows={3}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
              placeholder="e.g. Cover the International Affairs section before the prelims."
            />
          </div>

          <button
            type="submit"
            disabled={status === "saving"}
            className="btn-shine flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-base font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.25)] transition-all hover:shadow-[0_10px_32px_rgba(16,185,129,0.4)] active:scale-[0.98] disabled:opacity-60"
          >
            {status === "saving" ? "Saving…" : "Save & continue"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="block w-full text-center text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
          >
            Skip for now
          </button>
        </form>
      </div>
    </main>
  );
}
