"use client"

import * as PopoverPrimitive from "@radix-ui/react-popover"
import type * as React from "react"

import { cn } from "../lib/utils"

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "t-dropdown bg-popover text-popover-foreground z-50 w-72 rounded-[var(--radius-md)] border border-[var(--line-strong)] p-4 shadow-[var(--shadow-md)] outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
