"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useToast, type ToastVariant } from "@/lib/toast-ctx";

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-[var(--dashboard-primary)]",
  error: "border-red-500/30 bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)]",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-300",
};

const VARIANT_ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export default function Toaster() {
  const { toasts, dismiss } = useToast();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:pb-6 lg:items-end lg:right-4 lg:left-auto"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = VARIANT_ICONS[toast.variant];
          return (
            <motion.div
              key={toast.id}
              layout
              role="status"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
              className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-terminal-rounded border px-4 py-3 glass shadow-panel ${VARIANT_STYLES[toast.variant]}`}
            >
              <Icon size={18} className="shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm font-medium text-white">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-1 min-h-[24px] min-w-[24px] flex items-center justify-center text-[var(--dashboard-text-muted)] hover:text-white transition-colors"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
