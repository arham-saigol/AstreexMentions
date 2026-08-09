"use client"

import {
  ArrowClockwiseIcon,
  AtIcon,
  CreditCardIcon,
  FunnelSimpleIcon,
  KeyIcon,
  PauseCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { Button } from "@astreex/ui/components/button"
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@astreex/ui/components/empty-state"
import { Skeleton } from "@astreex/ui/components/skeleton"
import Link from "next/link"

import { useProductDialogs } from "@/components/product/product-dialogs"

export function MentionsLoadingState() {
  return (
    <div aria-label="Loading mentions" aria-busy="true" className="space-y-3">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="border-border bg-card rounded-lg border p-4 sm:p-5"
        >
          <div className="flex gap-3">
            <Skeleton className="size-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="mt-4 h-4 w-11/12" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function MentionsErrorState({
  description,
  onRetry,
}: {
  description: string
  onRetry: () => void
}) {
  return (
    <EmptyState className="min-h-72" role="alert">
      <EmptyStateIcon className="text-destructive">
        <WarningCircleIcon />
      </EmptyStateIcon>
      <EmptyStateTitle>Mentions could not be displayed</EmptyStateTitle>
      <EmptyStateDescription>{description}</EmptyStateDescription>
      <EmptyStateActions>
        <Button variant="outline" onClick={onRetry}>
          <ArrowClockwiseIcon aria-hidden="true" />
          Try again
        </Button>
      </EmptyStateActions>
    </EmptyState>
  )
}

export function UnpaidMentionsPreview({
  billingSetupRequired,
}: {
  billingSetupRequired: boolean
}) {
  const { openSettings } = useProductDialogs()

  return (
    <EmptyState className="min-h-80">
      <EmptyStateIcon>
        <CreditCardIcon />
      </EmptyStateIcon>
      <EmptyStateTitle>Live mentions require an active plan</EmptyStateTitle>
      <EmptyStateDescription>
        {billingSetupRequired
          ? "Billing is not configured, so a subscription cannot be started yet. Astreex is not substituting sample conversations for the unavailable feed."
          : "Monitoring and ingestion are not active for this account. Astreex is not showing fabricated conversations in preview mode."}
      </EmptyStateDescription>
      <EmptyStateActions>
        <Button
          variant="outline"
          onClick={(event) => openSettings("billing", event.currentTarget)}
        >
          <CreditCardIcon aria-hidden="true" />
          Open Settings
        </Button>
      </EmptyStateActions>
    </EmptyState>
  )
}

export function MentionsSetupRequiredState() {
  return (
    <EmptyState className="min-h-72">
      <EmptyStateIcon>
        <KeyIcon />
      </EmptyStateIcon>
      <EmptyStateTitle>Add a keyword to start monitoring</EmptyStateTitle>
      <EmptyStateDescription>
        The feed remains empty until the account has at least one keyword. Saved
        views only filter mentions that have already been collected.
      </EmptyStateDescription>
      <EmptyStateActions>
        <Button asChild>
          <Link href="/app/keywords">
            <KeyIcon aria-hidden="true" />
            Manage keywords
          </Link>
        </Button>
      </EmptyStateActions>
    </EmptyState>
  )
}

export function MentionsPausedState() {
  return (
    <EmptyState className="min-h-72">
      <EmptyStateIcon>
        <PauseCircleIcon />
      </EmptyStateIcon>
      <EmptyStateTitle>Monitoring is paused</EmptyStateTitle>
      <EmptyStateDescription>
        Every keyword in this account is paused. Existing mentions remain
        available, but no new conversations will be collected until a keyword is
        resumed.
      </EmptyStateDescription>
      <EmptyStateActions>
        <Button asChild variant="outline">
          <Link href="/app/keywords">
            <KeyIcon aria-hidden="true" />
            Review keywords
          </Link>
        </Button>
      </EmptyStateActions>
    </EmptyState>
  )
}

export function MentionsUsageLimitState() {
  const { openSettings } = useProductDialogs()

  return (
    <EmptyState className="min-h-72">
      <EmptyStateIcon>
        <CreditCardIcon />
      </EmptyStateIcon>
      <EmptyStateTitle>Mention usage limit reached</EmptyStateTitle>
      <EmptyStateDescription>
        Collection is paused for the current billing period. Existing mentions
        stay available; review plan and usage details to restore collection
        sooner.
      </EmptyStateDescription>
      <EmptyStateActions>
        <Button
          variant="outline"
          onClick={(event) => openSettings("billing", event.currentTarget)}
        >
          <CreditCardIcon aria-hidden="true" />
          Review billing
        </Button>
      </EmptyStateActions>
    </EmptyState>
  )
}

export function MentionsEmptyState({
  filtered,
  onClear,
}: {
  filtered: boolean
  onClear: () => void
}) {
  return (
    <EmptyState className="min-h-72">
      <EmptyStateIcon>
        {filtered ? <FunnelSimpleIcon /> : <AtIcon />}
      </EmptyStateIcon>
      <EmptyStateTitle>
        {filtered ? "No mentions match this view" : "No mentions collected yet"}
      </EmptyStateTitle>
      <EmptyStateDescription>
        {filtered
          ? "Adjust the search, filters, or saved view to broaden the existing feed."
          : "Monitoring is active. Collected mentions count toward usage; AI keeps clearly unrelated results in the reviewable Filtered view."}
      </EmptyStateDescription>
      {filtered && (
        <EmptyStateActions>
          <Button variant="outline" onClick={onClear}>
            Clear search and filters
          </Button>
        </EmptyStateActions>
      )}
    </EmptyState>
  )
}

export function FeedNotice({
  kind,
}: {
  kind: "paused" | "setup_required" | "usage_limited"
}) {
  const details =
    kind === "paused"
      ? {
          Icon: PauseCircleIcon,
          title: "Monitoring is paused.",
          description:
            "Existing mentions remain available; no new items are being collected.",
        }
      : kind === "usage_limited"
        ? {
            Icon: CreditCardIcon,
            title: "The mention limit has been reached.",
            description:
              "This feed remains searchable while new collection is paused.",
          }
        : {
            Icon: KeyIcon,
            title: "Monitoring setup is incomplete.",
            description:
              "Existing mentions remain available, but a keyword is required for collection.",
          }

  return (
    <div
      className="border-border bg-muted/35 mb-4 flex items-start gap-3 rounded-md border px-4 py-3"
      role="status"
    >
      <details.Icon
        aria-hidden="true"
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
      />
      <p className="text-muted-foreground text-xs leading-5">
        <span className="text-foreground font-medium">{details.title}</span>{" "}
        {details.description}
      </p>
    </div>
  )
}
