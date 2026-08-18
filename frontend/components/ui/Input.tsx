// src/components/ui/Input.tsx — terminal-styled text input.

import { clsx } from "clsx";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full bg-zinc-900/60 border border-terminal-border rounded-terminal-rounded",
        "px-3 py-2 text-sm font-mono text-zinc-100 placeholder:text-zinc-500",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        className,
      )}
      {...props}
    />
  );
}

export default Input;
