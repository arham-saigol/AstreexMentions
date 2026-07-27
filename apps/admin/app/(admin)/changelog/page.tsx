import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import type { Metadata } from "next"
import Link from "next/link"

import { AccessState } from "@/components/access-state"
import {
  ChangelogEntryActions,
  ChangelogPreview,
  CreateChangelogForm,
  EditChangelogDraft,
} from "@/components/changelog-controls"
import { runAdminQuery } from "@/lib/admin-convex"
import {
  changelogStatuses,
  parseChangelogEntries,
  type ChangelogEntry,
} from "@/lib/admin-data"
import { timestampToPublicationDate } from "@/lib/changelog"
import { adminConvex, type ChangelogStatus } from "@/lib/convex-references"

export const metadata: Metadata = {
  title: "Changelog",
}

const statusLabels: Record<ChangelogStatus, string> = {
  draft: "Drafts",
  published: "Published",
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

const publicationDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
})

function singleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseStatus(
  value: string | string[] | undefined,
): ChangelogStatus | undefined {
  const candidate = singleValue(value)
  return changelogStatuses.find((status) => status === candidate)
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : dateFormatter.format(date)
}

function formatPublicationDate(timestamp?: number): string {
  if (timestamp === undefined) {
    return "Not set"
  }

  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : publicationDateFormatter.format(date)
}

function EntryCard({ entry }: { entry: ChangelogEntry }) {
  const isPublished = entry.status === "published"

  return (
    <article className="admin-panel overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isPublished ? "default" : "outline"}>
                {isPublished ? "Published" : "Draft"}
              </Badge>
              {entry.label ? (
                <Badge variant="muted">{entry.label}</Badge>
              ) : null}
            </div>
            <h3 className="mt-3 text-lg font-semibold break-words">
              {entry.title}
            </h3>
            <p className="text-muted-foreground mt-1 font-mono text-xs break-all">
              /changelog/{entry.slug}
            </p>
          </div>
          <dl className="text-muted-foreground grid gap-2 text-right text-xs">
            <div>
              <dt className="text-foreground font-medium">
                {isPublished ? "Publication date" : "Planned publication"}
              </dt>
              <dd>{formatPublicationDate(entry.publishedAt)}</dd>
            </div>
            <div>
              <dt className="text-foreground font-medium">Last updated</dt>
              <dd>{formatTimestamp(entry.updatedAt)}</dd>
            </div>
          </dl>
        </div>
        <p className="text-foreground/90 mt-4 text-sm font-medium break-words">
          {entry.summary || "No summary was provided."}
        </p>
        {!isPublished ? (
          <p className="text-muted-foreground mt-2 line-clamp-3 text-sm leading-6 break-words whitespace-pre-wrap">
            {entry.body || "No body content was provided."}
          </p>
        ) : null}
      </div>

      {isPublished ? (
        <div className="bg-muted/25 border-t p-4 sm:p-5">
          <ChangelogPreview
            status="published"
            values={{
              body: entry.body,
              label: entry.label ?? "",
              publicationDate: timestampToPublicationDate(entry.publishedAt),
              slug: entry.slug,
              summary: entry.summary,
              title: entry.title,
            }}
          />
        </div>
      ) : (
        <details className="group border-t">
          <summary className="hover:bg-muted/40 flex list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium marker:content-none sm:px-5 [&::-webkit-details-marker]:hidden">
            <span>Edit and preview draft</span>
            <span
              className="text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              ↓
            </span>
          </summary>
          <EditChangelogDraft entry={entry} />
        </details>
      )}

      <div className="border-t p-4 sm:p-5">
        <ChangelogEntryActions
          entryId={entry.id}
          entryTitle={entry.title}
          status={entry.status}
        />
      </div>
    </article>
  )
}

function EntryGroup({
  entries,
  status,
}: {
  entries: ChangelogEntry[]
  status: ChangelogStatus
}) {
  const isPublished = status === "published"

  return (
    <section className="space-y-3" aria-labelledby={`${status}-entries-title`}>
      <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-3">
        <div>
          <h2 id={`${status}-entries-title`} className="font-semibold">
            {statusLabels[status]}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {isPublished
              ? "Live entries remain public until they are unpublished."
              : "Private entries can be edited and previewed before publication."}
          </p>
        </div>
        <p className="text-muted-foreground text-sm" role="status">
          {entries.length === 1 ? "1 entry" : `${entries.length} entries`}
        </p>
      </div>

      {entries.length > 0 ? (
        <div className="space-y-3">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <div className="admin-panel p-6 text-center">
          <h3 className="font-semibold">
            No {isPublished ? "published entries" : "drafts"}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            {isPublished
              ? "Publish a reviewed draft when an update is ready to go live."
              : "Create a draft above to begin a changelog update."}
          </p>
        </div>
      )}
    </section>
  )
}

export default async function ChangelogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>
}) {
  const params = await searchParams
  const status = parseStatus(params.status)
  const result = await runAdminQuery(
    adminConvex.listChangelogEntries,
    status ? { status } : {},
  )

  if (result.status === "access-denied") {
    return <AccessState {...result.access} />
  }

  if (result.status === "configuration") {
    return <AccessState kind="data-configuration" issues={result.issues} />
  }

  if (result.status === "unavailable") {
    return <AccessState kind="unavailable" />
  }

  const entries = parseChangelogEntries(result.data)

  if (!entries) {
    return <AccessState kind="unavailable" />
  }

  const groups = (status ? [status] : changelogStatuses).map((groupStatus) => ({
    status: groupStatus,
    entries: entries.filter((entry) => entry.status === groupStatus),
  }))

  return (
    <div className="space-y-8">
      <CreateChangelogForm />

      <section aria-labelledby="changelog-filter-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="changelog-filter-title" className="font-semibold">
              Manage entries
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Draft and published states are shown separately. Times are in UTC.
            </p>
          </div>
          <div
            className="flex flex-wrap gap-2"
            aria-label="Filter changelog entries"
          >
            <Button asChild size="sm" variant={status ? "outline" : "default"}>
              <Link href="/changelog">All</Link>
            </Button>
            {changelogStatuses.map((value) => (
              <Button
                key={value}
                asChild
                size="sm"
                variant={status === value ? "default" : "outline"}
              >
                <Link href={`/changelog?status=${value}`}>
                  {statusLabels[value]}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </section>

      <div className="space-y-8">
        {groups.map((group) => (
          <EntryGroup
            key={group.status}
            status={group.status}
            entries={group.entries}
          />
        ))}
      </div>
    </div>
  )
}
