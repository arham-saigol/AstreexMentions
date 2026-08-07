// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { FaqAccordion } from "./faq-accordion"

afterEach(cleanup)

describe("FaqAccordion", () => {
  it("exposes an answer to assistive technology only while expanded", () => {
    const { container } = render(
      <FaqAccordion items={[["How does it work?", "With an answer."]]} />,
    )
    const trigger = screen.getByRole("button", { name: "How does it work?" })
    const panel = container.querySelector(".t-acc-panel")

    expect(panel?.getAttribute("aria-hidden")).toBe("true")

    fireEvent.click(trigger)

    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(panel?.getAttribute("aria-hidden")).toBe("false")
  })
})
