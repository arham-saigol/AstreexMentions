import { cn } from "../lib/utils"

export type SeparatorProps = {
  /** Decorative separators are hidden from assistive technology by default. */
  decorative?: boolean
  orientation?: "horizontal" | "vertical"
  className?: string
}

/**
 * Separator styled to the kit. Purely decorative by default; opt into a
 * semantic divider with `decorative={false}`.
 */
function Separator({
  decorative = true,
  orientation = "horizontal",
  className,
}: SeparatorProps) {
  return (
    <div
      data-slot="separator"
      role={decorative ? undefined : "separator"}
      aria-hidden={decorative ? "true" : undefined}
      className={cn(
        "bg-[var(--line)]",
        orientation === "vertical" ? "h-full w-px self-stretch" : "h-px w-full",
        className,
      )}
    />
  )
}

export { Separator }
