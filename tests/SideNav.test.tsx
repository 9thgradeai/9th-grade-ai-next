import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/auth-ctx", () => ({
  useAuth: () => ({ user: { name: "Test", handle: "tester" }, isLoading: false, logout: vi.fn() }),
}));
vi.mock("@/lib/services/api", () => ({
  api: { examLibrary: vi.fn(() => Promise.resolve([])) },
  invalidateCache: vi.fn(),
}));
vi.mock("@/lib/toast-ctx", () => ({
  useToastSafe: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import SideNav from "@/components/dashboard/SideNav";
import { LanguageProvider } from "@/lib/lang-ctx";

describe("SideNav scroll containment", () => {
  it("renders the nav list with overscroll-contain so wheel events cannot escape to the document", () => {
    const { container } = render(<LanguageProvider><SideNav activeTab="home" onChange={() => {}} /></LanguageProvider>);
    const nav = container.querySelector('nav[aria-label="Desktop navigation"]');
    expect(nav).not.toBeNull();
    const scroller = nav!.querySelector(".overflow-y-auto");
    expect(scroller).not.toBeNull();
    expect(scroller!.className).toContain("overscroll-contain");
  });
});
