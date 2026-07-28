import type * as React from "react"

import { cn } from "../lib/utils"

function EmptyState({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="empty-state"
      className={cn(
        "border-border bg-card flex min-h-48 w-full flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center",
        className,
      )}
      {...props}
    />
  )
}

function EmptyStateIcon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-state-icon"
      aria-hidden="true"
      className={cn(
        "border-border bg-muted text-muted-foreground mb-4 grid size-10 place-items-center rounded-lg border [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  )
}

function EmptyStateTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="empty-state-title"
      className={cn("text-foreground text-base font-semibold", className)}
      {...props}
    />
  )
}

function EmptyStateDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-state-description"
      className={cn("text-muted-foreground mt-1 max-w-md text-sm", className)}
      {...props}
    />
  )
}

function EmptyStateActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-state-actions"
      className={cn(
        "mt-5 flex flex-wrap items-center justify-center gap-2",
        className,
      )}
      {...props}
    />
  )
}

export {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
}
