"use client";

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/types";
import { AppError, handleApiError, getUserFriendlyMessage } from "@/lib/errors";
import { account } from "@/lib/services/api";

type AuthContextType = {
  user: Client.User | null;
  isLoading: boolean;
  login: (email: string, password: string, options?: { redirect?: boolean }) => Promise<void>;
  register: (name: string, email: string, password: string, options?: { redirect?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<Client.User>;
  refreshToken: () => Promise<void>;
  tokenExpiry: number | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mirrors SESSION_DURATION_MS in app/api/auth/refresh/route.ts — keep in sync.
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// Start renewing the session this long before hard expiry while the tab is open.
const REFRESH_AHEAD_MS = 2 * 24 * 60 * 60 * 1000;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const [user, setUser] = useState<Client.User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          credentials: "include",
        });

        if (res.ok) {
          const data = (await res.json()) as { user: Client.User };
          setUser(data.user);
          // Restart the refresh scheduler on every page load. Without this,
          // tokenExpiry stayed null after reloads and long-lived tabs let
          // sessions hard-expire despite active use.
          setTokenExpiry(Date.now() + SESSION_DURATION_MS);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const refreshToken = async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        const data = (await res.json()) as { expiresIn?: number };
        if (data.expiresIn) {
          setTokenExpiry(Date.now() + data.expiresIn);
        }
      } else if (res.status === 401) {
        // Server explicitly rejected the session — clear local state.
        setUser(null);
        setTokenExpiry(null);
      }
      // Other failures (429 rate limit, 5xx, offline) keep the session: the
      // cookie is still valid and the next scheduler tick retries.
    } catch {
      // Network error — cookie may still be valid, so do NOT log out here.
      // The next tick retries; hard expiry is handled by the interval check.
    } finally {
      isRefreshingRef.current = false;
    }
  };

  useEffect(() => {
    if (tokenExpiry === null) return;

    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
    }

    checkIntervalRef.current = setInterval(() => {
      const remaining = tokenExpiry - Date.now();
      if (remaining <= 0) {
        // Hard expiry — the refresh endpoint refused or was never reached.
        setUser(null);
        setTokenExpiry(null);
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
        return;
      }
      // Active users get a sliding renewal via /api/auth/refresh well before
      // the cookie expires, so long sessions never break mid-study.
      if (remaining < REFRESH_AHEAD_MS && !isRefreshingRef.current) {
        void refreshToken();
      }
    }, 30_000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [tokenExpiry]);

  const login = async (email: string, password: string, options?: { redirect?: boolean }) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = (await res.json().catch(() => ({}))) as { user?: Client.User; error?: string; code?: string };

    if (!res.ok) {
      const error = handleApiError({
        message: data.error ?? "Invalid email or password.",
        code: data.code ?? "UNKNOWN_ERROR",
        status: res.status,
      });
      throw new AppError(getUserFriendlyMessage(error), error.code, error.status);
    }

    if (data.user) {
      setUser(data.user);
      setTokenExpiry(Date.now() + SESSION_DURATION_MS);
      if (options?.redirect !== false) {
        router.push("/dashboard");
      }
    }
  };

  const register = async (name: string, email: string, password: string, options?: { redirect?: boolean }) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = (await res.json().catch(() => ({}))) as { user?: Client.User; error?: string; code?: string };

    if (!res.ok) {
      const error = handleApiError({
        message: data.error ?? "Unable to create account.",
        code: data.code ?? "UNKNOWN_ERROR",
        status: res.status,
      });
      throw new AppError(getUserFriendlyMessage(error), error.code, error.status);
    }

    if (data.user) {
      setUser(data.user);
      setTokenExpiry(Date.now() + SESSION_DURATION_MS);
      if (options?.redirect !== false) {
        router.push("/dashboard");
      }
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore logout errors
    } finally {
      setUser(null);
      setTokenExpiry(null);
      router.push("/");
    }
  };

  const updateProfile = async (name: string) => {
    const { user: updated } = await account.updateProfile(name);
    setUser(updated);
    return updated;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        updateProfile,
        refreshToken,
        tokenExpiry,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
