// Centralized authentication experience state machine.
// The whole flow is driven by a single explicit stage — there are no free-floating
// booleans that can contradict each other. The avatar's expression/text/animation
// are derived from that stage plus transient signals (busy / error / focus).

export type AuthStage = "lamp" | "choice" | "login" | "signup" | "success";

export type AuthSuccessKind = "login" | "signup";

export type FocusField = "name" | "email" | "password" | "confirm" | null;

// The avatar companion — expression + copy are mapped below, never scattered
// across components.
export type AuthAvatarState =
  | "hidden"
  | "welcoming"
  | "asking"
  | "login"
  | "signup"
  | "focused"
  | "loading"
  | "success"
  | "celebrating"
  | "error";

export type EyeKind = "open" | "happy" | "closed" | "lid";
export type MouthKind = "smile" | "wide" | "small" | "flat" | "open" | "frown";
export type BrowKind = "calm" | "curious" | "concerned";
export type Gaze = "left" | "right" | "up" | "down";

export type AvatarExpression = {
  eyes: EyeKind;
  mouth: MouthKind;
  brows: BrowKind;
  blush: boolean;
  gaze?: Gaze;
};

export type AvatarConfig = {
  expression: AvatarExpression;
  message: string;
  sparkle: boolean;
};

export const avatarStates: Record<AuthAvatarState, AvatarConfig> = {
  hidden: {
    expression: { eyes: "closed", mouth: "flat", brows: "calm", blush: false },
    message: "",
    sparkle: false,
  },
  welcoming: {
    expression: { eyes: "happy", mouth: "wide", brows: "calm", blush: true },
    message: "Hey there. 👋",
    sparkle: false,
  },
  asking: {
    expression: { eyes: "open", mouth: "small", brows: "curious", blush: false },
    message: "Do you already have an account?",
    sparkle: false,
  },
  login: {
    expression: { eyes: "open", mouth: "smile", brows: "calm", blush: false },
    message: "Welcome back.",
    sparkle: false,
  },
  signup: {
    expression: { eyes: "open", mouth: "smile", brows: "curious", blush: false },
    message: "Let's get you set up.",
    sparkle: false,
  },
  focused: {
    expression: { eyes: "lid", mouth: "small", brows: "calm", blush: false },
    message: "",
    sparkle: false,
  },
  loading: {
    expression: { eyes: "open", mouth: "open", brows: "calm", blush: false, gaze: "up" },
    message: "One moment...",
    sparkle: false,
  },
  success: {
    expression: { eyes: "happy", mouth: "wide", brows: "calm", blush: true },
    message: "Welcome back. Let's go.",
    sparkle: true,
  },
  celebrating: {
    expression: { eyes: "happy", mouth: "wide", brows: "calm", blush: true },
    message: "You're all set. ✨",
    sparkle: true,
  },
  error: {
    expression: { eyes: "open", mouth: "frown", brows: "concerned", blush: false, gaze: "down" },
    message: "Hmm... something didn't go as expected.",
    sparkle: false,
  },
};

export type AvatarInput = {
  stage: AuthStage;
  lit: boolean;
  busy: boolean;
  error: string | null;
  focusField: FocusField;
  successKind: AuthSuccessKind;
};

export function getAvatarState(input: AvatarInput): AuthAvatarState {
  if (!input.lit) return "hidden";
  if (input.busy) return "loading";
  if (input.error) return "error";
  if (input.stage === "success") {
    return input.successKind === "signup" ? "celebrating" : "success";
  }
  if (input.stage === "login" || input.stage === "signup") {
    return input.focusField ? "focused" : input.stage;
  }
  if (input.stage === "choice") return "asking";
  return "welcoming";
}

// The avatar copy is derived from the state machine, but while a user is focused
// on a field we keep the form's contextual message (no text flicker).
export function getAvatarMessage(state: AuthAvatarState, stage: AuthStage): string {
  if (state === "hidden") return "";
  if (state === "focused") {
    if (stage === "login") return avatarStates.login.message;
    if (stage === "signup") return avatarStates.signup.message;
    return "";
  }
  return avatarStates[state].message;
}