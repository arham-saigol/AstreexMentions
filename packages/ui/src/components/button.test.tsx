import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Button } from "./button"

describe("Button", () => {
  it("uses a safe button type by default", () => {
    render(<Button>Save changes</Button>)

    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toHaveAttribute("type", "button")
  })

  it("composes behavior onto a child element", () => {
    render(
      <Button asChild variant="outline">
        <a href="/mentions">View mentions</a>
      </Button>,
    )

    const link = screen.getByRole("link", { name: "View mentions" })
    expect(link).toHaveAttribute("href", "/mentions")
    expect(link).toHaveClass("border-[var(--line-strong)]")
    expect(link).toHaveClass("focus-visible:ring-2")
    expect(link).not.toHaveAttribute("type")
  })
})
