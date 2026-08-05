"use client"

import * as ProgressPrimitive from "@radix-ui/react-progress"
import type * as React from "react"

import { cn } from "../lib/utils"

function Progress({
  className,
  value = 0,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const normalizedValue = Math.min(100, Math.max(0, value ?? 0))

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-border relative h-1 w-full overflow-hidden rounded-full",
        className,
      )}
      value={normalizedValue}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-[var(--ink-tertiary)] transition-transform"
        style={{ transform: `translateX(-${100 - normalizedValue}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
