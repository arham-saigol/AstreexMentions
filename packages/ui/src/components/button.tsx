import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm leading-none font-medium transition-[background-color,color,border-color,transform] duration-[var(--motion-control)] ease-[var(--ease-editorial)] outline-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[var(--brand-hover)] active:bg-[var(--brand-pressed)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:brightness-[1.08]",
        outline:
          "border-[var(--line-strong)] bg-card text-foreground hover:border-[var(--ink-tertiary)]",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]",
        ghost:
          "text-[var(--ink-secondary)] hover:bg-secondary hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "px-[18px] py-[11px]",
        sm: "gap-1.5 px-3 py-2 text-[13px]",
        lg: "px-[22px] py-3.5 text-[15px]",
        icon: "size-10 p-0",
        "icon-sm": "size-8 p-0",
        "icon-lg": "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Component = asChild ? Slot : "button"

  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...(!asChild && { type: type ?? "button" })}
      {...props}
    />
  )
}

export { Button, buttonVariants }
