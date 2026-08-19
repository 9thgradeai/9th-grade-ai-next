"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-ctx";
import { Eye, EyeOff, LockKeyhole, ShieldCheck, Zap, Sparkles, ArrowUpRight } from "lucide-react";
import Link from "next/link";

type Tone = "command" | "output" | "success" | "error" | "system" | "muted";
type LogEntry = { id: number; text: string; tone: Tone };
type Mode = "idle" | "login" | "register" | "busy";
type Step = "name" | "email" | "password" | "confirm";

const COMMANDS = ["help", "login", "register", "status", "whoami", "clear", "exit"];

const HELP_TEXT = [
  "Available commands:",
  "  help        show this help",
  "  login       sign in with email + password",
  "  register    create a new account",
  "  status      show system status",
  "  whoami      show current session",
  "  clear       clear the terminal",
  "  exit        return to the website",
  "",
  "Tip: TAB autocompletes commands · ↑/↓ recalls history · ^C cancels a flow",
];

const STATUS_TEXT = [
  "system     : online",
  "tls        : 1.3 (encrypted)",
  "uptime     : 99.99%",
  "rate-limit : 3 attempts / minute",
  "status     : accepting connections",
];

let lineId = 0;
const nextId = () => ++lineId;

export default function CLIAuthTerminal({ initialRegisterHint = false }: { initialRegisterHint?: boolean }) {
  const router = useRouter();
  const { login, register } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  const [log, setLog] = useState<LogEntry[]>([]);
  const [mode, setMode] = useState<Mode>("idle");
  const [step, setStep] = useState<Step | null>(null);
  const [input, setInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const fieldsRef = useRef<{ name: string; email: string; password: string }>({
    name: "",
    email: "",
    password: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootedRef = useRef(false);

  const push = useCallback((text: string, tone: Tone) => {
    setLog((prev) => [...prev, { id: nextId(), text, tone }]);
  }, []);

  const pushMany = useCallback(
    (lines: string[], tone: Tone) => {
      lines.forEach((l, i) => {
        setTimeout(() => push(l, tone), (shouldReduceMotion ? 0 : 90) * i);
      });
    },
    [push, shouldReduceMotion],
  );

  // Boot sequence
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const boot = [
      "9th-grade-ai — secure auth shell v2.4.0",
      "session: tls 1.3 • rate-limit: 3/min • storage: server-side",
    ];
    pushMany(boot, "muted");
    const hint = initialRegisterHint ? "hint: run 'register' to create your account" : "type 'help' for available commands";
    setTimeout(() => push(hint, "output"), (shouldReduceMotion ? 0 : 90) * boot.length + 80);
  }, [push, pushMany, initialRegisterHint, shouldReduceMotion]);

  // Auto-scroll to the newest line
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  // Keep focus on the active input
  useEffect(() => {
    inputRef.current?.focus();
  }, [mode, step, log.length]);

  const resetFlow = useCallback(() => {
    fieldsRef.current = { name: "", email: "", password: "" };
    setMode("idle");
    setStep(null);
    setInput("");
    setHistoryIndex(-1);
  }, []);

  const cancelFlow = useCallback(() => {
    push("^C — operation cancelled", "muted");
    resetFlow();
  }, [push, resetFlow]);

  const beginFlow = useCallback(
    (next: Mode) => {
      setMode(next);
      setStep(next === "register" ? "name" : "email");
      setInput("");
      setHistoryIndex(-1);
      push(next === "register" ? "register: create a new account" : "login: existing session", "system");
      push(next === "register" ? "enter name:" : "enter email:", "output");
    },
    [push],
  );

  const promptLabel = (): string => {
    if (step === "name") return "name:";
    if (step === "email") return "email:";
    if (step === "password") return "password:";
    if (step === "confirm") return "confirm password:";
    return "$";
  };

  const isPasswordStep = step === "password" || step === "confirm";

  const mask = useCallback(() => {
    return showPassword && isPasswordStep ? fieldsRef.current.password : "********";
  }, [showPassword, isPasswordStep]);

  const finishSubmit = useCallback(
    async (kind: "login" | "register") => {
      setMode("busy");
      setStep(null);
      setInput("");
      push("\\_ attempting " + kind + "...", "output");
      push("\\_ contacting auth service...", "output");

      try {
        const { name, email, password } = fieldsRef.current;
        if (kind === "register") {
          await register(name, email, password);
          push("✓ account created — welcome, " + name.trim() + "!", "success");
        } else {
          await login(email, password);
          push("✓ authentication successful", "success");
        }
        push("\\_ initializing session...", "output");
        push("\\_ redirecting to /dashboard", "muted");
        setTimeout(() => router.push("/dashboard"), shouldReduceMotion ? 250 : 900);
      } catch (err) {
        const message = err instanceof Error ? err.message : "an unexpected error occurred";
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: string }).code ?? "unknown")
            : "unknown";
        push("✗ error [" + code + "]: " + message, "error");
        push("\\_ run 'login' or 'register' to try again", "muted");
        resetFlow();
      }
    },
    [register, login, push, router, resetFlow, shouldReduceMotion],
  );

  const handleField = useCallback(
    (value: string) => {
      if (!step) return;
      const trimmed = value.trim();

      const fail = (msg: string) => {
        push("✗ " + msg + " — try again:", "error");
      };

      if (step === "name") {
        if (trimmed.length < 2) return fail("name must be at least 2 characters");
        fieldsRef.current.name = trimmed;
        push("name: " + trimmed, "output");
        setStep("email");
        push("enter email:", "output");
        return;
      }
      if (step === "email") {
        if (!trimmed.includes("@") || trimmed.length < 3) return fail("enter a valid email address");
        fieldsRef.current.email = trimmed.toLowerCase();
        push("email: " + trimmed.toLowerCase(), "output");
        setStep("password");
        push("enter password:", "output");
        return;
      }
      if (step === "password") {
        if (value.length < 8) return fail("password must be at least 8 characters");
        fieldsRef.current.password = value;
        push("password: " + mask(), "output");
        if (mode === "register") {
          setStep("confirm");
          push("confirm password:", "output");
        } else {
          void finishSubmit("login");
        }
        return;
      }
      if (value !== fieldsRef.current.password) return fail("passwords do not match");
      push("confirm: " + mask(), "output");
      void finishSubmit("register");
    },
    [step, mode, finishSubmit, push, mask],
  );

  const runCommand = useCallback(
    (raw: string) => {
      const cmd = raw.trim();
      if (cmd === "") return;

      if (cmd !== "clear") {
        push("$ " + cmd, "command");
        setHistory((h) => [...h, cmd]);
        setHistoryIndex(-1);
      }

      switch (cmd.toLowerCase()) {
        case "help":
          pushMany(HELP_TEXT, "output");
          return;
        case "login":
          beginFlow("login");
          return;
        case "register":
          beginFlow("register");
          return;
        case "status":
          pushMany(STATUS_TEXT, "system");
          return;
        case "whoami":
          push("session: unauthenticated", "output");
          push("identity: guest — run 'login' to continue", "muted");
          return;
        case "clear":
          setLog([]);
          return;
        case "exit":
          push("\\_ returning to website...", "muted");
          setTimeout(() => router.push("/"), shouldReduceMotion ? 0 : 400);
          return;
        default:
          push("command not found: " + cmd, "error");
          push("type 'help' to see available commands", "muted");
      }
    },
    [beginFlow, push, pushMany, router, shouldReduceMotion],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "busy") return;
    if (mode === "idle") {
      runCommand(input);
      setInput("");
    } else if (step) {
      handleField(input);
      setInput("");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
      if (mode !== "idle") {
        e.preventDefault();
        cancelFlow();
        setInput("");
      }
      return;
    }

    if (mode !== "idle") return;

    if (e.key === "Tab") {
      e.preventDefault();
      const match = COMMANDS.find((c) => c.startsWith(input.toLowerCase()));
      if (match) setInput(match);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const idx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(idx);
      setInput(history[idx]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      if (historyIndex >= history.length - 1) {
        setHistoryIndex(-1);
        setInput("");
        return;
      }
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      setInput(history[idx]);
    }
  };

  const autoComplete: {
    name: string;
    autoComplete: "email" | "name" | "current-password" | "new-password";
  } =
    mode === "idle"
      ? { name: "email", autoComplete: "email" }
      : step === "name"
        ? { name: "name", autoComplete: "name" }
        : step === "email"
          ? { name: "email", autoComplete: "email" }
          : step === "password"
            ? { name: "password", autoComplete: mode === "login" ? "current-password" : "new-password" }
            : { name: "confirm", autoComplete: "new-password" };

  return (
    <section className="relative min-h-dvh flex items-center justify-center px-4 py-12 overflow-hidden">
      {/* Ambient aurora */}
      <motion.div
        className="absolute -top-28 left-1/4 w-[34rem] h-[34rem] bg-emerald-500/10 rounded-full blur-[130px]"
        aria-hidden="true"
        animate={shouldReduceMotion ? { opacity: 0.5 } : { opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 right-1/6 w-[30rem] h-[30rem] bg-indigo-500/10 rounded-full blur-[130px]"
        aria-hidden="true"
        animate={shouldReduceMotion ? { opacity: 0.4 } : { opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative w-full max-w-2xl">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-4 px-1"
        >
          <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-semibold text-white tracking-tight hover:opacity-90 transition-opacity">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 via-emerald-500 to-cyan-500 shadow-[0_0_20px_rgba(16,185,129,0.35)] flex items-center justify-center text-zinc-950 font-mono font-bold">
              {"⌁"}
            </span>
            <span>9th-grade-ai</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" aria-hidden="true" />
            secure.shell
          </span>
        </motion.div>

        {/* Terminal window */}
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="rounded-2xl overflow-hidden border border-white/10 bg-[#060a12]/95 shadow-panel backdrop-blur"
        >
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex-1 text-center text-xs text-zinc-500 font-mono truncate">
              guest@9th-grade-ai:~/auth — zsh
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              <span className="hidden sm:inline text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                tls 1.3
              </span>
            </div>
          </div>

          {/* Terminal body */}
          <div
            ref={scrollRef}
            role="log"
            aria-live="polite"
            className="cli-scroll h-[min(64vh,540px)] overflow-y-auto px-4 sm:px-5 py-4 font-mono text-[13px] sm:text-sm leading-relaxed text-zinc-300 space-y-0.5"
          >
            {log.map((line) => (
              <div
                key={line.id}
                className={
                  line.tone === "command"
                    ? "text-zinc-100"
                    : line.tone === "success"
                      ? "text-emerald-400"
                      : line.tone === "error"
                        ? "text-red-400"
                        : line.tone === "system"
                          ? "text-cyan-400"
                          : line.tone === "muted"
                            ? "text-zinc-600"
                            : "text-zinc-400"
                }
              >
                {line.tone === "command" && (
                  <span className="text-emerald-400 select-none">{"$ "}</span>
                )}
                <span className="whitespace-pre-wrap break-words">{line.text}</span>
              </div>
            ))}

            {/* Active line */}
            {mode !== "busy" && (
              <form onSubmit={onSubmit} className="flex items-center gap-2 min-w-0">
                <span
                  className={
                    mode === "idle"
                      ? "text-emerald-400 select-none"
                      : "text-emerald-300 select-none"
                  }
                >
                  {mode === "idle" ? "$ " : promptLabel() + " "}
                </span>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  name={autoComplete.name}
                  autoComplete={autoComplete.autoComplete}
                  type={isPasswordStep && !showPassword ? "password" : "text"}
                  aria-label={
                    mode === "idle"
                      ? "Terminal command input"
                      : `Enter your ${step === "name" ? "name" : step === "email" ? "email" : "password"}`
                  }
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="flex-1 min-w-0 bg-transparent outline-none text-zinc-100 caret-emerald-400 placeholder-zinc-600"
                  placeholder={mode === "idle" ? "type 'help'..." : ""}
                />
                {isPasswordStep && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPassword((v) => !v);
                      inputRef.current?.focus();
                    }}
                    className="text-zinc-500 hover:text-emerald-400 transition-colors p-1"
                    aria-label={showPassword ? "Hide password" : "Reveal password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
                <span className="cli-cursor text-emerald-400 select-none" aria-hidden="true" />
              </form>
            )}

            {/* Busy indicator */}
            {mode === "busy" && (
              <div className="flex items-center gap-2 text-zinc-500">
                <span className="inline-flex gap-1" aria-hidden="true">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:300ms]" />
                </span>
                processing...
              </div>
            )}
          </div>

          {/* Footer — keyboard shortcuts + trust */}
          <div className="border-t border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-zinc-500">
                <span><kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">TAB</kbd> complete</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">↑↓</kbd> history</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">^C</kbd> cancel</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">ENTER</kbd> submit</span>
              </div>
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-emerald-400 transition-colors"
              >
                back to site <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5">
              {[
                { icon: Zap, label: "Free forever" },
                { icon: LockKeyhole, label: "Passwords never stored in plain text" },
                { icon: ShieldCheck, label: "Syllabus-aligned & private" },
              ].map((t) => (
                <span key={t.label} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono">
                  <t.icon className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  {t.label}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}