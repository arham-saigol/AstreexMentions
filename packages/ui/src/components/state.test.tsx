import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Progress } from "./progress"
import { StatusState } from "./status-state"

describe("shared states", () => {
  it("announces errors assertively without forcing custom regions live", () => {
    const { rerender } = render(
      <StatusState variant="error" title="Could not load mentions" />,
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveAttribute("aria-live", "assertive")
    expect(alert).toHaveTextContent("Could not load mentions")

    rerender(
      <StatusState
        role="region"
        aria-label="Current filter"
        title="Saved mentions"
      />,
    )
    expect(
      screen.getByRole("region", { name: "Current filter" }),
    ).not.toHaveAttribute("aria-live")
  })

  it("clamps progress values to the supported range", () => {
    const { rerender } = render(<Progress aria-label="Usage" value={125} />)

    expect(screen.getByRole("progressbar", { name: "Usage" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    )

    rerender(<Progress aria-label="Usage" value={-10} />)
    expect(screen.getByRole("progressbar", { name: "Usage" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    )
  })
})
