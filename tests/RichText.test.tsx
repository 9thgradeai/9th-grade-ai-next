import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RichText from "@/components/ui/RichText";

describe("RichText", () => {
  it("renders plain text unchanged", () => {
    render(<RichText text="What is the capital of Bangladesh?" />);
    expect(screen.getByText("What is the capital of Bangladesh?")).toBeInTheDocument();
  });

  it("renders **bold** markers as strong", () => {
    const { container } = render(<RichText text="Choose the **correct** sentence." />);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("correct");
    expect(container.textContent).toBe("Choose the correct sentence.");
  });

  it("renders *italic* markers as em", () => {
    const { container } = render(
      <RichText text="The board objected to *his presenting the report*." />,
    );
    const em = container.querySelector("em");
    expect(em?.textContent).toBe("his presenting the report");
    expect(container.textContent).toBe("The board objected to his presenting the report.");
  });

  it("leaves unmatched asterisks literal", () => {
    render(<RichText text="Solve 5 * 3 + 2." />);
    expect(screen.getByText("Solve 5 * 3 + 2.")).toBeInTheDocument();
  });

  it("highlights query matches without breaking markers", () => {
    const { container } = render(<RichText text="The *audit report* was reviewed." query="audit" />);
    const mark = container.querySelector("mark");
    expect(mark?.textContent).toBe("audit");
    expect(container.querySelector("em")?.textContent).toBe("audit report");
  });

  it("escapes HTML instead of rendering it", () => {
    const { container } = render(<RichText text="<img src=x onerror=alert(1)>" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
