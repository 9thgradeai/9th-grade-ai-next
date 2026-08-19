"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

interface AnimatedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  className?: string;
}

export function AnimatedList<T>({
  items,
  renderItem,
  keyExtractor,
  className,
}: AnimatedListProps<T>) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.ul
      variants={shouldReduceMotion ? undefined : containerVariants}
      initial={shouldReduceMotion ? false : "hidden"}
      animate={shouldReduceMotion ? undefined : "visible"}
      className={className ? `list-none ${className}` : "list-none"}
    >
      {items.map((item, index) => (
        <motion.li
          key={keyExtractor(item, index)}
          variants={shouldReduceMotion ? undefined : itemVariants}
        >
          {renderItem(item, index)}
        </motion.li>
      ))}
    </motion.ul>
  );
}