// src/components/ui/Button.tsx — design-system Button used across the app.
// Consolidates the button variants previously inlined in the landing + dashboard.

import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "elite" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold shadow-neon-glow",
  ghost:
    "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20",
  elite:
    "bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-zinc-950 font-bold",
  danger: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20",
  outline:
    "bg-transparent hover:bg-zinc-800/50 text-zinc-200 border border-zinc-700",
};

const SIZES: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 rounded-terminal-square",
  md: "text-sm px-4 py-2 rounded-terminal-rounded",
  lg: "text-base px-6 py-3 rounded-terminal-rounded",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-mono transition-colors duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span
          className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
      )}
      {!loading && leftIcon}
      {children}
    </button>
  );
}

export default Button;
