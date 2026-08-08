"use client"

import { api } from "@astreex/backend/api"
import {
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  KeyIcon,
  PauseCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { Badge } from "@astreex/ui/components/badge"
import { Progress } from "@astreex/ui/components/progress"
import { useQuery } from "convex/react"

import { useProductContext } from "@/components/product/product-context"

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp))
}

export function UsageSettings() {
  const { access, billing } = useProductContext()
  const keywordValue = useQuery(api.keywords.listKeywords, {})
  const usage = billing.usage ?? billing.evaluation
  const freeEvaluation = billing.usage === null && billing.evaluation !== null
  const allowance = usage?.mentionLimit ?? 0
  const used = usage?.mentionsUsed ?? 0
  const remaining = Math.max(0, allowance - used)
  const percent =
    allowance > 0 ? Math.min(100, Math.round((used / allowance) * 100)) : 0
  const keywords = keywordValue ?? null
  const activeKeywords = keywords?.filter(
    (keyword) => keyword.status === "active",
  ).length
  const keywordCount = keywords?.length

  const tracking = (() => {
    if (access.mode !== "active") {
      return {
        label: "Preview",
        description: "No paid monitoring entitlement is active.",
        icon: WarningCircleIcon,
      }
    }
    if (!keywords) {
      return {
        label: "Unavailable",
        description: "Keyword tracking state could not be validated.",
        icon: WarningCircleIcon,
      }
    }
    if (keywordCount === 0) {
      return {
        label: "Setup required",
        description: "Add a keyword before collection can begin.",
        icon: KeyIcon,
      }
    }
    if (activeKeywords === 0) {
      return {
        label: "Paused",
        description: "Every configured keyword is paused.",
        icon: PauseCircleIcon,
      }
    }
    if (allowance > 0 && used >= allowance) {
      return {
        label: "Limit reached",
        description: freeEvaluation
          ? "The one-time evaluation allowance is exhausted. Upgrade to resume collection."
          : "Collection is paused until the usage cycle resets.",
        icon: WarningCircleIcon,
      }
    }
    return {
      label: "Tracking",
      description: "Active keywords are eligible for scheduled collection.",
      icon: CheckCircleIcon,
    }
  })()

  return (
    <div className="space-y-8">
      <section aria-labelledby="mention-usage-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4
              id="mention-usage-heading"
              className="text-foreground text-sm font-semibold"
            >
              Mention usage
            </h4>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {freeEvaluation
                ? "Usage counts newly accepted mentions in the one-time free evaluation."
                : "Usage counts accepted mentions in the current billing cycle."}
            </p>
          </div>
          <Badge variant={usage ? "outline" : "muted"}>
            {usage ? `${percent}% used` : "No active usage cycle"}
          </Badge>
        </div>

        {usage ? (
          <>
            <Progress
              value={percent}
              aria-label={`${used} of ${allowance} mentions used`}
              className="mt-5"
            />
            <dl className="border-border mt-5 grid divide-y border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="px-3 py-4 first:pl-0 sm:px-5">
                <dt className="text-muted-foreground font-mono text-[11px] tracking-[0.08em] uppercase">
                  Used
                </dt>
                <dd className="font-display text-foreground mt-1 text-2xl font-medium tracking-[-0.02em]">
                  {used.toLocaleString()}
                </dd>
              </div>
              <div className="px-3 py-4 sm:px-5">
                <dt className="text-muted-foreground font-mono text-[11px] tracking-[0.08em] uppercase">
                  Allowance
                </dt>
                <dd className="font-display text-foreground mt-1 text-2xl font-medium tracking-[-0.02em]">
                  {allowance.toLocaleString()}
                </dd>
              </div>
              <div className="px-3 py-4 last:pr-0 sm:px-5">
                <dt className="text-muted-foreground font-mono text-[11px] tracking-[0.08em] uppercase">
                  Remaining
                </dt>
                <dd className="font-display text-foreground mt-1 text-2xl font-medium tracking-[-0.02em]">
                  {remaining.toLocaleString()}
                </dd>
              </div>
            </dl>
            <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
              <ClockCounterClockwiseIcon
                aria-hidden="true"
                className="size-4"
              />
              {"periodEndAt" in usage
                ? `Resets ${formatDate(usage.periodEndAt)}`
                : "One-time allowance; it does not reset"}
            </p>
          </>
        ) : (
          <div className="border-border bg-muted/35 mt-5 rounded-md border px-4 py-4">
            <p className="text-foreground text-sm font-medium">
              Usage is not available.
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              Start the free evaluation or activate a paid plan to receive a
              monitoring allowance.
            </p>
          </div>
        )}
      </section>

      <section
        aria-labelledby="keyword-usage-heading"
        className="border-border border-t pt-6"
      >
        <h4
          id="keyword-usage-heading"
          className="text-foreground text-sm font-semibold"
        >
          Keywords
        </h4>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">Configured</dt>
            <dd className="text-foreground mt-1 text-sm font-medium">
              {keywordValue === undefined
                ? "Loading…"
                : keywordCount === undefined
                  ? "Unavailable"
                  : keywordCount.toLocaleString()}
              {usage ? ` of ${usage.keywordLimit.toLocaleString()}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Active</dt>
            <dd className="text-foreground mt-1 text-sm font-medium">
              {keywordValue === undefined
                ? "Loading…"
                : activeKeywords === undefined
                  ? "Unavailable"
                  : activeKeywords.toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="tracking-heading"
        className="border-border border-t pt-6"
      >
        <div className="flex items-start gap-3">
          <tracking.icon
            aria-hidden="true"
            className="text-muted-foreground mt-0.5 size-5 shrink-0"
          />
          <div>
            <h4
              id="tracking-heading"
              className="text-foreground text-sm font-semibold"
            >
              {tracking.label}
            </h4>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {tracking.description}
            </p>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="dedupe-heading"
        className="border-border border-t pt-6"
      >
        <h4
          id="dedupe-heading"
          className="text-foreground text-sm font-semibold"
        >
          Duplicate handling
        </h4>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Astreex deduplicates provider results before a mention is accepted
          into the account. Repeated sightings of the same source item do not
          consume the mention allowance again; only newly accepted mentions
          increment usage.
        </p>
      </section>
    </div>
  )
}
