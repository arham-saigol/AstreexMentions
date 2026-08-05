"use client"

import { cn } from "@astreex/ui/lib/utils"
import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ComponentProps,
} from "react"

type RevealProps = ComponentProps<"div"> & {
  index?: number
}

export function Reveal({ className, index = 0, style, ...props }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    if (reduceMotion || !("IntersectionObserver" in window)) {
      element.classList.add("reveal-in")
      return
    }

    element.classList.add("reveal-ready")
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        element.classList.add("reveal-in")
        observer.disconnect()
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      style={
        {
          ...style,
          "--reveal-index": index,
        } as CSSProperties
      }
      {...props}
    />
  )
}
