"use client"

import { api } from "@astreex/backend/api"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CreditCardIcon,
  MagnifyingGlassIcon,
  SortAscendingIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import { Input } from "@astreex/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@astreex/ui/components/select"
import { useMutation, useQuery } from "convex/react"
import {
  Component,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { MentionCard } from "@/components/mentions/mention-card"
import { MentionFilterPopover } from "@/components/mentions/mention-filter-popover"
import {
  FeedNotice,
  MentionsEmptyState,
  MentionsLoadingState,
  MentionsPausedState,
  MentionsSetupRequiredState,
  MentionsUsageLimitState,
  UnpaidMentionsPreview,
} from "@/components/mentions/mention-states"
import { SavedViews } from "@/components/mentions/saved-views"
import { useProductContext } from "@/components/product/product-context"
import {
  EMPTY_MENTION_FILTERS,
  compactMentionFilters,
  copyMentionFilters,
  mentionFilterCount,
  nextSparseMentionCursor,
  optimisticStatusHasSettled,
  visibleMentionStatus,
  type MentionCategory,
  type MentionFilters,
  type MentionItem,
  type MentionKeyword,
  type MentionSort,
  type MentionStatus,
  type SavedView,
} from "@/lib/mentions"
import { useQueryClock } from "@/lib/use-query-clock"

const PAGE_SIZE = 12

function mentionsQueryArguments({
  cursor,
  filters,
  query,
  sort,
}: {
  cursor: string | undefined
  filters: MentionFilters
  query: string
  sort: MentionSort
}) {
  const compactFilters = compactMentionFilters(filters)
  return {
    limit: PAGE_SIZE,
    sort,
    ...(cursor ? { cursor } : {}),
    ...(query ? { query } : {}),
    ...(mentionFilterCount(compactFilters) > 0
      ? { filters: compactFilters }
      : {}),
  }
}

type SavedViewPatch = {
  filters?: MentionFilters
  name?: string
  sort?: MentionSort
}

type SavedViewsRegionProps = {
  categories: MentionCategory[]
  currentFilters: MentionFilters
  currentSort: MentionSort
  keywords: MentionKeyword[]
  onSelectedViewDeleted: (savedViewId: string) => void
  onSelectedViewUpdated: (savedViewId: string, patch: SavedViewPatch) => void
  onSelectAll: () => void
  onSelectView: (view: SavedView) => void
  selectedViewId: string | null
}

function SavedViewsFallback({
  loading = false,
  onSelectAll,
  selectedViewId,
}: {
  loading?: boolean
  onSelectAll: () => void
  selectedViewId: string | null
}) {
  return (
    <section
      aria-labelledby="saved-views-label"
      className="border-border border-b py-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p
          id="saved-views-label"
          className="text-muted-foreground hidden shrink-0 text-xs font-semibold tracking-wide uppercase sm:block"
        >
          Views
        </p>
        <Button
          size="sm"
          variant={selectedViewId === null ? "secondary" : "outline"}
          aria-pressed={selectedViewId === null}
          onClick={onSelectAll}
        >
          All Mentions
        </Button>
        <p
          className="text-muted-foreground min-w-0 text-xs leading-5"
          role="status"
        >
          {loading
            ? "Loading custom saved views…"
            : selectedViewId === null
              ? "Custom saved views are unavailable. All Mentions and feed filters still work."
              : "The selected saved view is unavailable. Choose All Mentions to clear its stored filters."}
        </p>
      </div>
    </section>
  )
}

class SavedViewsDataBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function SavedViewsDataRegion({
  categories,
  currentFilters,
  currentSort,
  keywords,
  onSelectedViewDeleted,
  onSelectedViewUpdated,
  onSelectAll,
  onSelectView,
  selectedViewId,
}: SavedViewsRegionProps) {
  const savedViewsValue = useQuery(api.savedViews.listSavedViews, {})
  const createSavedView = useMutation(api.savedViews.createSavedView)
  const updateSavedView = useMutation(api.savedViews.updateSavedView)
  const reorderSavedViews = useMutation(api.savedViews.reorderSavedViews)
  const deleteSavedView = useMutation(api.savedViews.deleteSavedView)

  if (savedViewsValue === undefined) {
    return (
      <SavedViewsFallback
        loading
        onSelectAll={onSelectAll}
        selectedViewId={selectedViewId}
      />
    )
  }

  return (
    <SavedViews
      categories={categories}
      currentFilters={currentFilters}
      currentSort={currentSort}
      keywords={keywords}
      onCreate={async (input) => {
        await createSavedView({
          ...input,
          filters: compactMentionFilters(input.filters),
        })
      }}
      onDelete={async (savedViewId) => {
        await deleteSavedView({ savedViewId })
        onSelectedViewDeleted(savedViewId)
      }}
      onReorder={async (savedViewIds) => {
        await reorderSavedViews({ savedViewIds })
      }}
      onSelectAll={onSelectAll}
      onSelectView={onSelectView}
      onUpdate={async (savedViewId, patch) => {
        await updateSavedView({
          savedViewId,
          ...(patch.filters
            ? { filters: compactMentionFilters(patch.filters) }
            : {}),
          ...(patch.name ? { name: patch.name } : {}),
          ...(patch.sort ? { sort: patch.sort } : {}),
        })
        onSelectedViewUpdated(savedViewId, patch)
      }}
      selectedViewId={selectedViewId}
      views={savedViewsValue}
    />
  )
}

function SavedViewsRegion(props: SavedViewsRegionProps) {
  return (
    <SavedViewsDataBoundary
      fallback={
        <SavedViewsFallback
          onSelectAll={props.onSelectAll}
          selectedViewId={props.selectedViewId}
        />
      }
    >
      <SavedViewsDataRegion {...props} />
    </SavedViewsDataBoundary>
  )
}

export function MentionsScreen() {
  const now = useQueryClock()
  const { access, billing, workspace } = useProductContext()
  const preview = access.mode === "preview"
  const [filters, setFilters] = useState<MentionFilters>(EMPTY_MENTION_FILTERS)
  const [sort, setSort] = useState<MentionSort>("newest")
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search.trim())
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>(
    [],
  )
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Record<string, { base: MentionStatus; target: MentionStatus }>
  >({})
  const [pendingStatuses, setPendingStatuses] = useState<
    Record<string, boolean>
  >({})
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})

  const resetPagination = () => {
    setCursor(undefined)
    setCursorHistory([])
  }

  const queryArguments = useMemo(
    () =>
      mentionsQueryArguments({
        cursor,
        filters,
        query: deferredSearch,
        sort,
      }),
    [cursor, deferredSearch, filters, sort],
  )

  const categoriesValue = useQuery(
    api.categories.listCategories,
    preview ? "skip" : {},
  )
  const keywordsValue = useQuery(
    api.keywords.listKeywords,
    preview ? "skip" : {},
  )
  const mentionsValue = useQuery(
    api.mentions.listMentions,
    preview ? "skip" : { ...queryArguments, now },
  )

  const updateMentionStatus = useMutation(api.mentions.updateMentionStatus)

  const mentions = useMemo(() => mentionsValue?.items ?? [], [mentionsValue])

  useEffect(() => {
    const serverStatuses = new Map<string, MentionStatus>(
      mentions.map((mention) => [mention.id, mention.status]),
    )
    const settleTimer = window.setTimeout(() => {
      setOptimisticStatuses((current) => {
        const settledIds = Object.entries(current)
          .filter(([mentionId, optimistic]) =>
            optimisticStatusHasSettled(
              serverStatuses.get(mentionId),
              optimistic,
            ),
          )
          .map(([mentionId]) => mentionId)
        if (settledIds.length === 0) {
          return current
        }

        const next = { ...current }
        for (const mentionId of settledIds) {
          delete next[mentionId]
        }
        return next
      })
    }, 0)
    return () => window.clearTimeout(settleTimer)
  }, [mentions])

  const visibleMentions: MentionItem[] = mentions.map((mention) => ({
    ...mention,
    status: visibleMentionStatus(
      mention.status,
      optimisticStatuses[mention.id],
    ),
  }))

  const changeMentionStatus = async (
    mentionId: MentionItem["id"],
    status: MentionStatus,
  ) => {
    const base =
      visibleMentions.find((mention) => mention.id === mentionId)?.status ??
      "new"
    setOptimisticStatuses((current) => ({
      ...current,
      [mentionId]: { base, target: status },
    }))
    setPendingStatuses((current) => ({ ...current, [mentionId]: true }))
    setActionErrors((current) => {
      const next = { ...current }
      delete next[mentionId]
      return next
    })

    try {
      const value = await updateMentionStatus({ mentionId, status })
      if (value.status !== status) {
        throw new Error("Unexpected mention status result")
      }
    } catch {
      setOptimisticStatuses((current) => {
        const next = { ...current }
        delete next[mentionId]
        return next
      })
      setActionErrors((current) => ({
        ...current,
        [mentionId]: "Status change failed and was reverted.",
      }))
    } finally {
      setPendingStatuses((current) => {
        const next = { ...current }
        delete next[mentionId]
        return next
      })
    }
  }

  const selectAll = () => {
    setSelectedViewId(null)
    setFilters(EMPTY_MENTION_FILTERS)
    setSort("newest")
    resetPagination()
  }

  const selectView = (view: SavedView) => {
    setSelectedViewId(view.id)
    setFilters(copyMentionFilters(view.filters))
    setSort(view.sort)
    resetPagination()
  }

  const applyFilters = (nextFilters: MentionFilters) => {
    setSelectedViewId(null)
    setFilters(nextFilters)
    resetPagination()
  }

  const clearSearchAndFilters = () => {
    setSearch("")
    selectAll()
  }

  const usage = billing.usage
  const usageLimited =
    mentionsValue?.monitoringState === "usage_limited" ||
    Boolean(
      usage &&
      usage.mentionLimit > 0 &&
      usage.mentionsUsed >= usage.mentionLimit,
    )

  const loading =
    !preview &&
    (categoriesValue === undefined ||
      keywordsValue === undefined ||
      mentionsValue === undefined)

  const categories = categoriesValue ?? []
  const keywords = keywordsValue ?? []
  const allKeywordsPaused =
    keywords.length > 0 &&
    keywords.every((keyword) => keyword.status === "paused")
  const monitoringState = mentionsValue?.monitoringState ?? "active"
  const setupRequired =
    monitoringState === "setup_required" || keywords.length === 0
  const paused = monitoringState === "paused" || allKeywordsPaused
  const filtered =
    search.trim().length > 0 ||
    mentionFilterCount(filters) > 0 ||
    selectedViewId !== null
  const paginationAvailable =
    cursorHistory.length > 0 ||
    (mentionsValue !== undefined &&
      !mentionsValue.isDone &&
      Boolean(mentionsValue.nextCursor))
  const sparsePageCursor =
    mentionsValue !== undefined
      ? nextSparseMentionCursor({
          filtered,
          itemCount: mentionsValue.items.length,
          nextCursor: mentionsValue.nextCursor,
        })
      : undefined

  useEffect(() => {
    if (!sparsePageCursor || sparsePageCursor === cursor) {
      return
    }
    const advanceTimer = window.setTimeout(() => {
      setCursor(sparsePageCursor)
    }, 0)
    return () => window.clearTimeout(advanceTimer)
  }, [cursor, sparsePageCursor])

  return (
    <div>
      <div className="border-border flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            {workspace.workspace.name}
          </p>
          <h1 className="text-foreground mt-1 text-2xl font-semibold tracking-tight">
            Mentions
          </h1>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Review customer conversations collected for your keywords.
          </p>
        </div>
        {preview ? (
          <Badge variant="outline" className="gap-1.5">
            <CreditCardIcon aria-hidden="true" />
            Subscription required
          </Badge>
        ) : usageLimited ? (
          <Badge variant="outline" className="gap-1.5">
            <WarningCircleIcon aria-hidden="true" />
            Usage limit reached
          </Badge>
        ) : null}
      </div>

      {preview ? (
        <div className="mt-6">
          <UnpaidMentionsPreview
            billingSetupRequired={access.billingSetupRequired}
          />
        </div>
      ) : loading ? (
        <div className="mt-6">
          <MentionsLoadingState />
        </div>
      ) : (
        <>
          <SavedViewsRegion
            categories={categories}
            currentFilters={filters}
            currentSort={sort}
            keywords={keywords}
            onSelectedViewDeleted={(savedViewId) => {
              if (selectedViewId === savedViewId) {
                selectAll()
              }
            }}
            onSelectedViewUpdated={(savedViewId, patch) => {
              if (selectedViewId !== savedViewId) {
                return
              }
              if (patch.filters) {
                setFilters(copyMentionFilters(patch.filters))
              }
              if (patch.sort) {
                setSort(patch.sort)
              }
              resetPagination()
            }}
            onSelectAll={selectAll}
            onSelectView={selectView}
            selectedViewId={selectedViewId}
          />

          <div className="border-border flex flex-col gap-3 border-b py-4 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlassIcon
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  resetPagination()
                }}
                placeholder="Search collected mentions"
                aria-label="Search collected mentions"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MentionFilterPopover
                categories={categories}
                filters={filters}
                keywords={keywords}
                onApply={applyFilters}
              />
              <Select
                value={sort}
                onValueChange={(value) => {
                  setSelectedViewId(null)
                  setSort(value as MentionSort)
                  resetPagination()
                }}
              >
                <SelectTrigger aria-label="Sort mentions" className="min-w-44">
                  <SortAscendingIcon aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="most_engaged">Most engaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-5">
            {visibleMentions.length > 0 &&
              (setupRequired || paused || usageLimited) && (
                <FeedNotice
                  kind={
                    setupRequired
                      ? "setup_required"
                      : paused
                        ? "paused"
                        : "usage_limited"
                  }
                />
              )}

            {visibleMentions.length === 0 ? (
              setupRequired ? (
                <MentionsSetupRequiredState />
              ) : paused ? (
                <MentionsPausedState />
              ) : usageLimited ? (
                <MentionsUsageLimitState />
              ) : (
                <MentionsEmptyState
                  filtered={filtered}
                  onClear={clearSearchAndFilters}
                />
              )
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-muted-foreground text-xs">
                    {mentionsValue?.totalCount !== undefined
                      ? `${mentionsValue.totalCount} mentions`
                      : `${visibleMentions.length} mentions on this page`}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Search is limited to the collected feed.
                  </p>
                </div>

                <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
                  {visibleMentions.map((mention) => (
                    <MentionCard
                      key={mention.id}
                      mention={mention}
                      pending={pendingStatuses[mention.id] ?? false}
                      {...(actionErrors[mention.id]
                        ? { actionError: actionErrors[mention.id] }
                        : {})}
                      onStatusChange={(mentionId, status) =>
                        void changeMentionStatus(mentionId, status)
                      }
                    />
                  ))}
                </div>
              </>
            )}
            {paginationAvailable && (
              <nav
                aria-label="Mentions pagination"
                className="mt-5 flex items-center justify-between gap-4"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cursorHistory.length === 0}
                  onClick={() => {
                    const previous = cursorHistory.at(-1)
                    setCursor(previous)
                    setCursorHistory((current) => current.slice(0, -1))
                  }}
                >
                  <ArrowLeftIcon aria-hidden="true" />
                  Previous
                </Button>
                <span className="text-muted-foreground text-xs">
                  Page {cursorHistory.length + 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    mentionsValue === undefined ||
                    mentionsValue.isDone ||
                    !mentionsValue.nextCursor
                  }
                  onClick={() => {
                    if (
                      mentionsValue === undefined ||
                      !mentionsValue.nextCursor
                    ) {
                      return
                    }
                    setCursorHistory((current) => [...current, cursor])
                    setCursor(mentionsValue.nextCursor ?? undefined)
                  }}
                >
                  Next
                  <ArrowRightIcon aria-hidden="true" />
                </Button>
              </nav>
            )}
          </div>
        </>
      )}
    </div>
  )
}
