"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wall-clock countdown shared by exam surfaces (Practice, Mock).
 * Deadline-derived (not decrement-derived) so throttled tabs, remounts and
 * backgrounding can't stretch the clock. Fires onExpire exactly once.
 */
export function useCountdownSeconds(
  totalSec: number,
  onExpire: () => void,
  active = true,
): number {
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const deadlineRef = useRef(0);
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil(totalSec)));
  const firedRef = useRef(false);

  // Re-arm when the allotted time (i.e. a new question/session) changes.
  useEffect(() => {
    deadlineRef.current = Date.now() + Math.max(0, totalSec) * 1000;
    firedRef.current = false;
    setSecs(Math.max(0, Math.ceil(totalSec)));
    if (!active || totalSec <= 0) {
      if (totalSec <= 0 && active) {
        firedRef.current = true;
        onExpireRef.current();
      }
      return;
    }
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSecs(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [totalSec, active]);

  return secs;
}
