import type { ElementType, ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  interactive?: boolean;
};

export default function Card({
  children,
  className = "",
  as: Tag = "div",
  interactive = false,
}: CardProps) {
  return (
    <Tag
      className={`rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm ${
        interactive
          ? "transition-[transform,box-shadow,border-color] duration-180 hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--border-default)]"
          : ""
      } ${className}`}
    >
      {children}
    </Tag>
  );
}
