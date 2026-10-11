"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UseApiDataOptions = {
  /** Background-revalidate when the tab regains focus. Default true. */
  revalidateOnFocus?: boolean;
  /** Background-revalidate when the browser comes back online. Default true. */
  revalidateOnReconnect?: boolean;
};

export type UseApiDataResult<T> = {
  /** Latest data, or null before the first successful load. Stays populated
   * (stale-while-revalidate) during background revalidations. */
  data: T | null;
  /** Last load error — only set when there is no data to show. */
  error: unknown;
  /** True only for the initial load (no data yet). */
  isLoading: boolean;
  /** True while any request (initial or background) is in flight. */
  isValidating: boolean;
  /** Manual background revalidation. Never clears existing data. */
  refresh: () => Promise<void>;
};

/**
 * Declarative read hook over the existing `api.*` fetch layer
 * (`frontend/lib/services/api.ts`, which already dedupes in-flight GETs and
 * caches with TTL + LRU).
 *
 * Adds the two SWR behaviors the hand-rolled `useEffect + fetch` call sites
 * lack: stale-while-revalidate (data stays visible while refetching) and
 * revalidation on window focus / reconnect. Pass `key = null` to disable.
 */
export function useApiData<T>(
  key: string | null,
  load: () => Promise<T>,
  options: UseApiDataOptions = {},
): UseApiDataResult<T> {
  const { revalidateOnFocus = true, revalidateOnReconnect = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState<boolean>(key !== null);
  const [isValidating, setIsValidating] = useState(false);

  // `load` identity changes every render at most call sites — keep it in a
  // ref (synced in an effect, never written during render) so effects below
  // don't loop.
  const loadRef = useRef(load);
  const dataRef = useRef<T | null>(null);
  useEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(
    async (first: boolean, signal: { cancelled: boolean }) => {
      if (first) setIsLoading(true);
      setIsValidating(true);
      try {
        const next = await loadRef.current();
        if (signal.cancelled) return;
        dataRef.current = next;
        setData(next);
        setError(null);
      } catch (err) {
        if (signal.cancelled) return;
        // Background failures must not blank already-visible data.
        if (dataRef.current === null) setError(err);
      } finally {
        if (!signal.cancelled) {
          if (first) setIsLoading(false);
          setIsValidating(false);
        }
      }
    },
    [],
  );

  // Initial load + reload on key change.
  useEffect(() => {
    if (key === null) {
      setIsLoading(false);
      return;
    }
    const signal = { cancelled: false };
    void run(true, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [key, run]);

  const refresh = useCallback(async () => {
    if (key === null) return;
    await run(false, { cancelled: false });
  }, [key, run]);

  // Focus / reconnect revalidation (background — data stays visible).
  useEffect(() => {
    if (key === null) return;
    if (!revalidateOnFocus && !revalidateOnReconnect) return;
    const onFocus = () => {
      if (revalidateOnFocus) void refresh();
    };
    const onOnline = () => {
      if (revalidateOnReconnect) void refresh();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [key, refresh, revalidateOnFocus, revalidateOnReconnect]);

  return { data, error, isLoading, isValidating, refresh };
}
