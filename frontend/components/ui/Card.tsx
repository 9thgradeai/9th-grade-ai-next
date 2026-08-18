// src/components/ui/Card.tsx — glass/terminal card surface used app-wide.

import { clsx } from "clsx";
import type { ReactNode } from "react";

export function Card({
  children,
  className,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-terminal-rounded border border-terminal-border bg-glass-bg backdrop-blur-sm",
        glow && "shadow-neon-glow",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default Card;
