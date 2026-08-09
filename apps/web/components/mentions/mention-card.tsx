"use client"

import {
  ArrowFatUpIcon,
  ArrowSquareOutIcon,
  BookmarkSimpleIcon,
  ChatCircleIcon,
  HeartIcon,
  NewspaperClippingIcon,
  RedditLogoIcon,
  RepeatIcon,
  XCircleIcon,
  XLogoIcon,
} from "@phosphor-icons/react"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import { cn } from "@astreex/ui/lib/utils"

import type { MentionItem, MentionStatus } from "@/lib/mentions"

const numberFormatter = new Intl.NumberFormat("en", { notation: "compact" })
const timestampFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
})

function platformDetails(platform: MentionItem["platform"]) {
  if (platform === "x") {
    return {
      label: "X",
      Icon: XLogoIcon,
      glyph: "bg-foreground text-white",
    }
  }
  if (platform === "reddit") {
    return {
      label: "Reddit",
      Icon: RedditLogoIcon,
      glyph: "bg-other text-other-foreground",
    }
  }
  return {
    label: "Hacker News",
    Icon: NewspaperClippingIcon,
    glyph: "bg-bug text-bug-foreground",
  }
}

function categoryVariant(category: MentionItem["category"]) {
  const key =
    `${category?.systemKey ?? ""} ${category?.name ?? ""}`.toLowerCase()
  if (key.includes("question")) return "question" as const
  if (key.includes("complaint")) return "complaint" as const
  if (key.includes("praise")) return "praise" as const
  if (key.includes("bug")) return "bug" as const
  if (key.includes("feature")) return "feature" as const
  if (key.includes("competitor")) return "competitor" as const

  switch (category?.colorToken) {
    case "blue":
    case "cyan":
      return "question" as const
    case "red":
    case "pink":
      return "complaint" as const
    case "green":
      return "praise" as const
    case "orange":
      return "bug" as const
    case "yellow":
      return "feature" as const
    case "purple":
      return "competitor" as const
    default:
      return "other" as const
  }
}

function PriorityBadge({ priority }: { priority: MentionItem["priority"] }) {
  if (!priority) return null
  const explanation =
    priority === "high"
      ? "Requires immediate intervention"
      : priority === "medium"
        ? "Should be reviewed soon"
        : "No immediate action"
  return (
    <Badge
      variant={priority === "high" ? "outline" : "muted"}
      title={explanation}
    >
      {priority === "high" ? "High" : priority === "medium" ? "Medium" : "Low"}{" "}
      priority
    </Badge>
  )
}

function StatusBadge({ status }: { status: MentionStatus }) {
  if (status === "new") return null
  return (
    <Badge variant="muted">{status === "saved" ? "Saved" : "Dismissed"}</Badge>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof HeartIcon
  label: string
  value: number | undefined
}) {
  if (value === undefined) return null
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-xs">
      <Icon aria-hidden="true" className="size-3.5 opacity-70" />
      <span>{numberFormatter.format(value)}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

function MentionMetrics({ mention }: { mention: MentionItem }) {
  if (mention.platform === "x") {
    return (
      <>
        <Metric icon={HeartIcon} label="likes" value={mention.likeCount} />
        <Metric icon={RepeatIcon} label="reposts" value={mention.repostCount} />
      </>
    )
  }
  return (
    <>
      <Metric
        icon={ArrowFatUpIcon}
        label={mention.platform === "reddit" ? "upvotes" : "points"}
        value={mention.pointCount}
      />
      <Metric
        icon={ChatCircleIcon}
        label="comments"
        value={mention.commentCount}
      />
    </>
  )
}

export function MentionCard({
  actionError,
  mention,
  onRestore,
  onStatusChange,
  pending,
}: {
  actionError?: string
  mention: MentionItem
  onRestore?: (mentionId: MentionItem["id"]) => void
  onStatusChange: (mentionId: MentionItem["id"], status: MentionStatus) => void
  pending: boolean
}) {
  const {
    Icon: PlatformIcon,
    label: platformLabel,
    glyph,
  } = platformDetails(mention.platform)
  const author =
    mention.authorDisplayName ?? mention.authorHandle ?? "Author unavailable"
  const handle = mention.authorHandle
    ? mention.authorHandle.startsWith("@")
      ? mention.authorHandle
      : `@${mention.authorHandle}`
    : null
  const publishedAt = new Date(mention.publishedAt)
  const timestamp = timestampFormatter.format(publishedAt)
  const saveTarget = mention.status === "saved" ? "new" : "saved"
  const dismissTarget = mention.status === "dismissed" ? "new" : "dismissed"

  return (
    <article className="surface-hover bg-card rounded-lg border px-5 py-5 sm:px-[22px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <span
            className={cn(
              "grid size-[18px] place-items-center rounded-sm",
              glyph,
            )}
          >
            <PlatformIcon aria-hidden="true" className="size-3" weight="bold" />
          </span>
          {platformLabel}
        </span>
        <span className="text-sm font-medium">{author}</span>
        {handle && mention.authorDisplayName && (
          <span className="text-muted-foreground font-mono text-xs">
            {handle}
          </span>
        )}
        {mention.category && (
          <Badge variant={categoryVariant(mention.category)}>
            {mention.category.name}
          </Badge>
        )}
        <PriorityBadge priority={mention.priority} />
        {mention.analysisState === "failed" && (
          <Badge variant="outline">Unclassified</Badge>
        )}
        <StatusBadge status={mention.status} />
        <time
          dateTime={publishedAt.toISOString()}
          title={timestamp}
          className="ml-auto font-mono text-[11px] text-[var(--ink-faint)]"
        >
          {timestamp}
        </time>
      </div>

      {mention.title && (
        <h2 className="font-display mt-3 max-w-4xl text-lg leading-6 font-medium tracking-[-0.01em]">
          {mention.title}
        </h2>
      )}
      <p
        className={cn(
          "[display:-webkit-box] max-w-4xl overflow-hidden text-[14.5px] leading-[1.62] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]",
          mention.title ? "mt-1" : "mt-3",
        )}
      >
        {mention.body}
      </p>

      {mention.feedState === "filtered" && mention.relevanceReason && (
        <div className="bg-muted/40 mt-3 rounded-md px-3 py-2 text-sm">
          <span className="font-medium">Why this was filtered: </span>
          <span className="text-muted-foreground">
            {mention.relevanceReason}
          </span>
        </div>
      )}
      {mention.analysisState === "failed" && (
        <p className="text-muted-foreground mt-3 text-xs">
          Analysis did not complete, so this mention remains visible for review.
        </p>
      )}

      {mention.matchedKeywords.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {mention.matchedKeywords.slice(0, 4).map((keyword, index) => (
            <Badge
              key={
                ("id" in keyword ? keyword.id : undefined) ??
                `${keyword.phrase}-${index}`
              }
              variant="outline"
              className="max-w-48 normal-case"
            >
              <span className="truncate">{keyword.phrase}</span>
            </Badge>
          ))}
          {mention.matchedKeywords.length > 4 && (
            <Badge variant="muted">+{mention.matchedKeywords.length - 4}</Badge>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center">
        <div className="flex min-h-8 flex-wrap items-center gap-4">
          <MentionMetrics mention={mention} />
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
          {mention.feedState === "filtered" && onRestore ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => onRestore(mention.id)}
            >
              Mark as relevant
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant={mention.status === "saved" ? "secondary" : "ghost"}
                aria-pressed={mention.status === "saved"}
                disabled={pending}
                onClick={() => onStatusChange(mention.id, saveTarget)}
              >
                <BookmarkSimpleIcon
                  aria-hidden="true"
                  weight={mention.status === "saved" ? "fill" : "regular"}
                />
                {mention.status === "saved" ? "Unsave" : "Save"}
              </Button>
              <Button
                size="sm"
                variant={mention.status === "dismissed" ? "secondary" : "ghost"}
                aria-pressed={mention.status === "dismissed"}
                disabled={pending}
                onClick={() => onStatusChange(mention.id, dismissTarget)}
              >
                <XCircleIcon
                  aria-hidden="true"
                  weight={mention.status === "dismissed" ? "fill" : "regular"}
                />
                {mention.status === "dismissed" ? "Undo dismiss" : "Dismiss"}
              </Button>
            </>
          )}
          <Button asChild size="sm" variant="outline">
            <a
              href={mention.canonicalUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open mention on ${platformLabel}`}
            >
              Open <ArrowSquareOutIcon aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>

      {actionError && (
        <p className="text-destructive mt-2 text-xs" role="alert">
          {actionError}
        </p>
      )}
    </article>
  )
}
