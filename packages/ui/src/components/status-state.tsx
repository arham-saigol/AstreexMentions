import { CircleAlert, CircleCheck, Info, LoaderCircle } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils"

const statusStateRing = (hue: string) =>
  `border-[color-mix(in_srgb,var(--${hue})_28%,transparent)] bg-[var(--${hue}-bg)] text-[var(--${hue})]`

const statusStateVariants = cva(
  "flex items-start gap-3 rounded-[var(--radius-md)] border p-3.5 text-[13px] [&_[data-slot=status-state-icon]>svg]:size-4",
  {
    variants: {
      variant: {
        info: statusStateRing("blue"),
        success: statusStateRing("green"),
        warning: statusStateRing("yellow"),
        error: statusStateRing("red"),
        loading:
          "border-[var(--line)] bg-[var(--surface-inset)] text-foreground",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
)

const statusIcons = {
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
  error: CircleAlert,
  loading: LoaderCircle,
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
            strokeWidth={normalizedVariant === "loading" ? 2.25 : 2}
            className={cn(normalizedVariant === "loading" && "animate-spin")}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
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
