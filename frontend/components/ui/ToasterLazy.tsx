"use client";

import dynamic from "next/dynamic";

/**
 * The toaster relies on Framer Motion for enter/exit transitions. It is not part
 * of first paint, so we load it lazily (client-only) — this keeps the animation
 * library out of the initial JavaScript bundle and off the critical path for
 * Lighthouse performance.
 */
const Toaster = dynamic(() => import("@/components/ui/Toaster").then((m) => m.default), {
  ssr: false,
});

export default function ToasterLazy() {
  return <Toaster />;
}
