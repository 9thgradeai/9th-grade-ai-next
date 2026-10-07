import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountdownSeconds } from "@/components/dashboard/practice/useCountdownSeconds";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCountdownSeconds (Phase 4 shared timer)", () => {
  it("counts down from the allotment and fires onExpire once", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useCountdownSeconds(5, onExpire));
    expect(result.current).toBe(5);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(3);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("re-arms when the allotment changes", () => {
    const onExpire = vi.fn();
    const { result, rerender } = renderHook(
      ({ total }) => useCountdownSeconds(total, onExpire),
      { initialProps: { total: 10 } },
    );
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(result.current).toBe(1);
    rerender({ total: 30 });
    expect(result.current).toBe(30);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
