"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from "lucide-react"
import { AuthField } from "./AuthField"
import { AuthSubmitButton } from "./AuthSubmitButton"
import { CapsLockWarning, readCapsLock } from "./CapsLockWarning"
import type { FocusField } from "./auth-state"

export type LoginValues = { email: string; password: string; remember: boolean }

export function LoginForm({
  onSubmit,
  busy,
  error,
  onFocusChange,
  onClearError,
  onBack,
  onTyping,
  failedAttempt = 0,
  lockoutUntil = null,
}: {
  onSubmit: (values: LoginValues) => Promise<void>
  busy: boolean
  error: string | null
  onFocusChange: (field: FocusField) => void
  onClearError: () => void
  onBack: () => void
  onTyping?: () => void
  /** Increments after each rejected submit — secrets are never preserved. */
  failedAttempt?: number
  /** Epoch ms until which submission is blocked (rate-limit backoff). */
  lockoutUntil?: number | null
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  // Privacy: after a rejected attempt the password is wiped; the email stays.
  // Render-phase reset (React's "adjust state on prop change" pattern).
  const [clearedAttempt, setClearedAttempt] = useState(failedAttempt)
  if (failedAttempt > clearedAttempt) {
    setClearedAttempt(failedAttempt)
    setPassword("")
  }

  // Rate-limit backoff countdown — ticks every 500ms while locked.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!lockoutUntil) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [lockoutUntil])
  const secondsLeft = lockoutUntil ? Math.max(0, Math.ceil((lockoutUntil - now) / 1000)) : 0
  const locked = secondsLeft > 0

  const validate = () => {
    const next: typeof fieldErrors = {}
    if (!email.trim()) next.email = "Email is required."
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "That doesn't look like a valid email."
    if (!password) next.password = "Password is required."
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy || locked) return
    if (!validate()) return
    void onSubmit({ email: email.trim(), password, remember })
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:gap-4" noValidate>
      <AuthField
        id="login-email"
        label="Email"
        type="email"
        name="email"
        value={email}
        onChange={(v) => {
          setEmail(v)
          setFieldErrors((f) => ({ ...f, email: undefined }))
          onClearError()
          onTyping?.()
        }}
        onFocus={() => onFocusChange("email")}
        onBlur={() => onFocusChange(null)}
        error={fieldErrors.email}
        autoComplete="email"
        placeholder="you@example.com"
        inputMode="email"
        leftIcon={<Mail className="h-4.5 w-4.5" aria-hidden="true" />}
      />
      <div>
        <AuthField
          id="login-password"
          label="Password"
          type={showPassword ? "text" : "password"}
          name="password"
          value={password}
          onChange={(v) => {
            setPassword(v)
            setFieldErrors((f) => ({ ...f, password: undefined }))
            onClearError()
            onTyping?.()
          }}
          onFocus={() => onFocusChange("password")}
          onBlur={() => {
            setCapsLock(false)
            onFocusChange(null)
          }}
          onKeyDown={(e) => setCapsLock(readCapsLock(e))}
          onKeyUp={(e) => setCapsLock(readCapsLock(e))}
          error={fieldErrors.password}
          autoComplete="current-password"
          placeholder="Your password"
          leftIcon={<KeyRound className="h-4.5 w-4.5" aria-hidden="true" />}
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-emerald-400/80"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          }
        />
        <CapsLockWarning visible={capsLock} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border-muted)] bg-transparent text-emerald-500 accent-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-400/80"
          />
          Stay signed in
        </label>
        <Link
          href="/forgot-password"
          className="text-sm text-emerald-400/80 transition-colors hover:text-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/80"
        >
          Forgot your password?
        </Link>
      </div>

      {error && (
        <p
          role="alert"
          id="auth-form-error"
          tabIndex={-1}
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 outline-none"
        >
          {error}
        </p>
      )}

      {locked && (
        <p
          role="alert"
          className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-center text-sm text-amber-300"
        >
          Too many attempts — try again in {secondsLeft}s.
        </p>
      )}

      <AuthSubmitButton
        busy={busy}
        disabled={locked}
        busyLabel="Signing in..."
        icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
      >
        Sign in securely
      </AuthSubmitButton>

      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="flex items-center gap-1 self-center text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-emerald-400/80"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back
      </button>
    </form>
  )
}
