import { clsx } from "clsx";
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center text-center p-8",
        className
      )}
    >
      {icon && <div className="mb-4 text-zinc-500">{icon}</div>}
      <h3 className="text-lg font-mono text-zinc-300 mb-1">{title}</h3>
      {description && <p className="text-sm text-zinc-500 font-mono max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
