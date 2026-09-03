"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LogOut } from "lucide-react";
import { Avatar } from "@/components/auth/Avatar";
import { AuthMessage } from "@/components/auth/AuthMessage";

/**
 * Cinematic sign-out moment — the bookend to the lamp-and-avatar auth story.
 * The companion says goodbye, the room dims, then the session ends. Escape or
 * "Actually, I'll stay" cancels and keeps the session intact.
 */
export function FarewellOverlay({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    const hold = reduced ? 450 : 1650;
    const t = setTimeout(onComplete, hold);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onComplete, onCancel, reduced]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Logging out"
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-black/90 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[10%] h-[75vh]"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ background: "radial-gradient(closest-side, rgba(251,191,36,0.14), transparent 70%)" }}
      />
      <div className="relative flex flex-col items-center gap-5 px-6 text-center">
        <Avatar mood="goodbye" />
        <AuthMessage message="See you soon. 👋" />
        <p className="flex items-center gap-1.5 text-xs text-[var(--dashboard-text-muted)]">
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Logging you out…
        </p>
        <button
          type="button"
          onClick={onCancel}
          autoFocus
          className="mt-2 rounded-full border border-zinc-700 px-5 py-2.5 text-sm text-[var(--dashboard-text-secondary)] transition-colors hover:border-emerald-400/60 hover:text-[var(--dashboard-primary)] focus-visible:ring-2 focus-visible:ring-emerald-400/80"
        >
          Actually, I&apos;ll stay
        </button>
      </div>
    </motion.div>
  );
}