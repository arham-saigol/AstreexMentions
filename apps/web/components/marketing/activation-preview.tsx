import {
  CheckCircleIcon,
  ClockCountdownIcon,
  FunnelSimpleIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Badge } from "@astreex/ui/components/badge"

const configuration = [
  {
    label: "Sources",
    value: "X, Reddit, Hacker News",
    icon: SlidersHorizontalIcon,
  },
  {
    label: "Keywords",
    value: "Brand, products, competitors",
    icon: FunnelSimpleIcon,
  },
  {
    label: "Review cadence",
    value: "Daily digest at 09:00",
    icon: ClockCountdownIcon,
  },
] as const

export function ActivationPreview() {
  return (
    <div
      aria-label="Example monitoring configuration"
      className="border-border bg-card rounded-xl border shadow-sm"
    >
      <div className="border-border flex items-center justify-between gap-4 border-b px-5 py-4">
        <div>
          <p className="text-foreground text-sm font-semibold">
            Monitoring setup
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Example configuration
          </p>
        </div>
        <Badge variant="outline">Draft</Badge>
      </div>

      <dl className="divide-border divide-y px-5">
        {configuration.map(({ label, value, icon: Icon }) => (
          <div key={label} className="py-4">
            <dt className="text-muted-foreground flex items-center gap-3 text-xs font-medium">
              <span className="border-border bg-muted grid size-9 shrink-0 place-items-center rounded-md border">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span>{label}</span>
            </dt>
            <dd className="text-foreground mt-1 pl-12 text-sm font-medium">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="border-border bg-muted/35 border-t px-5 py-4">
        <div className="flex items-start gap-3">
          <CheckCircleIcon
            aria-hidden="true"
            weight="fill"
            className="text-primary mt-0.5 size-5 shrink-0"
          />
          <div>
            <p className="text-foreground text-sm font-semibold">
              Review before activation
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              Monitoring starts only after sources, keywords, and delivery
              settings have been explicitly configured and confirmed.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
