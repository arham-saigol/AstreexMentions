import type { ReactNode } from "react"

import { cn } from "@astreex/ui/lib/utils"

/**
 * transitions.dev "texts reveal". Wrap stacked text lines marked with the
 * `t-stagger-line` class (and `t-stagger-line--2`, `--3` for stagger). CSS
 * animates each line to its visible resting state without requiring hydration.
 * The reduced-motion guard skips the animation entirely.
 */
export function Stagger({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <div className={cn("t-stagger", className)}>{children}</div>
}
