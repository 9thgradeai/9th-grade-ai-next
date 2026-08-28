"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Eye, EyeOff, Rocket } from "lucide-react"
import { UnderlineField } from "./UnderlineField"
import { AuthSubmitButton } from "./AuthSubmitButton"
import { CapsLockWarning, readCapsLock } from "./CapsLockWarning"
import type { FocusField } from "./auth-state"

export type SignupValues = { name: string; email: string; password: string }

const STRENGTH_LABEL = [
  "Too weak",
  "Warming up",
  "Building momentum",
  "Exam-ready",
  "Fortress",
]

// Heuristic password strength 0-4; -1 when empty (no feedback yet).
export function passwordStrength(password: string): number {
  if (!password) return -1
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return Math.min(4, score)
}

const SEGMENT_COLORS = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-cyan-400"]

export function SignupForm({
  onSubmit,
  busy,
  error,
  onFocusChange,
  onClearError,
  onTyping,
  onStrengthChange,
  failedAttempt = 0,
  lockoutUntil = null,
}: {
  onSubmit: (values: SignupValues) => Promise<void>
  busy: boolean
  error: string | null
  onFocusChange: (field: FocusField) => void
  onClearError: () => void
  onTyping?: () => void
  onStrengthChange?: (strength: number) => void
  /** Increments after each rejected submit — secrets are never preserved. */
  failedAttempt?: number
  /** Epoch ms until which submission is blocked (rate-limit backoff). */
  lockoutUntil?: number | null
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string
    email?: string
    password?: string
    confirm?: string
  }>({})

  // Rate-limit backoff countdown — ticks every 500ms while locked.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!lockoutUntil) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [lockoutUntil])
  const secondsLeft = lockoutUntil ? Math.max(0, Math.ceil((lockoutUntil - now) / 1000)) : 0
  const locked = secondsLeft > 0

  const strength = useMemo(() => passwordStrength(password), [password])

  // Privacy: after a rejected attempt the secrets are wiped; name/email stay.
  // Render-phase reset (React's "adjust state on prop change" pattern).
  const [clearedAttempt, setClearedAttempt] = useState(failedAttempt)
  if (failedAttempt > clearedAttempt) {
    setClearedAttempt(failedAttempt)
    setPassword("")
    setConfirm("")
    onStrengthChange?.(-1)
  }

  const validate = () => {
    const next: typeof fieldErrors = {}
    if (!name.trim()) next.name = "What should we call you?"
    else if (name.trim().length < 2) next.name = "Name must be at least 2 characters."
    if (!email.trim()) next.email = "Email is required."
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "That doesn't look like a valid email."
    if (!password) next.password = "Create a password."
    else if (password.length < 8) next.password = "Password must be at least 8 characters."
    if (confirm !== password) next.confirm = "Passwords don't match."
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy || locked) return
    if (!validate()) return
    void onSubmit({ name: name.trim(), email: email.trim(), password })
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4 sm:gap-5" noValidate>
      <UnderlineField
        id="signup-name"
        label="Name"
        name="name"
        value={name}
        onChange={(v) => {
          setName(v)
          setFieldErrors((f) => ({ ...f, name: undefined }))
          onClearError()
          onTyping?.()
        }}
        onFocus={() => onFocusChange("name")}
        onBlur={() => onFocusChange(null)}
        error={fieldErrors.name}
        autoComplete="name"
        placeholder="Rahim Uddin"
      />
      <UnderlineField
        id="signup-email"
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
      />
      <div>
        <p className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-emerald-400/80">
          Form fill-up · Free forever · No card required
        </p>
        <UnderlineField
          id="signup-password"
          label="Password"
          type={showPassword ? "text" : "password"}
          name="new-password"
          value={password}
          onChange={(v) => {
            setPassword(v)
            setFieldErrors((f) => ({ ...f, password: undefined, confirm: undefined }))
            onClearError()
            onTyping?.()
            onStrengthChange?.(passwordStrength(v))
          }}
          onFocus={() => onFocusChange("password")}
          onBlur={() => {
            setCapsLock(false)
            onFocusChange(null)
          }}
          onKeyDown={(e) => setCapsLock(readCapsLock(e))}
          onKeyUp={(e) => setCapsLock(readCapsLock(e))}
          error={fieldErrors.password}
          autoComplete="new-password"
          placeholder="At least 8 characters"
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
        {strength >= 0 && (
          <div className="mt-2" aria-label={`Password strength: ${STRENGTH_LABEL[strength]}`}>
            <div className="flex gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    i < strength ? SEGMENT_COLORS[strength] : "bg-[var(--border-muted)]"
                  }`}
                />
              ))}
            </div>
            <p className="mt-1.5 text-xs font-medium text-[var(--text-muted)]">
              Preparation level: <span className="text-emerald-400">{STRENGTH_LABEL[strength]}</span>
            </p>
          </div>
        )}
        <CapsLockWarning visible={capsLock} />
      </div>
      <UnderlineField
        id="signup-confirm"
        label="Confirm password"
        type={showPassword ? "text" : "password"}
        name="new-password"
        value={confirm}
        onChange={(v) => {
          setConfirm(v)
          setFieldErrors((f) => ({ ...f, confirm: undefined }))
          onClearError()
          onTyping?.()
        }}
        onFocus={() => onFocusChange("confirm")}
        onBlur={() => onFocusChange(null)}
        error={fieldErrors.confirm}
        autoComplete="new-password"
        placeholder="Repeat your password"
      />

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
        busyLabel="Creating account..."
        icon={<Rocket className="h-4 w-4" aria-hidden="true" />}
      >
        Enter the hall
      </AuthSubmitButton>
    </form>
  )
}
