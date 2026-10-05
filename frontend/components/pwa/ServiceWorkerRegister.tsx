"use client";

import { useEffect } from "react";

// Sprint 9: registers the hand-rolled service worker (assets/pwa/sw.js,
// copied to public/sw.js at build time). Production only — registering in
// dev would serve stale chunks across hot reloads.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // Fire-and-forget by design: offline support is progressive enhancement.
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
