"use client"

import { useEffect, useRef, type ReactNode } from "react"

import { cn } from "@astreex/ui/lib/utils"

/**
 * transitions.dev "texts reveal". Wrap stacked text lines marked with the
 * `t-stagger-line` class (and `t-stagger-line--2`, `--3` for stagger); the
 * parent flips `.is-shown` on mount so the lines rise + de-blur in sequence.
 * The snippet's `@media (prefers-reduced-motion)` guard zeroes the transition,
 * so reduced-motion users see the resting state immediately.
 */
export function Stagger({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.classList.add("is-shown")
  }, [])

  return (
    <div ref={ref} className={cn("t-stagger", className)}>
      {children}
    </div>
  )
}
