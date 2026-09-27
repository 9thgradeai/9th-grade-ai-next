// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
import { captureException } from "@sentry/nextjs";

function Boom({ fail }: { fail: boolean }) {
  if (fail) throw new Error("kaboom");
  return <div>recovered</div>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ErrorBoundary (Phase 4.3)", () => {
  it("reports crashes to Sentry and renders the fallback", () => {
    // Silence React's error logging for the intentional crash.
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary fallback={(e, reset) => <button onClick={reset}>{e.message}</button>}>
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: "kaboom" })).toBeDefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("clears the error when resetKeys change and runs onReset (refetch hook)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onReset = vi.fn();
    const { rerender } = render(
      <ErrorBoundary resetKeys={["home"]} onReset={onReset}>
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(screen.queryByText("recovered")).toBeNull();

    rerender(
      <ErrorBoundary resetKeys={["practice"]} onReset={onReset}>
        <Boom fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("recovered")).toBeDefined();
    expect(onReset).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("retry via fallback reset runs onReset", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onReset = vi.fn();
    const fallback = (_e: Error, reset: () => void) => <button onClick={reset}>retry</button>;
    const { rerender } = render(
      <ErrorBoundary onReset={onReset} fallback={fallback}>
        <Boom fail />
      </ErrorBoundary>,
    );
    // Fixed child alone must NOT clear the boundary — retry does.
    rerender(
      <ErrorBoundary onReset={onReset} fallback={fallback}>
        <Boom fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: "retry" })).toBeDefined();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "retry" }));
    });
    expect(screen.getByText("recovered")).toBeDefined();
    expect(onReset).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
