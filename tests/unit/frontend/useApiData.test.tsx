import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useApiData } from "@/lib/hooks/useApiData";

describe("useApiData", () => {
  it("loads data and clears the loading state", async () => {
    const { result } = renderHook(() => useApiData("k", () => Promise.resolve(42)));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBe(42);
    expect(result.current.error).toBeNull();
    expect(result.current.isValidating).toBe(false);
  });

  it("surfaces the error when the first load fails", async () => {
    const { result } = renderHook(() =>
      useApiData("k", () => Promise.reject(new Error("down"))),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("does nothing when the key is null", () => {
    const load = vi.fn(() => Promise.resolve(1));
    const { result } = renderHook(() => useApiData(null, load));
    expect(load).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it("refresh() revalidates without clearing data", async () => {
    let value = 1;
    const { result } = renderHook(() =>
      useApiData("k", () => Promise.resolve(value), {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }),
    );
    await waitFor(() => expect(result.current.data).toBe(1));
    value = 2;
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data).toBe(2);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isValidating).toBe(false);
  });

  it("revalidates on window focus", async () => {
    const load = vi.fn(() => Promise.resolve(7));
    const { result } = renderHook(() => useApiData("k", load));
    await waitFor(() => expect(result.current.data).toBe(7));
    expect(load).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it("keeps stale data when a background refresh fails", async () => {
    let fail = false;
    const { result } = renderHook(() =>
      useApiData(
        "k",
        () => (fail ? Promise.reject(new Error("blip")) : Promise.resolve("ok")),
        { revalidateOnFocus: false, revalidateOnReconnect: false },
      ),
    );
    await waitFor(() => expect(result.current.data).toBe("ok"));
    fail = true;
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data).toBe("ok");
    expect(result.current.error).toBeNull();
  });
});
