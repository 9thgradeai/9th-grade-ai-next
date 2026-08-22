import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium rounded-full transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-zinc-950 bg-emerald-500 hover:bg-emerald-400 shadow-neon-glow hover:shadow-neon-glow-lg",
  secondary:
    "text-white border border-white/15 bg-white/[0.03] hover:border-emerald-400/50 hover:bg-white/[0.06]",
  ghost: "text-zinc-300 hover:text-emerald-400 hover:bg-white/5",
};

const SIZES: Record<Size, string> = {
  sm: "px-4 py-1.5 text-sm min-h-[36px]",
  md: "px-6 py-2.5 text-sm min-h-[44px]",
  lg: "px-7 py-3.5 text-base min-h-[48px]",
};

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
  href?: string;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">;

/**
 * Single button primitive for the whole product. Renders a Next.js `<Link>`
 * when `href` is present, otherwise a `<button>`. Micro-interactions are
 * pure CSS (transform/opacity) so no client JS is required for feedback.
 */
export default function Button({
  variant = "primary",
  size = "md",
  href,
  fullWidth,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    BASE,
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href !== undefined) {
    const { type, ...linkRest } = rest as Record<string, unknown>;
    return (
      <Link href={href} className={classes} {...(linkRest as object)}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return [BASE, VARIANTS[variant], SIZES[size], extra].filter(Boolean).join(" ");
}
