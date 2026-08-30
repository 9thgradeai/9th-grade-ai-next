"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion"
import { ArrowRight, MoonStar, ShieldCheck, Sun } from "lucide-react"
import { useAuth } from "@/lib/auth-ctx"
import { account as accountApi } from "@/lib/services/api"
import { AuthEnvironment } from "./AuthEnvironment"
import { Lamp } from "./Lamp"
import { Avatar } from "./Avatar"
import { AuthMessage } from "./AuthMessage"
import { AuthChoice } from "./AuthChoice"
import { Celebration } from "./Celebration"
import { AdmitCard, deriveDisplayName } from "./AdmitCard"
import { VerificationSequence } from "./ceremony/VerificationSequence"
import { EnterHallTransition } from "./ceremony/EnterHallTransition"
import BrandMark from "@/components/ui/BrandMark"
import { LoginForm, type LoginValues } from "./LoginForm"
import { SignupForm, type SignupValues } from "./SignupForm"
import { resolveScene } from "./animation/AnimationDirector"
import {
  getAvatarMessage,
  getAvatarState,
  type AuthStage,
  type AuthSuccessKind,
  type FocusField,
} from "./auth-state"

export default function AuthExperience({
  initialStage = null,
  initialError = null,
}: {
  initialStage?: "login" | "signup" | null
  initialError?: string | null
}) {
  // Translate OAuth error flags from the callback redirect into a friendly,
  // non-leaky message. Google's raw error names are normalized server-side to
  // `google_*` flags; anything unknown falls back to a generic line.
  function googleErrorMessage(flag: string): string {
    const messages: Record<string, string> = {
      google_unavailable: "Google sign-in isn't available right now. Please use your email and password.",
      google_rate_limited: "Too many Google sign-in attempts. Please wait a moment and try again.",
      google_state_missing: "Your Google sign-in session expired. Please try again.",
      google_state_mismatch: "Google sign-in was blocked for security. Please try again.",
      google_invalid: "Google sign-in didn't complete. Please try again.",
      google_failed: "We couldn't sign you in with Google. Please try again or use your password.",
      apple_unavailable: "Apple sign-in isn't available right now. Please use your email and password.",
      apple_rate_limited: "Too many Apple sign-in attempts. Please wait a moment and try again.",
      apple_state_missing: "Your Apple sign-in session expired. Please try again.",
      apple_state_mismatch: "Apple sign-in was blocked for security. Please try again.",
      apple_invalid: "Apple sign-in didn't complete. Please try again.",
      apple_failed: "We couldn't sign you in with Apple. Please try again or use your password.",
    }
    if (flag.startsWith("google_") || flag.startsWith("apple_") || flag === "google_access_denied") {
      return messages[flag] ?? messages.google_failed
    }
    return messages.google_failed
  }

  const router = useRouter()
  const { login, register, logout, user, isLoading } = useAuth()
  const reduced = useReducedMotion() ?? false
  const shake = useAnimationControls()

  const [stage, setStage] = useState<AuthStage>("lamp")
  const [lit, setLit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError ? googleErrorMessage(initialError) : null)
  const [focusField, setFocusField] = useState<FocusField>(null)
  const [successKind, setSuccessKind] = useState<AuthSuccessKind>("login")
  const [strength, setStrength] = useState(-1)
  const [tick, setTick] = useState(0)
  const [departing, setDeparting] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  // Account details captured at submit time so the admit card can greet the
  // user by name even before /api/auth/me round-trips.
  const [account, setAccount] = useState<{ name: string; email: string } | null>(null)
  // Set when a request is rate-limited (429); the form shows a live countdown
  // and blocks resubmission until it elapses.
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null)

  const pendingStage = useRef<AuthStage | null>(initialStage)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    },
    []
  )

  // Redirect already-authenticated AND email-verified visitors straight to the
  // hall — the entry ceremony is only for people who still need to sign in.
  // Unverified accounts are deliberately NOT redirected away: doing so created
  // a redirect loop (/login -> /dashboard -> /verify-email -> /login) that
  // made it impossible to reach the sign-in form or log out. An unverified
  // user lands on the form surrounded by a banner with logout + verify links.
  useEffect(() => {
    if (isLoading || !user) return
    if (user.emailVerified && (stage === "lamp" || stage === "choice")) {
      router.replace("/dashboard")
    }
  }, [user, isLoading, stage, router])

  // Capture the email so an unverified session can be identified / re-verified.
  const unverifiedEmail = user && !user.emailVerified ? user.email : null

  // Skip the lamp ("pull the cord") for returning visitors and on very small
  // viewports where the staged reveal crowds the form. We still set the
  // "seen" flag so the lamp only appears on a visitor's very first arrival.
  useEffect(() => {
    if (typeof window === "undefined") return
    let seen = false
    try {
      seen = window.localStorage.getItem("unit9-seen") === "1"
    } catch {
      seen = false
    }
    const small = window.innerWidth < 380
    try {
      window.localStorage.setItem("unit9-seen", "1")
    } catch {
      /* ignore */
    }
    if (seen || small) {
      const id = window.setTimeout(() => {
        setLit(true)
        setStage(pendingStage.current ?? "choice")
      }, 0)
      return () => window.clearTimeout(id)
    }
  }, [])

  const avatar = useMemo(
    () => getAvatarState({ stage, lit, busy, error, focusField, successKind, strength }),
    [stage, lit, busy, error, focusField, successKind, strength]
  )
  const message = getAvatarMessage(avatar, stage)

  // ── Animation Director: one derivation drives environment + Unit-9 ──
  const scene = useMemo(
    () =>
      resolveScene({
        stage,
        lit,
        busy,
        error: error !== null,
        hasFieldFocus: focusField !== null,
        passwordFocused: focusField === "password" || focusField === "confirm",
        departing,
      }),
    [stage, lit, busy, error, focusField, departing]
  )

  const activate = useCallback(() => {
    if (lit) return
    setLit(true)
    const wait = reduced ? 140 : 720
    window.setTimeout(() => setStage(pendingStage.current ?? "choice"), wait)
  }, [lit, reduced])

  // Quiet mode: environment recedes as the user engages with the form
  const quietLevel: 0 | 1 | 2 | 3 = useMemo(() => {
    if (stage === "choice" || stage === "lamp") return 0
    if (focusField === "password" || focusField === "confirm") return 3
    if (focusField !== null) return 2
    return 1
  }, [stage, focusField])

  const handleFocusChange = useCallback((field: FocusField) => {
    setFocusField(field)
    setError(null)
  }, [])

  const handleClearError = useCallback(() => setError(null), [])

  const choose = useCallback((kind: "login" | "signup") => {
    setError(null)
    setFocusField(null)
    setStrength(-1)
    setStage(kind)
  }, [])

  // Verification ceremony dwell after the API has already resolved.
  const scheduleAdmitCard = useCallback(() => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current)
    redirectTimer.current = setTimeout(() => setStage("success"), reduced ? 400 : 1150)
  }, [reduced])

  // "Enter the hall": short departure transition, then navigation. New
  // signups land on the onboarding step; returning users go straight in.
  const continueNow = useCallback(() => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current)
    setDeparting(true)
    const target = successKind === "signup" ? "/onboarding" : "/dashboard"
    redirectTimer.current = setTimeout(() => router.push(target), reduced ? 300 : 900)
  }, [router, reduced, successKind])

  // Normalize an auth error into a friendly message + machine code (the code
  // drives the rate-limit countdown UI).
  const describeError = useCallback((err: unknown): { message: string; code?: string } => {
    const message = err instanceof Error ? err.message : "Something went wrong. Please try again."
    const code = (err as { code?: string } | null)?.code
    return { message, code }
  }, [])

  const handleLogin = useCallback(
    async (values: LoginValues) => {
      setError(null)
      setLockoutUntil(null)
      setBusy(true)
      try {
        await login(values.email, values.password, { redirect: false, remember: values.remember })
        setAccount({ name: deriveDisplayName(values.email), email: values.email })
        setSuccessKind("login")
        // Skip verification ceremony on login — go straight to admit card
        setStage("success")
      } catch (err) {
        const { message, code } = describeError(err)
        setError(message)
        setFailedAttempts((n) => n + 1)
        if (code === "RATE_LIMIT_EXCEEDED") setLockoutUntil(Date.now() + 60_000)
        if (!reduced) {
          void shake.start({
            x: [0, -8, 8, -6, 6, 0],
            transition: { duration: 0.45, ease: "easeInOut" },
          })
        }
      } finally {
        setBusy(false)
      }
    },
    [login, reduced, shake, describeError]
  )

  const handleSignup = useCallback(
    async (values: SignupValues) => {
      setError(null)
      setLockoutUntil(null)
      setBusy(true)
      try {
        await register(values.name, values.email, values.password, { redirect: false })
        setAccount({ name: values.name, email: values.email })
        setSuccessKind("signup")
        setStage("verify")
        scheduleAdmitCard()
      } catch (err) {
        const { message, code } = describeError(err)
        setError(message)
        setFailedAttempts((n) => n + 1)
        if (code === "RATE_LIMIT_EXCEEDED") setLockoutUntil(Date.now() + 60_000)
        if (!reduced) {
          void shake.start({
            x: [0, -8, 8, -6, 6, 0],
            transition: { duration: 0.45, ease: "easeInOut" },
          })
        }
      } finally {
        setBusy(false)
      }
    },
    [register, scheduleAdmitCard, reduced, shake, describeError]
  )

  // One-tap demo: drop the visitor straight into the sample account so they can
  // explore the product without filling the form.
  const handleDemo = useCallback(
    async () => {
      setError(null)
      setLockoutUntil(null)
      setBusy(true)
      try {
        await login("demo@9thgrade.ai", "demo12345", { redirect: false })
        // The demo account maps to a real row in the DB which may be unverified
        // on long-lived deployments. Best-effort auto-verify so the dashboard
        // gate can't bounce the demo user back to /verify-email.
        await accountApi.resendVerification("demo@9thgrade.ai").catch(() => {})
        setAccount({ name: "Demo Examinee", email: "demo@9thgrade.ai" })
        setSuccessKind("login")
        // Skip verification ceremony on demo — go straight to admit card
        setStage("success")
      } catch (err) {
        const { message } = describeError(err)
        setError(message)
      } finally {
        setBusy(false)
      }
    },
    [login, describeError]
  )

  // Move focus into the first field once a form appears (wizard-style).
  useEffect(() => {
    if (stage !== "login" && stage !== "signup") return
    const id = stage === "login" ? "login-email" : "signup-name"
    const t = window.setTimeout(
      () => document.getElementById(id)?.focus({ preventScroll: true }),
      260
    )
    return () => window.clearTimeout(t)
  }, [stage])

  // On a failed submit, move focus to the form-level error so screen-reader
  // and keyboard users land on the explanation instead of the submit button.
  useEffect(() => {
    if (!error || (stage !== "login" && stage !== "signup")) return
    document.getElementById("auth-form-error")?.focus({ preventScroll: true })
  }, [error, stage])

  // Avatar column — sits centered pre-light (hidden), then drops in once the
  // lamp is turned on. Mobile stacks it above the content (vertical flow);
  // desktop places it to the LEFT of the content (split layout).
  const avatarColumn = (
    <motion.div
      key="avatar"
      layout
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative flex shrink-0 flex-col items-center justify-center gap-2 max-[380px]:hidden sm:gap-2.5"
    >
       <Avatar mood={avatar} focusField={focusField} tick={tick} compact behavior={scene.unit9} />
       <Celebration active={stage === "success"} />
       <div role="status" aria-live="polite">
         <AuthMessage message={message} />
       </div>
    </motion.div>
  )

  // Content column — starts centered with the lamp, then opens with a subtle
  // slide as each step (choice / login / signup / success) mounts. It may
  // scroll internally on small screens so the page itself never scrolls.
  const contentColumn = (
    <motion.div
      layout
      className="flex min-h-0 w-full max-w-md flex-1 flex-col items-center overflow-y-auto"
    >
      <div className="my-auto flex w-full flex-col items-center justify-center">
      {stage === "lamp" && (
        <div className="flex w-full flex-col items-center gap-4 sm:gap-5">
          {/* The dark scene — dissolves as the room fills with light */}
          <AnimatePresence>
            {!lit && (
              <motion.div
                key="dark-scene"
                className="flex w-full flex-col items-center gap-3 sm:gap-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.45 }}
              >
                <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-emerald-400/70">
                  <MoonStar className="h-3.5 w-3.5" aria-hidden="true" />
                  Study hour · <LocalTime />
                </p>
                <p className="max-w-xs text-center font-display text-xl leading-snug text-zinc-300 sm:max-w-sm sm:text-2xl">
                  Your exam won&rsquo;t wait.
                  <span className="mt-1 block text-base font-normal text-[var(--text-muted)] sm:text-lg">
                    Neither should your preparation.
                  </span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Unit-9 waits in the darkness — two LEDs and an antenna tip */}
          <AnimatePresence>
            {!lit && (
              <motion.div
                key="dark-unit9"
                aria-hidden="true"
                className="flex flex-col items-center gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.4 }}
              >
                <span className="h-3 w-px bg-emerald-400/25" />
                <div className="flex items-center gap-2.5">
                  <motion.span
                    className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.95)]"
                    animate={reduced ? undefined : { opacity: [0.85, 0.2, 0.85] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <motion.span
                    className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.95)]"
                    animate={reduced ? undefined : { opacity: [0.2, 0.85, 0.2] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Lamp lit={lit} interactive onActivate={activate} />

          {!lit && (
            <motion.div
              key="turn-on"
              className="flex w-full flex-col items-center gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <button
                type="button"
                onClick={activate}
                className="group flex items-center gap-2.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-6 py-3 text-sm font-semibold text-emerald-400 transition-all hover:border-emerald-400/70 hover:bg-emerald-500/20 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-emerald-400/80"
              >
                <Sun className="h-4 w-4" aria-hidden="true" />
                Turn on the light
              </button>
              <p className="text-center text-xs text-[var(--text-muted)]">
                Pull the cord — your desk is ready, a million questions are waiting.
              </p>
            </motion.div>
          )}
        </div>
      )}

      {stage === "choice" && (
        <>
          {error && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-center text-sm text-red-300"
            >
              {error}
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-2 text-red-300/70 underline-offset-2 hover:underline"
              >
                Dismiss
              </button>
            </motion.div>
          )}
          <AuthChoice key="choice" onChoose={choose} onDemo={() => void handleDemo()} busy={busy} />
        </>
      )}

      {stage === "login" && (
        <motion.div
          key="login"
          className="glass-card relative isolate w-full overflow-hidden rounded-2xl border border-white/10 p-5 shadow-panel sm:p-7"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="relative z-10">
            <CardHeader serial="FORM 9G-A1" />
            <motion.div className="w-full" animate={shake}>
              <LoginForm
                onSubmit={handleLogin}
                busy={busy}
                error={error}
                onFocusChange={handleFocusChange}
                onClearError={handleClearError}
                onTyping={() => {
                  setTick((t) => t + 1)
                  setLockoutUntil(null)
                }}
                failedAttempt={failedAttempts}
                lockoutUntil={lockoutUntil}
              />
            </motion.div>
          </div>
        </motion.div>
      )}

      {stage === "signup" && (
        <motion.div
          key="signup"
          className="glass-card relative isolate w-full overflow-hidden rounded-2xl border border-white/10 p-5 shadow-panel sm:p-7"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="relative z-10">
            <CardHeader serial="FORM 9G-B7" />
            <motion.div className="w-full" animate={shake}>
              <SignupForm
                onSubmit={handleSignup}
                busy={busy}
                error={error}
                onFocusChange={handleFocusChange}
                onClearError={handleClearError}
                onTyping={() => {
                  setTick((t) => t + 1)
                  setLockoutUntil(null)
                }}
                onStrengthChange={setStrength}
                failedAttempt={failedAttempts}
                lockoutUntil={lockoutUntil}
              />
            </motion.div>
          </div>
        </motion.div>
      )}

      {stage === "verify" && (
        <motion.div
          key="verify"
          className="w-full"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <VerificationSequence kind={successKind} onComplete={() => setStage("success")} />
        </motion.div>
      )}

      {stage === "success" && (
        <motion.div
          key="success"
          className="flex w-full flex-col items-center gap-4 text-center"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <AdmitCard
            name={account?.name ?? deriveDisplayName(account?.email ?? "")}
            email={account?.email ?? ""}
            kind={successKind}
          />
          <div>
            <p className="font-display text-2xl font-semibold text-[var(--foreground)]">
              {successKind === "signup" ? "Your seat is reserved." : "Welcome back, examinee."}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {successKind === "signup"
                ? "Your preparation starts the moment you step in."
                : "The hall kept your place — let's keep going."}
            </p>
          </div>
          <button
            type="button"
            onClick={continueNow}
            className="btn-shine flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.3)] transition-all hover:shadow-[0_10px_32px_rgba(16,185,129,0.45)] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-emerald-400/80"
          >
            Enter the hall
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </motion.div>
      )}
      </div>
    </motion.div>
  )

  return (
    <AuthEnvironment state={scene.environment} quietLevel={quietLevel}>
      <motion.div
        className="relative z-10 flex h-dvh flex-col overflow-hidden"
      >
        <header className="flex items-center justify-between px-5 pt-3 sm:px-8 sm:pt-5">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-display text-[15px] font-semibold text-[var(--foreground)] transition-opacity hover:opacity-85"
          >
            <BrandMark className="h-7 w-7 rounded-lg shadow-[0_0_18px_rgba(16,185,129,0.35)]" />
            9Th-Grade AI
          </Link>
        </header>

        <main className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 self-center overflow-hidden px-4 pb-4 pt-1 sm:gap-5 sm:px-6 sm:pb-6 sm:pt-3">
          {/* Unverified session: don't silently redirect into a loop. Surface a
              clear banner so the user can verify, log out, or switch accounts. */}
          {unverifiedEmail && (
            <div className="flex w-full max-w-4xl flex-col items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center sm:flex-row sm:justify-between sm:text-left">
              <p className="text-sm text-amber-200">
                <span className="font-semibold">Your account needs email verification.</span>{" "}
                <span className="text-amber-200/80">Verify to unlock the dashboard.</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                  className="rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-400"
                >
                  Verify email
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-white/40 hover:text-white"
                >
                  Log out
                </button>
              </div>
            </div>
          )}

          {/* Avatar + content: vertical on mobile, split left/right on md+ */}
          <div className="flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 md:flex-row md:gap-8 lg:gap-10">
            <AnimatePresence>{lit && avatarColumn}</AnimatePresence>
            {contentColumn}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Secure session · Your password never leaves this page unhashed
          </p>
        </main>
      </motion.div>
      {departing && (
        <EnterHallTransition
          onNavigate={() => {
            router.push(successKind === "signup" ? "/onboarding" : "/dashboard")
          }}
        />
      )}
    </AuthEnvironment>
  )
}

/**
 * Live local time for the midnight-study scene. Renders a stable placeholder
 * on the server and first paint, then ticks every 15s — hydration-safe.
 */
function LocalTime() {
  const [time, setTime] = useState<string | null>(null)

  useEffect(() => {
    const update = () =>
      setTime(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      )
    update()
    const id = window.setInterval(update, 15000)
    return () => window.clearInterval(id)
  }, [])

  return <span className="tabular-nums">{time ?? "--:--"}</span>
}

/** "Entry pass" header strip — serial + live status dot. */
function CardHeader({ serial }: { serial: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--foreground)]">
          ENTRY PASS
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {serial}
        </span>
      </div>
      <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-[var(--border-muted)] to-transparent" />
    </div>
  )
}