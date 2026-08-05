import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils"

const badgeVariants = cva(
  "inline-flex min-h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-1 text-[11px] leading-none font-medium tracking-[0.06em] whitespace-nowrap uppercase transition-colors duration-[var(--motion-control)] before:hidden before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:opacity-70 before:content-[''] [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-[var(--brand-soft)] text-[var(--brand-soft-ink)]",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline:
          "border-border bg-background text-[var(--ink-secondary)] before:hidden",
        muted:
          "border-transparent bg-muted text-[var(--ink-secondary)] before:hidden",
        question:
          "border-transparent bg-question text-question-foreground before:block",
        complaint:
          "border-transparent bg-complaint text-complaint-foreground before:block",
        praise:
          "border-transparent bg-praise text-praise-foreground before:block",
        bug: "border-transparent bg-bug text-bug-foreground before:block",
        feature:
          "border-transparent bg-feature text-feature-foreground before:block",
        competitor:
          "border-transparent bg-competitor text-competitor-foreground before:block",
        other: "border-transparent bg-other text-other-foreground before:block",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
  }) {
  const Component = asChild ? Slot : "span"

  return (
    <Component
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

const mentionCategoryVariants = {
  Question: "question",
  Complaint: "complaint",
  Praise: "praise",
  Bug: "bug",
  "Feature Request": "feature",
  "Competitor Mention": "competitor",
  Other: "other",
} as const satisfies Record<
  string,
  NonNullable<VariantProps<typeof badgeVariants>["variant"]>
>

type MentionCategory = keyof typeof mentionCategoryVariants

function CategoryBadge({
  category,
  ...props
}: Omit<React.ComponentProps<typeof Badge>, "variant" | "children"> & {
  category: MentionCategory
}) {
  return (
    <Badge variant={mentionCategoryVariants[category]} {...props}>
      {category}
    </Badge>
  )
}

export { Badge, CategoryBadge, badgeVariants, mentionCategoryVariants }
export type { MentionCategory }
