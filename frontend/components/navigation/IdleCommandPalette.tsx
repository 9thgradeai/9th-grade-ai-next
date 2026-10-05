"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// Sprint 6: the command palette is interaction-only — nobody presses ⌘K in
// the first seconds. Mounting it on idle (or on first ⌘K/Ctrl+K, whichever
// comes first) keeps its chunk out of the hydration critical path. A missed
// early ⌘K still works: the key listener mounts the palette on demand.
const CommandPalette = dynamic(() => import("@/components/navigation/CommandPalette"), {
  ssr: false,
});

export default function IdleCommandPalette() {
  const [ready, setReady] = useState(false);
  const pendingOpen = useRef(false);

  useEffect(() => {
    if (ready) {
      // A Search click may have arrived before the chunk loaded — replay it
      // once the palette is listening.
      if (pendingOpen.current) {
        pendingOpen.current = false;
        window.dispatchEvent(new Event("app:open-command"));
      }
      return;
    }
    const mount = (reopen = false) => {
      if (reopen) pendingOpen.current = true;
      setReady(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        mount();
      }
    };
    const onOpenCommand = () => mount(true);
    // The navbar Search button fires this even when the palette chunk
    // hasn't loaded — mount on demand so the click is never swallowed.
    window.addEventListener("keydown", onKey);
    window.addEventListener("app:open-command", onOpenCommand);
    let idleId = 0;
    let timer = 0;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(() => mount(), { timeout: 4000 });
    } else {
      timer = window.setTimeout(() => mount(), 2500);
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("app:open-command", onOpenCommand);
      if (idleId) window.cancelIdleCallback?.(idleId);
      if (timer) window.clearTimeout(timer);
    };
  }, [ready]);

  if (!ready) return null;
  return <CommandPalette />;
}
