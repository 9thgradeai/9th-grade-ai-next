"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

export function AuthChoice({ onChoose }: { onChoose: (kind: "login" | "signup") => void }) {
  const options = [
    {
      kind: "login" as const,
      title: "I have an account",
      subtitle: "Sign in to your dashboard",
      icon: <ArrowRight className="h-5 w-5" aria-hidden="true" />,
    },
    {
      kind: "signup" as const,
      title: "I'm new here",
      subtitle: "Create your account",
      icon: <Sparkles className="h-5 w-5" aria-hidden="true" />,
    },
  ];

  return (
    <motion.div
      role="group"
      aria-label="Do you already have an account?"
      className="flex w-full flex-col gap-3"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      {options.map((opt) => (
        <motion.button
          key={opt.kind}
          type="button"
          onClick={() => onChoose(opt.kind)}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.985 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-[var(--border-muted)] bg-[var(--surface-raised)] px-5 py-4 text-left shadow-sm transition-colors hover:border-emerald-400/60 hover:bg-[var(--surface)]"
        >
          <span>
            <span className="block text-base font-semibold text-[var(--foreground)]">{opt.title}</span>
            <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{opt.subtitle}</span>
          </span>
          <span className="text-[var(--text-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-emerald-400">
            {opt.icon}
          </span>
        </motion.button>
      ))}
    </motion.div>
  );
}