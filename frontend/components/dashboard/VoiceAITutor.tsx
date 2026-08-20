"use client";

// AI Workspace — the real, streaming AI Tutor + Assistant.
// Replaces the old hardcoded keyword mock. Persists conversations, streams
// genuine model output, supports voice (STT/TTS) and feedback.

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Send, X, Volume2, VolumeX, Sparkles, Bot, User, Loader2,
  Plus, MessageSquare, Trash2, Copy, Check, ThumbsUp, ThumbsDown, RefreshCw,
  GraduationCap, BrainCircuit, ChevronLeft, ChevronRight,
} from "lucide-react";
import { PRESET_PROMPTS } from "@/lib/data/ai";
import {
  listConversations,
  getConversation,
  tutorTurn,
  askAssistant,
  deleteConversation,
  submitFeedback,
  AIError,
} from "@/lib/services/ai";
import type {
  AIConversationSummary,
  AIMessageDto,
  SuggestedActionDto,
} from "@/lib/services/ai/types";
import { subscribeToLaunch } from "@/lib/ai-launcher";
import { useAuth } from "@/lib/auth-ctx";

type Mode = "tutor" | "assistant";

type Status = "idle" | "generating" | "listening" | "speaking" | "error";

type UIMessage = {
  id: string;
  role: "user" | "ai";
  text: string;
  messageId?: string;
  actions?: SuggestedActionDto[];
  error?: boolean;
};

// Minimal typings for the vendor-prefixed Web Speech API.
type SpeechRecognitionResultLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const ASSISTANT_QUICK_ACTIONS: { labelBn: string; prompt: string }[] = [
  { labelBn: "আজ কী পড়ব?", prompt: "আজ কী পড়ব? আমার প্রগ্রেস ও দুর্বল বিষয় দেখে পরামর্শ দাও।" },
  { labelBn: "দুর্বল বিষয়গুলো", prompt: "আমার দুর্বল বিষয়গুলো কী কী? সেগুলো শুরুর জন্য কী করব?" },
  { labelBn: "প্র্যাকটিস শুরু করো", prompt: "আমাকে একটি প্র্যাকটিস সেশন পরামর্শ দাও।" },
  { labelBn: "কারেন্ট অ্যাফেয়ার্স", prompt: "সাম্প্রতিক কারেন্ট অ্যাফেয়ার্স কী কী?" },
];

const STATUS_LABEL: Record<Status, string> = {
  idle: "READY",
  generating: "GENERATING",
  listening: "LISTENING",
  speaking: "SPEAKING",
  error: "ERROR",
};

function messageToUI(m: AIMessageDto): UIMessage {
  return {
    id: m.id,
    role: m.role === "USER" ? "user" : "ai",
    text: m.role === "ASSISTANT" && (m.status === "FAILED" || !m.content)
      ? "দুঃখিত, এখন উত্তর তৈরি করা যাচ্ছে না।"
      : m.content,
    messageId: m.role === "ASSISTANT" ? m.id : undefined,
    error: m.status === "FAILED",
  };
}

export default function VoiceAITutor() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState<Mode>("tutor");
  const [conversations, setConversations] = useState<AIConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<Set<string>>(new Set());

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [pendingContext, setPendingContext] = useState<{
    questionId?: number;
    topicId?: number;
    subjectId?: number;
    topicPath?: string;
  }>({});

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await listConversations());
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (!showModal) return;
    let cancelled = false;
    listConversations()
      .then((c) => {
        if (!cancelled) setConversations(c);
      })
      .catch(() => {
        // non-fatal
      });
    return () => {
      cancelled = true;
    };
  }, [showModal]);

  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Voice recognition setup (Chrome/Edge).
  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      const Ctor = (window as unknown as { webkitSpeechRecognition: SpeechRecognitionCtor })
        .webkitSpeechRecognition;
      const recognition = new Ctor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "bn-BD";
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        if (status === "listening") setStatus("idle");
      };
      recognition.onerror = () => {
        setIsListening(false);
        if (status === "listening") setStatus("idle");
      };
      recognition.onend = () => {
        setIsListening(false);
        if (status === "listening") setStatus("idle");
      };
      recognitionRef.current = recognition;
    }
  }, [status]);

  // Launch from other surfaces (Solver handoff, etc.).
  useEffect(() => {
    return subscribeToLaunch((ctx) => {
      setMode(ctx.mode ?? "tutor");
      setShowModal(true);
      setError(null);
      if (ctx.prompt) setInput(ctx.prompt);
      if (ctx.questionId || ctx.topicId || ctx.subjectId) {
        setPendingContext({
          questionId: ctx.questionId,
          topicId: ctx.topicId,
          subjectId: ctx.subjectId,
          topicPath: ctx.topicPath,
        });
      }
    });
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setActiveConversationId(id);
    setError(null);
    try {
      const data = await getConversation(id);
      setMessages(data.messages.map(messageToUI));
    } catch (e) {
      setError(e instanceof AIError ? e.message : "Could not load conversation.");
    }
  }, []);

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    setPendingContext({});
  }, []);

  const removeConversation = useCallback(async (id: string) => {
    try {
      await deleteConversation(id);
      if (activeConversationId === id) startNewConversation();
      void refreshConversations();
    } catch (e) {
      setError(e instanceof AIError ? e.message : "Could not delete conversation.");
    }
  }, [activeConversationId, refreshConversations, startNewConversation]);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window) || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "bn-BD";
    utterance.rate = 0.9;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setStatus("speaking");
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setStatus("idle");
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setStatus("idle");
    };
    speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setIsSpeaking(false);
    setStatus("idle");
  }, []);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof AIError) {
      if (e.status === 401) {
        setError("Your session expired. Please sign in again.");
      } else {
        setError(e.message);
      }
    } else {
      setError("Something went wrong. Please try again.");
    }
    setStatus("error");
  }, []);

  const syncFromServer = useCallback(async (conversationId: string) => {
    try {
      const data = await getConversation(conversationId);
      setMessages(data.messages.map(messageToUI));
    } catch {
      // keep local state
    }
  }, []);

  const sendTurn = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || status === "generating" || !user) return;

    setInput("");
    setError(null);
    setStatus("generating");
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text }]);

    const ctx = pendingContext;
    const isAssistant = mode === "assistant";

    if (isAssistant) {
      try {
        const res = await askAssistant({
          conversationId: activeConversationId ?? undefined,
          content: text,
          questionId: ctx.questionId,
          intent: undefined,
        });
        setActiveConversationId(res.conversationId);
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "ai", text: res.reply, actions: res.suggestedActions },
        ]);
        setPendingContext({});
        speak(res.reply);
        void refreshConversations();
        void syncFromServer(res.conversationId).catch(() => {});
        setStatus("idle");
      } catch (e) {
        handleError(e);
      }
      return;
    }

    // Tutor streaming
    const abortController = new AbortController();
    abortRef.current = abortController;
    const placeholderId = `stream-${Date.now()}`;
    setMessages((prev) => [...prev, { id: placeholderId, role: "ai", text: "" }]);

    let assistantText = "";
    try {
      const meta = await tutorTurn({
        conversationId: activeConversationId ?? undefined,
        content: text,
        questionId: ctx.questionId,
        topicId: ctx.topicId,
        subjectId: ctx.subjectId,
        topicPath: ctx.topicPath,
        onChunk: (chunk) => {
          assistantText += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === placeholderId ? { ...m, text: assistantText } : m)),
          );
        },
        signal: abortController.signal,
      });
      abortRef.current = null;
      setStatus("idle");
      if (meta.conversationId) {
        setActiveConversationId(meta.conversationId);
        void refreshConversations();
        void syncFromServer(meta.conversationId);
      }
      setPendingContext({});
      speak(assistantText);
    } catch (e) {
      abortRef.current = null;
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? { ...m, text: m.text || "দুঃখিত, এখন উত্তর তৈরি করা যাচ্ছে না।", error: true }
            : m,
        ),
      );
      handleError(e);
    }
  }, [status, user, speak, handleError, refreshConversations, syncFromServer, mode, activeConversationId, pendingContext]);

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) void sendTurn(lastUser.text);
  }, [messages, sendTurn]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  const copyText = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore clipboard failures
    }
  }, []);

  const sendFeedback = useCallback(
    async (messageId: string | undefined, rating: "HELPFUL" | "NOT_HELPFUL") => {
      try {
        await submitFeedback({ messageId, rating });
        const key = messageId ?? `anon-${rating}-${Date.now()}`;
        setFeedbackSent((prev) => new Set(prev).add(key));
      } catch {
        // non-fatal
      }
    },
    [],
  );

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError("Speech recognition is not supported in this browser. Use Chrome or Edge.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setStatus("idle");
    } else {
      setError(null);
      recognitionRef.current.start();
      setIsListening(true);
      setStatus("listening");
    }
  }, [isListening]);

  const runPreset = useCallback((text: string) => {
    void sendTurn(text);
  }, [sendTurn]);

  const runAssistantAction = useCallback((prompt: string) => {
    void sendTurn(prompt);
  }, [sendTurn]);

  // Dialog focus management.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showModal) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const prevFocused = document.activeElement as HTMLElement | null;
    const focusable = dialog.querySelector<HTMLElement>("button, [href], input, textarea, [tabindex]:not([tabindex=\"-1\"])");
    focusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowModal(false);
        stopSpeaking();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        dialog.querySelectorAll<HTMLElement>("button, [href], input, textarea, [tabindex]:not([tabindex=\"-1\"])"),
      ).filter((n) => !n.hasAttribute("disabled"));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      prevFocused?.focus?.();
    };
  }, [showModal, stopSpeaking]);

  return (
    <>
      {/* Floating AI button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          setShowModal(true);
          setError(null);
        }}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 bg-emerald-500 rounded-full shadow-neon-glow flex items-center justify-center text-zinc-950 hover:bg-emerald-400 transition-colors"
        aria-label="Open AI Tutor and Assistant"
      >
        <Sparkles className="w-6 h-6" />
      </motion.button>

      <AnimatePresence>
        {showModal && (
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-workspace-title"
            className="fixed inset-0 z-50 flex flex-col bg-[var(--surface-solid)] bg-opacity-98 backdrop-blur-sm outline-none"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 p-3 sm:p-4 bg-[var(--surface-solid)] border-b border-emerald-500/30">
              <div className="flex items-center gap-2 min-w-0">
                {activeConversationId && (
                  <button
                    onClick={startNewConversation}
                    className="lg:hidden p-2 text-zinc-400 hover:text-white"
                    aria-label="New conversation"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => setSidebarOpen((v) => !v)}
                  className="hidden sm:flex p-2 text-zinc-400 hover:text-white"
                  aria-label="Toggle conversation list"
                >
                  {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>
                <Bot className="w-6 h-6 text-emerald-500 flex-shrink-0" aria-hidden="true" />
                <span id="ai-workspace-title" className="text-emerald-500 font-bold truncate">
                  9Th-Grade AI
                </span>

                {/* Mode switch */}
                <div className="flex items-center gap-1 ml-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-0.5">
                  <button
                    onClick={() => setMode("tutor")}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                      mode === "tutor"
                        ? "bg-emerald-500 text-zinc-950"
                        : "text-emerald-400 hover:text-white"
                    }`}
                  >
                    টিউটর
                  </button>
                  <button
                    onClick={() => setMode("assistant")}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                      mode === "assistant"
                        ? "bg-emerald-500 text-zinc-950"
                        : "text-emerald-400 hover:text-white"
                    }`}
                  >
                    সহায়ক
                  </button>
                </div>

                <span
                  aria-live="polite"
                  className={`hidden sm:inline-flex px-2 py-0.5 rounded-full text-xs font-mono items-center gap-1 ${
                    status === "listening"
                      ? "bg-red-500/10 text-red-400 animate-pulse"
                      : status === "generating"
                        ? "bg-cyan-500/10 text-cyan-400 animate-pulse"
                        : status === "speaking"
                          ? "bg-emerald-500/10 text-emerald-400 animate-pulse"
                          : status === "error"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-emerald-500/10 text-emerald-400"
                  }`}
                >
                  {status === "listening" ? <Mic className="w-3 h-3" /> : null}
                  {status === "speaking" ? <Volume2 className="w-3 h-3" /> : null}
                  {STATUS_LABEL[status]}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {isSpeaking && (
                  <button onClick={stopSpeaking} className="p-2 text-red-400 hover:text-red-300" title="Stop speaking">
                    <VolumeX className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => { setShowModal(false); stopGeneration(); stopSpeaking(); }}
                  className="p-2 text-zinc-400 hover:text-white"
                  aria-label="Close AI workspace"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex min-h-0">
              {/* Conversation list (desktop) */}
              <AnimatePresence>
                {sidebarOpen && (
                  <motion.aside
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 260, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    className="hidden sm:flex flex-col border-r border-emerald-500/10 bg-subtle overflow-hidden"
                  >
                    <div className="p-3 flex items-center justify-between border-b border-emerald-500/10">
                      <span className="text-xs font-mono text-zinc-500">CONVERSATIONS</span>
                      <button
                        onClick={startNewConversation}
                        className="p-1.5 rounded-lg border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
                        aria-label="New conversation"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {conversations.length === 0 && (
                        <p className="text-xs text-zinc-600 font-mono p-3">No conversations yet.</p>
                      )}
                      {conversations.map((conv) => (
                        <div
                          key={conv.id}
                          className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                            activeConversationId === conv.id
                              ? "bg-emerald-500/10 border border-emerald-500/20"
                              : "hover:bg-zinc-800/40 border border-transparent"
                          }`}
                          onClick={() => void openConversation(conv.id)}
                        >
                          {conv.kind === "ASSISTANT" ? (
                            <BrainCircuit className="w-4 h-4 text-emerald-500 flex-shrink-0" aria-hidden="true" />
                          ) : (
                            <MessageSquare className="w-4 h-4 text-emerald-500 flex-shrink-0" aria-hidden="true" />
                          )}
                          <span className="flex-1 min-w-0 truncate text-zinc-300">
                            {conv.title}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void removeConversation(conv.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400"
                            aria-label="Delete conversation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.aside>
                )}
              </AnimatePresence>

              {/* Chat column */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Error banner */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2"
                    >
                      <span className="flex-1">{error}</span>
                      <button onClick={() => setError(null)} className="p-1 hover:text-white" aria-label="Dismiss error">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Empty / quick actions */}
                {messages.length === 0 && (
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="text-center py-6">
                      {mode === "assistant" ? (
                        <BrainCircuit className="w-12 h-12 mx-auto mb-3 text-emerald-500/60" aria-hidden="true" />
                      ) : (
                        <GraduationCap className="w-12 h-12 mx-auto mb-3 text-emerald-500/60" aria-hidden="true" />
                      )}
                      <p className="text-sm text-zinc-300 font-mono">
                        {mode === "assistant"
                          ? "আপনার পড়াশোনার সহায়ক — প্রগ্রেস দেখে পরামর্শ দেব।"
                          : "আমি আপনার পড়াশোনার জন্য সাহায্য করতে পারি।"}
                      </p>
                    </div>

                    {mode === "tutor" ? (
                      <div className="flex flex-wrap gap-2 justify-center">
                        {PRESET_PROMPTS.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => runPreset(p.label.bn)}
                            className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-mono text-zinc-300 hover:bg-emerald-400 hover:text-zinc-950 transition-colors"
                          >
                            {p.label.bn}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
                        {ASSISTANT_QUICK_ACTIONS.map((a) => (
                          <button
                            key={a.labelBn}
                            onClick={() => runAssistantAction(a.prompt)}
                            className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-mono text-zinc-300 hover:bg-emerald-400 hover:text-zinc-950 transition-colors"
                          >
                            {a.labelBn}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Messages */}
                {messages.length > 0 && (
                  <div className="flex-1 overflow-y-auto p-4" ref={terminalRef} aria-live="polite" role="log">
                    <div className="space-y-3 max-w-3xl">
                      {messages.map((msg) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex items-start gap-3 p-3 rounded-terminal-rounded ${
                            msg.role === "user"
                              ? "bg-zinc-900 text-emerald-300 ml-auto"
                              : msg.error
                                ? "bg-red-500/10 text-zinc-300 border border-red-500/20"
                                : "bg-emerald-500/10 text-zinc-300"
                          }`}
                        >
                          <span
                            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              msg.role === "ai" ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {msg.role === "ai" ? (
                              <Bot className="w-4 h-4" aria-hidden="true" />
                            ) : (
                              <User className="w-4 h-4" aria-hidden="true" />
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                            {msg.actions && msg.actions.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-3">
                                {msg.actions.map((a) => (
                                  <button
                                    key={`${msg.id}-${a.id}`}
                                    onClick={() => runAssistantAction(a.labelBn)}
                                    className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                                  >
                                    {a.labelBn}
                                  </button>
                                ))}
                              </div>
                            )}

                            {msg.role === "ai" && msg.text !== "" && (
                              <div className="flex items-center gap-1 mt-2">
                                <button
                                  onClick={() => void copyText(msg.id, msg.text)}
                                  className="p-1.5 text-zinc-500 hover:text-emerald-400 transition-colors"
                                  aria-label="Copy response"
                                  title="Copy"
                                >
                                  {copiedId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => void sendFeedback(msg.messageId, "HELPFUL")}
                                  disabled={feedbackSent.has(msg.messageId ?? "")}
                                  className={`p-1.5 transition-colors ${
                                    feedbackSent.has(msg.messageId ?? "")
                                      ? "text-emerald-400"
                                      : "text-zinc-500 hover:text-emerald-400"
                                  }`}
                                  aria-label="Helpful"
                                  title="Helpful"
                                >
                                  <ThumbsUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => void sendFeedback(msg.messageId, "NOT_HELPFUL")}
                                  disabled={feedbackSent.has(msg.messageId ?? "")}
                                  className={`p-1.5 transition-colors ${
                                    feedbackSent.has(msg.messageId ?? "")
                                      ? "text-red-400"
                                      : "text-zinc-500 hover:text-red-400"
                                  }`}
                                  aria-label="Not helpful"
                                  title="Not helpful"
                                >
                                  <ThumbsDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => void sendFeedback(msg.messageId, "NOT_HELPFUL")}
                                  aria-hidden="true"
                                  tabIndex={-1}
                                  className="hidden"
                                />
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}

                      {status === "generating" && (
                        <div className="flex items-center gap-3 p-3 rounded-terminal-rounded bg-emerald-500/10 text-zinc-400 max-w-3xl">
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" aria-hidden="true" />
                          <span className="text-xs font-mono">Thinking...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Retry + stop row */}
                {(status === "generating" || messages.some((m) => m.error)) && (
                  <div className="px-4 pb-1 flex items-center gap-2">
                    {status === "generating" ? (
                      <button
                        onClick={stopGeneration}
                        className="text-xs font-mono px-2.5 py-1 rounded-md border border-red-500/20 text-red-300 hover:bg-red-500/10"
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={retryLast}
                        className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/10"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Retry
                      </button>
                    )}
                  </div>
                )}

                {/* Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendTurn(input);
                  }}
                  className="p-4 bg-[var(--surface-solid)] border-t border-emerald-500/20"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleListening}
                      className={`p-3 rounded-lg border transition-all ${
                        isListening
                          ? "bg-red-500/10 border-red-500/30 text-red-400 animate-pulse"
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                      }`}
                      title={isListening ? "Stop listening" : "Start voice input"}
                      aria-label={isListening ? "Stop listening" : "Start voice input"}
                      aria-pressed={isListening}
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                    <input
                      type="text"
                      value={input}
                      aria-label="Type your question or use voice input"
                      placeholder={isListening ? "Listening..." : "Type your question or use voice..."}
                      onChange={(e) => setInput(e.target.value)}
                      className="flex-1 bg-subtle border border-emerald-500/20 rounded-lg px-4 py-2.5 text-sm text-zinc-300 font-mono focus:outline-none focus:border-emerald-500/40"
                      disabled={status === "generating"}
                    />
                    <button
                      type="submit"
                      disabled={status === "generating" || !input.trim()}
                      className="p-3 bg-emerald-500 text-zinc-950 rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {status === "generating" ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}