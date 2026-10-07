"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "@/components/chat/Markdown";
import { SpeakerHigh, SpeakerX, Square } from "@phosphor-icons/react";
import { tutorTurn } from "@/lib/services/ai/tutor";
import { useVoiceInput, useVoiceOutput } from "@/lib/hooks/useVoice";

type Msg = { id: string; role: "user" | "ai"; text: string };

export default function VoiceInterviewTab() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const conversationId = useRef<string | undefined>(undefined);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});

  const voiceOut = useVoiceOutput();
  // Ref-mirrors for values the send callback reads: avoids recreating `send`
  // on every keystroke (messages dep) while staying fresh.
  const busyRef = useRef(false);
  const autoSpeakRef = useRef(true);
  const voiceOutRef = useRef(voiceOut);
  const speakTimerRef = useRef<number | null>(null);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);
  useEffect(() => {
    voiceOutRef.current = voiceOut;
  }, [voiceOut]);
  useEffect(() => {
    return () => {
      if (speakTimerRef.current !== null) window.clearTimeout(speakTimerRef.current);
      try {
        voiceOutRef.current.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const voiceIn = useVoiceInput({
    lang: "bn-BD",
    interimResults: true,
    onTranscript: (transcript, isFinal) => {
      setInput(transcript);
      if (isFinal) void sendRef.current(transcript);
    },
  });
  const { supported, listening } = voiceIn;

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busyRef.current) return;
      setError(null);
      // Collision-safe ids: Date.now alone collides on rapid double-send.
      const userMsg: Msg = { id: `u-${crypto.randomUUID()}`, role: "user", text: content };
      const aiId = `a-${crypto.randomUUID()}`;
      setMessages((m) => [...m, userMsg, { id: aiId, role: "ai", text: "" }]);
      setInput("");
      setBusy(true);
      try {
        const meta = await tutorTurn({
          conversationId: conversationId.current,
          content,
          intent: "tutor",
          onChunk: (chunk) =>
            setMessages((m) =>
              m.map((msg) => (msg.id === aiId ? { ...msg, text: msg.text + chunk } : msg)),
            ),
        });
        if (meta.conversationId) conversationId.current = meta.conversationId;
        if (autoSpeakRef.current) {
          // Speak after the stream closes (text is fully assembled).
          // Timer is tracked + cleared on unmount to avoid post-unmount TTS.
          if (speakTimerRef.current !== null) window.clearTimeout(speakTimerRef.current);
          speakTimerRef.current = window.setTimeout(() => {
            setMessages((m) => {
              const t = m.find((x) => x.id === aiId)?.text ?? "";
              if (t) voiceOutRef.current.speak(t);
              return m;
            });
          }, 50);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "কথোপকথন ব্যর্থ হয়েছে।");
        setMessages((m) => m.map((msg) => (msg.id === aiId ? { ...msg, text: "⚠️ সমস্যা হয়েছে। আবার চেষ্টা করো।" } : msg)));
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  // Mirror latest send after render so the recognition callback (which
  // outlives any single render) always acts on fresh state.
  useEffect(() => {
    sendRef.current = send;
  });

  const toggleMic = useCallback(() => {
    if (listening) {
      voiceIn.stop();
      return;
    }
    const err = voiceIn.start();
    if (err) {
      setError("এই ব্রাউজারে ভয়েস ইনপুট সাপোর্ট করে না। Chrome/Edge ব্যবহার করো।");
    }
  }, [listening, voiceIn]);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--dashboard-text-primary)]">ভয়েস ইন্টারভিউ</h1>
          <p className="mt-1 text-sm text-[var(--dashboard-text-muted)]">
            কথা বলে প্র্যাকটিস করো — মাইক চাপো, উত্তর দাও, আর AI-এর জবাব শুনে নাও।
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--dashboard-text-muted)]">
          <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />
          অটো-বলি
        </label>
      </div>

      {!supported && (
        <p className="rounded-xl border border-[var(--warning)]/30 bg-[var(--dashboard-warning-subtle)] px-3 py-2 text-sm text-[var(--dashboard-warning)]">
          তোমার ব্রাউজারে ভয়েস ইনপুট সাপোর্ট করে না। কীবোর্ড দিয়ে লিখে পাঠাতে পারো।
        </p>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--dashboard-surface)] p-4">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--dashboard-text-muted)]">
            মাইকে চাপ দিয়ে শুরু করো, অথবা নিচে লিখে পাঠাও। যেমন: “BCS প্রিলির জন্য কীভাবে প্রস্তুতি নেব?”
          </p>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl bg-[var(--dashboard-primary-subtle)] px-3 py-2 text-sm text-[var(--dashboard-text-primary)]">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex items-start gap-2">
              <div className="max-w-[85%] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--dashboard-text-primary)]">
                {m.text ? <Markdown text={m.text} /> : <span className="text-[var(--dashboard-text-muted)]">…</span>}
              </div>
              {m.text && (
                <button
                  type="button"
                  onClick={() => voiceOut.speak(m.text)}
                  aria-label="শোনো"
                  className="mt-1 rounded-lg border border-[var(--border-subtle)] p-1.5 text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-primary)]"
                >
                  <SpeakerHigh className="h-4 w-4" />
                </button>
              )}
            </div>
          ),
        )}
      </div>

      {error && <p className="text-sm text-[var(--dashboard-danger)]">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMic}
          disabled={!supported || busy}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
            listening ? "bg-[var(--danger)] text-[var(--text-inverse)]" : "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] hover:bg-[var(--accent-hover)]"
          } disabled:opacity-60`}
          aria-label={listening ? "শোনা বন্ধ করো" : "কথা বলো"}
        >
          {listening ? <Square className="h-4 w-4" /> : <SpeakerX className="h-4 w-4" />}
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          placeholder="প্রশ্ন লিখো বা মাইকে কথা বলো…"
          className="flex-1 resize-none rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--dashboard-text-primary)] outline-none focus:border-[var(--primary)]/50"
        />
        <button
          type="button"
          onClick={() => void send(input)}
          disabled={busy || !input.trim()}
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--dashboard-text-inverse)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          পাঠাও
        </button>
      </div>
    </div>
  );
}
