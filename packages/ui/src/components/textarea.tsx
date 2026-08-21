import type * as React from "react"

import { cn } from "../lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input text-foreground flex min-h-[90px] w-full resize-y rounded-[var(--radius-sm)] border bg-[var(--surface-inset)] px-3 py-2.5 text-[13px] leading-relaxed shadow-[var(--shadow-control)] transition-[border-color,box-shadow] duration-[var(--motion-control)] outline-none placeholder:text-[var(--text-tertiary)] hover:border-[var(--line-strong)] disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[var(--focus)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus)_16%,transparent)]",
        "aria-invalid:border-[var(--red)] aria-invalid:shadow-[0_0_0_3px_color-mix(in_srgb,var(--red)_16%,transparent)]",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
