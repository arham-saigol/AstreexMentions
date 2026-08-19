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
        "t-check peer grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-inset)] text-current transition-[background-color,border-color] duration-[var(--motion-control)] ease-[var(--ease-out)] outline-none hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[var(--focus)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus)_16%,transparent)]",
        "data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)] data-[state=checked]:text-[var(--on-accent)]",
        "data-[state=indeterminate]:border-[var(--accent)] data-[state=indeterminate]:bg-[var(--accent)] data-[state=indeterminate]:text-[var(--on-accent)]",
        "aria-invalid:border-[var(--red)] aria-invalid:shadow-[0_0_0_3px_color-mix(in_srgb,var(--red)_16%,transparent)]",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        forceMount
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current data-[state=unchecked]:opacity-0 data-[state=indeterminate]:[&_.checked-icon]:hidden data-[state=checked]:[&_.indeterminate-icon]:hidden"
      >
        <Check className="checked-icon size-3" strokeWidth={3} />
        <Minus className="indeterminate-icon size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
