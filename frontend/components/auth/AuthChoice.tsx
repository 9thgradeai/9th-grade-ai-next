"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"

/** Google "G" mark — inline so we don't add an icon dependency. */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

/**
 * Candidate identification — two clear paths with exam-hall language.
 * Social auth above, credential options below. No 3D tilt, no serial
 * numbers on the choice cards — clean, decisive.
 */
export function AuthChoice({
  onChoose,
  onDemo,
  busy = false,
}: {
  onChoose: (kind: "login" | "signup") => void
  onDemo?: () => void
  busy?: boolean
}) {
  const [googleBusy, setGoogleBusy] = useState(false)

  const startGoogle = () => {
    if (googleBusy || busy) return
    setGoogleBusy(true)
    window.location.assign("/api/auth/google")
  }

  const socialBusy = googleBusy || busy

  return (
    <motion.div
      role="group"
      aria-label="Do you already have an account?"
      className="flex w-full max-w-md flex-col gap-3"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      <h2 className="text-center font-display text-2xl font-bold tracking-tight text-[var(--foreground)]">
        Welcome, candidate
      </h2>

      <motion.button
        type="button"
        onClick={startGoogle}
        disabled={socialBusy}
        aria-busy={googleBusy}
        aria-label="Sign in with Google"
        className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-full border border-white/10 bg-[var(--surface-raised)] px-5 py-3.5 text-sm font-semibold text-[var(--foreground)] transition-all duration-200 hover:border-white/25 hover:shadow-[0_8px_24px_rgba(0,0,0,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-70"
      >
        <GoogleIcon className="h-5 w-5" />
        <span>{googleBusy ? "Redirecting…" : "Google"}</span>
      </motion.button>

      <div className="flex items-center gap-3 px-1" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--border-muted)]" />
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-500">OR</span>
        <span className="h-px flex-1 bg-[var(--border-muted)]" />
      </div>

      <button
        type="button"
        onClick={() => onChoose("login")}
        className="group relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl border border-[var(--border-muted)] bg-[var(--surface-raised)] px-5 py-4 text-left transition-all duration-200 hover:border-emerald-400/60 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.28),0_8px_24px_rgba(6,214,160,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        <span className="min-w-0">
          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400/70">
            Returning
          </span>
          <span className="mt-0.5 block truncate text-base font-semibold text-[var(--foreground)]">
            I have an account
          </span>
          <span className="mt-0.5 block text-sm text-[var(--text-muted)]">Your preparation is waiting.</span>
        </span>
        <span className="shrink-0 text-[var(--text-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-emerald-400">
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChoose("signup")}
        className="group relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl border border-[var(--border-muted)] bg-[var(--surface-raised)] px-5 py-4 text-left transition-all duration-200 hover:border-emerald-400/60 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.28),0_8px_24px_rgba(6,214,160,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        <span className="min-w-0">
          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400/70">
            First entry
          </span>
          <span className="mt-0.5 block truncate text-base font-semibold text-[var(--foreground)]">
            I&apos;m new here
          </span>
          <span className="mt-0.5 block text-sm text-[var(--text-muted)]">Start your preparation.</span>
        </span>
        <span className="shrink-0 text-[var(--text-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-emerald-400">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
      </button>

      {onDemo && (
        <button
          type="button"
          onClick={onDemo}
          disabled={busy}
          className="flex items-center justify-center gap-2 self-center text-sm text-[var(--text-muted)] transition-colors hover:text-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/80 disabled:opacity-70"
        >
          Explore with demo
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </motion.div>
  )
}
