import type * as React from "react"

import { cn } from "../lib/utils"

/**
 * Surface panel — the kit's `.panel`. A bordered, raised card on the page
 * surface, with optional divided header, body, and footer regions.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card min-w-0 rounded-[var(--radius-lg)] border border-[var(--line)] shadow-[var(--shadow-xs)]",
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex min-h-[66px] items-center gap-3.5 border-b border-[var(--line)] px-[18px] py-4",
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        "text-foreground text-[15px] leading-tight font-semibold tracking-[-0.01em]",
        className,
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-muted-foreground mt-0.5 text-[13px]", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("p-5", className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-2 border-t border-[var(--line)] px-[18px] py-3.5",
        className,
      )}
      {...props}
    />
  )
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
