"use client";

import type { ReactNode } from "react";
import { ArrowRight, WifiSlash } from "@phosphor-icons/react";
import { useNetworkStatus } from "@/lib/ui-states";

/**
 * OfflineState — never leave a blank screen when connectivity drops.
 *
 * Two shapes:
 *   • `OfflineState` (default) — a full-panel message for a surface that cannot
 *     load without the network.
 *   • `<OfflineState banner />` — a thin strip for surfaces that still have
 *     cached content to show, so the user keeps reading and knows why
 *     mutations are failing.
 *
 * Renders nothing while online (unless `force`), so callers can drop it above
 * any content unconditionally.
 */
export default function OfflineState({
  title = "You're offline",
  message = "We can't reach the server. Check your connection — this screen will recover on its own once you're back.",
  banner = false,
  force = false,
  onRetry,
  children,
  className = "",
}: {
  title?: string;
  message?: string;
  /** Thin top strip instead of a full-panel state. */
  banner?: boolean;
  /** Render even when the browser claims to be online. */
  force?: boolean;
  onRetry?: () => void;
  /** Content kept visible in banner mode. */
  children?: ReactNode;
  className?: string;
}) {
  const status = useNetworkStatus();
  const offline = force || status === "offline";

  if (banner) {
    return (
      <>
        {offline && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-3 border-b px-4 py-2"
            style={{
              borderColor: "color-mix(in srgb, var(--dashboard-warning) 30%, transparent)",
              background: "var(--dashboard-warning-subtle)",
            }}
          >
            <p className="flex items-center gap-1.5 text-[11px] font-mono" style={{ color: "var(--dashboard-warning)" }}>
              <WifiSlash aria-hidden="true" className="h-3.5 w-3.5" />
              {title} — showing saved content
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-[11px] underline underline-offset-2"
                style={{ color: "var(--dashboard-warning)" }}
              >
                Retry
              </button>
            )}
          </div>
        )}
        {children}
      </>
    );
  }

  if (!offline) return <>{children}</>;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
    >
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--dashboard-warning)]/30 bg-[var(--dashboard-warning-subtle)]">
        <WifiSlash aria-hidden="true" className="h-5 w-5" style={{ color: "var(--dashboard-warning)" }} />
      </span>

      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {message}
      </p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 flex items-center gap-1.5 rounded-lg px-4 py-2 font-mono text-xs"
          style={{ background: "var(--accent)", color: "var(--dashboard-text-inverse)" }}
        >
          Retry
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
