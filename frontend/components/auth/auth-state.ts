// Centralized authentication experience state machine.
// The whole flow is driven by a single explicit stage — there are no free-floating
// booleans that can contradict each other. The avatar's expression/text/animation
// are derived from that stage plus transient signals (busy / error / focus).
//
// Copy voice: the product frames sign-in/sign-up as entering the exam hall —
// aspirants know this ritual intimately, so the journey borrows it.

export type AuthStage = "lamp" | "choice" | "login" | "signup" | "verify" | "success"

export type AuthSuccessKind = "login" | "signup"

export type FocusField = "name" | "email" | "password" | "confirm" | null

// The avatar companion — expression + copy are mapped below, never scattered
// across components.
export type AuthAvatarState =
  | "hidden"
  | "welcoming"
  | "asking"
  | "login"
  | "signup"
  | "focused"
  | "weak"
  | "moderate"
  | "strong"
  | "excellent"
  | "loading"
  | "success"
  | "celebrating"
  | "goodbye"
  | "error"

export type EyeKind = "open" | "happy" | "closed" | "lid"
export type MouthKind = "smile" | "wide" | "small" | "flat" | "open" | "frown"
export type BrowKind = "calm" | "curious" | "concerned"
export type Gaze = "left" | "right" | "up" | "down"

export type AvatarExpression = {
  eyes: EyeKind
  mouth: MouthKind
  brows: BrowKind
  blush: boolean
  gaze?: Gaze
}

export type AvatarConfig = {
  expression: AvatarExpression
  message: string
  sparkle: boolean
  wave?: boolean
  headTilt?: number
}

export const avatarStates: Record<AuthAvatarState, AvatarConfig> = {
  hidden: {
    expression: { eyes: "closed", mouth: "flat", brows: "calm", blush: false },
    message: "",
    sparkle: false,
    headTilt: 6,
  },
  welcoming: {
    expression: { eyes: "happy", mouth: "wide", brows: "calm", blush: true },
    message: "The hall is open. Ready when you are.",
    sparkle: false,
    headTilt: -3,
  },
  asking: {
    expression: { eyes: "open", mouth: "small", brows: "curious", blush: false },
    message: "First attempt here, or returning examinee?",
    sparkle: false,
    headTilt: 4,
  },
  login: {
    expression: { eyes: "open", mouth: "smile", brows: "calm", blush: false },
    message: "Show me your admit card.",
    sparkle: false,
    headTilt: 0,
  },
  signup: {
    expression: { eyes: "open", mouth: "smile", brows: "curious", blush: false },
    message: "Form fill-up — takes under a minute.",
    sparkle: false,
    headTilt: 2,
  },
  focused: {
    expression: { eyes: "lid", mouth: "small", brows: "calm", blush: false },
    message: "",
    sparkle: false,
  },
  weak: {
    expression: { eyes: "open", mouth: "flat", brows: "concerned", blush: false, gaze: "down" },
    message: "Hmm — that password needs a little more.",
    sparkle: false,
    headTilt: -4,
  },
  moderate: {
    expression: { eyes: "open", mouth: "small", brows: "curious", blush: false, gaze: "down" },
    message: "Getting there — keep going.",
    sparkle: false,
    headTilt: 1,
  },
  strong: {
    expression: { eyes: "open", mouth: "smile", brows: "calm", blush: false, gaze: "down" },
    message: "Now that's more like it.",
    sparkle: false,
    headTilt: 0,
  },
  excellent: {
    expression: { eyes: "happy", mouth: "wide", brows: "calm", blush: true, gaze: "down" },
    message: "Excellent — a fortress of a password.",
    sparkle: true,
    headTilt: -2,
  },
  loading: {
    expression: { eyes: "open", mouth: "open", brows: "curious", blush: false, gaze: "up" },
    message: "Checking the register...",
    sparkle: false,
    headTilt: -3,
  },
  success: {
    expression: { eyes: "happy", mouth: "wide", brows: "calm", blush: true },
    message: "Seat confirmed. See you inside.",
    sparkle: true,
    wave: true,
    headTilt: -3,
  },
  celebrating: {
    expression: { eyes: "happy", mouth: "wide", brows: "calm", blush: true },
    message: "Admit card issued. ✨",
    sparkle: true,
    wave: true,
    headTilt: -3,
  },
  goodbye: {
    expression: { eyes: "happy", mouth: "smile", brows: "calm", blush: true },
    message: "See you soon. 👋",
    sparkle: false,
    headTilt: 0,
  },
  error: {
    expression: { eyes: "open", mouth: "frown", brows: "concerned", blush: false, gaze: "down" },
    message: "That didn't match our records. Try again?",
    sparkle: false,
    headTilt: -6,
  },
}

// Password strength index → avatar state. Strength is only ever surfaced while
// the user is on the signup form, so it can never contradict the stage machine.
export const strengthAvatarStates: AuthAvatarState[] = [
  "weak",
  "weak",
  "moderate",
  "strong",
  "excellent",
]

// Gaze + head-lean per focused field. The password field gets a slight look-away
// (privacy), everything else draws the companion's attention downward.
const FOCUS_LEAN: Record<Exclude<FocusField, null>, { gaze: Gaze; tilt: number }> = {
  name: { gaze: "down", tilt: 4 },
  email: { gaze: "down", tilt: 2 },
  password: { gaze: "down", tilt: -2 },
  confirm: { gaze: "down", tilt: -4 },
}

export type AvatarInput = {
  stage: AuthStage
  lit: boolean
  busy: boolean
  error: string | null
  focusField: FocusField
  successKind: AuthSuccessKind
  strength: number // -1 = not applicable, 0-4 otherwise
}

export function getAvatarState(input: AvatarInput): AuthAvatarState {
  if (!input.lit) return "hidden"
  if (input.busy || input.stage === "verify") return "loading"
  if (input.error) return "error"
  if (input.stage === "success") {
    return input.successKind === "signup" ? "celebrating" : "success"
  }
  if (input.stage === "login" || input.stage === "signup") {
    if (input.stage === "signup" && input.strength >= 0) {
      return strengthAvatarStates[Math.min(4, input.strength)]
    }
    return input.focusField ? "focused" : input.stage
  }
  if (input.stage === "choice") return "asking"
  return "welcoming"
}

// The avatar copy is derived from the state machine, but while a user is focused
// on a field we keep the form's contextual message (no text flicker).
export function getAvatarMessage(state: AuthAvatarState, stage: AuthStage): string {
  if (state === "hidden") return ""
  if (state === "focused") {
    if (stage === "login") return avatarStates.login.message
    if (stage === "signup") return avatarStates.signup.message
    return ""
  }
  return avatarStates[state].message
}

export function focusLean(
  field: FocusField | null | undefined
): { gaze: Gaze; tilt: number } | null {
  if (!field) return null
  return FOCUS_LEAN[field]
}
