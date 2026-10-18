"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

/** Small client button so server-rendered pages (404) can offer history.back(). */
export default function GoBackButton({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [clicked, setClicked] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setClicked(true);
        router.back();
      }}
      disabled={clicked}
      className="px-5 py-2.5 rounded-full border border-white/15 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}
