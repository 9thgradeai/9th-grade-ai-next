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

export function CountdownClock({ target }: { target: string }) {
  const remaining = useCountdown(target);
  return (
    <span className="font-bold text-lg tracking-widest tabular-nums" style={{ color: "var(--dashboard-primary)" }}>
      {remaining.d}:{remaining.h}:{remaining.m}:{remaining.s}
    </span>
  );
}

export function CountdownRing({ daysLeft }: { daysLeft: number }) {
  const fraction = Math.max(0, Math.min(1, daysLeft / 90));
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - fraction);
  return (
    <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90" aria-hidden="true">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--dashboard-border-muted)" strokeWidth="5" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="var(--dashboard-primary)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

export function CountdownRingLive({ target }: { target: string }) {
  const remaining = useCountdown(target);
  return <CountdownRing daysLeft={Number(remaining.d) || 0} />;
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

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("bn-BD", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
