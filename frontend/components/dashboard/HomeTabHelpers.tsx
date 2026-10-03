"use client";

import { useEffect, useState } from "react";

export function useCountdown(target: string) {
  const [remaining, setRemaining] = useState({ d: "00", h: "00", m: "00", s: "00" });
  useEffect(() => {
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining({ d: "00", h: "00", m: "00", s: "00" });
        return;
      }
      const pad = (n: number) => String(n).padStart(2, "0");
      setRemaining({
        d: pad(Math.floor(diff / 86400000)),
        h: pad(Math.floor((diff % 86400000) / 3600000)),
        m: pad(Math.floor((diff % 3600000) / 60000)),
        s: pad(Math.floor((diff % 60000) / 1000)),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return remaining;
}

export function useExamDaysLeft(target: string | null): number | null {
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    if (!target) {
      queueMicrotask(() => setDays(null));
      return;
    }
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      setDays(Math.max(0, Math.ceil(diff / 86400000)));
    };
    queueMicrotask(tick);
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [target]);
  return days;
}

export function formatDate(iso: string, lang: "bn" | "en" = "bn") {
  return new Date(iso).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
