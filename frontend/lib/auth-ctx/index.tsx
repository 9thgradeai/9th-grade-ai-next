"use client";

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/types";
import { AppError, handleApiError, getUserFriendlyMessage } from "@/lib/errors";
import { account, authGateway, ApiError } from "@/lib/services/api";

type AuthContextType = {
  user: Client.User | null;
  isLoading: boolean;
  login: (email: string, password: string, options?: { redirect?: boolean; remember?: boolean }) => Promise<void>;
  register: (name: string, email: string, password: string, options?: { redirect?: boolean; remember?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<Client.User>;
  refreshToken: () => Promise<void>;
  tokenExpiry: number | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Start renewing the session this long before hard expiry while the tab is open.
const REFRESH_AHEAD_MS = 2 * 24 * 60 * 60 * 1000;

type SessionResponse = { user?: Client.User; expiresIn?: number };

function toFriendly(error: unknown): never {
  const appError = handleApiError(error);
  throw new AppError(getUserFriendlyMessage(appError), appError.code, appError.status);
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const [user, setUser] = useState<Client.User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);

  // Expiry is always server-authoritative (`expiresIn` ms from login /
  // register / refresh) — never a client-mirrored constant that can drift
  // from the cookie the server actually set.
  const applySession = (data: SessionResponse) => {
    if (data.user) setUser(data.user);
    if (typeof data.expiresIn === "number" && Number.isFinite(data.expiresIn)) {
      setTokenExpiry(Date.now() + data.expiresIn);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        // Refresh (not /me) on mount: it transparently renews a stale-but-
        // renewable session AND reports user + authoritative expiry in one
        // round trip. 401 means no usable session — clear the dead cookie.
        const data = await authGateway<SessionResponse>("/api/auth/refresh", {
          method: "POST",
        });
        applySession(data);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          // The cookie is missing OR stale (expired/revoked). It is HttpOnly,
          // so only the server can remove it — ask /logout to clear it, then
          // drop local state. Without this a dead cookie lingers and the
          // login page's signed-in gate can fight the dashboard guard.
          await authGateway("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        }
        setUser(null);
        setTokenExpiry(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const refreshToken = async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      const data = await authGateway<SessionResponse>("/api/auth/refresh", {
        method: "POST",
      });
      applySession(data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Server explicitly rejected the session — clear local state.
        setUser(null);
        setTokenExpiry(null);
      }
      // Other failures (429 rate limit, 5xx, offline) keep the session: the
      // cookie is still valid and the next scheduler tick retries.
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

  const login = async (email: string, password: string, options?: { redirect?: boolean; remember?: boolean }) => {
    try {
      const data = await authGateway<SessionResponse>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember: options?.remember === true }),
      });
      if (data.user) {
        applySession(data);
        if (options?.redirect !== false) {
          router.push("/dashboard");
        }
      }
    } catch (error) {
      toFriendly(error);
    }
  };

  const register = async (name: string, email: string, password: string, options?: { redirect?: boolean; remember?: boolean }) => {
    try {
      const data = await authGateway<SessionResponse>("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, remember: options?.remember === true }),
      });
      if (data.user) {
        applySession(data);
        if (options?.redirect !== false) {
          router.push("/dashboard");
        }
      }
    } catch (error) {
      toFriendly(error);
    }
  };

  const logout = async () => {
    try {
      await authGateway("/api/auth/logout", { method: "POST" });
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
