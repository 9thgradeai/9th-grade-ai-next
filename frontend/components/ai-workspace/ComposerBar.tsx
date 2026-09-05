"use client";

// Input law for the workspace: a status strip that reflects only real activity
// (listening, streaming, or the coach's actual tool steps), an auto-growing
// textarea, and mic / send / stop controls.
//
// Layout is a single inline flex row — textarea stretches with its content on
// the left, action buttons stay bottom-aligned on the right (separated by a
// hairline divider). No fake "thinking" indicators.

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
    <div className="border-t border-[var(--dashboard-border-muted)] px-3 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-6 sm:pt-3">
      {/* Honest status strip — slims to nil when quiet, never shows fake activity */}
      <div
        aria-live="polite"
        className="mx-auto mb-2 flex min-h-5 max-w-3xl items-center gap-1.5 px-1 sm:px-0"
      >
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
                    className="rounded-md border border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--dashboard-text-muted)]"
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
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            aria-label="Type your question or use voice input"
            placeholder={isListening ? "Listening..." : "Ask 9Th-Grade AI anything…"}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            disabled={generating}
            className="max-h-40 min-h-[26px] flex-1 resize-none self-center bg-transparent px-0.5 py-2.5 text-[15px] leading-6 text-[var(--dashboard-text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none disabled:opacity-60"
          />

          <div className="flex flex-shrink-0 items-center gap-1 pl-1">
            <button
              type="button"
              onClick={onToggleVoice}
              disabled={generating}
              className={`ai-icon-btn h-10 w-10 ${
                isListening
                  ? "bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]"
                  : "text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)]"
              }`}
              title={isListening ? "Stop listening" : "Start voice input"}
              aria-label={isListening ? "Stop listening" : "Start voice input"}
              aria-pressed={isListening}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>

            <span
              className="mx-0.5 h-6 w-px flex-shrink-0 bg-[var(--dashboard-border-muted)]"
              aria-hidden="true"
            />

            {generating ? (
              <button
                type="button"
                onClick={onStop}
                className="ai-stop h-10 w-10 flex-shrink-0"
                aria-label="Stop generating"
                title="Stop"
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="ai-send h-10 w-10 flex-shrink-0"
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
        </div>

        <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between gap-3 px-1 font-mono text-[10px] text-[var(--dashboard-text-muted)] sm:px-0">
          <span className="hidden truncate sm:inline">Enter to send · Shift+Enter for a new line</span>
          <span className="truncate">9Th-Grade AI can make mistakes. Verify important facts.</span>
        </div>
      </form>
    </div>
  );
}