import { api } from "@astreex/backend/api"
import { Button } from "@astreex/ui/components/button"
import type { Metadata } from "next"
import Link from "next/link"

import { AccessState } from "@/components/access-state"
import {
  CategoryBreakdownChart,
  MentionVolumeChart,
  ProviderHealthChart,
} from "@/components/metrics-charts"
import { runAdminQuery } from "@/lib/admin-convex"
import type { MetricsRangeDays } from "@/lib/admin-data"

export const metadata: Metadata = {
  title: "Metrics",
}

const ranges: readonly MetricsRangeDays[] = [7, 30, 90]
const numberFormatter = new Intl.NumberFormat("en-US")

function parseRange(value: string | undefined): MetricsRangeDays {
  const candidate = Number(value)
  return ranges.includes(candidate as MetricsRangeDays)
    ? (candidate as MetricsRangeDays)
    : 30
}

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const params = await searchParams
  const days = parseRange(params.days)
  const result = await runAdminQuery(api.admin.getMetricsOverview, { days })

  if (result.status === "access-denied") {
    return <AccessState {...result.access} />
  }

  if (result.status === "configuration") {
    return <AccessState kind="data-configuration" issues={result.issues} />
  }

  if (result.status === "unavailable") {
    return <AccessState kind="unavailable" />
  }

  const metrics = result.data

  const stats = [
    {
      label: "Workspaces",
      value: metrics.stats.workspaces,
      description: "Total workspaces",
    },
    {
      label: "Active workspaces",
      value: metrics.stats.activeWorkspaces,
      description: `Active in the last ${days} days`,
    },
    {
      label: "Mentions",
      value: metrics.stats.mentions,
      description: `Recorded in the last ${days} days`,
    },
    {
      label: "Emails delivered",
      value: metrics.stats.emailsDelivered,
      description: `Delivered in the last ${days} days`,
    },
  ] as const

  return (
    <div className="space-y-6 [--metrics-series-1:#2a78d6] [--metrics-series-2:#eda100] [--metrics-series-3:#e87ba4] [--metrics-series-4:#008300] dark:[--metrics-series-1:#3987e5] dark:[--metrics-series-2:#c98500] dark:[--metrics-series-3:#d55181] dark:[--metrics-series-4:#008300]">
      <form
        className="admin-panel flex flex-wrap items-end gap-3 p-4 sm:p-5"
        aria-label="Metrics filters"
      >
        <div className="mr-auto min-w-full sm:min-w-0">
          <p className="text-sm font-semibold">Filters</p>
          <p className="text-muted-foreground mt-1 text-sm">
            The selected range applies to every metric, chart, and table below.
          </p>
        </div>
        <div className="min-w-0 space-y-1.5">
          <label htmlFor="metrics-days" className="text-sm font-medium">
            Date range
          </label>
          <select
            id="metrics-days"
            name="days"
            defaultValue={String(days)}
            className="border-input bg-background focus-visible:ring-ring block h-9 min-w-40 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2"
          >
            {ranges.map((range) => (
              <option key={range} value={range}>
                Last {range} days
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <section aria-labelledby="metric-summary-title">
        <h2 id="metric-summary-title" className="sr-only">
          Metric summary
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="admin-panel min-w-0 p-4">
              <dt className="text-muted-foreground text-sm">{stat.label}</dt>
              <dd className="mt-2 text-2xl font-semibold tracking-tight">
                {numberFormatter.format(stat.value)}
              </dd>
              <p className="text-muted-foreground mt-1 text-xs">
                {stat.description}
              </p>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="account-deletion-operations-title"
        className="admin-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      >
        <div>
          <h2 id="account-deletion-operations-title" className="font-semibold">
            Account deletion operations
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Inspect the durable deletion queue, lifecycle evidence, and
            confirmation-gated recovery controls.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/deletions">Open deletion queue</Link>
        </Button>
      </section>

      <MentionVolumeChart data={metrics.mentionVolume} />

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <CategoryBreakdownChart data={metrics.categoryBreakdown} />
        <ProviderHealthChart data={metrics.providerHealth} />
      </div>
    </div>
  )
}
