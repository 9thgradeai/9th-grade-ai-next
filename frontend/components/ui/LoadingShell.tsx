"use client";

import { AuroraRing, StatusText, BootProgress } from "./Loader";

/* ── Full "data-boot" loading panel ─────────────────────────────────────────
   Used at route boundaries (app/loading.tsx, app/dashboard/loading.tsx) and
   the dashboard auth gate. Renders the cosmic aurora ring, a cycling terminal
   status line, and a scanning progress bar inside a terminal-style frame so the
   dashboard boot feels like a sci-fi system starting up. */

export function LoadingShell({
  title = "LOADING_DASHBOARD",
  messages = ["initializing modules", "syncing data", "calibrating accuracy"],
  progressLabel = "dashboard boot",
  className = "",
}: {
  title?: string;
  messages?: string[];
  progressLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden flex flex-col items-center justify-center gap-6 text-center ${className}`}
    >
      {/* ambient cosmic backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -20%, rgb(20 184 166 / 0.16), transparent 60%), radial-gradient(ellipse 55% 45% at 85% 90%, rgb(167 139 250 / 0.12), transparent 55%)",
        }}
      />
      {/* scanline travelling down the frame */}
      <div aria-hidden="true" className="boot-scanline absolute inset-0" />

      <div className="relative flex flex-col items-center gap-6">
        <AuroraRing size={84} label={title} />

        {/* Terminal-style status block */}
        <div className="space-y-2">
          <p className="text-[var(--dashboard-primary)]/90 font-mono text-sm tracking-[0.3em] uppercase">
            {title}
          </p>
          <StatusText
            messages={messages}
            className="flex justify-center font-mono"
          />
        </div>

        <BootProgress label={progressLabel} />
      </div>

      {/* faint corner HUD brackets for terminal flair */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute top-3 left-3 h-4 w-4 border-l-2 border-t-2 border-[var(--primary)]/30" />
        <span className="absolute top-3 right-3 h-4 w-4 border-r-2 border-t-2 border-[var(--primary)]/30" />
        <span className="absolute bottom-3 left-3 h-4 w-4 border-l-2 border-b-2 border-[var(--primary)]/30" />
        <span className="absolute bottom-3 right-3 h-4 w-4 border-r-2 border-b-2 border-[var(--primary)]/30" />
      </div>
    </div>
  );
}
