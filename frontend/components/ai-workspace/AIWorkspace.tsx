"use client";

// AI Workspace — the real, streaming AI Tutor + Assistant + Study Coach.
// Replaces the old hardcoded keyword mock. Persists conversations, streams
// genuine model output, supports voice (STT/TTS) and feedback, and surfaces
// only real coach tool activity while an agent turn is running.
//
// Shell: mobile is a full-viewport takeover with a slide-over rail; desktop is
// a docked rounded panel with an always-visible conversation rail.

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, PanelLeft } from "lucide-react";
import AiLogo from "@/components/ui/AiLogo";
import {
  listConversations,
  getConversation,
  tutorTurn,
  askAssistant,
  runAgentTurn,
  renameConversation,
  pinConversation,
  deleteConversation,
  submitFeedback,
  AIError,
} from "@/lib/services/ai";
import type { AIConversationSummary, AIMessageDto } from "@/lib/services/ai/types";
import { subscribeToLaunch } from "@/lib/ai-launcher";
import { useAuth } from "@/lib/auth-ctx";
import ModeSwitcher from "./ModeSwitcher";
import ConversationRail from "./ConversationRail";
import ComposerBar from "./ComposerBar";
import EmptyState from "./EmptyState";
import ThreadView from "./ThreadView";
import {
  STATUS_LABEL,
  type Mode,
  type Status,
  type UIMessage,
  type WorkspaceMeta,
  type SpeechRecognitionLike,
  type SpeechRecognitionCtor,
} from "./types";
import type { AgentBlockDto } from "@/lib/types";

function messageToUI(m: AIMessageDto): UIMessage {
  return {
    id: m.id,
    role: m.role === "USER" ? "user" : "ai",
    text:
      m.role === "ASSISTANT" && (m.status === "FAILED" || !m.content)
        ? "দুঃখিত, এখন উত্তর তৈরি করা যাচ্ছে না।"
        : m.content,
    messageId: m.role === "ASSISTANT" ? m.id : undefined,
    error: m.status === "FAILED",
  };
}

function statusVariant(status: Status): string {
  switch (status) {
    case "listening":
      return "is-listening";
    case "generating":
      return "is-working";
    case "error":
      return "is-error";
    default:
      return "is-ready";
  }
}

export default function AIWorkspace() {
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

  // Real coach activity surfaced from the agent stream.
  const [activity, setActivity] = useState<string | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [meta, setMeta] = useState<WorkspaceMeta>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
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

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    setPendingContext({});
    setMeta(null);
    setActivity(null);
    setTools([]);
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setActiveConversationId(id);
    setError(null);
    setSidebarOpen(false);
    setMeta(null);
    try {
      const data = await getConversation(id);
      setMessages(data.messages.map(messageToUI));
    } catch (e) {
      setError(e instanceof AIError ? e.message : "Could not load conversation.");
    }
  }, []);

  const removeConversation = useCallback(
    async (id: string) => {
      try {
        await deleteConversation(id);
        if (activeConversationId === id) startNewConversation();
        void refreshConversations();
      } catch (e) {
        setError(e instanceof AIError ? e.message : "Could not delete conversation.");
      }
    },
    [activeConversationId, refreshConversations, startNewConversation],
  );

  const applyConversationUpdate = useCallback((id: string, patch: Partial<AIConversationSummary>) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

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

  const sendTurn = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || status === "generating" || !user) return;

      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setError(null);
      setStatus("generating");
      setMeta(null);
      setActivity(null);
      setTools([]);
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text }]);

      const ctx = pendingContext;

      // AI study coach — bounded tool loop, streams tool activity + typed blocks.
      if (mode === "agent") {
        const abortController = new AbortController();
        abortRef.current = abortController;
        const placeholderId = `stream-${Date.now()}`;
        setMessages((prev) => [...prev, { id: placeholderId, role: "ai", text: "" }]);

        let assistantText = "";
        const blocks: AgentBlockDto[] = [];
        try {
          const result = await runAgentTurn({
            conversationId: activeConversationId ?? undefined,
            question: text,
            context: {
              subjectId: ctx.subjectId,
              topicId: ctx.topicId,
              topicPath: ctx.topicPath,
              questionId: ctx.questionId,
            },
            onDelta: (chunk) => {
              assistantText += chunk;
              setMessages((prev) =>
                prev.map((m) => (m.id === placeholderId ? { ...m, text: assistantText } : m)),
              );
            },
            onStatus: (message) => {
              setActivity(message);
              if (assistantText === "") {
                setMessages((prev) =>
                  prev.map((m) => (m.id === placeholderId ? { ...m, text: message } : m)),
                );
              }
            },
            onTool: (tool) => {
              setTools((prev) =>
                tool.action === "started"
                  ? prev.includes(tool.name)
                    ? prev
                    : [...prev, tool.name]
                  : prev.filter((t) => t !== tool.name),
              );
            },
            onBlock: (block) => {
              blocks.push(block);
              setMessages((prev) =>
                prev.map((m) => (m.id === placeholderId ? { ...m, blocks: [...blocks] } : m)),
              );
            },
            signal: abortController.signal,
          });
          abortRef.current = null;
          setStatus("idle");
          setTools([]);
          setMeta({ provider: result.provider, model: result.model });
          if (result.conversationId) {
            setActiveConversationId(result.conversationId);
            void refreshConversations();
            void syncFromServer(result.conversationId);
          }
          setPendingContext({});
        } catch (e) {
          abortRef.current = null;
          setTools([]);
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
        return;
      }

      if (mode === "assistant") {
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
          setMeta({ provider: res.source });
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
        const res = await tutorTurn({
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
        setMeta({ provider: res.source, model: res.model });
        if (res.conversationId) {
          setActiveConversationId(res.conversationId);
          void refreshConversations();
          void syncFromServer(res.conversationId);
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
    },
    [status, user, handleError, refreshConversations, syncFromServer, mode, activeConversationId, pendingContext],
  );

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) void sendTurn(lastUser.text);
  }, [messages, sendTurn]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setActivity(null);
    setTools([]);
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

  const runPrompt = useCallback(
    (text: string) => {
      void sendTurn(text);
    },
    [sendTurn],
  );

  const closeWorkspace = useCallback(() => {
    // Dismissing the panel must NOT stop an in-flight generation. The stream
    // keeps running in the background (launcher shows a live pulse) so users
    // can browse any dashboard tab while the AI finishes; only the explicit
    // Stop button aborts.
    setShowModal(false);
  }, []);

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
  useEffect(() => {
    if (!showModal) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const prevFocused = document.activeElement as HTMLElement | null;
    const focusable = dialog.querySelector<HTMLElement>(
      "button, [href], input, textarea, [tabindex]:not([tabindex=\"-1\"])",
    );
    focusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowModal(false);
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button, [href], input, textarea, [tabindex]:not([tabindex=\"-1\"])",
        ),
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

  const contextChip =
    pendingContext.topicPath ??
    (pendingContext.questionId ? `প্রশ্ন #${pendingContext.questionId}` : null);

  const rail = (
    <ConversationRail
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
      {/* Floating AI launcher — with a live pulse while a background
          generation is running with the panel dismissed. The launcher itself
          is bottom-anchored; the pulse pill stacks above it. */}
      <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 sm:bottom-24 sm:right-6">
        <AnimatePresence>
          {status === "generating" && !showModal && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              role="status"
              className="flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] shadow-lg"
              style={{
                borderColor: "var(--dashboard-border-muted)",
                background: "var(--dashboard-surface-muted)",
                color: "var(--dashboard-primary)",
              }}
            >
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ background: "var(--dashboard-primary)" }}
                />
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ background: "var(--dashboard-primary)" }}
                />
              </span>
              <span className="max-w-[180px] truncate">
                {activity ?? STATUS_LABEL.generating}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            setShowModal(true);
            setError(null);
          }}
          className="ai-launcher flex h-12 w-12 items-center justify-center rounded-2xl sm:h-14 sm:w-14"
          aria-label="Open AI Tutor and Assistant"
        >
          <AiLogo className="h-10 w-10 sm:h-12 sm:w-12" />
        </motion.button>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="ai-workspace fixed inset-0 z-[60] flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeWorkspace}
              className="absolute inset-0 bg-[var(--dashboard-overlay)] backdrop-blur-sm"
              aria-hidden="true"
            />

            {/* Panel — full-viewport takeover on mobile, docked panel on desktop */}
            <motion.div
              ref={dialogRef}
              initial={{ opacity: 0, y: 12, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.995 }}
              transition={{ type: "spring", damping: 30, stiffness: 260 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-workspace-title"
              className="ai-panel relative m-auto flex h-full w-full flex-col overflow-hidden border sm:h-[min(94dvh,940px)] sm:w-[min(1160px,96vw)] sm:rounded-2xl sm:shadow-2xl"
            >
              {/* Header */}
              <div className="ai-header flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSidebarOpen((v) => !v)}
                    className="ai-icon-btn h-9 w-9 lg:hidden"
                    aria-label="Toggle conversation list"
                  >
                    <PanelLeft className="h-5 w-5" />
                  </button>
                  <AiLogo className="h-7 w-7 flex-shrink-0" />
                  <span id="ai-workspace-title" className="truncate font-mono font-bold text-[var(--accent)]">
                    9Th-Grade AI
                  </span>
                  <div className="ml-1 flex-shrink-0">
                    <ModeSwitcher mode={mode} onChange={setMode} />
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-1">
                  <span
                    aria-live="polite"
                    className={`ai-status ${statusVariant(status)} hidden font-mono text-xs md:inline-flex`}
                  >
                    {STATUS_LABEL[status]}
                  </span>

                  {activeConversationId && (
                    <button
                      type="button"
                      onClick={startNewConversation}
                      className="ai-icon-btn h-9 w-9 lg:hidden"
                      aria-label="New conversation"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeWorkspace}
                    className="ai-icon-btn h-9 w-9"
                    aria-label="Close AI workspace"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex min-h-0 flex-1">
                {/* Conversation rail (desktop) */}
                <aside className="ai-rail hidden w-64 flex-shrink-0 lg:block" aria-label="Conversation list">
                  {rail}
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
                        className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-[var(--dashboard-danger)]/25 bg-[var(--dashboard-danger-subtle)] px-3 py-2 text-xs text-[var(--dashboard-danger)]"
                      >
                        <span className="flex-1">{error}</span>
                        <button
                          type="button"
                          onClick={() => setError(null)}
                          className="ai-icon-btn h-7 w-7"
                          aria-label="Dismiss error"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {messages.length === 0 ? (
                    <EmptyState mode={mode} contextChip={contextChip} onPrompt={runPrompt} />
                  ) : (
                    <ThreadView
                      messages={messages}
                      status={status}
                      meta={meta}
                      copiedId={copiedId}
                      feedbackSent={feedbackSent}
                      terminalRef={terminalRef}
                      onCopy={(id, text) => void copyText(id, text)}
                      onFeedback={(messageId, rating) => void sendFeedback(messageId, rating)}
                      onQuickPrompt={runPrompt}
                      onBlocksAction={closeWorkspace}
                    />
                  )}

                  {/* Retry row */}
                  {status !== "generating" && messages.some((m) => m.error) && (
                    <div className="flex items-center justify-center px-4 pb-1.5">
                      <button
                        type="button"
                        onClick={retryLast}
                        className="ai-ghost font-mono text-xs"
                      >
                        ↻ Retry
                      </button>
                    </div>
                  )}

                  <ComposerBar
                    input={input}
                    status={status}
                    activity={activity}
                    tools={tools}
                    isListening={isListening}
                    textareaRef={inputRef}
                    onInputChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    onSubmit={() => void sendTurn(input)}
                    onStop={stopGeneration}
                    onToggleVoice={toggleListening}
                  />
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
                    className="absolute inset-0 z-20 bg-[var(--dashboard-overlay)] lg:hidden"
                    aria-hidden="true"
                  />
                  <motion.aside
                    initial={{ x: -300 }}
                    animate={{ x: 0 }}
                    exit={{ x: -300 }}
                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    className="absolute inset-y-0 left-0 z-30 w-72 max-w-[85vw] border-r border-[var(--dashboard-border-muted)] shadow-2xl lg:hidden"
                    aria-label="Conversation list"
                  >
                    <div className="h-full bg-[var(--surface-elevated)]">{rail}</div>
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