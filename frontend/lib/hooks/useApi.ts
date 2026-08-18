"use client";

import { useEffect, useRef, useState } from "react";
import { AppError, handleApiError } from "@/lib/errors";

export type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: AppError | null;
  refetch: () => Promise<void>;
};

export function useFetch<T>(url: string | null, options: RequestInit = {}): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const urlRef = useRef(url);
  const optionsRef = useRef(options);

  useEffect(() => {
    urlRef.current = url;
    optionsRef.current = options;
  }, [url, options]);

  useEffect(() => {
    let cancelled = false;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const currentUrl = urlRef.current;
        if (!currentUrl) return;

        const currentOptions = optionsRef.current;
        const response = await fetch(currentUrl, {
          ...currentOptions,
          signal: controller.signal,
          headers: {
            ...currentOptions.headers,
          },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const errorMessage = typeof body.error === "string" ? body.error : response.statusText;
          const errorCode = body.code ?? `HTTP_${response.status}`;
          throw new AppError(errorMessage, errorCode, response.status);
        }

        const result: T = await response.json();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!cancelled && (err as Error).name !== "AbortError") {
          setError(handleApiError(err));
        }
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!controller.signal.aborted && !cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url]);

  const refetch = async () => {
    const currentUrl = urlRef.current;
    if (!currentUrl) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const currentOptions = optionsRef.current;
      const response = await fetch(currentUrl, {
        ...currentOptions,
        signal: controller.signal,
        headers: {
          ...currentOptions.headers,
        },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const errorMessage = typeof body.error === "string" ? body.error : response.statusText;
        const errorCode = body.code ?? `HTTP_${response.status}`;
        throw new AppError(errorMessage, errorCode, response.status);
      }

      const result: T = await response.json();
      setData(result);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(handleApiError(err));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  return { data, loading, error, refetch };
}

export type InfiniteScrollState<T> = FetchState<T[]> & {
  nextPage: number | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
};

export function useInfiniteScroll<T>(
  urlTemplate: string,
  options: { limit?: number } = {}
): InfiniteScrollState<T> {
  const limit = options.limit ?? 10;
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const urlTemplateRef = useRef(urlTemplate);
  const limitRef = useRef(limit);

  useEffect(() => {
    urlTemplateRef.current = urlTemplate;
    limitRef.current = limit;
  }, [urlTemplate, limit]);

  useEffect(() => {
    let cancelled = false;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const url = `${urlTemplateRef.current}?page=1&limit=${limitRef.current}`;
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const errorMessage = typeof body.error === "string" ? body.error : response.statusText;
          const errorCode = body.code ?? `HTTP_${response.status}`;
          throw new AppError(errorMessage, errorCode, response.status);
        }

        const result = await response.json();
        const newItems = result.data ?? result;
        const total = result.total ?? 0;

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!cancelled) {
          setItems(newItems as T[]);
          setTotalPages(result.totalPages ?? Math.ceil(total / limitRef.current));
          setPage(1);
        }
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!cancelled && (err as Error).name !== "AbortError") {
          setError(handleApiError(err));
        }
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!controller.signal.aborted && !cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [urlTemplate, limit]);

  const loadMore = async () => {
    if (loading) return;
    if (totalPages !== null && page >= totalPages) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const url = `${urlTemplateRef.current}?page=${page + 1}&limit=${limitRef.current}`;
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const errorMessage = typeof body.error === "string" ? body.error : response.statusText;
        const errorCode = body.code ?? `HTTP_${response.status}`;
        throw new AppError(errorMessage, errorCode, response.status);
      }

      const result = await response.json();
      const newItems = result.data ?? result;

      setItems((prev) => [...prev, ...(newItems as T[])]);
      setTotalPages(result.totalPages ?? totalPages);
      setPage((prev) => prev + 1);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(handleApiError(err));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  return {
    data: items,
    loading,
    error,
    refetch: async () => {
      setItems([]);
      setPage(1);
      setTotalPages(null);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        const url = `${urlTemplateRef.current}?page=1&limit=${limitRef.current}`;
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
            const errorMessage = typeof body.error === "string" ? body.error : response.statusText;
            const errorCode = body.code ?? `HTTP_${response.status}`;
            throw new AppError(errorMessage, errorCode, response.status);
          }

          const result = await response.json();
          const newItems = result.data ?? result;
          const total = result.total ?? 0;

          setItems(newItems as T[]);
          setTotalPages(result.totalPages ?? Math.ceil(total / limitRef.current));
          setPage(1);
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            setError(handleApiError(err));
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      },
    nextPage: totalPages !== null && page < totalPages ? page + 1 : null,
    hasMore: totalPages === null || page < totalPages,
    loadMore,
  };
}
