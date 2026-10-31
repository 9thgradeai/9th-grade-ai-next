"use client";

/**
 * ui-states-network.ts — Network status detection for UI states.
 *
 * Returns "offline" when the browser reports no connectivity, "slow" when the
 * Network Information API reports a 2G/3G-class connection, otherwise "online".
 * Used by the loading shell to show real progress instead of a frozen spinner.
 */

import { useEffect, useState } from "react";

export type NetworkStatus = "online" | "offline" | "slow";

type ConnectionLike = {
  effectiveType?: string;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

const FAST_TYPES = new Set(["4g", "5g"]);

function readStatus(): NetworkStatus {
  if (typeof navigator === "undefined") return "online";
  if (!navigator.onLine) return "offline";

  const connection = (navigator as Navigator & { connection?: ConnectionLike }).connection;
  const effectiveType = connection?.effectiveType;
  if (effectiveType && !FAST_TYPES.has(effectiveType)) return "slow";

  return "online";
}

export function useNetworkStatus(): NetworkStatus {
  // Always start "online": the server render has no navigator, so starting at
  // "offline" would flash an offline banner during hydration.
  const [status, setStatus] = useState<NetworkStatus>("online");

  useEffect(() => {
    const update = () => setStatus(readStatus());

    update();

    const connection = (navigator as Navigator & { connection?: ConnectionLike }).connection;

    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    connection?.addEventListener?.("change", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      connection?.removeEventListener?.("change", update);
    };
  }, []);

  return status;
}
