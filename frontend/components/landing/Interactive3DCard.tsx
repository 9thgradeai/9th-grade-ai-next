"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { useMotionCapabilities } from "@/lib/motion/device";

/**
 * Reusable dimensional card: pointer-tracked perspective tilt with a
 * cursor-following border glow.
 *
 * Performance contract:
 *  - zero React state per pointer frame (MotionValues + CSS variables only)
 *  - transform-only animation (no layout properties)
 *  - disabled for touch, reduced motion, and low-tier devices
 *  - capability comes from a hydration-safe hook, so SSR markup always
 *    matches the first client render
 */
export default function Interactive3DCard({
  children,
  className = "",
  maxRotation = 3,
  glow = true,
}: {
  children: ReactNode;
  className?: string;
  /** Peak tilt in degrees on each axis. Keep this small — ±3° reads premium. */
  maxRotation?: number;
  glow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { pointerEffects } = useMotionCapabilities();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateY = useSpring(rawX, { stiffness: 160, damping: 20, mass: 0.6 });
  const rotateX = useSpring(rawY, { stiffness: 160, damping: 20, mass: 0.6 });

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointerEffects) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    // Normalized cursor position (-0.5 … 0.5)
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rawX.set(px * maxRotation * 2);
    rawY.set(-py * maxRotation * 2);
    if (glow) {
      const el = ref.current;
      el?.style.setProperty("--glow-x", `${(px + 0.5) * 100}%`);
      el?.style.setProperty("--glow-y", `${(py + 0.5) * 100}%`);
    }
  };

  const handlePointerLeave = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <div style={{ perspective: 900 }} className={className}>
      <motion.div
        ref={ref}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className={`group relative h-full ${glow ? "[--glow-x:50%] [--glow-y:50%]" : ""}`}
      >
        {glow && pointerEffects ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(260px circle at var(--glow-x) var(--glow-y), rgba(45,212,191,0.14), transparent 65%)",
            }}
          />
        ) : null}
        <div className="relative z-10 h-full">{children}</div>
      </motion.div>
    </div>
  );
}
