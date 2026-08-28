"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { account } from "@/lib/services/api"
import { AuthShell } from "@/components/auth/AuthShell"

function VerifyInner() {
  const params = useSearchParams()
  const token = params.get("token") ?? ""
  const [state, setState] = useState<"checking" | "ok" | "invalid">(token ? "checking" : "invalid")
  const [email, setEmail] = useState("")
  const [resending, setResending] = useState(false)
  const [resendNote, setResendNote] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let active = true
    account
      .verifyEmail(token)
      .then((r) => active && setState(r.ok ? "ok" : "invalid"))
      .catch(() => active && setState("invalid"))
    return () => {
      active = false
    }
  }, [token])

  if (state === "checking") {
    return (
      <div className="flex flex-col items-center gap-3 py-2">
        <span
          aria-hidden="true"
          className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400"
        />
        <p className="text-sm text-[var(--text-muted)]" role="status">
          Verifying your email…
        </p>
      </div>
    )
  }

  if (state === "ok") {
    return (
      <div className="space-y-3">
        <p
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
        >
          Your email is verified. Welcome aboard!
        </p>
        <Link
          href="/dashboard"
          className="block text-center text-sm text-emerald-400/80 transition-colors hover:text-emerald-400"
        >
          Go to your dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p
        role="alert"
        className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
      >
        This verification link is invalid or has expired.
      </p>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="mb-2 text-sm text-[var(--text-muted)]">Resend a fresh link:</p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (resending) return
            setResending(true)
            setResendNote(null)
            account
              .resendVerification(email)
              .then((r) => {
                if (r.devLink) {
                  setResendNote("Dev link (no email transport): open it to verify.")
                  window.location.href = r.devLink
                } else {
                  setResendNote("If that email exists, a new link is on its way.")
                }
              })
              .catch(() => setResendNote("Something went wrong. Please try again."))
              .finally(() => setResending(false))
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className="flex-1 rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80"
          />
          <button
            type="submit"
            disabled={resending}
            className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:shadow-[0_8px_24px_rgba(16,185,129,0.35)] active:scale-[0.98] disabled:opacity-60"
          >
            {resending ? "Sending…" : "Resend"}
          </button>
        </form>
        {resendNote && (
          <p className="mt-2 text-xs text-[var(--text-muted)]" role="status">
            {resendNote}
          </p>
        )}
      </div>

      <Link
        href="/login"
        className="block text-center text-sm text-emerald-400/80 transition-colors hover:text-emerald-400"
      >
        Back to sign in
      </Link>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <AuthShell
      eyebrow="Exam hall · Identity check"
      title="Email verification"
      description="Confirming your seat in the examination."
    >
      <Suspense fallback={<p className="text-sm text-[var(--text-muted)]">Loading…</p>}>
        <VerifyInner />
      </Suspense>
    </AuthShell>
  )
}
