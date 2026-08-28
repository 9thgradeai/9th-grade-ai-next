import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { AuthChoice } from "@/components/auth/AuthChoice"

describe("AuthChoice — Google sign-in", () => {
  let assignSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    assignSpy = vi.fn()
    // window.location.assign triggers a real navigation in jsdom; stub it.
    // @ts-expect-error - replacing a read-only property for the test
    delete window.location
    // @ts-expect-error - provide a minimal location object
    window.location = { assign: assignSpy }
  })

  it("renders a 'Continue with Google' button", () => {
    render(<AuthChoice onChoose={() => {}} />)
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument()
  })

  it("navigates to the Google OAuth start route when clicked", () => {
    render(<AuthChoice onChoose={() => {}} />)
    const btn = screen.getByRole("button", { name: /continue with google/i })
    fireEvent.click(btn)
    expect(assignSpy).toHaveBeenCalledWith("/api/auth/google")
  })

  it("does not call onChoose when the Google button is used", () => {
    const onChoose = vi.fn()
    render(<AuthChoice onChoose={onChoose} />)
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }))
    expect(onChoose).not.toHaveBeenCalled()
  })
})
