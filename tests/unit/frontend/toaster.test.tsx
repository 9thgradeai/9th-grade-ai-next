import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "@/lib/toast-ctx";
import Toaster from "@/components/ui/Toaster";

function TestHarness() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success("সেভ হয়েছে")}>push-success</button>
      <button onClick={() => toast.error("ব্যর্থ হয়েছে")}>push-error</button>
      <Toaster />
    </div>
  );
}

function renderHarness() {
  return render(
    <ToastProvider>
      <TestHarness />
    </ToastProvider>,
  );
}

/** Lets framer-motion exit animations flush before asserting on the DOM. */
const settle = () => new Promise((r) => setTimeout(r, 250));

afterEach(() => {
  cleanup();
});

describe("Toaster (toast notification system)", () => {
  it("renders a success toast when pushed", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText("push-success"));

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("সেভ হয়েছে")).toBeInTheDocument();
  });

  it("schedules auto-dismiss at ~4.2s and dismisses via the close button", async () => {
    const timeoutSpy = vi.spyOn(window, "setTimeout");
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText("push-error"));
    expect(
      timeoutSpy.mock.calls.some(([, ms]) => ms === 4200),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    await settle();

    expect(screen.queryByText("ব্যর্থ হয়েছে")).not.toBeInTheDocument();
    timeoutSpy.mockRestore();
  });

  it("keeps at most three toasts visible", async () => {
    const user = userEvent.setup();
    renderHarness();

    for (let i = 0; i < 4; i++) {
      await user.click(screen.getAllByText("push-success")[0]);
    }
    // The oldest toast leaves state immediately but exits the DOM after the
    // exit animation — wait it out before counting.
    await settle();

    expect(screen.getAllByRole("status").length).toBe(3);
  });
});
