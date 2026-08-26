import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useEffect } from "react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

// Validates the Phase-1 per-selector isolation: a field update must re-render
// only the components that actually read that field, never unrelated ones.
// Render counts are accumulated inside effects (not during render) so they
// satisfy the React Compiler immutability rule.
const counters = { active: 0, filters: 0 };

function ActiveView() {
  const activeTab = useDashboardStore((s) => s.activeTab);
  useEffect(() => {
    counters.active += 1;
  });
  return <span data-testid="active">{activeTab}</span>;
}

function FiltersView() {
  const filters = useDashboardStore((s) => s.questionBankFilters);
  useEffect(() => {
    counters.filters += 1;
  });
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
    counters.active = 0;
    counters.filters = 0;
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
    const filtersBefore = counters.filters;

    act(() => {
      fireEvent.click(screen.getByText("change-tab"));
    });

    expect(screen.getByTestId("active").textContent).toBe("practice");
    // The filters view never re-rendered from this update.
    expect(counters.filters).toBe(filtersBefore);
  });

  it("re-renders only the filters view when filters change", () => {
    render(
      <>
        <ActiveView />
        <FiltersView />
        <Controls />
      </>,
    );
    const activeBefore = counters.active;

    act(() => {
      fireEvent.click(screen.getByText("change-filters"));
    });

    expect(screen.getByTestId("filters").textContent).toBe("x");
    expect(counters.active).toBe(activeBefore);
  });
});
