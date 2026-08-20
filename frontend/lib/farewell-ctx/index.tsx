"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-ctx";
import { FarewellOverlay } from "@/components/dashboard/FarewellOverlay";

type FarewellContextValue = {
  beginLogout: () => void;
  isLoggingOut: boolean;
};

const FarewellContext = createContext<FarewellContextValue | null>(null);

/**
 * Coordinates the cinematic sign-out. `beginLogout` opens the farewell overlay;
 * once the farewell completes, the session is cleared and the user is sent to
 * the landing page. `isLoggingOut` lets the dashboard guard skip its /login
 * redirect during an intentional logout so the landing page wins.
 */
export function LogoutFarewellProvider({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const [active, setActive] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const beginLogout = useCallback(() => setActive(true), []);

  const cancel = useCallback(() => setActive(false), []);

  const complete = useCallback(async () => {
    setIsLoggingOut(true);
    setActive(false);
    await logout();
  }, [logout]);

  const value = useMemo(
    () => ({ beginLogout, isLoggingOut }),
    [beginLogout, isLoggingOut],
  );

  return (
    <FarewellContext.Provider value={value}>
      {children}
      {active && <FarewellOverlay onComplete={() => void complete()} onCancel={cancel} />}
    </FarewellContext.Provider>
  );
}

export function useFarewell() {
  const ctx = useContext(FarewellContext);
  if (!ctx) {
    throw new Error("useFarewell must be used within a LogoutFarewellProvider");
  }
  return ctx;
}

/** Optional access — lets LogoutButton degrade to a direct logout when no
 *  farewell provider is mounted (e.g. standalone component tests). */
export function useFarewellSafe() {
  return useContext(FarewellContext);
}