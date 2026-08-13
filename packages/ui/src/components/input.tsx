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
        "border-input bg-[var(--surface-inset)] text-foreground placeholder:text-[var(--text-tertiary)] selection:text-foreground flex h-[var(--control-h)] w-full min-w-0 rounded-[var(--radius-sm)] border px-3 py-2 text-[13px] shadow-[var(--shadow-control)] transition-[border-color,box-shadow] duration-[var(--motion-control)] outline-none selection:bg-[var(--brand-soft)] hover:border-[var(--line-strong)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[var(--focus)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus)_16%,transparent)]",
        "aria-invalid:border-[var(--red)] aria-invalid:shadow-[0_0_0_3px_color-mix(in_srgb,var(--red)_16%,transparent)]",
        "file:text-foreground file:mr-3 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
