"use client"

import { CheckIcon, MinusIcon } from "@phosphor-icons/react/dist/ssr"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import type * as React from "react"

import { cn } from "../lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-input bg-background size-4 shrink-0 rounded-[4px] border shadow-xs transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-2",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-2",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current data-[state=indeterminate]:[&_.checked-icon]:hidden data-[state=checked]:[&_.indeterminate-icon]:hidden"
      >
        <CheckIcon className="checked-icon size-3" weight="bold" />
        <MinusIcon className="indeterminate-icon size-3" weight="bold" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
