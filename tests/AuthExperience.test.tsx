import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import AuthExperience from "@/components/auth/AuthExperience"

const h = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  push: vi.fn(),
}))

vi.mock("@/lib/auth-ctx", () => ({
  useAuth: () => ({
    login: h.login,
    register: h.register,
    logout: vi.fn(),
    user: null,
    isLoading: false,
  }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: h.push,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

function submitForm(name: string) {
  const button = screen.getByRole("button", { name })
  const form = button.closest("form")
  if (!form) throw new Error(`No form found for button ${name}`)
  fireEvent.submit(form)
}

describe("AuthExperience", () => {
  beforeEach(() => {
    h.login.mockReset()
    h.register.mockReset()
    h.push.mockReset()
    h.login.mockResolvedValue(undefined)
    h.register.mockResolvedValue(undefined)
  })

  it("opens in a dim room with the lamp as the only interaction", () => {
    render(<AuthExperience />)

    expect(screen.getAllByRole("button", { name: /turn on the light/i }).length).toBeGreaterThan(0)
    expect(screen.queryByText("First attempt here, or returning examinee?")).not.toBeInTheDocument()
    expect(screen.queryByRole("img", { name: /friendly companion/i })).not.toBeInTheDocument()
  })

  it("turning on the light reveals the avatar and the account choice", async () => {
    render(<AuthExperience />)

    fireEvent.click(screen.getAllByRole("button", { name: /turn on the light/i })[0])

    await waitFor(
      () => {
        expect(screen.getByText("First attempt here, or returning examinee?")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /i have an account/i })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /i'm new here/i })).toBeInTheDocument()
      },
      { timeout: 2500 }
    )
    expect(screen.getByRole("img", { name: /friendly companion/i })).toBeInTheDocument()
  })

  it("signs in, celebrates, and continues to the dashboard", async () => {
    render(<AuthExperience />)

    fireEvent.click(screen.getAllByRole("button", { name: /turn on the light/i })[0])
    await waitFor(
      () => expect(screen.getByRole("button", { name: /i have an account/i })).toBeInTheDocument(),
      {
        timeout: 2000,
      }
    )

    fireEvent.click(screen.getByRole("button", { name: /i have an account/i }))
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument(), {
      timeout: 2000,
    })

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@9thgrade.ai" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } })
    submitForm("Sign in securely")

    await waitFor(() => {
      expect(h.login).toHaveBeenCalledWith("demo@9thgrade.ai", "secret123", { redirect: false })
    })
    await waitFor(() => expect(screen.getByText("Seat confirmed. See you inside.")).toBeInTheDocument(), {
      timeout: 2000,
    })
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/dashboard"), { timeout: 2500 })
  })

  it("shows a human-friendly error and concerned avatar on failed login", async () => {
    h.login.mockRejectedValue(new Error("We couldn't sign you in with those details."))
    render(<AuthExperience />)

    fireEvent.click(screen.getAllByRole("button", { name: /turn on the light/i })[0])
    await waitFor(
      () => expect(screen.getByRole("button", { name: /i have an account/i })).toBeInTheDocument(),
      {
        timeout: 2000,
      }
    )
    fireEvent.click(screen.getByRole("button", { name: /i have an account/i }))
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument(), {
      timeout: 2000,
    })

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@9thgrade.ai" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrongpw" } })
    submitForm("Sign in securely")

    await waitFor(() =>
      expect(screen.getByText("We couldn't sign you in with those details.")).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(screen.getByText("That didn't match our records. Try again?")).toBeInTheDocument()
    )
    expect(h.push).not.toHaveBeenCalled()
  })

  it("validates the signup form and submits a new account", async () => {
    render(<AuthExperience />)

    fireEvent.click(screen.getAllByRole("button", { name: /turn on the light/i })[0])
    await waitFor(
      () => expect(screen.getByRole("button", { name: /i'm new here/i })).toBeInTheDocument(),
      {
        timeout: 2000,
      }
    )
    fireEvent.click(screen.getByRole("button", { name: /i'm new here/i }))
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument(), {
      timeout: 2000,
    })

    submitForm("Create account")
    expect(await screen.findByText("What should we call you?")).toBeInTheDocument()
    expect(screen.getByText("Email is required.")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Rahim Uddin" } })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rahim@example.com" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } })
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret999" } })
    submitForm("Create account")
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret123" } })
    submitForm("Create account")

    await waitFor(() => {
      expect(h.register).toHaveBeenCalledWith("Rahim Uddin", "rahim@example.com", "secret123", {
        redirect: false,
      })
    })
    await waitFor(() => {
      expect(screen.getByText("Admit card issued. ✨")).toBeInTheDocument()
      expect(screen.getAllByText("Rahim Uddin").length).toBeGreaterThan(0)
      expect(screen.getByText(/9th-Grade AI · Admit Card/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /enter the hall/i })).toBeInTheDocument()
    })
  })

  it("honors ?register=true by going straight to signup after the lamp", async () => {
    render(<AuthExperience initialStage="signup" />)

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole("button", { name: /turn on the light/i })[0])

    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument(), {
      timeout: 2000,
    })
    expect(screen.queryByText("First attempt here, or returning examinee?")).not.toBeInTheDocument()
  })

  it("never renders audio (the avatar does not speak)", async () => {
    render(<AuthExperience />)
    expect(document.querySelector("audio")).toBeNull()
  })

  it("issues a personalized admit card on successful login", async () => {
    render(<AuthExperience />)

    fireEvent.click(screen.getAllByRole("button", { name: /turn on the light/i })[0])
    await waitFor(
      () => expect(screen.getByRole("button", { name: /i have an account/i })).toBeInTheDocument(),
      { timeout: 2000 }
    )
    fireEvent.click(screen.getByRole("button", { name: /i have an account/i }))
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument(), {
      timeout: 2000,
    })

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@9thgrade.ai" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } })
    submitForm("Sign in securely")

    // Name derived from the email local-part ("demo" → "Demo").
    await waitFor(() =>
      expect(screen.getAllByText("Demo").length).toBeGreaterThan(0)
    )
    expect(screen.getByText(/Returning Examinee/i)).toBeInTheDocument()
    expect(screen.getByText(/Session valid · 7 days/i)).toBeInTheDocument()

    fireEvent.click(await screen.findByRole("button", { name: /enter the hall/i }))
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/dashboard"))
  })

  it("shows the Caps Lock hint only while active", async () => {
    // jsdom cannot reproduce modifier-state through React's synthetic proxy,
    // so the hint UI and its guard are covered directly.
    const { CapsLockWarning, readCapsLock } = await import("@/components/auth/CapsLockWarning")

    const { rerender } = render(<CapsLockWarning visible={false} />)
    expect(screen.queryByText(/caps lock is on/i)).not.toBeInTheDocument()

    rerender(<CapsLockWarning visible />)
    expect(screen.getByRole("status")).toHaveTextContent(/caps lock is on/i)

    expect(readCapsLock({ getModifierState: () => true })).toBe(true)
    expect(readCapsLock({ getModifierState: () => false })).toBe(false)
    expect(readCapsLock({})).toBe(false)
  })
})
