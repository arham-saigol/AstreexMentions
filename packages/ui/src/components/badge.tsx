import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils"

const badgeVariants = cva(
  "inline-flex min-h-[22px] w-fit shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-[var(--motion-feedback)] [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-[var(--surface-active)] text-[var(--text)]",
        destructive:
          "border-transparent bg-[var(--red-bg)] text-[var(--red)]",
        success:
          "border-transparent bg-[var(--green-bg)] text-[var(--green)]",
        warning:
          "border-transparent bg-[var(--yellow-bg)] text-[var(--yellow)]",
        outline:
          "border-[var(--line)] bg-[var(--surface-inset)] text-[var(--text-secondary)]",
        muted:
          "border-transparent bg-[var(--surface-hover)] text-[var(--text-secondary)]",
        question:
          "border-transparent bg-question text-question-foreground before:size-[5px] before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        complaint:
          "border-transparent bg-complaint text-complaint-foreground before:size-[5px] before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        praise:
          "border-transparent bg-praise text-praise-foreground before:size-[5px] before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        bug: "border-transparent bg-bug text-bug-foreground before:size-[5px] before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        feature:
          "border-transparent bg-feature text-feature-foreground before:size-[5px] before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        competitor:
          "border-transparent bg-competitor text-competitor-foreground before:size-[5px] before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        other:
          "border-transparent bg-other text-other-foreground",
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