import type { AuthStage } from "../auth-state"

/**
 * Animation Director — the single coordinator for the cinematic layer.
 *
 * Business logic (the auth stage machine in `auth-state.ts`) stays the sole
 * source of truth. The director translates snapshots of that machine into
 * two render-side concerns: which ENVIRONMENT state the room is in, and what
 * Unit-9 should be DOING. Nothing here holds credentials or network data —
 * events are semantic only (`AUTH_SUCCESS`, never `{ token }`).
 *
 * It is intentionally pure: AuthExperience already re-renders on stage /
 * busy / error / focus changes, so a plain derivation is cheaper and easier
 * to reason about than a subscription bus.
 */

/* Semantic events (documentation + future analytics hooks) */
export const AUTH_EVENTS = {
  LAMP_ACTIVATED: "AUTH_LAMP_ACTIVATED",
  CHOICE_OPENED: "AUTH_CHOICE_OPENED",
  CHOICE_SELECTED: "AUTH_CHOICE_SELECTED",
  FIELD_FOCUSED: "AUTH_FIELD_FOCUSED",
  FIELD_BLURRED: "AUTH_FIELD_BLURRED",
  SUBMITTING: "AUTH_SUBMITTING",
  FAILURE: "AUTH_FAILURE",
  SUCCESS: "AUTH_SUCCESS",
  VERIFYING: "AUTH_VERIFYING",
  CARD_ISSUED: "AUTH_CARD_ISSUED",
  ENTER_HALL: "AUTH_ENTER_HALL",
} as const

export type AuthEventName = (typeof AUTH_EVENTS)[keyof typeof AUTH_EVENTS]

/** Explicit environment states — each maps to concrete lighting/atmosphere. */
export type AuthEnvironmentState =
  | "dark"
  | "awakening"
  | "ready"
  | "choice"
  | "focused"
  | "verifying"
  | "success"
  | "departure"

/** Unit-9 behavioral states — drive gaze/micro-motion, not new artwork. */
export type Unit9Behavior =
  | "idle"
  | "waking"
  | "observing"
  | "curious"
  | "focused"
  | "privacy"
  | "processing"
  | "concerned"
  | "approved"
  | "celebrating"
  | "departing"

export type SceneSnapshot = {
  stage: AuthStage
  lit: boolean
  busy: boolean
  error: boolean
  hasFieldFocus: boolean
  passwordFocused: boolean
  departing: boolean
}

export type Scene = {
  environment: AuthEnvironmentState
  unit9: Unit9Behavior
}

export function resolveScene(s: SceneSnapshot): Scene {
  if (s.departing) return { environment: "departure", unit9: "departing" }
  if (!s.lit && s.stage === "lamp") return { environment: "dark", unit9: "idle" }

  // The lamp is on but the room is still brightening.
  if (s.stage === "lamp") return { environment: "awakening", unit9: "waking" }

  if (s.stage === "verify" || (s.busy && s.stage !== "success")) {
    return { environment: "verifying", unit9: "processing" }
  }
  if (s.stage === "success") {
    return { environment: "success", unit9: "approved" }
  }

  if (s.error) return { environment: "focused", unit9: "concerned" }

  if (s.stage === "login" || s.stage === "signup") {
    if (s.passwordFocused) return { environment: "focused", unit9: "privacy" }
    if (s.hasFieldFocus) return { environment: "focused", unit9: "focused" }
    return { environment: "focused", unit9: s.stage === "signup" ? "curious" : "observing" }
  }

  // Remaining: the identification desk.
  return { environment: "choice", unit9: "observing" }
}

/** Per-state ambient particle budget (embers). Quality governor clamps it. */
export const EMBER_BUDGET: Record<AuthEnvironmentState, number> = {
  dark: 1,
  awakening: 0.6,
  ready: 1,
  choice: 0.8,
  focused: 0.4,
  verifying: 0.5,
  success: 0.9,
  departure: 0.3,
}
