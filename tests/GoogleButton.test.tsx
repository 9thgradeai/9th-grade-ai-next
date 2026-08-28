import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { AuthChoice } from "@/components/auth/AuthChoice"

describe("AuthChoice — social sign-in", () => {
  let assignSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    assignSpy = vi.fn()
    // window.location.assign triggers a real navigation in jsdom; stub it.
    // @ts-expect-error - replacing a read-only property for the test
    delete window.location
    // @ts-expect-error - provide a minimal location object
    window.location = { assign: assignSpy }
  })

  it("renders a 'Google' button", () => {
    render(<AuthChoice onChoose={() => {}} />)
    expect(screen.getByRole("button", { name: /^google$/i })).toBeInTheDocument()
  })

  it("renders an 'Apple' button", () => {
    render(<AuthChoice onChoose={() => {}} />)
    expect(screen.getByRole("button", { name: /^apple$/i })).toBeInTheDocument()
  })

  it("navigates to the Google OAuth start route when clicked", () => {
    render(<AuthChoice onChoose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /^google$/i }))
    expect(assignSpy).toHaveBeenCalledWith("/api/auth/google")
  })

  it("navigates to the Apple OAuth start route when clicked", () => {
    render(<AuthChoice onChoose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /^apple$/i }))
    expect(assignSpy).toHaveBeenCalledWith("/api/auth/apple")
  })

  it("does not call onChoose when a social button is used", () => {
    const onChoose = vi.fn()
    render(<AuthChoice onChoose={onChoose} />)
    fireEvent.click(screen.getByRole("button", { name: /^google$/i }))
    expect(onChoose).not.toHaveBeenCalled()
  })

  it("calls onDemo when the demo button is clicked", () => {
    const onDemo = vi.fn()
    render(<AuthChoice onChoose={() => {}} onDemo={onDemo} />)
    fireEvent.click(screen.getByRole("button", { name: /try a demo account/i }))
    expect(onDemo).toHaveBeenCalledTimes(1)
  })
})
