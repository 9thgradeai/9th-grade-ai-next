import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/lib/lang-ctx";
import { selectMission } from "@/components/dashboard/command-center/TodayMission";
import RecommendedActions from "@/components/dashboard/command-center/RecommendedActions";
import type { PreparationIntelligenceDTO } from "@/lib/types";

function intelWith(recs: PreparationIntelligenceDTO["recommendations"]): PreparationIntelligenceDTO {
  return { recommendations: recs } as PreparationIntelligenceDTO;
}

const diagnostic = {
  id: "diagnostic",
  priority: "high",
  target: "practice",
  count: 10,
} as const;

describe("diagnostic mission (cold-start O1)", () => {
  it("selects a one-click practice mission from the diagnostic rec", () => {
    const mission = selectMission(intelWith([{ ...diagnostic }]));
    expect(mission).not.toBeNull();
    expect(mission?.action).toBe("practice");
    expect(mission?.subject).toBeUndefined();
    expect(mission?.cta.length).toBeGreaterThan(0);
  });

  it("renders the diagnostic rec and fires the action on click", () => {
    const onAction = vi.fn();
    render(
      <LanguageProvider>
        <RecommendedActions
          intelligence={intelWith([{ ...diagnostic }])}
          onAction={onAction}
          onOpenPlanner={vi.fn()}
        />
      </LanguageProvider>,
    );
    const cta = screen.getByText(/first diagnostic/i);
    fireEvent.click(cta.closest("button") ?? cta);
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction.mock.calls[0][0]).toMatchObject({ id: "diagnostic" });
  });

  it("renders the onboarding checklist (never blank) when recs are empty", () => {
    const onAction = vi.fn();
    const onOpenPlanner = vi.fn();
    render(
      <LanguageProvider>
        <RecommendedActions
          intelligence={intelWith([])}
          onAction={onAction}
          onOpenPlanner={onOpenPlanner}
        />
      </LanguageProvider>,
    );
    // Three steps, first routes through the standard diagnostic pipeline.
    expect(screen.getByText(/Get started|শুরু করুন/)).toBeInTheDocument();
    const stepButtons = screen.getAllByRole("button");
    expect(stepButtons).toHaveLength(3);
    fireEvent.click(stepButtons[0]);
    expect(onAction).toHaveBeenCalledWith({ id: "diagnostic", priority: "high", target: "practice" });
    fireEvent.click(stepButtons[2]);
    expect(onOpenPlanner).toHaveBeenCalledOnce();
  });

  it("returns null when there are no recommendations", () => {
    expect(selectMission(intelWith([]))).toBeNull();
    expect(selectMission(null)).toBeNull();
  });
});
