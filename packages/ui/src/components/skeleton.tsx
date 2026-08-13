import type * as React from "react"

import { cn } from "../lib/utils"

/**
 * Skeleton placeholder styled to the kit: an inset surface with a soft sweep
 * shimmer. Callers control size via `className`; the shimmer fills it.
 */
export type SkeletonProps = {
  className?: string
}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn("astro-skeleton rounded-[5px]", className)}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }