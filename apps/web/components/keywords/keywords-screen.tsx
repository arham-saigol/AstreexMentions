"use client"

import { api } from "@astreex/backend/api"
import {
  CreditCardIcon,
  PlusIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import { Progress } from "@astreex/ui/components/progress"
import { useMutation, useQuery } from "convex/react"
import { useState } from "react"

import {
  KeywordConfirmationDialog,
  KeywordFormDialog,
  type KeywordConfirmationAction,
} from "@/components/keywords/keyword-dialogs"
import { KeywordRow } from "@/components/keywords/keyword-row"
import {
  KeywordsEmptyState,
  KeywordsLoadingState,
  UnpaidKeywordNotice,
  UsagePausedNotice,
} from "@/components/keywords/keyword-states"
import { useProductContext } from "@/components/product/product-context"
import { type KeywordItem, type Platform } from "@/lib/keywords"
import { useQueryClock } from "@/lib/use-query-clock"

function KeywordUsage({
  count,
  limit,
  atLimit,
}: {
  count: number
  limit: number | null
  atLimit: boolean
}) {
  const percentage =
    limit === null || limit <= 0 ? 0 : Math.min(100, (count / limit) * 100)
  const remaining = limit === null ? null : Math.max(0, limit - count)

  return (
    <section
      aria-labelledby="keyword-usage-title"
      className="border-border mt-5 grid gap-4 border-y py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-4">
          <h2
            id="keyword-usage-title"
            className="text-foreground text-sm font-semibold"
          >
            Keyword usage
          </h2>
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {limit === null ? `${count} configured` : `${count} / ${limit}`}
          </span>
        </div>
        {limit === null ? (
          <p className="text-muted-foreground mt-2 text-xs leading-5">
            The connected data service did not return a keyword limit. Convex
            will still enforce the authoritative limit when a keyword is added.
          </p>
        ) : (
          <>
            <Progress
              value={percentage}
              className="mt-3 h-1.5"
              aria-label={`${count} of ${limit} keyword slots used`}
            />
            <p className="text-muted-foreground mt-2 text-xs leading-5">
              {atLimit
                ? "No keyword slots remain. Editing platforms does not consume another slot."
                : `${remaining} keyword slot${remaining === 1 ? "" : "s"} remaining. One keyword counts once across all selected platforms.`}
            </p>
          </>
        )}
      </div>
      <div className="text-muted-foreground text-xs sm:max-w-52 sm:text-right">
        Platform selections do not multiply keyword usage.
      </div>
    </section>
  )
}

export function KeywordsScreen() {
  const now = useQueryClock()
  const { access, billing, workspace } = useProductContext()
  const monitoringActive = access.mode === "active"
  const [formOpen, setFormOpen] = useState(false)
  const [editingKeyword, setEditingKeyword] = useState<KeywordItem | null>(null)
  const [confirmation, setConfirmation] = useState<{
    action: KeywordConfirmationAction
    keyword: KeywordItem
  } | null>(null)

  const listValue = useQuery(api.keywords.listKeywords, {})
  const summaryValue = useQuery(api.keywords.getKeywordSummary, { now })

  const createKeyword = useMutation(api.keywords.createKeyword)
  const updateKeyword = useMutation(api.keywords.updateKeyword)
  const pauseKeyword = useMutation(api.keywords.pauseKeyword)
  const resumeKeyword = useMutation(api.keywords.resumeKeyword)
  const deleteKeyword = useMutation(api.keywords.deleteKeyword)

  const loading = listValue === undefined || summaryValue === undefined
  const keywords = listValue ?? []
  const summary = summaryValue ?? null
  const limit = summary?.limit ?? billing.usage?.keywordLimit ?? null
  const atLimit =
    summary?.canCreate === false ||
    summary?.limitReached === true ||
    (limit !== null && keywords.length >= limit)
  const usagePaused =
    summary?.monitoringState === "usage_limited" ||
    Boolean(
      billing.usage &&
      billing.usage.mentionLimit > 0 &&
      billing.usage.mentionsUsed >= billing.usage.mentionLimit,
    ) ||
    keywords.some((keyword) =>
      keyword.sources.some((source) => source.pauseReason === "usage"),
    )

  const openAdd = () => {
    setEditingKeyword(null)
    setFormOpen(true)
  }

  const openEdit = (keyword: KeywordItem) => {
    setEditingKeyword(keyword)
    setFormOpen(true)
  }

  const confirmAction = async () => {
    if (!confirmation) {
      return
    }
    const args = { keywordId: confirmation.keyword.id }
    if (confirmation.action === "pause") {
      await pauseKeyword(args)
    } else if (confirmation.action === "resume") {
      await resumeKeyword(args)
    } else {
      await deleteKeyword(args)
    }
  }

  return (
    <div>
      <div className="border-border flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {workspace.workspace.name}
          </p>
          <h1 className="text-foreground mt-1 text-2xl font-semibold tracking-tight">
            Keywords
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-6">
            Define precise phrases and inspect the provider schedule for every
            configured source.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!monitoringActive && (
            <Badge variant="outline" className="gap-1.5">
              <CreditCardIcon aria-hidden="true" />
              Draft configuration
            </Badge>
          )}
          {usagePaused && monitoringActive && (
            <Badge variant="outline" className="gap-1.5">
              <WarningCircleIcon aria-hidden="true" />
              Usage paused
            </Badge>
          )}
          <Button onClick={openAdd} disabled={loading || atLimit}>
            <PlusIcon aria-hidden="true" />
            Add keyword
          </Button>
        </div>
      </div>

      {!loading && (
        <KeywordUsage count={keywords.length} limit={limit} atLimit={atLimit} />
      )}

      <div className="mt-6 space-y-5">
        {!monitoringActive && (
          <UnpaidKeywordNotice
            billingSetupRequired={access.billingSetupRequired}
          />
        )}
        {usagePaused && monitoringActive && <UsagePausedNotice />}

        {loading ? (
          <KeywordsLoadingState />
        ) : keywords.length === 0 ? (
          <KeywordsEmptyState
            atLimit={atLimit}
            monitoringActive={monitoringActive}
            onAdd={openAdd}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-foreground text-sm font-medium">
                {keywords.length} configured keyword
                {keywords.length === 1 ? "" : "s"}
              </p>
              <p className="text-muted-foreground text-xs">
                Source times and errors come from the authenticated Convex
                result.
              </p>
            </div>
            <div className="space-y-3">
              {keywords.map((keyword) => (
                <KeywordRow
                  key={keyword.id}
                  keyword={keyword}
                  monitoringActive={monitoringActive}
                  onEdit={() => openEdit(keyword)}
                  onPause={() => setConfirmation({ action: "pause", keyword })}
                  onResume={() =>
                    setConfirmation({ action: "resume", keyword })
                  }
                  onDelete={() =>
                    setConfirmation({ action: "delete", keyword })
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {formOpen && (
        <KeywordFormDialog
          atLimit={atLimit}
          keyword={editingKeyword}
          monitoringActive={monitoringActive}
          open
          onOpenChange={setFormOpen}
          onSubmit={async (value: {
            phrase: string
            platforms: Platform[]
          }) => {
            if (editingKeyword) {
              await updateKeyword({
                keywordId: editingKeyword.id,
                phrase: value.phrase,
                platforms: value.platforms,
              })
            } else {
              await createKeyword(value)
            }
          }}
        />
      )}

      {confirmation && (
        <KeywordConfirmationDialog
          action={confirmation.action}
          keyword={confirmation.keyword}
          open
          onOpenChange={(open) => {
            if (!open) setConfirmation(null)
          }}
          onConfirm={confirmAction}
        />
      )}
    </div>
  )
}
