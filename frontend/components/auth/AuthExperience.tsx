"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion"
import { ArrowRight, MoonStar, ShieldCheck, Sun } from "lucide-react"
import { useAuth } from "@/lib/auth-ctx"
import { AuthEnvironment } from "./AuthEnvironment"
import { Lamp } from "./Lamp"
import { Avatar } from "./Avatar"
import { AuthMessage } from "./AuthMessage"
import { AuthChoice } from "./AuthChoice"
import { Celebration } from "./Celebration"
import { AdmitCard, deriveDisplayName } from "./AdmitCard"
import BrandMark from "@/components/ui/BrandMark"
import { LoginForm, type LoginValues } from "./LoginForm"
import { SignupForm, type SignupValues } from "./SignupForm"
import {
  getAvatarMessage,
  getAvatarState,
  type AuthStage,
  type AuthSuccessKind,
  type FocusField,
} from "./auth-state"

export default function AuthExperience({
  initialStage = null,
}: {
  initialStage?: "login" | "signup" | null
}) {
  const router = useRouter()
  const { login, register } = useAuth()
  const reduced = useReducedMotion() ?? false
  const shake = useAnimationControls()

  const [stage, setStage] = useState<AuthStage>("lamp")
  const [lit, setLit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusField, setFocusField] = useState<FocusField>(null)
  const [successKind, setSuccessKind] = useState<AuthSuccessKind>("login")
  const [strength, setStrength] = useState(-1)
  const [tick, setTick] = useState(0)
  // Account details captured at submit time so the admit card can greet the
  // user by name even before /api/auth/me round-trips.
  const [account, setAccount] = useState<{ name: string; email: string } | null>(null)

  const pendingStage = useRef<AuthStage | null>(initialStage)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    },
    []
  )

  const avatar = useMemo(
    () => getAvatarState({ stage, lit, busy, error, focusField, successKind, strength }),
    [stage, lit, busy, error, focusField, successKind, strength]
  )
  const message = getAvatarMessage(avatar, stage)

  const activate = useCallback(() => {
    if (lit) return
    setLit(true)
    const wait = reduced ? 140 : 720
    window.setTimeout(() => setStage(pendingStage.current ?? "choice"), wait)
  }, [lit, reduced])

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

  const goBack = useCallback(() => {
    setError(null)
    setFocusField(null)
    setStrength(-1)
    setStage("choice")
  }, [])

  const scheduleRedirect = useCallback(() => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current)
    const wait = reduced ? 320 : 1100
    redirectTimer.current = setTimeout(() => router.push("/dashboard"), wait)
  }, [router, reduced])

  const handleLogin = useCallback(
    async (values: LoginValues) => {
      setError(null)
      setBusy(true)
      try {
        await login(values.email, values.password, { redirect: false })
        setAccount({ name: deriveDisplayName(values.email), email: values.email })
        setSuccessKind("login")
        setStage("success")
        scheduleRedirect()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
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
    [login, scheduleRedirect, reduced, shake]
  )

  const handleSignup = useCallback(
    async (values: SignupValues) => {
      setError(null)
      setBusy(true)
      try {
        await register(values.name, values.email, values.password, { redirect: false })
        setAccount({ name: values.name, email: values.email })
        setSuccessKind("signup")
        setStage("success")
        scheduleRedirect()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
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
    [register, scheduleRedirect, reduced, shake]
  )

  const continueNow = useCallback(() => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current)
    router.push("/dashboard")
  }, [router])

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
      className="relative flex shrink-0 flex-col items-center justify-center gap-2 sm:gap-2.5"
    >
      <Avatar mood={avatar} focusField={focusField} tick={tick} compact />
      <Celebration active={stage === "success"} />
      <AuthMessage message={message} />
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

      {stage === "choice" && <AuthChoice key="choice" onChoose={choose} />}

      {stage === "login" && (
        <motion.div
          key="login"
          className="w-full"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <motion.div className="w-full" animate={shake}>
            <LoginForm
              onSubmit={handleLogin}
              busy={busy}
              error={error}
              onFocusChange={handleFocusChange}
              onClearError={handleClearError}
              onBack={goBack}
              onTyping={() => setTick((t) => t + 1)}
            />
          </motion.div>
        </motion.div>
      )}

      {stage === "signup" && (
        <motion.div
          key="signup"
          className="w-full"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <motion.div className="w-full" animate={shake}>
            <SignupForm
              onSubmit={handleSignup}
              busy={busy}
              error={error}
              onFocusChange={handleFocusChange}
              onClearError={handleClearError}
              onBack={goBack}
              onTyping={() => setTick((t) => t + 1)}
              onStrengthChange={setStrength}
            />
          </motion.div>
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
    <AuthEnvironment lit={lit}>
      <div className="relative z-10 flex h-dvh flex-col overflow-hidden">
        <header className="flex items-center justify-between px-5 pt-3 sm:px-8 sm:pt-5">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-display text-[15px] font-semibold text-[var(--foreground)] transition-opacity hover:opacity-85"
          >
            <BrandMark className="h-7 w-7 rounded-lg shadow-[0_0_18px_rgba(16,185,129,0.35)]" />
            9Th-Grade AI
          </Link>
          <Link
            href="/"
            className="rounded-lg px-2 py-1 text-sm text-[var(--text-muted)] transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400/80"
          >
            Back to home
          </Link>
        </header>

        <main className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 self-center overflow-hidden px-4 pb-4 pt-1 sm:gap-5 sm:px-6 sm:pb-6 sm:pt-3">
          {/* Futuristic eyebrow label */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: lit ? 1 : 0, y: lit ? 0 : -8 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            aria-hidden="true"
            className="hidden items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em] text-emerald-400/80 sm:flex"
          >
            <span className="h-px w-6 bg-emerald-400/40" />
            Exam hall — secure entry
            <span className="h-px w-6 bg-emerald-400/40" />
          </motion.div>

          {/* Avatar + content: vertical on mobile, split left/right on md+ */}
          <div className="flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 md:flex-row md:gap-8 lg:gap-10">
            <AnimatePresence>{lit && avatarColumn}</AnimatePresence>
            {contentColumn}
          </div>

          {/* Wizard stage indicator */}
          <div
            aria-hidden="true"
            className="hidden items-center gap-2 pt-1 sm:flex"
            style={{ opacity: lit ? 1 : 0 }}
          >
            {["lamp", "choice", "form", "success"].map((s, i) => {
              const idx = indexOfStage(stage)
              const active =
                (i === 0 && idx === 0) ||
                (i === 1 && (idx === 1 || idx === 2)) ||
                (i === 2 && idx === 2) ||
                (i === 3 && idx === 3)
              const done = i < idx
              return (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && (
                    <div
                      className={`h-px w-5 transition-colors duration-300 ${done ? "bg-emerald-400/70" : "bg-[var(--border-muted)]"}`}
                    />
                  )}
                  <motion.div
                    initial={false}
                    animate={{ scale: active ? 1.4 : 1, opacity: done || active ? 1 : 0.35 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className={`h-1.5 w-1.5 rounded-full ${active || done ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-[var(--text-muted)]"}`}
                  />
                </div>
              )
            })}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Secure session · Your password never leaves this page unhashed
          </p>
        </main>
      </div>
    </AuthEnvironment>
  )
}

function indexOfStage(stage: AuthStage): number {
  if (stage === "lamp") return 0
  if (stage === "choice") return 1
  if (stage === "login" || stage === "signup") return 2
  return 3
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