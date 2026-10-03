"use client";

// Shared voice primitives (Phase 3D) — single implementation of Web Speech
// STT/TTS used by both the AI workspace and the voice-interview tab.
// Behavior preserved per consumer via callbacks; this hook owns no UI state
// beyond listening/speaking flags. All window access is guarded.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SpeechRecognitionCtor,
  SpeechRecognitionLike,
} from "@/components/ai-workspace/types";

const BENGALI_RE = /[ঀ-৿]/;

/** Bengali vs English auto-detect for TTS voices (matches legacy behavior). */
export function detectVoiceLang(text: string): string {
  return BENGALI_RE.test(text) ? "bn-BD" : "en-US";
}

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, SpeechRecognitionCtor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceInputSupported(): boolean {
  return recognitionCtor() !== null;
}

export function isVoiceOutputSupported(): boolean {
  return typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
}

export type VoiceInputOptions = {
  lang?: string;
  interimResults?: boolean;
  continuous?: boolean;
  onTranscript: (text: string, isFinal: boolean) => void;
  onEnd?: () => void;
};

/**
 * Speech-to-text. `start()` returns null on success or an error key
 * ("unsupported") when the browser has no recognizer. Callbacks always see
 * fresh state via refs, so consumers never re-create the recognizer.
 */
export function useVoiceInput(opts: VoiceInputOptions) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const optsRef = useRef(opts);
  // Mirror latest callbacks after render (never during) so async
  // recognition events always see fresh handlers.
  useEffect(() => {
    optsRef.current = opts;
  });

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      // Stopping an idle recognizer throws in some browsers — terminal
      // state is what matters, not the exception.
    }
    setListening(false);
  }, []);

  const start = useCallback((): string | null => {
    const Ctor = recognitionCtor();
    if (!Ctor) return "unsupported";
    try {
      recRef.current?.stop();
    } catch {
      // Ignore — see stop().
    }
    const rec = new Ctor();
    rec.lang = optsRef.current.lang ?? "bn-BD";
    rec.interimResults = optsRef.current.interimResults ?? false;
    rec.continuous = optsRef.current.continuous ?? false;
    rec.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");
      const isFinal = event.results[0]?.isFinal ?? true;
      optsRef.current.onTranscript(transcript, isFinal);
    };
    rec.onerror = () => {
      setListening(false);
      optsRef.current.onEnd?.();
    };
    rec.onend = () => {
      setListening(false);
      optsRef.current.onEnd?.();
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
    return null;
  }, []);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        // Unmount cleanup — same rationale as stop().
      }
    };
  }, []);

  return useMemo(
    () => ({ supported: isVoiceInputSupported(), listening, start, stop }),
    [listening, start, stop],
  );
}

/** Text-to-speech with cancel-previous semantics and auto language. */
export function useVoiceOutput() {
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const cancel = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.speechSynthesis?.cancel?.();
    } catch {
      // Some browsers throw when cancelling with an empty queue.
    }
    utterRef.current = null;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !text) return;
      if (typeof window.speechSynthesis === "undefined") return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = detectVoiceLang(text);
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      utterRef.current = u;
      window.speechSynthesis.speak(u);
    },
    [cancel],
  );

  useEffect(() => cancel, [cancel]);

  return useMemo(
    () => ({ supported: isVoiceOutputSupported(), speaking, speak, cancel }),
    [speaking, speak, cancel],
  );
}
