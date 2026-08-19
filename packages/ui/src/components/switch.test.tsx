import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { Switch } from "./switch"

describe("Switch", () => {
  it("keeps the supplied id on the native switch for external labels", () => {
    const onChange = vi.fn()

    render(
      <>
        <label htmlFor="digest-enabled">Daily digest</label>
        <Switch
          id="digest-enabled"
          label="Enable daily digest"
          isLabelHidden
          value={false}
          onChange={onChange}
        />
      </>,
    )

    const input = screen.getByRole("switch")
    expect(input).toHaveAttribute("id", "digest-enabled")
    expect(screen.getByLabelText("Enable daily digest")).toBe(input)

    fireEvent.click(screen.getByText("Daily digest"))
    expect(onChange).toHaveBeenCalledWith(true, expect.any(Object))
  })

  it("toggles when the visual switch track is clicked directly", () => {
    const onChange = vi.fn()
    const { container } = render(
      <Switch id="toggle" value={false} onChange={onChange} />,
    )

    const label = container.querySelector("label[for='toggle']")
    expect(label).not.toBeNull()
    if (label) {
      fireEvent.click(label)
      expect(onChange).toHaveBeenCalledWith(true, expect.any(Object))
    }
  })
})
