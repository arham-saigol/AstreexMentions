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
    return { label: "X", Icon: XLogoIcon }
  }

  if (platform === "reddit") {
    return { label: "Reddit", Icon: RedditLogoIcon }
  }

  return { label: "Hacker News", Icon: NewspaperClippingIcon }
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
  return "other" as const
}

function StatusBadge({ status }: { status: MentionStatus }) {
  if (status === "new") return null
  const label = status === "saved" ? "Saved" : "Dismissed"
  return <Badge variant="muted">{label}</Badge>
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
  if (value === undefined) {
    return null
  }

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <Icon aria-hidden="true" className="size-3.5" />
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

  if (mention.platform === "reddit") {
    return (
      <>
        <Metric
          icon={ArrowFatUpIcon}
          label="upvotes"
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

  return (
    <>
      <Metric icon={ArrowFatUpIcon} label="points" value={mention.pointCount} />
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
  onStatusChange,
  pending,
}: {
  actionError?: string
  mention: MentionItem
  onStatusChange: (mentionId: MentionItem["id"], status: MentionStatus) => void
  pending: boolean
}) {
  const { Icon: PlatformIcon, label: platformLabel } = platformDetails(
    mention.platform,
  )
  const author =
    mention.authorDisplayName ?? mention.authorHandle ?? "Author unavailable"
  const handle = mention.authorHandle
    ? mention.authorHandle.startsWith("@")
      ? mention.authorHandle
      : `@${mention.authorHandle}`
    : null
  const timestamp = timestampFormatter.format(new Date(mention.publishedAt))
  const saveTarget = mention.status === "saved" ? "new" : "saved"
  const dismissTarget = mention.status === "dismissed" ? "new" : "dismissed"

  return (
    <article className="group bg-card hover:bg-secondary px-4 py-5 transition-colors duration-[var(--motion-control)] sm:px-6 sm:py-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <PlatformIcon
          aria-hidden="true"
          className="text-muted-foreground mt-0.5 size-4.5 shrink-0"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-foreground min-w-0 truncate text-sm font-semibold">
              {author}
            </p>
            {handle && mention.authorDisplayName && (
              <span className="text-muted-foreground truncate text-xs">
                {handle}
              </span>
            )}
            <span aria-hidden="true" className="text-muted-foreground text-xs">
              ·
            </span>
            <span className="text-muted-foreground text-xs">
              {platformLabel}
            </span>
            <span aria-hidden="true" className="text-muted-foreground text-xs">
              ·
            </span>
            <time
              dateTime={new Date(mention.publishedAt).toISOString()}
              title={timestamp}
              className="text-muted-foreground text-xs"
            >
              {timestamp}
            </time>
          </div>

          {mention.title && (
            <h2 className="text-foreground mt-3 max-w-4xl text-[15px] leading-6 font-semibold">
              {mention.title}
            </h2>
          )}
          <p
            className={cn(
              "text-foreground max-w-4xl text-sm leading-6",
              mention.title ? "mt-1" : "mt-3",
            )}
          >
            {mention.body}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {mention.category && (
              <Badge variant={categoryVariant(mention.category)}>
                {mention.category.name}
              </Badge>
            )}
            {mention.matchedKeywords.slice(0, 4).map((keyword, index) => (
              <Badge
                key={
                  ("id" in keyword ? keyword.id : undefined) ??
                  `${keyword.phrase}-${index}`
                }
                variant="outline"
                className="max-w-48"
              >
                <span className="truncate">{keyword.phrase}</span>
              </Badge>
            ))}
            {mention.matchedKeywords.length > 4 && (
              <Badge variant="muted">
                +{mention.matchedKeywords.length - 4}
              </Badge>
            )}
            <StatusBadge status={mention.status} />
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-h-8 flex-wrap items-center gap-4">
              <MentionMetrics mention={mention} />
            </div>

            <div className="flex flex-wrap items-center gap-1 transition-opacity duration-[var(--motion-control)] md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
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
              <Button asChild size="sm">
                <a
                  href={mention.canonicalUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open mention on ${platformLabel}`}
                >
                  Open
                  <ArrowSquareOutIcon aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>

          {actionError && (
            <p className="text-destructive mt-2 text-xs" role="alert">
              {actionError}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
