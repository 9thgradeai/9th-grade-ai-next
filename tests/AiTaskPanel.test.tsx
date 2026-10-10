import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AiTaskPanel from "@/components/dashboard/ai/AiTaskPanel";
import Button from "@/components/ui/Button";

describe("AiTaskPanel", () => {
  it("renders header and submit button when not loading", () => {
    const handleSubmit = vi.fn();
    render(
      <AiTaskPanel
        title="Test Title"
        description="Test description"
        submitLabel="Run"
        loadingLabel="Loading…"
        loading={false}
        error={null}
        onSubmit={handleSubmit}
        fields={<p>Form fields</p>}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByRole("heading", { name: "Test Title" })).toBeInTheDocument();
    expect(screen.getByText("Test description")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run/i })).toBeInTheDocument();
  });

  it("disables submit button and shows loading label while loading", () => {
    const handleSubmit = vi.fn();
    render(
      <AiTaskPanel
        title="Test"
        description="Desc"
        submitLabel="Run"
        loadingLabel="Please wait…"
        loading={true}
        error={null}
        onSubmit={handleSubmit}
        fields={<p>Form</p>}
      />
    );
    const button = screen.getByRole("button", { name: /please wait/i });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it("displays error text when provided", () => {
    render(
      <AiTaskPanel
        title="Test"
        description="Desc"
        submitLabel="Run"
        loadingLabel="Loading…"
        loading={false}
        error="Something went wrong"
        onSubmit={() => {}}
        fields={<p>Form</p>}
      />
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

it("renders the result card when result prop is provided and not loading", () => {
    const handleSubmit = vi.fn();
    const resultContent = <p>Result content</p>;
    render(
      <AiTaskPanel
        title="Test"
        description="Desc"
        submitLabel="Run"
        loadingLabel="Loading…"
        loading={false}
        error={null}
        onSubmit={handleSubmit}
        fields={<p>Form</p>}
        result={resultContent}
        sourceProvider="test-provider"
        sourceModel="test-model"
      />
    );
    expect(screen.getByText("Result content")).toBeInTheDocument();
    // AiTaskPanel renders AISourceFooter after the result content
    expect(screen.getByText(/source:/i)).toBeInTheDocument();
  });

  it("shows a skeleton card while loading", () => {
    const handleSubmit = vi.fn();
    render(
      <AiTaskPanel
        title="Test"
        description="Desc"
        submitLabel="Run"
        loadingLabel="Loading…"
        loading={true}
        error={null}
        onSubmit={handleSubmit}
        fields={<p>Form</p>}
      />
    );
    const skeleton = screen.getByRole("status", { name: /loading/i });
    expect(skeleton).toBeInTheDocument();
  });

it("passes resultActions to the result card", () => {
    const handleSubmit = vi.fn();
    const actions = <Button variant="secondary" size="sm">Action</Button>;
    render(
      <AiTaskPanel
        title="Test"
        description="Desc"
        submitLabel="Run"
        loadingLabel="Loading…"
        loading={false}
        error={null}
        onSubmit={handleSubmit}
        fields={<p>Form</p>}
        result={<p>Result</p>}
        resultActions={actions}
        sourceProvider={null}
        sourceModel={null}
      />
    );
    expect(screen.getByText("Result")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });
});