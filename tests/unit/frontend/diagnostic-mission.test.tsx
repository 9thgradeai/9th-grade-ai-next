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
        />
      </LanguageProvider>,
    );
    const cta = screen.getByText(/first diagnostic/i);
    fireEvent.click(cta.closest("button") ?? cta);
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction.mock.calls[0][0]).toMatchObject({ id: "diagnostic" });
  });

  it("returns null when there are no recommendations", () => {
    expect(selectMission(intelWith([]))).toBeNull();
    expect(selectMission(null)).toBeNull();
  });
});
