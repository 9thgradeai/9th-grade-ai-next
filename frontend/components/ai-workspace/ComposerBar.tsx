"use client";

// Input law for the workspace: a status strip that reflects only real activity
// (listening, streaming, or the coach's actual tool steps), an auto-growing
// textarea, and mic / attach / send / stop controls. Tutor mode accepts a
// photo/screenshot of a question (imageBase64 travels in the turn body and
// forces a vision-capable provider); the auto-read toggle streams the AI reply
// back through the browser's speechSynthesis (Bengali vs English auto-detected).
//
// Layout is a single inline flex row — textarea stretches with its content on
// the left, action buttons stay bottom-aligned on the right (separated by a
// hairline divider). No fake "thinking" indicators.

import { useRef, type ChangeEvent, type KeyboardEvent, type RefObject } from "react";
import { Image, Microphone, MicrophoneSlash, ArrowUp, Square, Spinner, X, SpeakerHigh, SpeakerX } from "@phosphor-icons/react";
import type { Mode, Status } from "./types";
import type { AgentActivityStepDto } from "./types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ComposerBarProps = {
  mode: Mode;
  input: string;
  status: Status;
  /** Real coach status line surfaced from the agent stream. */
  activity: string | null;
  /** Coach activity surfaced from the agent stream (tool labels, not raw names). */
  tools: AgentActivityStepDto[];
  /** Data URL of the attached question image (tutor mode only). */
  imagePreview: string | null;
  /** Whether the attach button is available (tutor mode, not generating). */
  canAttachImage: boolean;
  speakOnReply: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onStop: () => void;
  onToggleVoice: () => void;
  onAttachImage: (dataUrl: string) => void;
  onRemoveImage: () => void;
  onToggleSpeak: () => void;
};

export default function ComposerBar({
  mode,
  input,
  status,
  activity,
  tools,
  imagePreview,
  canAttachImage,
  speakOnReply,
  isSpeaking,
  isListening,
  textareaRef,
  onInputChange,
  onKeyDown,
  onSubmit,
  onStop,
  onToggleVoice,
  onAttachImage,
  onRemoveImage,
  onToggleSpeak,
}: ComposerBarProps) {
  const generating = status === "generating";
  const attachRef = useRef<HTMLInputElement>(null);

  const handleAttach = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > MAX_IMAGE_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onAttachImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const canSend = input.trim().length > 0 || (Boolean(imagePreview) && mode === "tutor");

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
                    key={t.name}
                    className="rounded-md border border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--dashboard-text-muted)]"
                  >
                    {t.label}
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
          {imagePreview && (
            <div className="mr-2 flex items-center gap-2 self-center pb-1 sm:ml-1">
              <img
                src={imagePreview}
                alt="Attached question image"
                className="h-10 w-14 rounded-lg border border-[var(--dashboard-border-muted)] object-cover"
              />
              <span className="hidden font-mono text-[10px] text-[var(--dashboard-text-muted)] sm:inline">
                question image attached
              </span>
              <button
                type="button"
                onClick={onRemoveImage}
                disabled={generating}
                className="ai-icon-btn h-6 w-6"
                aria-label="Remove attached image"
                title="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

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
              onClick={() => attachRef.current?.click()}
              disabled={!canAttachImage || generating}
              className="ai-icon-btn h-10 w-10 text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40"
              title={
                mode === "tutor"
                  ? "Attach a photo/screenshot of the question"
                  : "Photo upload is available in Tutor mode"
              }
              aria-label="Attach a question image"
            >
              <Image className="h-4 w-4" />
            </button>
            <input ref={attachRef} type="file" accept="image/*" hidden onChange={handleAttach} />

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
              {isListening ? <MicrophoneSlash className="h-4 w-4" /> : <Microphone className="h-4 w-4" />}
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
                disabled={!canSend}
                className="ai-send h-10 w-10 flex-shrink-0"
                aria-label="Send message"
                title="Send"
              >
                {status === "listening" ? (
                  <Spinner className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between gap-3 px-1 font-mono text-[10px] text-[var(--dashboard-text-muted)] sm:px-0">
          <button
            type="button"
            onClick={onToggleSpeak}
            disabled={generating}
            className={`inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
              isSpeaking ? "text-[var(--dashboard-primary)]" : "hover:text-[var(--dashboard-text-secondary)]"
            }`}
            aria-pressed={speakOnReply}
            title={speakOnReply ? "Turn off auto-read of AI replies" : "Turn on auto-read of AI replies"}
          >
            {isSpeaking ? (
              <span className="flex items-end gap-0.5" aria-hidden="true">
                <span className="h-2 w-0.5 animate-pulse rounded-full bg-current" />
                <span className="h-3 w-0.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "120ms" }} />
                <span className="h-2 w-0.5 animate-pulse rounded-full bg-current" style={{ animationDelay: "240ms" }} />
              </span>
            ) : speakOnReply ? (
              <SpeakerHigh className="h-3.5 w-3.5" />
            ) : (
              <SpeakerX className="h-3.5 w-3.5" />
            )}
            Auto-read {speakOnReply ? "on" : "off"}
          </button>
          <span className="hidden truncate sm:inline">Enter to send · Shift+Enter for a new line</span>
          <span className="truncate">9Th-Grade AI can make mistakes. Verify important facts.</span>
        </div>
      </form>
    </div>
  );
}