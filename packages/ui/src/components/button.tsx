import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils"

const buttonVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] border text-[13px] leading-none font-semibold outline-none transition-[background-color,border-color,box-shadow,color,transform] duration-[var(--motion-control)] ease-[var(--ease-out)] active:translate-y-px active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[15px] [&_svg]:stroke-[2] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        // Primary — signal coral fill with near-black text (kit btn-primary).
        default:
          "bg-primary text-primary-foreground border-transparent shadow-[var(--shadow-control)] hover:bg-[var(--brand-hover)] active:bg-[var(--brand-pressed)]",
        // Secondary — quiet surface button (kit default .btn).
        outline:
          "border-[var(--line-strong)] bg-card text-foreground shadow-[var(--shadow-control)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)] hover:shadow-[var(--shadow-sm)] hover:-translate-y-px",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-[var(--surface-hover)] hover:text-foreground",
        ghost:
          "border-transparent bg-transparent text-[var(--ink-secondary)] shadow-none hover:bg-[var(--surface-hover)] hover:text-foreground",
        link: "border-transparent bg-transparent text-foreground underline-offset-4 shadow-none hover:underline",
        // Destructive — soft red tint with red text (kit btn-danger). Solid
        // red (`bg-destructive`) and error text (`text-destructive`) both read
        // as the red hue via the destructive token.
        destructive:
          "border-transparent bg-[var(--red-bg)] text-[var(--red)] shadow-[var(--shadow-control)] hover:bg-[color-mix(in_srgb,var(--red)_12%,transparent)] hover:text-[var(--red)] active:bg-[color-mix(in_srgb,var(--red)_18%,transparent)]",
      },
      size: {
        default: "h-[var(--control-h)] px-3.5",
        sm: "h-[calc(var(--control-h)-6px)] gap-1.5 px-2.5 text-[12px]",
        lg: "h-[calc(var(--control-h)+8px)] px-[18px] text-[14px]",
        icon: "size-[var(--control-h)] p-0",
        "icon-sm": "size-[calc(var(--control-h)-6px)] p-0",
        "icon-lg": "size-[calc(var(--control-h)+8px)] p-0",
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
  loading = false,
  type,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }) {
  const Component = asChild ? Slot : "button"
  const isDisabled = disabled || loading

  return (
    <Component
      data-slot="button"
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...(!asChild && { disabled: isDisabled, type: type ?? "button" })}
      {...props}
    >
      {asChild ? (
        children
      ) : loading ? (
        <>
          <span
            aria-hidden="true"
            className="size-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current"
          />
          <span className="sr-only">Loading…</span>
        </>
      ) : (
        children
      )}
    </Component>
  )
}

export { Button, buttonVariants }
