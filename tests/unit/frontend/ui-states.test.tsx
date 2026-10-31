import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ErrorState from "@/components/ui/ErrorState";
import NoResultsState from "@/components/ui/NoResultsState";
import PermissionDeniedState from "@/components/ui/PermissionDeniedState";
import SessionExpiredState from "@/components/ui/SessionExpiredState";
import SuccessState from "@/components/ui/SuccessState";
import OfflineState from "@/components/ui/OfflineState";
import { FieldError, FormErrorSummary } from "@/components/ui/FormValidationState";
import { API_ERRORS, classifyError } from "@/lib/ui-states";

describe("ErrorState", () => {
  it("shows the copy for the error code and retries on demand", () => {
    const onRetry = vi.fn();
    render(<ErrorState code="NETWORK_ERROR" onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(API_ERRORS.NETWORK_ERROR.message)).toBeTruthy();
    expect(screen.getByText(API_ERRORS.NETWORK_ERROR.userMessage)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: API_ERRORS.NETWORK_ERROR.action }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not offer a retry for non-retryable failures", () => {
    render(<ErrorState code="AUTH_ERROR" onRetry={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/session may have expired/i)).toBeTruthy();
  });

  it("lets the caller override the heading and body", () => {
    render(<ErrorState code="SERVER_ERROR" title="Upload failed" message="Try a smaller file." />);
    expect(screen.getByText("Upload failed")).toBeTruthy();
    expect(screen.getByText("Try a smaller file.")).toBeTruthy();
  });
});

describe("NoResultsState", () => {
  it("echoes the query and offers alternate searches", () => {
    const onPickSuggestion = vi.fn();
    render(
      <NoResultsState
        query="photosynthesis"
        scope="question bank"
        suggestions={["photosynthesis light reaction"]}
        onPickSuggestion={onPickSuggestion}
      />,
    );

    expect(screen.getByText(/No results for/)).toBeTruthy();
    expect(screen.getByText(/No results for/).textContent).toContain("photosynthesis");
    expect(screen.getByText(/question bank/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "photosynthesis light reaction" }));
    expect(onPickSuggestion).toHaveBeenCalledWith("photosynthesis light reaction");
  });

  it("offers clear-filters only when a handler is wired", () => {
    const onReset = vi.fn();
    const { rerender } = render(<NoResultsState query="x" onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(onReset).toHaveBeenCalledTimes(1);

    rerender(<NoResultsState query="x" />);
    expect(screen.queryByRole("button", { name: /clear filters/i })).toBeNull();
  });
});

describe("PermissionDeniedState", () => {
  it("explains the refusal and gives a way back", () => {
    const onBack = vi.fn();
    render(<PermissionDeniedState reason="This paper is limited to enrolled students." onBack={onBack} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("This paper is limited to enrolled students.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("SessionExpiredState", () => {
  it("saves unsaved work through the caller, then stops", async () => {
    const onSaveAndContinue = vi.fn().mockResolvedValue(undefined);
    render(<SessionExpiredState unsavedWork onSaveAndContinue={onSaveAndContinue} />);

    expect(screen.getByText(/unsaved work/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /save and sign in/i }));

    await waitFor(() => expect(onSaveAndContinue).toHaveBeenCalledTimes(1));
  });

  it("reports a failed save instead of claiming the work is safe", async () => {
    const onSaveAndContinue = vi.fn().mockRejectedValue(new Error("offline"));
    render(<SessionExpiredState unsavedWork onSaveAndContinue={onSaveAndContinue} />);

    fireEvent.click(screen.getByRole("button", { name: /save and sign in/i }));

    await waitFor(() =>
      expect(screen.getByText(/Couldn't save your work/i)).toBeTruthy(),
    );
    // It never claims the work was saved.
    expect(screen.queryByText(/has been saved/i)).toBeNull();
  });

  it("warns that signing in again discards work when no save path exists", () => {
    render(<SessionExpiredState unsavedWork />);
    expect(screen.getByText(/will discard it/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save and sign in/i })).toBeNull();
  });

  it("uses plain sign-in copy when nothing is unsaved", () => {
    render(<SessionExpiredState onSignIn={vi.fn()} />);
    expect(screen.getByText(/session timed out/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign in again/i })).toBeTruthy();
  });
});

describe("SuccessState", () => {
  it("confirms the action and offers the next step", () => {
    const onClick = vi.fn();
    render(
      <SuccessState
        title="Answers submitted"
        message="Your paper is with the examiner."
        nextAction={{ label: "View result", onClick }}
      />,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Answers submitted")).toBeTruthy();
    expect(screen.getByText("Your paper is with the examiner.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /view result/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("stays silent for assistive tech when the region already announces", () => {
    render(<SuccessState title="Saved" announce={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("OfflineState", () => {
  it("renders a recoverable panel when forced offline", () => {
    const onRetry = vi.fn();
    render(<OfflineState force onRetry={onRetry} />);

    expect(screen.getByText("You're offline")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps cached content visible in banner mode", () => {
    render(
      <OfflineState force banner>
        <p>cached question</p>
      </OfflineState>,
    );

    expect(screen.getByText("cached question")).toBeTruthy();
    expect(screen.getByText(/showing saved content/i)).toBeTruthy();
  });

  it("renders nothing while online", () => {
    const { container } = render(<OfflineState />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("form validation surfaces", () => {
  it("FieldError renders nothing without a message", () => {
    const { container } = render(<FieldError message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("FieldError announces the message", () => {
    render(<FieldError id="email-error" message="Enter a valid email address." />);
    const error = screen.getByRole("alert");
    expect(error.textContent).toBe("Enter a valid email address.");
    expect(error.id).toBe("email-error");
  });

  it("FormErrorSummary lists every invalid field and focuses on demand", () => {
    const onFocusField = vi.fn();
    render(
      <FormErrorSummary
        errors={{ email: "Enter a valid email address.", password: "Use at least 8 characters." }}
        fieldLabels={{ email: "Email", password: "Password" }}
        onFocusField={onFocusField}
      />,
    );

    expect(screen.getByText(/2 fields need your attention/i)).toBeTruthy();
    expect(screen.getByText(/Enter a valid email address\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /password/i }));
    expect(onFocusField).toHaveBeenCalledWith("password");
  });

  it("FormErrorSummary renders nothing when the form is valid", () => {
    const { container } = render(<FormErrorSummary errors={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("classifyError", () => {
  it("prefers the server's error code", () => {
    expect(classifyError({ code: "RATE_LIMIT", status: 429 })).toBe("RATE_LIMIT");
  });

  it("maps status codes when no code is supplied", () => {
    expect(classifyError({ status: 401 })).toBe("AUTH_ERROR");
    expect(classifyError({ status: 403 })).toBe("AUTH_ERROR");
    expect(classifyError({ status: 404 })).toBe("NOT_FOUND");
    expect(classifyError({ status: 409 })).toBe("CONFLICT");
    expect(classifyError({ status: 503 })).toBe("SERVER_ERROR");
  });

  it("treats transport failures as network errors", () => {
    expect(classifyError(new TypeError("Failed to fetch"))).toBe("NETWORK_ERROR");
  });

  it("falls back to server error for unknown shapes", () => {
    expect(classifyError("boom")).toBe("SERVER_ERROR");
    expect(classifyError(undefined)).toBe("SERVER_ERROR");
  });
});
