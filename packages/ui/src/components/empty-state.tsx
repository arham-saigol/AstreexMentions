import type * as React from "react"

import { cn } from "../lib/utils"

function EmptyState({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="empty-state"
      className={cn(
        "bg-card flex min-h-[256px] w-full flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--line)] px-6 py-10 text-center",
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
        "mb-4 grid size-12 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-inset)] text-[var(--text-tertiary)] [&_svg]:size-5",
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
      className={cn(
        "text-foreground text-[16px] font-semibold tracking-[-0.01em]",
        className,
      )}
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
      className={cn(
        "text-muted-foreground mt-1.5 max-w-[320px] text-[13px] leading-relaxed",
        className,
      )}
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
