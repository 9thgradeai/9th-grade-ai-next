"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { useMotionCapabilities } from "@/lib/motion/device";

/**
 * Magnetic CTA wrapper — the child drifts a few pixels toward the cursor.
 * Max displacement ~5px; disabled on touch, reduced motion, and low-tier
 * devices. Pure MotionValues: no re-renders while tracking the pointer.
 */
export default function Magnetic({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { pointerEffects } = useMotionCapabilities();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(rawY, { stiffness: 220, damping: 18, mass: 0.4 });

  const MAX_SHIFT = 5;

  const handlePointerMove = (e: PointerEvent<HTMLSpanElement>) => {
    if (!pointerEffects) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = (e.clientX - (rect.left + rect.width / 2)) / rect.width;
    const dy = (e.clientY - (rect.top + rect.height / 2)) / rect.height;
    rawX.set(Math.max(-1, Math.min(1, dx * 2)) * MAX_SHIFT);
    rawY.set(Math.max(-1, Math.min(1, dy * 2)) * MAX_SHIFT);
  };

  const handlePointerLeave = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.span
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ x, y }}
      className="inline-block"
    >
      {children}
    </motion.span>
  );
}
