import type * as React from "react"

import { cn } from "../lib/utils"

function Input({
  className,
  type = "text",
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-card text-foreground placeholder:text-muted-foreground selection:text-foreground flex h-10 w-full min-w-0 rounded-md border px-3 py-2 text-sm transition-[border-color,box-shadow] duration-[var(--motion-control)] outline-none selection:bg-[var(--brand-soft)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-foreground hover:border-[var(--ink-tertiary)] focus-visible:shadow-[0_0_0_3px_rgba(27,26,24,0.06)]",
        "aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_rgba(159,47,45,0.08)]",
        "file:text-foreground file:mr-3 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
