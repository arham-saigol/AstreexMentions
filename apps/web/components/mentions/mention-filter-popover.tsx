"use client"

import { FunnelSimpleIcon, XIcon } from "@phosphor-icons/react"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import { Checkbox } from "@astreex/ui/components/checkbox"
import { Input } from "@astreex/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@astreex/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@astreex/ui/components/select"
import { Separator } from "@astreex/ui/components/separator"
import { useState, type ReactNode } from "react"

import {
  EMPTY_MENTION_FILTERS,
  compactMentionFilters,
  copyMentionFilters,
  mentionFilterCount,
  setMentionFilterValues,
  toggleFilterValue,
  type MentionCategory,
  type MentionFilters,
  type MentionKeyword,
  type MentionStatus,
  type Platform,
} from "@/lib/mentions"

type DateMode = "any" | "24h" | "7d" | "30d" | "90d" | "custom"

const platformOptions: Array<{ label: string; value: Platform }> = [
  { label: "X", value: "x" },
  { label: "Reddit", value: "reddit" },
  { label: "Hacker News", value: "hacker_news" },
]

const statusOptions: Array<{ label: string; value: MentionStatus }> = [
  { label: "New", value: "new" },
  { label: "Saved", value: "saved" },
  { label: "Dismissed", value: "dismissed" },
]

function dateInputValue(value: number | undefined): string {
  if (value === undefined) {
    return ""
  }

  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function startOfDate(value: string): number | undefined {
  if (!value) {
    return undefined
  }

  const timestamp = new Date(`${value}T00:00:00`).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function endOfDate(value: string): number | undefined {
  if (!value) {
    return undefined
  }

  const timestamp = new Date(`${value}T23:59:59.999`).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function filtersForDateMode(
  filters: MentionFilters,
  mode: DateMode,
  startDate: string,
  endDate: string,
): MentionFilters {
  const withoutDate = { ...filters }
  delete withoutDate.publishedAfter
  delete withoutDate.publishedBefore

  if (mode === "any") {
    return withoutDate
  }

  if (mode === "custom") {
    const publishedAfter = startOfDate(startDate)
    const publishedBefore = endOfDate(endDate)
    return {
      ...withoutDate,
      ...(publishedAfter !== undefined ? { publishedAfter } : {}),
      ...(publishedBefore !== undefined ? { publishedBefore } : {}),
    }
  }

  const days = mode === "24h" ? 1 : Number.parseInt(mode, 10)
  return {
    ...withoutDate,
    publishedAfter: Date.now() - days * 24 * 60 * 60 * 1000,
  }
}

function FilterGroup({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <fieldset>
      <legend className="text-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
        {label}
      </legend>
      <div className="space-y-2.5">{children}</div>
    </fieldset>
  )
}

function FilterCheckbox({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean
  label: string
  onCheckedChange: () => void
}) {
  return (
    <label className="text-foreground flex min-h-7 cursor-pointer items-center gap-2.5 text-sm">
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  )
}

export function MentionFilterPopover({
  categories,
  filters,
  keywords,
  onApply,
}: {
  categories: MentionCategory[]
  filters: MentionFilters
  keywords: MentionKeyword[]
  onApply: (filters: MentionFilters) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<MentionFilters>(() =>
    copyMentionFilters(filters),
  )
  const [dateMode, setDateMode] = useState<DateMode>(() =>
    filters.publishedAfter !== undefined ||
    filters.publishedBefore !== undefined
      ? "custom"
      : "any",
  )
  const [startDate, setStartDate] = useState(() =>
    dateInputValue(filters.publishedAfter),
  )
  const [endDate, setEndDate] = useState(() =>
    dateInputValue(filters.publishedBefore),
  )
  const appliedCount = mentionFilterCount(filters)

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setDraft(copyMentionFilters(filters))
      setDateMode(
        filters.publishedAfter !== undefined ||
          filters.publishedBefore !== undefined
          ? "custom"
          : "any",
      )
      setStartDate(dateInputValue(filters.publishedAfter))
      setEndDate(dateInputValue(filters.publishedBefore))
    }
  }

  const clear = () => {
    setDraft(EMPTY_MENTION_FILTERS)
    setDateMode("any")
    setStartDate("")
    setEndDate("")
  }

  const apply = () => {
    onApply(
      compactMentionFilters(
        filtersForDateMode(draft, dateMode, startDate, endDate),
      ),
    )
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label="Filter mentions">
          <FunnelSimpleIcon aria-hidden="true" />
          Filters
          {appliedCount > 0 && (
            <Badge variant="secondary" className="min-w-5 px-1.5">
              {appliedCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(42rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-0"
      >
        <div className="border-border bg-popover sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-foreground text-sm font-semibold">
              Filter mentions
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Refine the collected feed only.
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={() => setOpen(false)}>
            <XIcon aria-hidden="true" />
            <span className="sr-only">Close filters</span>
          </Button>
        </div>

        <div className="space-y-5 p-4">
          <FilterGroup label="Platform">
            {platformOptions.map((option) => (
              <FilterCheckbox
                key={option.value}
                label={option.label}
                checked={draft.platforms?.includes(option.value) ?? false}
                onCheckedChange={() =>
                  setDraft((current) =>
                    setMentionFilterValues(
                      current,
                      "platforms",
                      toggleFilterValue(current.platforms, option.value),
                    ),
                  )
                }
              />
            ))}
          </FilterGroup>

          <Separator />

          <FilterGroup label="Category">
            {categories.length > 0 ? (
              <div className="max-h-36 space-y-2.5 overflow-y-auto pr-1">
                {categories.map((category) => (
                  <FilterCheckbox
                    key={category.id}
                    label={category.name}
                    checked={draft.categoryIds?.includes(category.id) ?? false}
                    onCheckedChange={() =>
                      setDraft((current) =>
                        setMentionFilterValues(
                          current,
                          "categoryIds",
                          toggleFilterValue(current.categoryIds, category.id),
                        ),
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                No categories are available yet.
              </p>
            )}
          </FilterGroup>

          <Separator />

          <FilterGroup label="Keyword">
            {keywords.length > 0 ? (
              <div className="max-h-36 space-y-2.5 overflow-y-auto pr-1">
                {keywords.map((keyword) => (
                  <FilterCheckbox
                    key={keyword.id}
                    label={keyword.phrase}
                    checked={draft.keywordIds?.includes(keyword.id) ?? false}
                    onCheckedChange={() =>
                      setDraft((current) =>
                        setMentionFilterValues(
                          current,
                          "keywordIds",
                          toggleFilterValue(current.keywordIds, keyword.id),
                        ),
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                Add a keyword before filtering by keyword.
              </p>
            )}
          </FilterGroup>

          <Separator />

          <FilterGroup label="Status">
            {statusOptions.map((option) => (
              <FilterCheckbox
                key={option.value}
                label={option.label}
                checked={draft.mentionStatuses?.includes(option.value) ?? false}
                onCheckedChange={() =>
                  setDraft((current) =>
                    setMentionFilterValues(
                      current,
                      "mentionStatuses",
                      toggleFilterValue(current.mentionStatuses, option.value),
                    ),
                  )
                }
              />
            ))}
          </FilterGroup>

          <Separator />

          <FilterGroup label="Date published">
            <Select
              value={dateMode}
              onValueChange={(value) => setDateMode(value as DateMode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any time</SelectItem>
                <SelectItem value="24h">Past 24 hours</SelectItem>
                <SelectItem value="7d">Past 7 days</SelectItem>
                <SelectItem value="30d">Past 30 days</SelectItem>
                <SelectItem value="90d">Past 90 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            {dateMode === "custom" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="text-muted-foreground text-xs">
                  From
                  <Input
                    type="date"
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="mt-1"
                  />
                </label>
                <label className="text-muted-foreground text-xs">
                  To
                  <Input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="mt-1"
                  />
                </label>
              </div>
            )}
          </FilterGroup>
        </div>

        <div className="border-border bg-popover sticky bottom-0 flex items-center justify-between gap-3 border-t px-4 py-3">
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear all
          </Button>
          <Button size="sm" onClick={apply}>
            Apply filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
