import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border bg-background text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        question: "border-transparent bg-question text-question-foreground",
        complaint: "border-transparent bg-complaint text-complaint-foreground",
        praise: "border-transparent bg-praise text-praise-foreground",
        bug: "border-transparent bg-bug text-bug-foreground",
        feature: "border-transparent bg-feature text-feature-foreground",
        competitor:
          "border-transparent bg-competitor text-competitor-foreground",
        other: "border-transparent bg-other text-other-foreground",
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
