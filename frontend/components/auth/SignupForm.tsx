"use client"

import { useMemo, useState, type FormEvent } from "react"
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Mail, Rocket, UserRound } from "lucide-react"
import { AuthField } from "./AuthField"
import type { FocusField } from "./auth-state"

export type SignupValues = { name: string; email: string; password: string }

const STRENGTH_LABEL = ["Too weak", "Too weak", "Getting there", "Good", "Excellent"]

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
  onBack,
  onTyping,
  onStrengthChange,
}: {
  onSubmit: (values: SignupValues) => Promise<void>
  busy: boolean
  error: string | null
  onFocusChange: (field: FocusField) => void
  onClearError: () => void
  onBack: () => void
  onTyping?: () => void
  onStrengthChange?: (strength: number) => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string
    email?: string
    password?: string
    confirm?: string
  }>({})

  const strength = useMemo(() => passwordStrength(password), [password])

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
    if (busy) return
    if (!validate()) return
    void onSubmit({ name: name.trim(), email: email.trim(), password })
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:gap-4" noValidate>
      <AuthField
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
        leftIcon={<UserRound className="h-4.5 w-4.5" aria-hidden="true" />}
      />
      <AuthField
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
        leftIcon={<Mail className="h-4.5 w-4.5" aria-hidden="true" />}
      />
      <div>
        <AuthField
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
          onBlur={() => onFocusChange(null)}
          error={fieldErrors.password}
          autoComplete="new-password"
          placeholder="At least 8 characters"
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
              Strength: <span className="text-emerald-400">{STRENGTH_LABEL[strength]}</span>
            </p>
          </div>
        )}
      </div>
      <AuthField
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
        leftIcon={<KeyRound className="h-4.5 w-4.5" aria-hidden="true" />}
      />

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="btn-shine flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.25)] transition-all hover:shadow-[0_10px_32px_rgba(16,185,129,0.4)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-emerald-400/80 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {busy ? "Creating account..." : "Create account"}
        {!busy && <Rocket className="h-4 w-4" aria-hidden="true" />}
      </button>

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
