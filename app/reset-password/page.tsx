"use client"

import { Suspense, useState, type FormEvent } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Eye, EyeOff, KeyRound } from "lucide-react"
import { account } from "@/lib/services/api"
import { AuthShell } from "@/components/auth/AuthShell"
import { AuthField } from "@/components/auth/AuthField"
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton"

function ResetPasswordInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle")
  const [message, setMessage] = useState("")

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage("")
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.")
      setStatus("error")
      return
    }
    if (password !== confirm) {
      setMessage("Passwords do not match.")
      setStatus("error")
      return
    }
    setStatus("saving")
    try {
      await account.resetPassword(token, password)
      setStatus("done")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setStatus("error")
    }
  }

  if (!token) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
      >
        This reset link is missing its token. Request a new one.
      </p>
    )
  }

  const eyeToggle = (
    <button
      type="button"
      onClick={() => setShow((s) => !s)}
      aria-label={show ? "Hide password" : "Show password"}
      className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-emerald-400/80"
    >
      {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
    </button>
  )

  return (
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
        id="password"
        label="New password"
        type={show ? "text" : "password"}
        name="new-password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        placeholder="At least 8 characters"
        leftIcon={<KeyRound className="h-4.5 w-4.5" aria-hidden="true" />}
        rightSlot={eyeToggle}
      />
      <AuthField
        id="confirm"
        label="Confirm new password"
        type={show ? "text" : "password"}
        name="new-password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        placeholder="Repeat your password"
        leftIcon={<KeyRound className="h-4.5 w-4.5" aria-hidden="true" />}
      />
      {status === "done" ? (
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="block w-full text-center text-sm font-medium text-emerald-400/80 transition-colors hover:text-emerald-400"
        >
          Password updated — continue to sign in
        </button>
      ) : (
        <AuthSubmitButton busy={status === "saving"} busyLabel="Updating…">
          Update password
        </AuthSubmitButton>
      )}
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Exam hall · New credentials"
      title="Choose a new password"
      description="Pick a strong password for your account."
    >
      <Suspense fallback={<p className="text-sm text-[var(--text-muted)]">Loading…</p>}>
        <ResetPasswordInner />
      </Suspense>
    </AuthShell>
  )
}
