// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HeaderActions, { GlobalEcosystemToggle } from "@/components/dashboard/HeaderActions";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { EcosystemProvider } from "@/lib/ecosystem-ctx";
import { LanguageProvider, useLanguage, LANGUAGE_KEY } from "@/lib/lang-ctx";
import { DashboardThemeProvider } from "@/lib/dashboard-theme-ctx";

// The dashboard header row is a fixed h-16 flex row. On 320–375px
// phones it only has room for: hamburger, logo, search,
// notifications, theme, language. The ~116px ecosystem toggle must
// drop out below `sm` (it lives in the nav drawer there) — otherwise
// the shrink-0 action cluster overflows and the language button is
// pushed off the right edge (cut/overlapped).

function renderHeaderActions() {
  return render(
    <LanguageProvider>
      <EcosystemProvider>
        <DashboardThemeProvider>
          <HeaderActions onOpenShortcuts={() => {}} />
        </DashboardThemeProvider>
      </EcosystemProvider>
    </LanguageProvider>
  );
}

describe("dashboard header actions (mobile responsive)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders language, theme and notification controls", () => {
    renderHeaderActions();
    expect(
      screen.getByRole("button", { name: /switch interface language to english|ইন্টারফেস ভাষা বাংলায় পরিবর্তন করুন/i }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /switch to (light|dark) dashboard mode/i }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /notifications/i })).toBeDefined();
  });

  it("hides the ecosystem toggle below sm so the row cannot overflow phone widths", () => {
    renderHeaderActions();
    const group = screen.getByRole("group", { name: /exam ecosystem|পরীক্ষা ইকোসিস্টেম/i });
    // The wrapper must be hidden on xs and restored from sm —
    // dropping either class reintroduces the 320–375px overflow.
    const wrapper = group.parentElement;
    expect(wrapper?.className).toContain("hidden");
    expect(wrapper?.className).toContain("sm:inline-flex");
  });

  it("exposes the ecosystem toggle standalone for the mobile nav drawer", () => {
    render(
      <LanguageProvider>
        <EcosystemProvider>
          <GlobalEcosystemToggle />
        </EcosystemProvider>
      </LanguageProvider>
    );
    const bank = screen.getByRole("button", { name: /bangladesh bank|বাংলাদেশ ব্যাংক/i });
    expect(bank).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(bank);
    expect(bank).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("9th-grade-ai:ecosystem")).toBe("BANGLADESH_BANK");
  });
});

function LangProbe() {
  const { lang } = useLanguage();
  return <span data-testid="lang">{lang}</span>;
}

describe("LanguageToggle", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("toggles the interface language through the provider", () => {
    render(
      <LanguageProvider>
        <LangProbe />
        <LanguageToggle />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(document.documentElement.lang).toBe("en");

    fireEvent.click(screen.getByRole("button", { name: /ইন্টারফেস ভাষা বাংলায় পরিবর্তন করুন/ }));
    expect(screen.getByTestId("lang").textContent).toBe("bn");
    expect(document.documentElement.lang).toBe("bn");
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe("bn");

    fireEvent.click(screen.getByRole("button", { name: /switch interface language to english/i }));
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });
});
