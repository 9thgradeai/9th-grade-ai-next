"use client";

/* SpeechRecognition types are not in the standard lib DOM; we access them
   dynamically, so disable the explicit-any rule for this file only. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useRef, useState } from "react";
import Markdown from "@/components/chat/Markdown";
import { Volume2, Mic, Square } from "lucide-react";
import { tutorTurn } from "@/lib/services/ai/tutor";

type Msg = { id: string; role: "user" | "ai"; text: string };

const BENGALI_RE = /[ঀ-৿]/;

export default function VoiceInterviewTab() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(
    typeof window !== "undefined" &&
      Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  );

  const conversationId = useRef<string | undefined>(undefined);
  const recognitionRef = useRef<any>(null);
  const activeTts = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = BENGALI_RE.test(text) ? "bn-BD" : "en-US";
    activeTts.current = u;
    window.speechSynthesis.speak(u);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      setError(null);
      const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", text: content };
      const aiId = `a-${Date.now()}`;
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
        if (autoSpeak) {
          // Speak after the stream closes (text is fully assembled).
          setTimeout(() => {
            setMessages((m) => {
              const t = m.find((x) => x.id === aiId)?.text ?? "";
              if (t) speak(t);
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
    [autoSpeak, busy, messages, speak],
  );

  const toggleMic = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("এই ব্রাউজারে ভয়েস ইনপুট সাপোর্ট করে না। Chrome/Edge ব্যবহার করো।");
      return;
    }
    const rec = new SR();
    rec.lang = "bn-BD";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (ev: any) => {
      const transcript = Array.from(ev.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setInput(transcript);
      if (ev.results[0].isFinal) {
        rec.stop();
        setListening(false);
        void send(transcript);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening, send]);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">ভয়েস ইন্টারভিউ</h1>
          <p className="mt-1 text-sm text-zinc-400">
            কথা বলে প্র্যাকটিস করো — মাইক চাপো, উত্তর দাও, আর AI-এর জবাব শুনে নাও।
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />
          অটো-বলি
        </label>
      </div>

      {!supported && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          তোমার ব্রাউজারে ভয়েস ইনপুট সাপোর্ট করে না। কীবোর্ড দিয়ে লিখে পাঠাতে পারো।
        </p>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/40 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            মাইকে চাপ দিয়ে শুরু করো, অথবা নিচে লিখে পাঠাও। যেমন: “BCS প্রিলির জন্য কীভাবে প্রস্তুতি নেব?”
          </p>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm text-zinc-100">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex items-start gap-2">
              <div className="max-w-[85%] rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
                {m.text ? <Markdown text={m.text} /> : <span className="text-zinc-500">…</span>}
              </div>
              {m.text && (
                <button
                  type="button"
                  onClick={() => speak(m.text)}
                  aria-label="শোনো"
                  className="mt-1 rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:text-emerald-400"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ),
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMic}
          disabled={!supported || busy}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
            listening ? "bg-red-500 text-white" : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
          } disabled:opacity-60`}
          aria-label={listening ? "শোনা বন্ধ করো" : "কথা বলো"}
        >
          {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
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
          className="flex-1 resize-none rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
        />
        <button
          type="button"
          onClick={() => void send(input)}
          disabled={busy || !input.trim()}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          পাঠাও
        </button>
      </div>
    </div>
  );
}
