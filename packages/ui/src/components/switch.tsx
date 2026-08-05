"use client"

import * as SwitchPrimitive from "@radix-ui/react-switch"
import type * as React from "react"

import { cn } from "../lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer bg-input inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border border-transparent transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-foreground focus-visible:shadow-[0_0_0_3px_rgba(27,26,24,0.06)]",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="bg-card pointer-events-none block size-[18px] translate-x-px rounded-full shadow-xs transition-transform data-[state=checked]:translate-x-[17px] data-[state=unchecked]:translate-x-px"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
