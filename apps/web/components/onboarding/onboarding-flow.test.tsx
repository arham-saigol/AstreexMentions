// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useAction, useMutation } from "convex/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OnboardingFlow } from "./onboarding-flow"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
}))

vi.mock("@/components/product/product-context", () => ({
  useProductContext: () => ({
    workspace: {
      workspace: {
        id: "workspace_test",
        name: "Acme Corp",
      },
    },
  }),
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe("OnboardingFlow", () => {
  const researchCompany = vi.fn()
  const saveConfiguration = vi.fn()
  const createCheckout = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()

    vi.mocked(useAction).mockImplementation((actionRef: unknown) => {
      return (args: unknown) => {
        if (actionRef === "researchCompany" || typeof actionRef === "object") {
          return researchCompany(args)
        }
        return createCheckout(args)
      }
    })
    vi.mocked(useMutation).mockReturnValue(saveConfiguration)
  })

  it("invalidates pending research when returning from step 2 to step 1", async () => {
    let resolveResearch!: (value: unknown) => void
    const pendingPromise = new Promise((resolve) => {
      resolveResearch = resolve
    })
    researchCompany.mockReturnValue(pendingPromise)

    render(<OnboardingFlow />)

    // Wait for hydration
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    // Fill website URL in step 1
    const websiteInput = screen.getByLabelText("Company website")
    fireEvent.change(websiteInput, { target: { value: "acme.com" } })

    // Submit form to start research and move to step 2
    fireEvent.click(screen.getByRole("button", { name: "Research company" }))

    expect(researchCompany).toHaveBeenCalledWith({
      websiteUrl: "https://acme.com",
    })

    // Step 2 should now be visible
    expect(screen.getByText("Choose what to monitor")).toBeDefined()

    // Click Back to return to Step 1 while research is still pending
    fireEvent.click(screen.getByRole("button", { name: "Back" }))

    // Step 1 should be visible again
    expect(screen.getByRole("button", { name: "Research company" })).toBeDefined()

    // Now resolve the abandoned research request
    await act(async () => {
      resolveResearch({
        state: "completed",
        suggestions: [
          {
            brandCandidate: true,
            description: "Stale keyword description",
            phrase: "StaleKeyword",
            platforms: ["x"],
          },
        ],
        filteringContext: "Stale company context",
        filteringGuidelines: "Stale noise guidelines",
      })
    })

    // Skip to step 2 manually
    fireEvent.click(
      screen.getByRole("button", { name: "Skip research & set up manually" }),
    )

    // Verify step 2 does NOT contain the stale keyword or stale context
    expect(screen.queryByDisplayValue("StaleKeyword")).toBeNull()
    expect(screen.queryByText("Stale keyword description")).toBeNull()
  })
})
