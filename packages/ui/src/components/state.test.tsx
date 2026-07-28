import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  AppShellMain,
  AppShellMobileNavItem,
  AppShellNavItem,
  SkipLink,
} from "./app-shell"
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

  it("provides a keyboard skip target for the shell", () => {
    render(
      <>
        <SkipLink href="#main-content">Skip to content</SkipLink>
        <AppShellMain>Mentions</AppShellMain>
      </>,
    )

    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toHaveAttribute("href", "#main-content")
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content")
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1")
  })

  it("keeps shell navigation buttons from submitting forms", () => {
    render(
      <form>
        <AppShellNavItem>Desktop navigation</AppShellNavItem>
        <AppShellMobileNavItem>Mobile navigation</AppShellMobileNavItem>
      </form>,
    )

    expect(
      screen.getByRole("button", { name: "Desktop navigation" }),
    ).toHaveAttribute("type", "button")
    expect(
      screen.getByRole("button", { name: "Mobile navigation" }),
    ).toHaveAttribute("type", "button")
  })
})
