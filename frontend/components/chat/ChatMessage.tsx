"use client";

// ChatGPT-style message bubble. AI replies render on the left with an avatar
// and a properly formatted Markdown body; the learner's own messages render as
// a right-aligned bubble. Includes action chips, copy, read-aloud and feedback
// controls.

import { useState } from "react";
import { Check, Copy, ThumbsDown, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import Markdown from "./Markdown";
import AiLogo from "@/components/ui/AiLogo";

export type SuggestedAction = {
  id: string;
  labelBn: string;
};

export type ChatMessageData = {
  id: string;
  role: "user" | "ai";
  text: string;
  messageId?: string;
  actions?: SuggestedAction[];
  error?: boolean;
};

// Module-level handle so only one message is read aloud at a time.
let activeTts: SpeechSynthesisUtterance | null = null;

function detectSpeechLang(text: string): string {
  return /[ঀ-৿]/.test(text) ? "bn-BD" : "en-US";
}

function stopTts() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  activeTts = null;
}

type ChatMessageProps = {
  message: ChatMessageData;
  copied: boolean;
  feedbackSent: boolean;
  streaming?: boolean;
  onCopy: (id: string, text: string) => void;
  onFeedback: (messageId: string | undefined, rating: "HELPFUL" | "NOT_HELPFUL") => void;
  onAction: (prompt: string) => void;
};

export function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Generating response">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

export default function ChatMessage({
  message,
  copied,
  feedbackSent,
  streaming,
  onCopy,
  onFeedback,
  onAction,
}: ChatMessageProps) {
  const [speaking, setSpeaking] = useState(false);

  const handleSpeak = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (speaking) {
      stopTts();
      setSpeaking(false);
      return;
    }
    stopTts();
    const u = new SpeechSynthesisUtterance(message.text);
    u.lang = detectSpeechLang(message.text);
    u.onend = () => {
      setSpeaking(false);
      activeTts = null;
    };
    u.onerror = () => {
      setSpeaking(false);
      activeTts = null;
    };
    activeTts = u;
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-zinc-800 px-4 py-2.5 text-sm leading-relaxed text-zinc-100 shadow-sm sm:max-w-[72%]">
          {message.text}
        </div>
      </div>
    );
  }

  const showMeta = !message.error && message.text !== "";

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/20">
        <AiLogo solid={false} className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        {message.error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
            {message.text}
          </div>
        ) : (
          <div className="min-w-0">
            <Markdown text={message.text} />
            {message.text === "" && streaming && <TypingIndicator />}
          </div>
        )}

        {message.actions && message.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.actions.map((a) => (
              <button
                key={`${message.id}-${a.id}`}
                type="button"
                onClick={() => onAction(a.labelBn)}
                className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/20"
              >
                {a.labelBn}
              </button>
            ))}
          </div>
        )}

        {showMeta && (
          <div className="mt-1 flex items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100">
            <button
              type="button"
              onClick={() => onCopy(message.id, message.text)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:text-emerald-400"
              aria-label="Copy response"
              title="Copy"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleSpeak}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                speaking ? "text-emerald-400" : "text-zinc-400 hover:text-emerald-400"
              }`}
              aria-label={speaking ? "Stop reading aloud" : "Read aloud"}
              title={speaking ? "Stop" : "Read aloud"}
            >
              {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => onFeedback(message.messageId, "HELPFUL")}
              disabled={feedbackSent}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                feedbackSent ? "text-emerald-400" : "text-zinc-400 hover:text-emerald-400"
              }`}
              aria-label="Helpful"
              title="Helpful"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onFeedback(message.messageId, "NOT_HELPFUL")}
              disabled={feedbackSent}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                feedbackSent ? "text-red-400" : "text-zinc-400 hover:text-red-400"
              }`}
              aria-label="Not helpful"
              title="Not helpful"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}