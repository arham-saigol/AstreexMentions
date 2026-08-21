// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react"
import { useMutation, useQuery } from "convex/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { browserTimeZone, useProductBootstrap } from "./use-product-bootstrap"

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock("@/lib/use-query-clock", () => ({
  useQueryClock: () => 0,
}))

describe("useProductBootstrap", () => {
  const bootstrap = Object.assign(vi.fn(), {
    withOptimisticUpdate: vi.fn(),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    bootstrap.mockResolvedValue(undefined)
    vi.mocked(useMutation).mockReturnValue(bootstrap)
    vi.mocked(useQuery).mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("sends the browser timezone when bootstrapping", async () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Asia/Tokyo" }),
    } as Intl.DateTimeFormat)

    renderHook(() => useProductBootstrap(true))

    await waitFor(() =>
      expect(bootstrap).toHaveBeenCalledWith({ timeZone: "Asia/Tokyo" }),
    )
  })

  it("uses UTC only when browser timezone detection is unavailable", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new RangeError("Intl timezone data is unavailable")
    })

    expect(browserTimeZone()).toBe("UTC")
  })
})
