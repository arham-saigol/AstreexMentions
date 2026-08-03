"use client"

import { Button } from "@astreex/ui/components/button"
import { useFormStatus } from "react-dom"

export function ActionSubmit({
  children,
  variant = "default",
}: {
  children: string
  variant?: "default" | "outline"
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden="true"
        />
      ) : null}
      {pending ? "Saving…" : children}
    </Button>
  )
}
