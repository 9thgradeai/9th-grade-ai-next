"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getSnapshot(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function getServerSnapshot(): boolean {
  return true;
}

/** Offline indicator — pairs with the registered service worker so users
 *  know cached content is being served instead of failing silently. */
export default function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const t = useT();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[var(--z-tooltip)] -translate-x-1/2 rounded-xl border border-[var(--warning)]/40 bg-[var(--dashboard-warning-subtle)] px-4 py-2 text-xs font-mono text-[var(--dashboard-warning)] shadow-lg"
    >
      {t("offline.banner")}
    </div>
  );
}
