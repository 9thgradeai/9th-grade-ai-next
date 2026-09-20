"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { account } from "@/lib/services/api"
import { useAuth } from "@/lib/auth-ctx"
import { AuthShell } from "@/components/auth/AuthShell"

function VerifyInner() {
  const router = useRouter()
  const { logout } = useAuth()
  const params = useSearchParams()
  const token = params.get("token") ?? ""
  // `email` is prefilled from the dashboard gate (?email=...) so the "resend"
  // box starts addressed even when the visitor has no token to paste.
  const prefilledEmail = params.get("email") ?? ""
  // No token at all — visiting the page directly. Show "check your inbox"
  // instead of the misleading "invalid/expired" state.
  const hasToken = token.length > 0
  const [state, setState] = useState<"checking" | "ok" | "invalid">("checking")
  const [email, setEmail] = useState(prefilledEmail)
  const [resending, setResending] = useState(false)
  const [resendNote, setResendNote] = useState<string | null>(null)
  const [autoVerified, setAutoVerified] = useState(false)

  useEffect(() => {
    let active = true
    if (!token) {
      // Direct visit with no link: there is nothing to verify yet. The `state`
      // starts at "checking"; rendering falls through to the inbox hint since
      // there is no token to act on.
      return () => {
        active = false
      }
    }
    account
      .verifyEmail(token)
      .then((r) => {
        if (!active) return
        if (r.ok) {
          // Common case: the email is now verified, so let them straight in.
          router.replace("/dashboard")
        } else {
          setState("invalid")
        }
      })
      .catch(() => active && setState("invalid"))
    return () => {
      active = false
    }
  }, [token, router])

  // Verified by resend (no transport installed — account auto-verified).
  if (autoVerified) {
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

  if (state === "checking" && hasToken) {
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
        className={`rounded-xl border px-4 py-3 text-sm ${
          hasToken
            ? "border-red-500/30 bg-red-500/10 text-red-400"
            : "border-amber-500/30 bg-amber-500/10 text-amber-300"
        }`}
      >
        {hasToken
          ? "This verification link is invalid or has expired."
          : "Check your inbox — we sent you a verification link. If you haven't received one, request a fresh link below."}
      </p>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="mb-2 text-sm text-[var(--text-muted)]">
          {hasToken ? "Resend a fresh link:" : "Resend the link to:"}
        </p>
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
                if (r.autoVerified) {
                  // No email transport installed — the account was verified
                  // immediately, so drop them into the product.
                  setResendNote("No email service is configured, so your account was verified automatically.")
                  setAutoVerified(true)
                } else if (r.devLink) {
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

      <button
        type="button"
        onClick={() => void logout()}
        className="mx-auto block text-center text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        Use a different account — log out
      </button>
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
