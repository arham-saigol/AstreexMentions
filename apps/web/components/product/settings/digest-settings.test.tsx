// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useMutation, useQuery } from "convex/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DigestSettings } from "./digest-settings"

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}))

describe("DigestSettings", () => {
  const updateDigest = Object.assign(vi.fn(), {
    withOptimisticUpdate: vi.fn(),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    updateDigest.mockResolvedValue(undefined)
    vi.mocked(useMutation).mockReturnValue(updateDigest)
    vi.mocked(useQuery).mockReturnValue({
      digest: {
        enabled: true,
        nextRunAt: Date.parse("2026-07-26T09:00:00.000Z"),
        timeZone: "America/New_York",
      },
    })
  })

  it("uses fixed-time copy without a local time or duplicate timezone control", async () => {
    render(<DigestSettings />)

    expect(
      screen.getByText(/around 9:00 AM in your account timezone/i),
    ).toBeDefined()
    expect(screen.getByText(/up to 15 minutes/i)).toBeDefined()
    expect(screen.queryByLabelText(/local delivery time/i)).toBeNull()
    expect(screen.queryByLabelText(/^timezone$/i)).toBeNull()
    expect(document.querySelector('input[type="time"]')).toBeNull()

    fireEvent.click(
      screen.getByRole("switch", { name: /enable daily digest/i }),
    )
    fireEvent.click(screen.getByRole("button", { name: /save digest/i }))

    await waitFor(() =>
      expect(updateDigest).toHaveBeenCalledWith({
        enabled: false,
        timeZone: "America/New_York",
      }),
    )
  })
})
