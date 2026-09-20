import "./home-tab-redesign.test";
import { it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import HomeTab from "@/components/dashboard/HomeTab";

it("exports actual HomeTab with the existing redesign fixture and provider mocks", async () => {
  const { container } = render(<HomeTab />);
  await screen.findByRole("region", { name: "Preparation pulse" });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1800)); });
  await screen.findByText(/70%/);
  const outPath = join(tmpdir(), "opencode", "home-preview-markup.html");
  mkdirSync(join(tmpdir(), "opencode"), { recursive: true });
  writeFileSync(outPath, container.innerHTML);
});
