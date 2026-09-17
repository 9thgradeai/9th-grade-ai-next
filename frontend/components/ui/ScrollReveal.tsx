"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

type ScrollOffset = NonNullable<NonNullable<Parameters<typeof useScroll>[0]>["offset"]>[number];

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  from?: { opacity?: number; scale?: number; y?: number };
  to?: { opacity?: number; scale?: number; y?: number };
  start?: ScrollOffset;
  end?: ScrollOffset;
  scrub?: boolean;
}

const DEFAULT_FROM = { opacity: 0.15, scale: 0.92, y: 40 };
const DEFAULT_TO = { opacity: 1, scale: 1, y: 0 };
const DEFAULT_START = "0% end";
const DEFAULT_END = "30% start";

export default function ScrollReveal({
  children,
  className,
  from = DEFAULT_FROM,
  to = DEFAULT_TO,
  start = DEFAULT_START,
  end = DEFAULT_END,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: [start, end],
  });

  const opacity = useTransform(
    scrollYProgress,
    [0, 1],
    [from.opacity ?? DEFAULT_FROM.opacity, to.opacity ?? DEFAULT_TO.opacity],
  );
  const fromScale = from.scale ?? DEFAULT_FROM.scale;
  const toScale = to.scale ?? DEFAULT_TO.scale;
  const midScale = (fromScale + toScale) / 2;
  const scale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    [fromScale, midScale, toScale],
  );
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    [from.y ?? DEFAULT_FROM.y, to.y ?? DEFAULT_TO.y],
  );

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ opacity: shouldReduce ? 1 : opacity, scale: shouldReduce ? 1 : scale, y: shouldReduce ? 0 : y }}
    >
      {children}
    </motion.div>
  );
}
