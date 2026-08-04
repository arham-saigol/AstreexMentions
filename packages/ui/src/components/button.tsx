import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-semibold transition-[background-color,color,border-color,transform] duration-[var(--motion-control)] ease-out outline-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[var(--brand-hover)] active:bg-[var(--brand-pressed)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive",
        outline:
          "border border-input bg-card hover:border-[var(--line-strong)] hover:bg-secondary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[var(--surface-strong)]",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs",
        lg: "h-12 rounded-md px-6 text-sm",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
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
