import "./home-tab-redesign.test";
import { it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { writeFileSync } from "node:fs";
import HomeTab from "@/components/dashboard/HomeTab";

it("exports actual HomeTab with the existing redesign fixture and provider mocks", async () => {
  const { container } = render(<HomeTab />);
  await screen.findByRole("region", { name: "Preparation pulse" });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1800)); });
  await screen.findByText(/70%/);
  writeFileSync("/var/folders/d3/fcvkl71x4gd2md2qhzb992c80000gn/T/opencode/home-preview-markup.html", container.innerHTML);
});
