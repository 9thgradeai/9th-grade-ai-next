"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders modal overlays (bottom sheets, confirm dialogs) into
 * document.body instead of inline in the tab tree.
 *
 * REQUIRED, not cosmetic: dashboard tab content lives inside layout
 * containers that create stacking contexts (positioned + z-indexed
 * <main>, backdrop-blur sticky headers). Any `fixed inset-0` overlay
 * rendered inline is trapped inside that context, so the root-level
 * mobile bottom nav (z-sticky) paints ABOVE the sheet and swallows taps
 * on its footer, on phones the sheet's primary action becomes
 * unreachable. Portaling escapes the trap; the --z-modal scale then
 * applies globally as designed.
 *
 * SSR-safe: renders nothing until mounted (no portal target on server).
 * Focus trapping (useDialogA11y), scroll locking (useScrollLock), and
 * AnimatePresence exit animations all keep working, they operate on
 * document/body level, independent of DOM location.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
