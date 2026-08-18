/* src/components/AITutorModal.tsx */
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { PRESET_PROMPTS } from "@/lib/data/ai";
import type { TutorMessage } from "@/lib/types";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

function AITutorModalContent({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const terminalRef = useRef<HTMLUListElement>(null);
  const nextMsgId = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const lastUserMessageRef = useRef<string>("");

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const addMessage = useCallback((msg: Omit<TutorMessage, "id" | "timestamp">) => {
    const newId = `msg-${nextMsgId.current++}`;
    setMessages((prev) => [...prev, { ...msg, id: newId, timestamp: Date.now() }]);
    return newId;
  }, []);

  const generateWithDelay = useCallback(
    async (userText: string) => {
      if (!userText.trim()) return;

      setIsGenerating(true);
      setError(null);
      lastUserMessageRef.current = userText;

      addMessage({ role: "user", text: userText });

      try {
        const res = await fetch("/api/ai/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: userText }] }),
        });

        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(typeof body.error === "string" ? body.error : "Tutor request failed");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        const aiId = addMessage({ role: "ai", text: "" });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          const text = acc;
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, text } : m)),
          );
        }

        setRetryCount(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unexpected error occurred.";
        setError(message);
      } finally {
        setIsGenerating(false);
      }
    },
    [addMessage],
  );

  const retryLastMessage = useCallback(() => {
    if (lastUserMessageRef.current) {
      setMessages((prev) => prev.slice(0, -1));
      setRetryCount((prev) => prev + 1);
      void generateWithDelay(lastUserMessageRef.current);
    }
  }, [generateWithDelay]);

  const handlePresetClick = (prompt: { bn: string }) => {
    if (isGenerating) return;
    lastUserMessageRef.current = prompt.bn;
    void generateWithDelay(prompt.bn);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    const userText = input.trim();
    lastUserMessageRef.current = userText;
    setInput("");
    void generateWithDelay(userText);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="AI Tutor chat"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950 bg-opacity-90 backdrop-filter backdrop-blur-sm overflow-y-auto outline-none"
    >
      {/* Console Header */}
      <div className="flex items-center justify-between p-4 bg-zinc-950 border border-emerald-500/30">
        <div className="flex items-center gap-2">
          <span className="text-emerald-500 text-xl font-bold">🤖 9Th-Grade AI Tutor</span>
          <motion.span
            className="text-emerald-500"
            initial={{ scale: 0.9 }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            STATUS: ONLINE
          </motion.span>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors px-2 py-1"
            aria-label="Close AI Tutor"
          >
            ✕
          </button>
        )}

        <div className="flex gap-2">
          {PRESET_PROMPTS.map((p, i) => (
            <motion.button
              key={p.id}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => handlePresetClick(p.label)}
              disabled={isGenerating}
              className="cursor-pointer px-3 py-1 bg-emerald-500/10 rounded-md text-sm font-mono hover:bg-emerald-400 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <span className="text-emerald-500" aria-hidden="true">{p.icon}</span>
              <span className="text-zinc-400">{p.label.bn}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Chat Console */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="terminal-window-bar">
          <div className="dot close" />
          <div className="dot minimize" />
          <div className="dot maximize" />
          <div className="flex-1 text-center text-xs text-zinc-400 font-mono">terminal.emulator.9th-grade-ai</div>
        </div>

        <ul className="space-y-3" ref={terminalRef} aria-live="polite">
          {messages.map((msg) => (
            <motion.li
              key={msg.id}
              initial={{ opacity: 0, y: msg.role === "user" ? -20 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-start gap-3 p-2 rounded-md max-w-3xl ${
                msg.role === "user"
                  ? "bg-zinc-900 text-emerald-300"
                  : "bg-emerald-500/10 text-zinc-300"
              }`}
            >
              <div className="flex items-start gap-2">
                {msg.role === "user" && (
                  <div className="relative w-6 h-5 mt-1">
                    <div className="cursor-blink text-emerald-400 animate-blink" />
                  </div>
                )}
                <span className={msg.role === "ai" ? "text-emerald-300" : "text-zinc-300"}>{msg.text || (msg.role === "ai" && isGenerating ? "" : "...")}</span>
              </div>
            </motion.li>
          ))}
          {isGenerating && (
            <li className="flex items-center gap-2 p-2 text-emerald-400">
              <LoadingSpinner size={16} label="AI is thinking" />
              <span className="font-mono text-sm">Thinking...</span>
            </li>
          )}
        </ul>

        {/* Error state */}
        {error && !isGenerating && (
          <div className="mt-4 p-3 rounded-terminal-rounded border border-red-500/20 bg-red-500/5">
            <p className="text-red-400 text-sm font-mono mb-2">{error}</p>
            <button
              onClick={retryLastMessage}
              className="px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-terminal-rounded text-red-400 font-mono text-xs hover:bg-red-500/20 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Input area */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2 bg-zinc-900/50 border border-emerald-500/20 rounded mt-4">
          <label htmlFor="ai-tutor-input" className="sr-only">
            Type your question
          </label>
          <input
            id="ai-tutor-input"
            type="text"
            value={input}
            placeholder="Type your question..."
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-emerald-300 font-mono"
            disabled={isGenerating}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isGenerating || !input.trim()}
            className="px-3 py-1 bg-emerald-500 text-zinc-950 font-mono rounded hover:bg-emerald-400 transition-colors disabled:opacity-50"
            aria-label="Send message"
          >
            {isGenerating ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <span>Send</span>
            )}
          </button>
        </form>
      </div>
    </motion.div>
  );
}

export default function AITutorModal({ onClose }: { onClose?: () => void }) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950 bg-opacity-90">
          <div className="p-8 rounded-terminal-rounded border border-red-500/20 bg-red-500/5 text-center max-w-md">
            <p className="text-red-400 font-mono text-sm mb-2">AI Tutor encountered an error</p>
            <p className="text-zinc-500 text-xs mb-4">{error.message}</p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-terminal-rounded text-emerald-400 font-mono text-sm hover:bg-emerald-500/20 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    >
      <AITutorModalContent onClose={onClose} />
    </ErrorBoundary>
  );
}
