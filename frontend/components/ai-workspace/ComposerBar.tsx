"use client";

// Input law for the workspace: a status strip that reflects only real activity
// (listening, streaming, or the coach's actual tool steps), an auto-growing
// textarea, and mic / send / stop controls. No fake "thinking" indicators.

import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { Mic, MicOff, Send, Square, Loader2 } from "lucide-react";
import type { Status } from "./types";

type ComposerBarProps = {
  input: string;
  status: Status;
  /** Real coach status line surfaced from the agent stream. */
  activity: string | null;
  /** Tool names actually running during a coach turn. */
  tools: string[];
  isListening: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onStop: () => void;
  onToggleVoice: () => void;
};

export default function ComposerBar({
  input,
  status,
  activity,
  tools,
  isListening,
  textareaRef,
  onInputChange,
  onKeyDown,
  onSubmit,
  onStop,
  onToggleVoice,
}: ComposerBarProps) {
  const generating = status === "generating";

  return (
    <div className="border-t border-[var(--dashboard-border-muted)] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pb-4">
      {/* Honest status strip */}
      <div className="mx-auto mb-1.5 flex min-h-5 max-w-3xl items-center gap-2 px-1">
        {isListening && (
          <span className="ai-status is-listening font-mono text-xs text-[var(--dashboard-danger)]">
            শুনছি… voice input on
          </span>
        )}
        {generating && (
          <span className="ai-status is-working min-w-0 font-mono text-xs">
            <span className="truncate">{activity ?? "Generating…"}</span>
            {tools.length > 0 && (
              <span className="flex flex-wrap items-center gap-1">
                {tools.map((t) => (
                  <span
                    key={t}
                    className="rounded border border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--dashboard-text-muted)]"
                  >
                    {t}
                  </span>
                ))}
              </span>
            )}
          </span>
        )}
        {status === "error" && (
          <span className="ai-status is-error font-mono text-xs text-[var(--dashboard-danger)]">
            ERROR
          </span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="ai-composer mx-auto max-w-3xl">
          <button
            type="button"
            onClick={onToggleVoice}
            className={`ai-icon-btn h-9 w-9 flex-shrink-0 ${
              isListening ? "bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]" : ""
            }`}
            title={isListening ? "Stop listening" : "Start voice input"}
            aria-label={isListening ? "Stop listening" : "Start voice input"}
            aria-pressed={isListening}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            aria-label="Type your question or use voice input"
            placeholder={isListening ? "Listening..." : "Ask 9Th-Grade AI anything…"}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            disabled={generating}
            className="max-h-40 min-h-[38px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed text-[var(--dashboard-text-secondary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none disabled:opacity-60"
          />

          {generating ? (
            <button
              type="button"
              onClick={onStop}
              className="ai-stop h-9 w-9 flex-shrink-0"
              aria-label="Stop generating"
              title="Stop"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="ai-send h-9 w-9 flex-shrink-0"
              aria-label="Send message"
              title="Send"
            >
              {status === "listening" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center font-mono text-[10px] text-[var(--dashboard-text-muted)]">
          9Th-Grade AI can make mistakes. Verify important facts.
        </p>
      </form>
    </div>
  );
}