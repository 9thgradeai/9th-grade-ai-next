import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

// Validates the Phase-1 per-selector isolation: a field update must re-render
// only the components that actually read that field, never unrelated ones.

const renderCounts = { active: 0, filters: 0 };

function ActiveView() {
  const activeTab = useDashboardStore((s) => s.activeTab);
  renderCounts.active += 1;
  return <span data-testid="active">{activeTab}</span>;
}

function FiltersView() {
  const filters = useDashboardStore((s) => s.questionBankFilters);
  renderCounts.filters += 1;
  return <span data-testid="filters">{filters.query}</span>;
}

function Controls() {
  const setActiveTab = useDashboardStore((s) => s.setActiveTab);
  const setQuestionBankFilters = useDashboardStore((s) => s.setQuestionBankFilters);
  return (
    <>
      <button onClick={() => setActiveTab("practice")}>change-tab</button>
      <button onClick={() => setQuestionBankFilters({ query: "x" })}>change-filters</button>
    </>
  );
}

describe("dashboard store selector isolation", () => {
  beforeEach(() => {
    renderCounts.active = 0;
    renderCounts.filters = 0;
    localStorage.clear();
  });

  it("re-renders only the active-tab view when activeTab changes", () => {
    render(
      <>
        <ActiveView />
        <FiltersView />
        <Controls />
      </>,
    );
    expect(screen.getByTestId("active").textContent).toBe("home");
    const filtersBefore = renderCounts.filters;

    act(() => {
      fireEvent.click(screen.getByText("change-tab"));
    });

    expect(screen.getByTestId("active").textContent).toBe("practice");
    // The filters view never re-rendered from this update.
    expect(renderCounts.filters).toBe(filtersBefore);
  });

  it("re-renders only the filters view when filters change", () => {
    render(
      <>
        <ActiveView />
        <FiltersView />
        <Controls />
      </>,
    );
    const activeBefore = renderCounts.active;

    act(() => {
      fireEvent.click(screen.getByText("change-filters"));
    });

    expect(screen.getByTestId("filters").textContent).toBe("x");
    expect(renderCounts.active).toBe(activeBefore);
  });
});
