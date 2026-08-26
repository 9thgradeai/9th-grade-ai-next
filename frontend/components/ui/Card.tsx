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
    <Tag className={`card rounded-2xl ${interactive ? "card-interactive" : ""} ${className}`}>
      {children}
    </Tag>
  );
}
