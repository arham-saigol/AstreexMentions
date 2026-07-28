import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog"

describe("Dialog", () => {
  it("opens from its trigger and closes with the labeled close control", async () => {
    render(
      <Dialog>
        <DialogTrigger>Open details</DialogTrigger>
        <DialogContent>
          <DialogTitle>Mention details</DialogTitle>
          <DialogDescription>Review the full conversation.</DialogDescription>
        </DialogContent>
      </Dialog>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Open details" }))

    expect(
      await screen.findByRole("dialog", { name: "Mention details" }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Mention details" }),
      ).not.toBeInTheDocument()
    })
  })
})
