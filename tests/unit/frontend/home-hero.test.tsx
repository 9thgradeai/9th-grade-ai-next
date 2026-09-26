import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HomeHero from "@/components/dashboard/ai/HomeHero";

const components = vi.hoisted(() => ({
  runAgentTurn: vi.fn(),
}));

vi.mock("@/lib/services/ai", () => ({
  runAgentTurn: (...args: unknown[]) => components.runAgentTurn(...args),
  AIError: class extends Error {},
}));

vi.mock("@/lib/auth-ctx", () => ({
  useAuth: () => ({ user: { name: "Test Scholar" } }),
}));

vi.mock("@/lib/lang-ctx", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lang-ctx")>("@/lib/lang-ctx");
  return { ...actual, useLanguage: () => ({ lang: "en" as const }) };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HomeHero (AI command bar)", () => {
  it("greets the user and renders deterministic chips from signals", () => {
    render(
      <HomeHero
        signals={{ weakSubject: "গণিত", unmasteredMistakes: 5, flashcardsDue: 0, dailyQuizAvailable: true }}
      />,
    );
    // NB: the hero greets "late night" between 00:00–04:00 local time.
    expect(screen.getByText(/Good (morning|afternoon|evening|night)|late night/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fix গণিত/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fix 5 mistakes/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Today's quiz/ })).toBeInTheDocument();
    // Zero-count signals produce no chip.
    expect(screen.queryByRole("button", { name: /flashcards/ })).not.toBeInTheDocument();
  });

  it("asks with the home_brief intent and streams the brief with source label", async () => {
    components.runAgentTurn.mockImplementation(async ({ onDelta, onStatus }) => {
      onStatus?.("Reading your plan…");
      onDelta?.("Start with 10 mistakes.");
      return { text: "Start with 10 mistakes.", blocks: [], provider: "mock", model: "" };
    });

    render(<HomeHero signals={{}} />);
    fireEvent.change(screen.getByLabelText("Ask the AI"), { target: { value: "I have 20 minutes" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(components.runAgentTurn).toHaveBeenCalledWith(
        expect.objectContaining({ question: "I have 20 minutes", intent: "home_brief" }),
      );
    });
    await screen.findByText("Start with 10 mistakes.");
    expect(screen.getByText(/source: mock/)).toBeInTheDocument();
  });

  it("sends chip prompts through the same intent", async () => {
    components.runAgentTurn.mockResolvedValue({ text: "ok", blocks: [], provider: "mock", model: "" });
    render(<HomeHero signals={{ dailyQuizAvailable: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Today's quiz" }));
    await waitFor(() => {
      expect(components.runAgentTurn).toHaveBeenCalledWith(
        expect.objectContaining({ intent: "home_brief" }),
      );
    });
  });

  it("surfaces agent errors without crashing", async () => {
    components.runAgentTurn.mockRejectedValue(new Error("boom"));
    render(<HomeHero signals={{}} />);
    fireEvent.change(screen.getByLabelText("Ask the AI"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("alert");
  });

  it("reveals streaming words visually while the live region announces full text", async () => {
    // Hang mid-stream: delta delivered, promise never settles.
    components.runAgentTurn.mockImplementation(async ({ onDelta }) => {
      onDelta?.("Solve ten questions today.");
      await new Promise(() => {});
      return { text: "", blocks: [], provider: "mock", model: "" };
    });
    const { container } = render(<HomeHero signals={{}} />);
    fireEvent.change(screen.getByLabelText("Ask the AI"), { target: { value: "stream please" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // Streaming glow state is active (no settled static layer).
    await waitFor(() => {
      expect(container.querySelector(".cd-glow-stream")).toBeInTheDocument();
    });
    // Visual word reveal is aria-hidden; the sr-only live region carries the
    // same complete text for assistive tech.
    const visual = container.querySelector('p[aria-hidden="true"].whitespace-pre-wrap');
    expect(visual?.textContent).toBe("Solve ten questions today.");
    const live = container.querySelector('p[aria-live="polite"].sr-only');
    expect(live?.textContent).toBe("Solve ten questions today.");
  });
});
