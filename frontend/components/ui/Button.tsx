import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium rounded-full transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-[var(--text-inverse)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] shadow-sm hover:shadow-md",
  secondary:
    "text-[var(--text-primary)] border border-[var(--border-default)] bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]",
  ghost: "text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-muted)]",
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
