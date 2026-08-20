"use client";

// AI Workspace — the real, streaming AI Tutor + Assistant.
// Replaces the old hardcoded keyword mock. Persists conversations, streams
// genuine model output, supports voice (STT/TTS) and feedback.
//
// Responsive, ChatGPT/Gemini-inspired shell:
//  - Mobile: full-width bottom sheet + slide-over conversation drawer.
//  - Desktop: centered floating panel with an always-visible conversation
//    sidebar. AI replies render as rich Markdown; the learner's messages are
//    right-aligned bubbles; input is an auto-growing textarea.

import {
  useState, useRef, useEffect, useCallback,
  type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Send, X, Loader2,
  Plus, RefreshCw, GraduationCap, BrainCircuit, PanelLeft,
} from "lucide-react";
import AiLogo from "@/components/ui/AiLogo";
import { PRESET_PROMPTS } from "@/lib/data/ai";
import {
  listConversations,
  getConversation,
  tutorTurn,
  askAssistant,
  renameConversation,
  pinConversation,
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
import ChatMessage, { TypingIndicator, type ChatMessageData } from "@/components/chat/ChatMessage";
import ConversationList from "@/components/chat/ConversationList";

type Mode = "tutor" | "assistant";

type Status = "idle" | "generating" | "listening" | "error";

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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<Set<string>>(new Set());

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    setSidebarOpen(false);
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

  const applyConversationUpdate = useCallback(
    (id: string, patch: Partial<AIConversationSummary>) => {
      setConversations((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
        return next;
      });
    },
    [],
  );

  const renameConversationHandler = useCallback(
    async (id: string, title: string) => {
      try {
        const updated = await renameConversation(id, title);
        applyConversationUpdate(id, { title: updated.title });
      } catch (e) {
        setError(e instanceof AIError ? e.message : "Could not rename conversation.");
      }
    },
    [applyConversationUpdate],
  );

  const togglePinConversation = useCallback(
    async (id: string, pinned: boolean) => {
      try {
        const updated = await pinConversation(id, pinned);
        applyConversationUpdate(id, { pinned: updated.pinned });
      } catch (e) {
        setError(e instanceof AIError ? e.message : "Could not update conversation.");
      }
    },
    [applyConversationUpdate],
  );

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
    if (inputRef.current) inputRef.current.style.height = "auto";
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
  }, [status, user, handleError, refreshConversations, syncFromServer, mode, activeConversationId, pendingContext]);

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

  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    setInput(el.value);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendTurn(input);
      }
    },
    [input, sendTurn],
  );

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
      prevFocused?.focus();
    };
  }, [showModal]);

  const closeModal = useCallback(() => {
    setShowModal(false);
    stopGeneration();
  }, [stopGeneration]);

  const lastMessage = messages[messages.length - 1];
  const showThinkingRow =
    status === "generating" &&
    (messages.length === 0 || lastMessage.role !== "ai" || lastMessage.text !== "");

  const conversationList = (
    <ConversationList
      conversations={conversations}
      activeConversationId={activeConversationId}
      onOpen={(id) => void openConversation(id)}
      onDelete={(id) => void removeConversation(id)}
      onRename={(id, title) => void renameConversationHandler(id, title)}
      onPin={(id, pinned) => void togglePinConversation(id, pinned)}
      onNew={startNewConversation}
    />
  );

  return (
    <>
      {/* Floating AI launcher — the assistant's logo doubles as the button */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => {
          setShowModal(true);
          setError(null);
        }}
        className="fixed bottom-20 right-4 z-40 rounded-2xl drop-shadow-[0_8px_24px_rgba(16,185,129,0.45)] transition-transform sm:bottom-24 sm:right-6"
        aria-label="Open AI Tutor and Assistant"
      >
        <AiLogo className="h-12 w-12 sm:h-14 sm:w-14" />
      </motion.button>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
              aria-hidden="true"
            />

            {/* Panel — full-width bottom sheet on mobile, centered panel on desktop */}
            <motion.div
              ref={dialogRef}
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 48, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-workspace-title"
              className="absolute inset-x-0 bottom-0 flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-emerald-500/20 bg-[var(--surface-solid)] shadow-2xl outline-none sm:inset-x-4 sm:bottom-6 sm:mx-auto sm:h-[min(88dvh,900px)] sm:max-w-4xl sm:rounded-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 border-b border-emerald-500/20 px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSidebarOpen((v) => !v)}
                    className="flex p-2 text-zinc-400 transition-colors hover:text-white lg:hidden"
                    aria-label="Toggle conversation list"
                  >
                    <PanelLeft className="h-5 w-5" />
                  </button>
                  <AiLogo className="h-7 w-7 flex-shrink-0" />
                  <span id="ai-workspace-title" className="truncate font-bold text-emerald-500">
                    9Th-Grade AI
                  </span>

                  {/* Mode switch */}
                  <div className="ml-1 flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-0.5 sm:ml-2">
                    <button
                      type="button"
                      onClick={() => setMode("tutor")}
                      className={`rounded-md px-2.5 py-1 font-mono text-xs transition-colors ${
                        mode === "tutor"
                          ? "bg-emerald-500 text-zinc-950"
                          : "text-emerald-400 hover:text-white"
                      }`}
                    >
                      টিউটর
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("assistant")}
                      className={`rounded-md px-2.5 py-1 font-mono text-xs transition-colors ${
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
                    className={`hidden items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs sm:inline-flex ${
                      status === "listening"
                        ? "bg-red-500/10 text-red-400 animate-pulse"
                        : status === "generating"
                          ? "bg-cyan-500/10 text-cyan-400 animate-pulse"
                          : status === "error"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-emerald-500/10 text-emerald-400"
                    }`}
                  >
                    {status === "listening" ? <Mic className="h-3 w-3" /> : null}
                    {STATUS_LABEL[status]}
                  </span>
                </div>

                <div className="flex flex-shrink-0 items-center gap-1">
                  {activeConversationId && (
                    <button
                      type="button"
                      onClick={startNewConversation}
                      className="p-2 text-zinc-400 transition-colors hover:text-white lg:hidden"
                      aria-label="New conversation"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeModal}
                    className="p-2 text-zinc-400 transition-colors hover:text-white"
                    aria-label="Close AI workspace"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex min-h-0 flex-1">
                {/* Conversation sidebar (desktop) */}
                <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-emerald-500/10 bg-subtle lg:flex">
                  {conversationList}
                </aside>

                {/* Chat column */}
                <div className="flex min-w-0 flex-1 flex-col">
                  {/* Error banner */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                      >
                        <span className="flex-1">{error}</span>
                        <button type="button" onClick={() => setError(null)} className="p-1 hover:text-white" aria-label="Dismiss error">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {messages.length === 0 ? (
                    /* Empty / quick actions */
                    <div className="flex-1 overflow-y-auto">
                      <div className="flex min-h-full flex-col items-center justify-center px-4 py-8">
                        <div className="text-center">
                          {mode === "assistant" ? (
                            <BrainCircuit className="mx-auto mb-3 h-12 w-12 text-emerald-500/60" aria-hidden="true" />
                          ) : (
                            <GraduationCap className="mx-auto mb-3 h-12 w-12 text-emerald-500/60" aria-hidden="true" />
                          )}
                          <p className="font-mono text-sm text-zinc-400">
                            {mode === "assistant"
                              ? "আপনার পড়াশোনার সহায়ক — প্রগ্রেস দেখে পরামর্শ দেব।"
                              : "আমি আপনার পড়াশোনার জন্য সাহায্য করতে পারি।"}
                          </p>
                        </div>

                        <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
                          {mode === "tutor"
                            ? PRESET_PROMPTS.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => runPreset(p.label.bn)}
                                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                                >
                                  {p.label.bn}
                                </button>
                              ))
                            : ASSISTANT_QUICK_ACTIONS.map((a) => (
                                <button
                                  key={a.labelBn}
                                  type="button"
                                  onClick={() => runAssistantAction(a.prompt)}
                                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                                >
                                  {a.labelBn}
                                </button>
                              ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Messages */
                    <div ref={terminalRef} role="log" aria-live="polite" className="flex-1 overflow-y-auto">
                      <div className="mx-auto max-w-3xl space-y-5 px-3 py-4 sm:px-6 sm:py-5">
                        {messages.map((msg) => (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            <ChatMessage
                              message={msg as ChatMessageData}
                              streaming={status === "generating"}
                              copied={copiedId === msg.id}
                              feedbackSent={feedbackSent.has(msg.messageId ?? "")}
                              onCopy={(id, text) => void copyText(id, text)}
                              onFeedback={(messageId, rating) => void sendFeedback(messageId, rating)}
                              onAction={runAssistantAction}
                            />
                          </motion.div>
                        ))}

                        {showThinkingRow && (
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20">
                              <AiLogo solid={false} className="h-4 w-4" />
                            </div>
                            <TypingIndicator />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Retry + stop row */}
                  {(status === "generating" || messages.some((m) => m.error)) && (
                    <div className="flex items-center justify-center gap-2 px-4 pb-1.5">
                      {status === "generating" ? (
                        <button
                          type="button"
                          onClick={stopGeneration}
                          className="rounded-md border border-red-500/20 px-2.5 py-1 font-mono text-xs text-red-300 transition-colors hover:bg-red-500/10"
                        >
                          Stop
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={retryLast}
                          className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 px-2.5 py-1 font-mono text-xs text-emerald-300 transition-colors hover:bg-emerald-500/10"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Retry
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
                    className="border-t border-emerald-500/20 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-4"
                  >
                    <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-emerald-500/25 bg-subtle px-2 py-1.5 transition-colors focus-within:border-emerald-500/50">
                      <button
                        type="button"
                        onClick={toggleListening}
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition-all ${
                          isListening
                            ? "border-red-500/30 bg-red-500/10 text-red-400 animate-pulse"
                            : "border-zinc-700/60 text-zinc-400 hover:text-white"
                        }`}
                        title={isListening ? "Stop listening" : "Start voice input"}
                        aria-label={isListening ? "Stop listening" : "Start voice input"}
                        aria-pressed={isListening}
                      >
                        {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                      </button>
                      <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        aria-label="Type your question or use voice input"
                        placeholder={isListening ? "Listening..." : "Ask 9Th-Grade AI anything…"}
                        onChange={handleInputChange}
                        onKeyDown={handleInputKeyDown}
                        disabled={status === "generating"}
                        className="max-h-40 min-h-[38px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed text-zinc-300 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
                      />
                      <button
                        type="submit"
                        disabled={status === "generating" || !input.trim()}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Send message"
                      >
                        {status === "generating" ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Send className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    <p className="mt-1.5 text-center font-mono text-[10px] text-zinc-500">
                      9Th-Grade AI can make mistakes. Verify important facts.
                    </p>
                  </form>
                </div>
              </div>
            </motion.div>

            {/* Mobile conversation drawer */}
            <AnimatePresence>
              {sidebarOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setSidebarOpen(false)}
                    className="absolute inset-0 z-20 bg-zinc-950/60 lg:hidden"
                    aria-hidden="true"
                  />
                  <motion.aside
                    initial={{ x: -280 }}
                    animate={{ x: 0 }}
                    exit={{ x: -280 }}
                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    className="absolute inset-y-0 left-0 z-30 w-72 max-w-[85vw] border-r border-emerald-500/10 bg-[var(--surface-solid)] shadow-2xl lg:hidden"
                    aria-label="Conversation list"
                  >
                    {conversationList}
                  </motion.aside>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}