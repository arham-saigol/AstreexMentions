"use client"

import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"
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
        "t-check peer border-input bg-background size-4 shrink-0 rounded-[4px] border outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-foreground focus-visible:shadow-[0_0_0_3px_rgba(27,26,24,0.06)]",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-2",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        forceMount
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current data-[state=unchecked]:opacity-0 data-[state=indeterminate]:[&_.checked-icon]:hidden data-[state=checked]:[&_.indeterminate-icon]:hidden"
      >
        <Check className="checked-icon size-3" strokeWidth={2.5} />
        <Minus className="indeterminate-icon size-3" strokeWidth={2.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
