"use client";

// Lightweight pub/sub used to launch the AI workspace with context from other
// surfaces (Solver handoff, Exam review, etc.) without restructuring layouts.

export type TutorLaunchContext = {
  mode?: "tutor" | "assistant";
  prompt?: string;
  questionId?: number;
  topicId?: number;
  subjectId?: number;
  topicPath?: string;
};

const EVENT = "9g:ai:launch";

export function launchAI(ctx: TutorLaunchContext): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TutorLaunchContext>(EVENT, { detail: ctx }));
}

export function subscribeToLaunch(cb: (ctx: TutorLaunchContext) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    cb((event as CustomEvent<TutorLaunchContext>).detail ?? {});
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}