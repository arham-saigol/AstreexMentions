"use client"

import {
  ArrowClockwiseIcon,
  CreditCardIcon,
  KeyIcon,
  PlusIcon,
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
import { StatusState } from "@astreex/ui/components/status-state"

export function KeywordsLoadingState() {
  return (
    <div aria-label="Loading keywords" aria-busy="true" className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="border-border bg-card overflow-hidden rounded-lg border"
        >
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-5 w-48 max-w-full" />
                <div className="mt-3 flex gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </div>
              <Skeleton className="h-8 w-36" />
            </div>
          </div>
          <div className="border-border border-t px-4 py-4 sm:px-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function KeywordsErrorState({
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
      <EmptyStateTitle>Keywords could not be displayed</EmptyStateTitle>
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

export function KeywordsEmptyState({
  atLimit,
  monitoringActive,
  onAdd,
}: {
  atLimit: boolean
  monitoringActive: boolean
  onAdd: () => void
}) {
  return (
    <EmptyState className="min-h-72">
      <EmptyStateIcon>
        <KeyIcon />
      </EmptyStateIcon>
      <EmptyStateTitle>
        {monitoringActive ? "No keywords configured" : "No keyword drafts yet"}
      </EmptyStateTitle>
      <EmptyStateDescription>
        {monitoringActive
          ? "Add a precise brand, product, competitor, or problem phrase. At least one platform is required before the keyword can be saved."
          : "Prepare the phrases and platforms Astreex should monitor. Saving a draft does not start collection without an active subscription."}
      </EmptyStateDescription>
      <EmptyStateActions>
        <Button onClick={onAdd} disabled={atLimit}>
          <PlusIcon aria-hidden="true" />
          Add keyword
        </Button>
      </EmptyStateActions>
    </EmptyState>
  )
}

export function UnpaidKeywordNotice({
  billingSetupRequired,
}: {
  billingSetupRequired: boolean
}) {
  return (
    <StatusState
      variant="warning"
      title="Draft configuration — monitoring is inactive"
      description={
        billingSetupRequired
          ? "You can prepare keywords and sources, but billing is not configured and monitoring cannot start."
          : "You can prepare keywords and sources before payment. Monitoring starts after your subscription is active."
      }
      icon={<CreditCardIcon />}
    />
  )
}

export function UsagePausedNotice() {
  return (
    <StatusState
      variant="warning"
      title="Collection is paused by the usage limit"
      description="Configured keywords still use one slot each, and existing mentions remain available. Per-source schedules below show which checks are paused until usage becomes available again."
      icon={<WarningCircleIcon />}
    />
  )
}
