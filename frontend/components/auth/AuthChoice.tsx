"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"
import Interactive3DCard from "@/components/landing/Interactive3DCard"

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
 * Candidate identification — two examination documents rather than generic
 * UI cards. Each carries a form serial and a candidate-class stamp; tilt,
 * lift and edge-lighting react to the pointer on capable devices. A Google
 * button sits above as the fastest path in (OAuth 2.0 + PKCE round-trip).
 */
export function AuthChoice({ onChoose }: { onChoose: (kind: "login" | "signup") => void }) {
  const [googleBusy, setGoogleBusy] = useState(false)

  // Full-page navigation to the OAuth flow. The server sets the session cookie
  // on the callback and redirects back, so no client-side token handling is
  // needed (and none can leak to JS — the cookie is HttpOnly).
  const startGoogle = () => {
    if (googleBusy) return
    setGoogleBusy(true)
    window.location.assign("/api/auth/google")
  }

  const options = [
    {
      kind: "login" as const,
      title: "I have an account",
      kicker: "Returning candidate",
      subtitle: "Sign in — your admit card is waiting",
      tag: "EXAMINEE",
      serial: "FORM NO. 9G-A1",
      icon: <ArrowRight className="h-5 w-5" aria-hidden="true" />,
    },
    {
      kind: "signup" as const,
      title: "I'm new here",
      kicker: "First attempt",
      subtitle: "Form fill-up — issue your first admit card",
      tag: "NEW ASPIRANT",
      serial: "FORM NO. 9G-B7",
      icon: <Sparkles className="h-5 w-5" aria-hidden="true" />,
    },
  ]

  return (
    <motion.div
      role="group"
      aria-label="Do you already have an account?"
      className="flex w-full flex-col gap-3"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      {/* Fastest path in: Google OAuth (PKCE). Styled as a distinct, branded
          primary action above the two credential documents. */}
      <motion.button
        type="button"
        onClick={startGoogle}
        disabled={googleBusy}
        aria-busy={googleBusy}
        className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-[var(--border-muted)] bg-[var(--surface-raised)] px-5 py-3.5 text-sm font-semibold text-[var(--foreground)] backdrop-blur-md transition-all duration-300 hover:border-zinc-300/60 hover:shadow-[0_12px_36px_rgba(0,0,0,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-70 dark:hover:border-zinc-500/60"
      >
        <GoogleIcon className="h-5 w-5" />
        <span>{googleBusy ? "Redirecting to Google…" : "Continue with Google"}</span>
      </motion.button>

      <div className="flex items-center gap-3 px-1" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--border-muted)]" />
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-500">
          or use exam credentials
        </span>
        <span className="h-px flex-1 bg-[var(--border-muted)]" />
      </div>

      {options.map((opt) => (
        <motion.div
          key={opt.kind}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.985 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        >
          <Interactive3DCard maxRotation={2} glow className="rounded-2xl">
            <button
              type="button"
              onClick={() => onChoose(opt.kind)}
              className="group relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl border border-[var(--border-muted)] bg-[var(--surface-raised)] px-5 py-4 text-left backdrop-blur-md transition-all duration-300 hover:border-emerald-400/60 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.28),0_12px_36px_rgba(6,214,160,0.10)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              {/* Document texture — faint ruled lines */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.05]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, rgba(234,255,251,0.7) 0 1px, transparent 1px 22px)",
                }}
              />
              <span className="relative min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                    {opt.serial}
                  </span>
                  <span className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-400">
                    {opt.tag}
                  </span>
                </span>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400/70">
                  {opt.kicker}
                </span>
                <span className="mt-0.5 block truncate text-base font-semibold text-[var(--foreground)]">
                  {opt.title}
                </span>
                <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{opt.subtitle}</span>
              </span>
              <span className="relative shrink-0 text-[var(--text-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-emerald-400">
                {opt.icon}
              </span>
            </button>
          </Interactive3DCard>
        </motion.div>
      ))}
    </motion.div>
  )
}
