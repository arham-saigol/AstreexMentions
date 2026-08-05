import type * as React from "react"

import { cn } from "../lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-card text-foreground placeholder:text-muted-foreground flex min-h-24 w-full resize-y rounded-md border px-3 py-2 text-sm leading-relaxed transition-[border-color,box-shadow] duration-[var(--motion-control)] outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-foreground hover:border-[var(--ink-tertiary)] focus-visible:shadow-[0_0_0_3px_rgba(27,26,24,0.06)]",
        "aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_rgba(159,47,45,0.08)]",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
