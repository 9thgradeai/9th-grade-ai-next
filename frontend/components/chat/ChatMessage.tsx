"use client";

// AI message row for the workspace. AI replies render on the left behind an
// avatar with a prose Markdown body, quiet action chips and a compact action
// toolbar (copy, read-aloud, feedback) that reveals on hover/focus. The
// learner's own messages render as a right-aligned surface row.
//
// The visual layer is token-driven (`.ai-prose`, `.ai-avatar`, `.ai-actions`)
// so both dashboard themes keep full contrast.

import { memo, useState } from "react";
import { Check, Copy, ThumbsDown, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import Markdown from "./Markdown";
import AiLogo from "@/components/ui/AiLogo";

export type SuggestedAction = {
  id: string;
  labelBn: string;
  labelEn?: string;
};

export type ChatMessageData = {
  id: string;
  role: "user" | "ai";
  text: string;
  messageId?: string;
  actions?: SuggestedAction[];
  error?: boolean;
};

function detectSpeechLang(text: string): string {
  return /[ঀ-৿]/.test(text) ? "bn-BD" : "en-US";
}

function stopTts() {
  if (typeof window === "undefined") return;
  window.speechSynthesis.cancel();
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
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--dashboard-success)]"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function ChatMessageInner({
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
    if (typeof window === "undefined") return;
    if (speaking) {
      stopTts();
      setSpeaking(false);
      return;
    }
    stopTts();
    const u = new SpeechSynthesisUtterance(message.text);
    u.lang = detectSpeechLang(message.text);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--dashboard-primary-subtle)] px-4 py-2.5 text-sm leading-relaxed text-[var(--text-primary)] shadow-sm ring-1 ring-[var(--border-strong)]/40 sm:max-w-[72%]">
          {message.text}
        </div>
      </div>
    );
  }

  const showMeta = !message.error && message.text !== "";

  return (
    <div className="flex items-start gap-3">
      <div className="ai-avatar h-8 w-8">
        <AiLogo solid={false} className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        {message.error ? (
          <div className="rounded-xl border border-red-500/25 bg-[var(--dashboard-danger-subtle)] px-3 py-2.5 text-sm text-red-300">
            {message.text}
          </div>
        ) : (
          <div className="min-w-0">
            <Markdown text={message.text} />
            {message.text === "" && streaming && <TypingIndicator />}
            {message.text !== "" && streaming && (
              <span className="ai-stream-caret" role="presentation" aria-hidden="true" />
            )}
          </div>
        )}

        {message.actions && message.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.actions.map((a) => (
              <button
                key={`${message.id}-${a.id}`}
                type="button"
                onClick={() => onAction(a.labelBn)}
                className="rounded-lg border border-[var(--dashboard-primary)]/25 bg-[var(--dashboard-primary-subtle)] px-2.5 py-1 text-xs text-[var(--dashboard-primary)] transition-colors hover:bg-[var(--dashboard-primary)]/15"
              >
                {a.labelBn}
              </button>
            ))}
          </div>
        )}

        {showMeta && (
          <div className="ai-actions -ml-2 mt-1 flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onCopy(message.id, message.text)}
              className="ai-icon-btn h-8 w-8"
              aria-label="Copy response"
              title="Copy"
            >
              {copied && <Check className="h-4 w-4 text-[var(--dashboard-success)]" />}
              {!copied && <Copy className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handleSpeak}
              className={`ai-icon-btn h-8 w-8 ${speaking ? "text-[var(--dashboard-success)]" : ""}`}
              aria-label={speaking ? "Stop reading aloud" : "Read aloud"}
              title={speaking ? "Stop" : "Read aloud"}
            >
              {speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => onFeedback(message.messageId, "HELPFUL")}
              disabled={feedbackSent}
              className={`ai-icon-btn h-8 w-8 ${feedbackSent ? "text-[var(--dashboard-success)]" : ""}`}
              aria-label="Helpful"
              title="Helpful"
            >
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onFeedback(message.messageId, "NOT_HELPFUL")}
              disabled={feedbackSent}
              className={`ai-icon-btn h-8 w-8 ${feedbackSent ? "text-[var(--dashboard-danger)]" : ""}`}
              aria-label="Not helpful"
              title="Not helpful"
            >
              <ThumbsDown className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ChatMessageInner);