import type { Metadata } from "next";
import Link from "next/link";
import { TerminalSquare, ShieldCheck, KeyRound, GitBranch, Lock, BookOpen } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  alternates: { canonical: "/docs" },
  title: "API Documentation — 9Th-Grade AI",
  description:
    "Public API reference for the 9Th-Grade AI platform — auth, questions, exams, study plans, progress, content, and AI endpoints.",
};

type Endpoint = {
  method: "GET" | "POST";
  path: string;
  description: string;
};

const groups: { title: string; icon: typeof BookOpen; endpoints: Endpoint[] }[] = [
  {
    title: "Authentication",
    icon: KeyRound,
    endpoints: [
      { method: "POST", path: "/api/auth/register", description: "Create an account and start a session." },
      { method: "POST", path: "/api/auth/login", description: "Sign in and receive an HttpOnly session cookie." },
      { method: "POST", path: "/api/auth/logout", description: "Invalidate the current session." },
      { method: "POST", path: "/api/auth/refresh", description: "Refresh and extend the session expiry." },
      { method: "GET", path: "/api/auth/me", description: "Return the currently authenticated user." },
      { method: "GET", path: "/api/auth/profile", description: "Fetch the signed-in user's full profile." },
      { method: "GET", path: "/api/auth/account", description: "Return account & subscription details." },
      { method: "POST", path: "/api/auth/change-password", description: "Update the account password and sign out other devices." },
      { method: "POST", path: "/api/auth/sessions/revoke-all", description: "Sign out everywhere by invalidating all sessions." },
    ],
  },
  {
    title: "Questions & Practice",
    icon: TerminalSquare,
    endpoints: [
      { method: "GET", path: "/api/questions", description: "Query tagged questions with filters." },
      { method: "GET", path: "/api/question-bank/categories", description: "List question-bank categories & counts." },
      { method: "POST", path: "/api/practice/submit", description: "Submit a practice attempt and record answers." },
      { method: "GET", path: "/api/mock-test/results", description: "Fetch results for past mock tests." },
    ],
  },
  {
    title: "Exams",
    icon: TerminalSquare,
    endpoints: [
      { method: "GET", path: "/api/exam/config", description: "Exam configuration, subjects, and topics." },
      { method: "POST", path: "/api/exam/build", description: "Build a custom exam from selected topics." },
      { method: "POST", path: "/api/exam/submit", description: "Submit a full exam and compute the score." },
    ],
  },
  {
    title: "Study & Progress",
    icon: BookOpen,
    endpoints: [
      { method: "GET", path: "/api/study-plan", description: "Fetch the adaptive study plan." },
      { method: "POST", path: "/api/study-plan/tasks/[id]/toggle", description: "Toggle completion of a study task." },
      { method: "GET", path: "/api/progress", description: "Aggregate progress across subjects." },
      { method: "GET", path: "/api/subject-reports", description: "Per-subject performance reports." },
      { method: "GET", path: "/api/dashboard-stats", description: "Overview stats for the dashboard." },
      { method: "GET", path: "/api/recommendations", description: "Personalized study recommendations." },
      { method: "GET", path: "/api/badges", description: "Earned badges and achievements." },
      { method: "GET", path: "/api/exam-schedule", description: "Upcoming official exam dates." },
    ],
  },
  {
    title: "Content & Notifications",
    icon: BookOpen,
    endpoints: [
      { method: "GET", path: "/api/flash-news", description: "Latest exam & platform flash news." },
      { method: "GET", path: "/api/daily-quiz", description: "Today's daily quiz." },
      { method: "POST", path: "/api/daily-quiz/submit", description: "Submit the daily quiz answers." },
      { method: "GET", path: "/api/notifications", description: "Paginated notification feed." },
      { method: "POST", path: "/api/notifications/[id]/read", description: "Mark a notification as read." },
      { method: "GET", path: "/api/flashcards", description: "Fetch flashcard decks & cards." },
      { method: "GET", path: "/api/documents", description: "Downloadable study documents." },
      { method: "GET", path: "/api/bookmarks", description: "Bookmarked questions & content." },
    ],
  },
  {
    title: "AI",
    icon: TerminalSquare,
    endpoints: [
      { method: "POST", path: "/api/ai/solver", description: "AI step-by-step question solving." },
      { method: "POST", path: "/api/ai/tutor", description: "Conversational AI study tutor." },
    ],
  },
];

const methodStyles: Record<Endpoint["method"], string> = {
  GET: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  POST: "text-cyan-400 border-cyan-400/30 bg-cyan-500/10",
};

export default function DocsPage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="API DOCUMENTATION"
        title="Build On the"
        highlight="9Th-Grade AI Platform"
        description="A single authenticated API powers every dashboard module. All routes live under /api/*, return JSON, and use an HttpOnly session cookie for auth."
        actions={[
          { href: "https://github.com/9thgradeai/9th-grade-ai-next", label: "View on GitHub", variant: "ghost" },
        ]}
      />

      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading
            eyebrow="REFERENCE"
            title="Endpoints,"
            highlight="Grouped by Domain"
          />

          <div className="space-y-8">
            {groups.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.title} className="glass-card rounded-2xl border border-white/10 overflow-hidden">
                  <div className="flex items-center gap-3 px-5 md:px-6 py-4 border-b border-white/10 bg-white/[0.02]">
                    <Icon className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                    <h2 className="font-display text-base font-semibold text-white">{group.title}</h2>
                  </div>
                  <ul className="divide-y divide-white/5">
                    {group.endpoints.map((endpoint) => (
                      <li key={endpoint.method + endpoint.path} className="px-5 md:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5">
                        <div className="flex items-center gap-3 sm:w-72 flex-shrink-0">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border ${methodStyles[endpoint.method]}`}
                          >
                            {endpoint.method}
                          </span>
                          <code className="text-xs md:text-sm text-zinc-200 font-mono">{endpoint.path}</code>
                        </div>
                        <p className="text-sm text-zinc-500 leading-relaxed">{endpoint.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Auth & security notes */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Lock,
                title: "Session Auth",
                text: "JWT sessions issued via jose and stored in an HttpOnly cookie. No client-side token storage.",
              },
              {
                icon: ShieldCheck,
                title: "Validated Inputs",
                text: "Every route validates its inputs and returns 400 on malformed payloads. Never trust raw client data.",
              },
              {
                icon: GitBranch,
                title: "Open Source",
                text: "The full API reference lives in docs/API.md in the repository. Contributions welcome.",
              },
            ].map((note) => {
              const NoteIcon = note.icon;
              return (
                <div key={note.title} className="glass-card rounded-2xl border border-white/10 p-6">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center mb-4">
                    <NoteIcon className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-sm font-semibold text-white mb-1.5">{note.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{note.text}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="https://github.com/9thgradeai/9th-grade-ai-next"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 transition-colors shadow-[0_0_24px_rgba(16,185,129,0.3)]"
            >
              Read docs/API.md on GitHub
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}