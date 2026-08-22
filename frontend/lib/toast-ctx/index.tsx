"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type ToastVariant = "success" | "error" | "info";

export type Toast = {
  id: number;
  variant: ToastVariant;
  message: string;
};

type ToastContextValue = {
  toasts: Toast[];
  dismiss: (id: number) => void;
  push: (variant: ToastVariant, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE_TOASTS = 3;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE_TOASTS - 1)), { id, variant, message }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, dismiss, push }), [toasts, dismiss, push]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return useMemo(
    () => ({
      toasts: ctx.toasts,
      dismiss: ctx.dismiss,
      success: (message: string) => ctx.push("success", message),
      error: (message: string) => ctx.push("error", message),
      info: (message: string) => ctx.push("info", message),
    }),
    [ctx],
  );
}

/** Optional access — lets components degrade to silent no-ops when no
 *  ToastProvider is mounted (e.g. standalone component tests). Production
 *  always mounts the provider at the root layout. */
const noop = () => {};
const SAFE_FALLBACK = {
  toasts: [] as Toast[],
  dismiss: noop,
  success: noop,
  error: noop,
  info: noop,
};

export function useToastSafe() {
  const ctx = useContext(ToastContext);
  return useMemo(() => {
    if (!ctx) return SAFE_FALLBACK;
    return {
      toasts: ctx.toasts,
      dismiss: ctx.dismiss,
      success: (message: string) => ctx.push("success", message),
      error: (message: string) => ctx.push("error", message),
      info: (message: string) => ctx.push("info", message),
    };
  }, [ctx]);
}
