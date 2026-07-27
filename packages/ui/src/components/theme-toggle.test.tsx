import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ThemeToggle } from "./theme-toggle"

const { setTheme } = vi.hoisted(() => ({ setTheme: vi.fn() }))

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme, theme: "dark" }),
}))

describe("ThemeToggle", () => {
  beforeEach(() => {
    setTheme.mockClear()
  })

  it("exposes theme choices as a radio group", async () => {
    render(<ThemeToggle />)

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Change color theme" }),
      { button: 0, ctrlKey: false },
    )

    expect(
      await screen.findByRole("menuitemradio", { name: "Dark" }),
    ).toHaveAttribute("aria-checked", "true")

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Light" }))
    expect(setTheme).toHaveBeenCalledWith("light")
  })
})
