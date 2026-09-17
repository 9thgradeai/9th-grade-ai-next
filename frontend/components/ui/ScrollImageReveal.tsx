"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

type ScrollOffset = NonNullable<NonNullable<Parameters<typeof useScroll>[0]>["offset"]>[number];

interface ScrollImageProps {
  children: ReactNode;
  className?: string;
  start?: ScrollOffset;
  end?: ScrollOffset;
  fromScale?: number;
  toScale?: number;
  fromOpacity?: number;
  toOpacity?: number;
}

export default function ScrollImageReveal({
  children,
  className,
  start = "0% end",
  end = "80% start",
  fromScale = 0.8,
  toScale = 1,
  fromOpacity = 0.2,
  toOpacity = 1,
}: ScrollImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: [start, end],
  });

  const scale = useTransform(scrollYProgress, [0, 1], [fromScale, toScale]);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [fromOpacity, toOpacity, fromOpacity * 0.6]);

  return (
    <div ref={ref} className={`overflow-hidden ${className ?? ""}`}>
      <motion.div style={{ scale: shouldReduce ? 1 : scale, opacity: shouldReduce ? 1 : opacity }} className="will-change-transform">
        {children}
      </motion.div>
    </div>
  );
}
