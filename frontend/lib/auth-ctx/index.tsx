"use client";

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/types";
import { AppError, handleApiError, getUserFriendlyMessage } from "@/lib/errors";
import { account } from "@/lib/services/api";

type AuthContextType = {
  user: Client.User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<Client.User>;
  isAuthenticated: boolean;
  hasRole: (role: "student" | "admin") => boolean;
  refreshToken: () => Promise<void>;
  tokenExpiry: number | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  useEffect(() => {
    if (tokenExpiry === null) return;

    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
    }

    checkIntervalRef.current = setInterval(() => {
      if (Date.now() >= tokenExpiry) {
        setUser(null);
        setTokenExpiry(null);
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
      }
    }, 30_000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [tokenExpiry]);

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
      }
    } catch {
      setUser(null);
      setTokenExpiry(null);
    } finally {
      isRefreshingRef.current = false;
    }
  };

  const login = async (email: string, password: string) => {
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
      setTokenExpiry(Date.now() + 7 * 24 * 60 * 60 * 1000);
      router.push("/dashboard");
    }
  };

  const register = async (name: string, email: string, password: string) => {
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
      setTokenExpiry(Date.now() + 7 * 24 * 60 * 60 * 1000);
      router.push("/dashboard");
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

  const isAuthenticated = user !== null;
  const hasRole = (role: "student" | "admin") => {
    return user?.role === role;
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
        isAuthenticated,
        hasRole,
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
