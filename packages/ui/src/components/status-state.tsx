import {
  CheckCircleIcon,
  CircleNotchIcon,
  InfoIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils"

const statusStateVariants = cva(
  "flex items-start gap-3 rounded-lg border p-4 text-sm [&_[data-slot=status-state-icon]>svg]:size-5",
  {
    variants: {
      variant: {
        info: "border-border bg-muted/50 text-foreground",
        success: "border-praise bg-praise/50 text-praise-foreground",
        warning:
          "border-competitor bg-competitor/50 text-competitor-foreground",
        error: "border-bug bg-bug/50 text-bug-foreground",
        loading: "border-border bg-muted/50 text-foreground",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
)

const statusIcons = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: WarningCircleIcon,
  error: WarningCircleIcon,
  loading: CircleNotchIcon,
} as const

type StatusStateProps = Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof statusStateVariants> & {
    title: React.ReactNode
    description?: React.ReactNode
    action?: React.ReactNode
    icon?: React.ReactNode
  }

function StatusState({
  className,
  variant = "info",
  title,
  description,
  action,
  icon,
  role,
  "aria-live": ariaLive,
  ...props
}: StatusStateProps) {
  const normalizedVariant = variant ?? "info"
  const Icon = statusIcons[normalizedVariant]
  const resolvedRole =
    role ?? (normalizedVariant === "error" ? "alert" : "status")
  const resolvedAriaLive =
    ariaLive ??
    (resolvedRole === "alert"
      ? "assertive"
      : resolvedRole === "status"
        ? "polite"
        : undefined)

  return (
    <div
      data-slot="status-state"
      data-variant={normalizedVariant}
      role={resolvedRole}
      aria-live={resolvedAriaLive}
      className={cn(
        statusStateVariants({ variant: normalizedVariant }),
        className,
      )}
      {...props}
    >
      <div
        data-slot="status-state-icon"
        aria-hidden="true"
        className="mt-0.5 shrink-0"
      >
        {icon ?? (
          <Icon
            weight={normalizedVariant === "loading" ? "bold" : "regular"}
            className={cn(normalizedVariant === "loading" && "animate-spin")}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {description && (
          <div className="mt-1 text-current/80">{description}</div>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}

export { StatusState, statusStateVariants }
export type { StatusStateProps }
