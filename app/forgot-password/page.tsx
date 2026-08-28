"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { Mail } from "lucide-react"
import { account } from "@/lib/services/api"
import { AuthShell } from "@/components/auth/AuthShell"
import { AuthField } from "@/components/auth/AuthField"
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [message, setMessage] = useState("")
  const [devLink, setDevLink] = useState<string | undefined>()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus("sending")
    setMessage("")
    setDevLink(undefined)
    try {
      const res = await account.forgotPassword(email)
      setDevLink(res.devLink)
      setStatus("sent")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setStatus("error")
    }
  }

  return (
    <AuthShell
      eyebrow="Exam hall · Account recovery"
      title="Reset your password"
      description="Enter the email on your account and we'll send a secure reset link."
    >
      {status === "sent" ? (
        <div className="space-y-3">
          <p
            role="status"
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
          >
            If an account exists for that email, a reset link is on its way.
          </p>
          {devLink && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              Dev mode (no email transport):{" "}
              <a href={devLink} className="underline break-all">
                {devLink}
              </a>
            </p>
          )}
          <Link
            href="/login"
            className="block text-center text-sm text-emerald-400/80 transition-colors hover:text-emerald-400"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3 sm:gap-4">
          {status === "error" && message && (
            <p
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            >
              {message}
            </p>
          )}
          <AuthField
            id="email"
            label="Email"
            type="email"
            name="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder="you@example.com"
            inputMode="email"
            leftIcon={<Mail className="h-4.5 w-4.5" aria-hidden="true" />}
          />
          <AuthSubmitButton busy={status === "sending"} busyLabel="Sending…">
            Send reset link
          </AuthSubmitButton>
          <Link
            href="/login"
            className="block text-center text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
          >
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  )
}
