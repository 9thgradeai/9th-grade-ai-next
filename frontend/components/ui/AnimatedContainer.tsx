"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { transitions } from "@/lib/transitions";

const animations: Record<string, Variants> = {
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  fadeInUp: {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  },
  fadeInDown: {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0 },
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1 },
  },
  slideInLeft: {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0 },
  },
  slideInRight: {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0 },
  },
};

export type AnimationName = keyof typeof animations;

interface AnimatedContainerProps {
  children: React.ReactNode;
  animation?: AnimationName;
  delay?: number;
  duration?: number;
  className?: string;
}

export function AnimatedContainer({
  children,
  animation = "fadeInUp",
  delay = 0,
  duration,
  className,
}: AnimatedContainerProps) {
  const shouldReduceMotion = useReducedMotion();
  const resolved = shouldReduceMotion ? animations.fadeIn : animations[animation];
  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { ...transitions.smooth, duration: duration ?? 0.5, delay };

  return (
    <motion.div
      variants={resolved}
      initial="hidden"
      animate="visible"
      transition={transition}
      className={className}
    >
      {children}
    </motion.div>
  );
}