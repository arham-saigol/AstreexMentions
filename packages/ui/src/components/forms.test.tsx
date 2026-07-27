import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { Checkbox } from "./checkbox"
import { Label } from "./label"
import { Switch } from "./switch"

describe("form controls", () => {
  it("associates a checkbox with its visible label and toggles it", () => {
    render(
      <div>
        <Label htmlFor="saved-filter">Saved mentions</Label>
        <Checkbox id="saved-filter" />
      </div>,
    )

    const checkbox = screen.getByRole("checkbox", { name: "Saved mentions" })
    expect(checkbox).not.toBeChecked()

    fireEvent.click(checkbox)

    expect(checkbox).toBeChecked()
  })

  it("exposes switch semantics and reports state changes", () => {
    const onCheckedChange = vi.fn()
    render(
      <Switch aria-label="Daily digest" onCheckedChange={onCheckedChange} />,
    )

    const digestSwitch = screen.getByRole("switch", { name: "Daily digest" })
    expect(digestSwitch).toHaveAttribute("aria-checked", "false")

    fireEvent.click(digestSwitch)

    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(digestSwitch).toHaveAttribute("aria-checked", "true")
  })
})
