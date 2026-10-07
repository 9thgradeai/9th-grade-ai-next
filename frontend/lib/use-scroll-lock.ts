"use client";

import { useEffect } from "react";

// Shared background scroll-lock for dashboard overlays (bottom sheets,
// dialogs, drawers, command palette, notification panel).
//
// Fixed overlays don't stop the dashboard scroller behind them
// (#dashboard-content) from receiving chained scrolls — swiping a sheet
// slides the whole layout underneath. Lock both the dashboard scroller and
// <body> while any overlay is open.
//
// Nesting-safe: a module counter keeps the lock until the last overlay
// closes; the pre-lock overflow values are restored exactly once.

let lockCount = 0;
let prevBodyOverflow = "";
let prevDashOverflow = "";

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    if (lockCount === 0) {
      prevBodyOverflow = document.body.style.overflow;
      const dash = document.getElementById("dashboard-content");
      prevDashOverflow = dash?.style.overflow ?? "";
      document.body.style.overflow = "hidden";
      if (dash) dash.style.overflow = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = prevBodyOverflow;
        const dash = document.getElementById("dashboard-content");
        if (dash) dash.style.overflow = prevDashOverflow;
      }
    };
  }, [active]);
}
