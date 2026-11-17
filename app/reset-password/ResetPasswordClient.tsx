"use client"

import { useState, type FormEvent, type KeyboardEvent } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, EyeSlash, Key } from "@phosphor-icons/react"
import { account } from "@/lib/services/api"
import { AuthShell } from "@/components/auth/AuthShell"
import { AuthField } from "@/components/auth/AuthField"
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton"
import { CapsLockWarning, readCapsLock } from "@/components/auth/CapsLockWarning"

type FieldErrors = { password?: string; confirm?: string; form?: string }

export default function ResetPasswordClient() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle")
  const [errors, setErrors] = useState<FieldErrors>({})

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next: FieldErrors = {}
    if (password.length < 8) next.password = "Password must be at least 8 characters."
    if (password !== confirm) next.confirm = "Passwords do not match."
    setErrors(next)
    if (Object.keys(next).length > 0) {
      setStatus("error")
      return
    }
    setStatus("saving")
    try {
      await account.resetPassword(token, password)
      setStatus("done")
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Something went wrong. Please try again." })
      setStatus("error")
    }
  }

  const onKeyUp = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(readCapsLock(e.nativeEvent))

  const eyeToggle = (visible: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
      className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-emerald-400/80"
    >
      {visible ? <EyeSlash className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
    </button>
  )

  // A reset link without its token is unusable — say so inside the same
  // shell as the rest of the recovery flow instead of rendering a bare
  // paragraph at the top-left of an unstyled page.
  if (!token) {
    return (
      <AuthShell
        eyebrow="Exam hall · Account recovery"
        title="This reset link is invalid"
        description="The link is missing its security token. Request a new one to continue."
      >
        <div className="space-y-3">
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            This reset link is missing its token. Request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="block w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            Request a new reset link
          </Link>
          <Link href="/login" className="block text-center text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Exam hall · Account recovery"
      title="Set a new password"
      description="Choose a new password for your 9Th-Grade AI account."
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3 sm:gap-4" noValidate>
        {errors.form ? (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errors.form}
          </p>
        ) : null}
        <AuthField
          id="password"
          label="New password"
          type={showPassword ? "text" : "password"}
          name="new-password"
          value={password}
          onChange={(v) => {
            setPassword(v)
            if (errors.password) setErrors((e) => ({ ...e, password: undefined }))
          }}
          onKeyUp={onKeyUp}
          error={errors.password}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          leftIcon={<Key className="h-4.5 w-4.5" aria-hidden="true" />}
          rightSlot={eyeToggle(showPassword, () => setShowPassword((s) => !s))}
        />
        <CapsLockWarning visible={capsLock} />
        <AuthField
          id="confirm"
          label="Confirm new password"
          type={showConfirm ? "text" : "password"}
          // Distinct name: Chrome ignores autocomplete="off" on password
          // fields, and a duplicate name lets a password manager autofill the
          // confirm box with a generated password, producing a bogus
          // "passwords do not match" error.
          name="confirm-password"
          value={confirm}
          onChange={(v) => {
            setConfirm(v)
            if (errors.confirm) setErrors((e) => ({ ...e, confirm: undefined }))
          }}
          onKeyUp={onKeyUp}
          error={errors.confirm}
          autoComplete="new-password"
          placeholder="Repeat your password"
          leftIcon={<Key className="h-4.5 w-4.5" aria-hidden="true" />}
          rightSlot={eyeToggle(showConfirm, () => setShowConfirm((s) => !s))}
        />
        {status === "done" ? (
          <>
            <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              Password updated. You can sign in with your new password.
            </p>
            <button type="button" onClick={() => router.push("/login")} className="block w-full text-center text-sm font-medium text-emerald-400/80 transition-colors hover:text-emerald-400">
              Continue to sign in
            </button>
          </>
        ) : (
          <AuthSubmitButton busy={status === "saving"} busyLabel="Updating…">Update password</AuthSubmitButton>
        )}
      </form>
    </AuthShell>
  )
}
