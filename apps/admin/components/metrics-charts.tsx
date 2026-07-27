"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { MetricsOverview } from "@/lib/admin-data"

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const exactNumberFormatter = new Intl.NumberFormat("en-US")
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

const providerPalette = [
  "var(--metrics-series-1)",
  "var(--metrics-series-2)",
  "var(--metrics-series-3)",
  "var(--metrics-series-4)",
] as const

const knownProviderSlots = [
  ["openai", 0],
  ["anthropic", 1],
  ["google", 2],
  ["gemini", 2],
  ["perplexity", 3],
  ["xai", 0],
  ["grok", 0],
  ["cohere", 1],
  ["mistral", 2],
  ["meta", 3],
  ["llama", 3],
] as const

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
  boxShadow: "var(--shadow-sm)",
} as const

function providerColor(provider: string): string {
  const normalized = provider.trim().toLocaleLowerCase("en-US")
  const known = knownProviderSlots.find(([name]) => normalized.includes(name))

  if (known) {
    return providerPalette[known[1]]
  }

  let hash = 2166136261

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (
    providerPalette[(hash >>> 0) % providerPalette.length] ?? providerPalette[0]
  )
}

type ChartTableRow = Readonly<{
  key: string
  cells: readonly (string | number)[]
  swatchColor?: string
}>

function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string
  columns: readonly string[]
  rows: readonly ChartTableRow[]
}) {
  return (
    <details className="mt-4 border-t pt-3">
      <summary className="text-muted-foreground hover:text-foreground w-fit text-sm font-medium">
        View data table
      </summary>
      <div className="mt-3 max-w-full overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-muted-foreground border-b">
              {columns.map((column, columnIndex) => (
                <th
                  key={column}
                  scope="col"
                  className={
                    columnIndex === 0
                      ? "px-2 py-2 font-medium"
                      : "px-2 py-2 text-right font-medium"
                  }
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b last:border-0">
                {row.cells.map((cell, cellIndex) =>
                  cellIndex === 0 ? (
                    <th
                      key={`${cellIndex}-${cell}`}
                      scope="row"
                      className="px-2 py-2 font-medium"
                    >
                      <span className="inline-flex items-center gap-2">
                        {row.swatchColor ? (
                          <span
                            className="border-foreground/35 size-2.5 shrink-0 rounded-[2px] border"
                            style={{ backgroundColor: row.swatchColor }}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span>{cell}</span>
                      </span>
                    </th>
                  ) : (
                    <td
                      key={`${cellIndex}-${cell}`}
                      className="px-2 py-2 text-right tabular-nums"
                    >
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function EmptyChartState({ children }: { children: string }) {
  return (
    <p className="bg-muted/35 text-muted-foreground mt-5 rounded-md border p-4 text-sm">
      {children}
    </p>
  )
}

function ProviderLegend({
  providers,
}: {
  providers: MetricsOverview["providerHealth"]
}) {
  if (providers.length < 2) {
    return null
  }

  return (
    <ul
      className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs"
      aria-label="Provider legend"
    >
      {providers.map((provider) => (
        <li key={provider.provider} className="inline-flex items-center gap-2">
          <span
            className="border-foreground/35 h-2.5 w-4 rounded-[2px] border"
            style={{ backgroundColor: providerColor(provider.provider) }}
            aria-hidden="true"
          />
          <span>{provider.provider}</span>
        </li>
      ))}
    </ul>
  )
}

export function MentionVolumeChart({
  data,
}: {
  data: MetricsOverview["mentionVolume"]
}) {
  const chartData = [...data].sort(
    (left, right) => left.timestamp - right.timestamp,
  )
  const latest = chartData.at(-1)

  return (
    <section
      className="admin-panel min-w-0 p-4 sm:p-5"
      aria-labelledby="mention-trend-title"
    >
      <div>
        <h2 id="mention-trend-title" className="font-semibold">
          Mention trend
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Daily mention volume returned for the selected date range.
        </p>
      </div>
      {chartData.length > 0 ? (
        <>
          <div
            className="mt-5 h-72 max-w-full min-w-0"
            role="img"
            aria-label="Daily mention volume over time"
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={chartData}
                accessibilityLayer
                margin={{ top: 24, right: 24, bottom: 8, left: 0 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeWidth={1}
                  vertical={false}
                />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickFormatter={(value) => dateFormatter.format(Number(value))}
                  minTickGap={28}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickFormatter={(value) =>
                    compactNumberFormatter.format(Number(value))
                  }
                  width={44}
                />
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "var(--popover-foreground)" }}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                  labelFormatter={(label) =>
                    dateFormatter.format(Number(label))
                  }
                  formatter={(value) => [
                    exactNumberFormatter.format(Number(value)),
                    "Mentions",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Mentions"
                  stroke="var(--metrics-series-1)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{
                    fill: "var(--metrics-series-1)",
                    r: 5,
                    stroke: "var(--card)",
                    strokeWidth: 2,
                  }}
                />
                {latest ? (
                  <ReferenceDot
                    x={latest.timestamp}
                    y={latest.count}
                    r={4}
                    fill="var(--metrics-series-1)"
                    stroke="var(--card)"
                    strokeWidth={2}
                    label={{
                      value: exactNumberFormatter.format(latest.count),
                      position: "top",
                      fill: "var(--foreground)",
                      fontSize: 12,
                    }}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ChartTable
            caption="Daily mention volume"
            columns={["Date", "Mentions"]}
            rows={chartData.map((point) => ({
              key: String(point.timestamp),
              cells: [
                dateFormatter.format(point.timestamp),
                exactNumberFormatter.format(point.count),
              ],
            }))}
          />
        </>
      ) : (
        <EmptyChartState>
          No mention volume was returned for this date range.
        </EmptyChartState>
      )}
    </section>
  )
}

export function CategoryBreakdownChart({
  data,
}: {
  data: MetricsOverview["categoryBreakdown"]
}) {
  const chartData = [...data].sort((left, right) => right.count - left.count)
  const chartHeight = Math.max(288, chartData.length * 42)

  return (
    <section
      className="admin-panel min-w-0 p-4 sm:p-5"
      aria-labelledby="category-breakdown-title"
    >
      <div>
        <h2 id="category-breakdown-title" className="font-semibold">
          Mentions by category
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Category counts ranked by volume. Bar length carries magnitude.
        </p>
      </div>
      {chartData.length > 0 ? (
        <>
          <div
            className="mt-5 max-w-full min-w-0"
            style={{ height: chartHeight }}
            role="img"
            aria-label="Mention counts by category"
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                data={chartData}
                layout="vertical"
                accessibilityLayer
                margin={{ top: 0, right: 16, bottom: 4, left: 4 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeWidth={1}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickFormatter={(value) =>
                    compactNumberFormatter.format(Number(value))
                  }
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickFormatter={(value) => {
                    const label = String(value)
                    return label.length > 18 ? `${label.slice(0, 17)}…` : label
                  }}
                  width={116}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", fillOpacity: 0.55 }}
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "var(--popover-foreground)" }}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                  formatter={(value) => [
                    exactNumberFormatter.format(Number(value)),
                    "Mentions",
                  ]}
                />
                <Bar
                  dataKey="count"
                  name="Mentions"
                  fill="var(--metrics-series-1)"
                  maxBarSize={24}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartTable
            caption="Mention counts by category"
            columns={["Category", "Mentions"]}
            rows={chartData.map((item) => ({
              key: item.category,
              cells: [item.category, exactNumberFormatter.format(item.count)],
            }))}
          />
        </>
      ) : (
        <EmptyChartState>
          No categorized mentions were returned for this date range.
        </EmptyChartState>
      )}
    </section>
  )
}

export function ProviderHealthChart({
  data,
}: {
  data: MetricsOverview["providerHealth"]
}) {
  const chartData = [...data].sort(
    (left, right) => right.requestCount - left.requestCount,
  )
  const providerSeries = chartData.map((provider, index) => ({
    color: providerColor(provider.provider),
    dataKey: `provider-${index}`,
    provider,
  }))
  const outcomeData: Array<{
    outcome: string
    [dataKey: string]: string | number
  }> = [
    { outcome: "Requests" },
    { outcome: "Succeeded" },
    { outcome: "Failed" },
  ]

  for (const series of providerSeries) {
    outcomeData[0]![series.dataKey] = series.provider.requestCount
    outcomeData[1]![series.dataKey] = series.provider.successCount
    outcomeData[2]![series.dataKey] = series.provider.failureCount
  }

  const hasUniqueProviderColors =
    new Set(providerSeries.map((series) => series.color)).size ===
    providerSeries.length
  const canChartProviders =
    chartData.length <= providerPalette.length && hasUniqueProviderColors
  const chartFallbackMessage =
    chartData.length > providerPalette.length
      ? `The query returned more than ${providerPalette.length} providers, so the identity chart is replaced by the complete table rather than recycling colors.`
      : "The returned provider names do not resolve to distinct slots in the fixed palette, so the identity chart is replaced by the labeled table rather than showing ambiguous colors."

  return (
    <section
      className="admin-panel min-w-0 p-4 sm:p-5"
      aria-labelledby="provider-health-title"
    >
      <div>
        <h2 id="provider-health-title" className="font-semibold">
          Provider request outcomes
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Grouped counts use fixed provider colors. Latency remains in the table
          instead of adding a second axis.
        </p>
      </div>
      {chartData.length > 0 ? (
        <>
          {canChartProviders ? (
            <>
              <ProviderLegend providers={chartData} />
              <div
                className="mt-5 h-80 max-w-full min-w-0"
                role="img"
                aria-label="Grouped request totals, successes, and failures by provider"
              >
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={outcomeData}
                    accessibilityLayer
                    barGap={2}
                    barCategoryGap="24%"
                    margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
                  >
                    <CartesianGrid
                      stroke="var(--border)"
                      strokeWidth={1}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="outcome"
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                      tickFormatter={(value) =>
                        compactNumberFormatter.format(Number(value))
                      }
                      width={44}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", fillOpacity: 0.55 }}
                      contentStyle={tooltipStyle}
                      itemStyle={{ color: "var(--popover-foreground)" }}
                      labelStyle={{ color: "var(--muted-foreground)" }}
                      formatter={(value, name) => [
                        exactNumberFormatter.format(Number(value)),
                        String(name),
                      ]}
                    />
                    {providerSeries.map((series) => (
                      <Bar
                        key={series.dataKey}
                        dataKey={series.dataKey}
                        name={series.provider.provider}
                        fill={series.color}
                        maxBarSize={24}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p className="bg-muted/35 text-muted-foreground mt-5 rounded-md border p-4 text-sm">
              {chartFallbackMessage}
            </p>
          )}
          <ChartTable
            caption="Provider request totals, outcomes, and latency"
            columns={[
              "Provider",
              "Requests",
              "Succeeded",
              "Failed",
              "Avg. latency",
            ]}
            rows={chartData.map((provider) => ({
              key: provider.provider,
              ...(canChartProviders
                ? { swatchColor: providerColor(provider.provider) }
                : {}),
              cells: [
                provider.provider,
                exactNumberFormatter.format(provider.requestCount),
                exactNumberFormatter.format(provider.successCount),
                exactNumberFormatter.format(provider.failureCount),
                `${exactNumberFormatter.format(provider.averageLatencyMs)} ms`,
              ],
            }))}
          />
        </>
      ) : (
        <EmptyChartState>
          No provider runs were returned for this date range.
        </EmptyChartState>
      )}
    </section>
  )
}
