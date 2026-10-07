import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScrollLock } from "@/lib/use-scroll-lock";

describe("useScrollLock", () => {
  it("locks and restores body + dashboard scroller overflow", () => {
    document.body.style.overflow = "";
    const dash = document.createElement("div");
    dash.id = "dashboard-content";
    document.body.appendChild(dash);
    try {
      const { unmount } = renderHook(() => useScrollLock(true));
      expect(document.body.style.overflow).toBe("hidden");
      expect(dash.style.overflow).toBe("hidden");
      unmount();
      expect(document.body.style.overflow).toBe("");
      expect(dash.style.overflow).toBe("");
    } finally {
      dash.remove();
    }
  });

  it("keeps the lock until the last nested overlay closes", () => {
    const dash = document.createElement("div");
    dash.id = "dashboard-content";
    document.body.appendChild(dash);
    try {
      const first = renderHook(() => useScrollLock(true));
      const second = renderHook(() => useScrollLock(true));
      first.unmount();
      expect(document.body.style.overflow).toBe("hidden");
      second.unmount();
      expect(document.body.style.overflow).toBe("");
    } finally {
      dash.remove();
    }
  });

  it("does nothing while inactive", () => {
    document.body.style.overflow = "";
    const { unmount } = renderHook(() => useScrollLock(false));
    expect(document.body.style.overflow).toBe("");
    unmount();
  });
});
