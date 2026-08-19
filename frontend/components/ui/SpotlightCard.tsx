"use client";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useMotionValue,
  useMotionTemplate,
} from "framer-motion";
import type { ReactNode } from "react";

export default function SpotlightCard({
  children,
  className = "",
  spotColor = "rgba(16, 185, 129, 0.14)",
  spotSize = 320,
}: {
  children: ReactNode;
  className?: string;
  spotColor?: string;
  spotSize?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const mx = useMotionValue(-spotSize);
  const my = useMotionValue(-spotSize);
  const background = useMotionTemplate`radial-gradient(${spotSize}px circle at ${mx}px ${my}px, ${spotColor}, transparent 65%)`;

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
  };

  const onMouseLeave = () => {
    mx.set(-spotSize);
    my.set(-spotSize);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`group relative overflow-hidden ${className}`}
    >
      {!shouldReduceMotion && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-0"
          style={{ background }}
          aria-hidden="true"
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}