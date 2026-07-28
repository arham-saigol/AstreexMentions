import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import { Input } from "@astreex/ui/components/input"
import { Label } from "@astreex/ui/components/label"
import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { AccessState } from "@/components/access-state"
import { FeatureRequestControls } from "@/components/feature-request-controls"
import { runAdminQuery } from "@/lib/admin-convex"
import {
  featureRequestStatuses,
  parseFeatureRequestPage,
} from "@/lib/admin-data"
import { adminConvex, type FeatureRequestStatus } from "@/lib/convex-references"
import {
  featureRequestStatusLabels,
  type FeatureRequestSort,
} from "@/lib/feature-requests"

export const metadata: Metadata = {
  title: "Feature Requests",
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

function singleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseStatus(
  value: string | string[] | undefined,
): FeatureRequestStatus | undefined {
  const candidate = singleValue(value)
  return featureRequestStatuses.find((status) => status === candidate)
}

function parseSort(value: string | string[] | undefined): FeatureRequestSort {
  return singleValue(value) === "oldest" ? "oldest" : "newest"
}

function parseSearch(value: string | string[] | undefined): string {
  return singleValue(value)?.trim().slice(0, 160) ?? ""
}

function parseCursor(value: string | string[] | undefined): string | undefined {
  const cursor = singleValue(value)
  return cursor && cursor.length <= 2_000 ? cursor : undefined
}

function featureRequestPageHref(input: {
  cursor: string
  query: string
  sort: FeatureRequestSort
  status?: FeatureRequestStatus | undefined
}): string {
  const params = new URLSearchParams({ cursor: input.cursor })
  if (input.query) {
    params.set("q", input.query)
  }
  if (input.sort !== "newest") {
    params.set("sort", input.sort)
  }
  if (input.status) {
    params.set("status", input.status)
  }
  return `/feature-requests?${params.toString()}`
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : dateFormatter.format(date)
}

function MetadataItem({
  children,
  label,
  mono = false,
}: {
  children: ReactNode
  label: string
  mono?: boolean
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd
        className={
          mono
            ? "text-foreground font-mono text-xs break-all"
            : "text-foreground text-sm break-words"
        }
      >
        {children}
      </dd>
    </div>
  )
}

export default async function FeatureRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string | string[]
    q?: string | string[]
    sort?: string | string[]
    status?: string | string[]
  }>
}) {
  const params = await searchParams
  const cursor = parseCursor(params.cursor)
  const query = parseSearch(params.q)
  const sort = parseSort(params.sort)
  const status = parseStatus(params.status)
  const result = await runAdminQuery(adminConvex.listFeatureRequests, {
    ...(cursor === undefined ? {} : { cursor }),
    limit: 25,
    ...(query ? { query } : {}),
    sort,
    ...(status === undefined ? {} : { status }),
  })

  if (result.status === "access-denied") {
    return <AccessState {...result.access} />
  }

  if (result.status === "configuration") {
    return <AccessState kind="data-configuration" issues={result.issues} />
  }

  if (result.status === "unavailable") {
    return <AccessState kind="unavailable" />
  }

  const page = parseFeatureRequestPage(result.data)

  if (!page) {
    return <AccessState kind="unavailable" />
  }

  const visibleRequests = page.items
  const hasFilters = Boolean(query || status || sort === "oldest" || cursor)

  return (
    <div className="space-y-6">
      <section aria-labelledby="feature-request-filters-title">
        <div className="mb-3">
          <h2 id="feature-request-filters-title" className="font-semibold">
            Find requests
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Search request content and metadata, then narrow the queue by
            status.
          </p>
        </div>
        <form
          action="/feature-requests"
          className="admin-panel grid gap-4 p-4 md:grid-cols-[minmax(14rem,1fr)_12rem_11rem_auto] md:items-end"
          role="search"
        >
          <div className="space-y-1.5">
            <Label htmlFor="feature-request-search">Search</Label>
            <Input
              id="feature-request-search"
              name="q"
              type="search"
              defaultValue={query}
              maxLength={160}
              placeholder="Title, user, workspace, or ID"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feature-request-status">Status</Label>
            <select
              id="feature-request-status"
              name="status"
              defaultValue={status ?? ""}
              className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2"
            >
              <option value="">All statuses</option>
              {featureRequestStatuses.map((value) => (
                <option key={value} value={value}>
                  {featureRequestStatusLabels[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feature-request-sort">Sort</Label>
            <select
              id="feature-request-sort"
              name="sort"
              defaultValue={sort}
              className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Apply</Button>
            {hasFilters ? (
              <Button asChild variant="outline">
                <Link href="/feature-requests">Clear</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <section
        className="space-y-3"
        aria-labelledby="feature-request-queue-title"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="feature-request-queue-title" className="font-semibold">
              Request queue
            </h2>
            <p className="text-muted-foreground mt-1 text-sm" role="status">
              {visibleRequests.length === 1
                ? "1 matching request on this page"
                : `${visibleRequests.length} matching requests on this page`}
            </p>
          </div>
          <p className="text-muted-foreground text-xs">Times shown in UTC</p>
        </div>

        {visibleRequests.length > 0 ? (
          <div className="space-y-3">
            {visibleRequests.map((request) => (
              <article key={request.id} className="admin-panel overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold break-words">
                          {request.title}
                        </h3>
                        <Badge variant="outline">
                          {featureRequestStatusLabels[request.status]}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Submitted {formatDate(request.createdAt)} by{" "}
                        {request.user.email ??
                          request.user.name ??
                          "an unavailable user"}
                      </p>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {request.workspace.name ?? "Workspace unavailable"}
                    </p>
                  </div>
                  <p className="text-foreground/90 mt-4 line-clamp-2 text-sm leading-6 break-words whitespace-pre-wrap">
                    {request.body || "No request description was provided."}
                  </p>
                </div>

                <details className="group border-t">
                  <summary className="hover:bg-muted/40 flex list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium marker:content-none sm:px-5 [&::-webkit-details-marker]:hidden">
                    <span>Review details and update status</span>
                    <span
                      className="text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    >
                      ↓
                    </span>
                  </summary>
                  <div className="space-y-5 border-t px-4 py-4 sm:px-5 sm:py-5">
                    <section aria-label="Request description">
                      <h4 className="text-sm font-semibold">Request</h4>
                      <p className="text-foreground/90 mt-2 text-sm leading-6 break-words whitespace-pre-wrap">
                        {request.body || "No request description was provided."}
                      </p>
                    </section>

                    <div className="grid gap-5 border-t pt-5 lg:grid-cols-3">
                      <section aria-labelledby={`submission-${request.id}`}>
                        <h4
                          id={`submission-${request.id}`}
                          className="text-sm font-semibold"
                        >
                          Submission
                        </h4>
                        <dl className="mt-3 space-y-3">
                          <MetadataItem label="Request ID" mono>
                            {request.id}
                          </MetadataItem>
                          <MetadataItem label="Submitted">
                            {formatDate(request.createdAt)}
                          </MetadataItem>
                          <MetadataItem label="Last updated">
                            {formatDate(request.updatedAt)}
                          </MetadataItem>
                          {request.submission.source ? (
                            <MetadataItem label="Source">
                              {request.submission.source}
                            </MetadataItem>
                          ) : null}
                        </dl>
                      </section>

                      <section aria-labelledby={`user-${request.id}`}>
                        <h4
                          id={`user-${request.id}`}
                          className="text-sm font-semibold"
                        >
                          User
                        </h4>
                        <dl className="mt-3 space-y-3">
                          <MetadataItem label="Name">
                            {request.user.name ?? "Unavailable"}
                          </MetadataItem>
                          <MetadataItem label="Email">
                            {request.user.email ?? "Unavailable"}
                          </MetadataItem>
                          <MetadataItem label="User ID" mono>
                            {request.user.id ?? "Unavailable"}
                          </MetadataItem>
                        </dl>
                      </section>

                      <section aria-labelledby={`workspace-${request.id}`}>
                        <h4
                          id={`workspace-${request.id}`}
                          className="text-sm font-semibold"
                        >
                          Workspace
                        </h4>
                        <dl className="mt-3 space-y-3">
                          <MetadataItem label="Name">
                            {request.workspace.name ?? "Unavailable"}
                          </MetadataItem>
                          <MetadataItem label="Slug">
                            {request.workspace.slug ?? "Unavailable"}
                          </MetadataItem>
                          <MetadataItem label="Workspace ID" mono>
                            {request.workspace.id ?? "Unavailable"}
                          </MetadataItem>
                        </dl>
                      </section>
                    </div>

                    <div className="border-t pt-5">
                      <FeatureRequestControls
                        requestId={request.id}
                        requestTitle={request.title}
                        status={request.status}
                        adminNote={request.adminNote}
                      />
                    </div>
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-panel p-8 text-center">
            <h3 className="font-semibold">No feature requests found</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {hasFilters
                ? "Try a different search, status, or sort selection."
                : "Convex returned no feature requests."}
            </p>
          </div>
        )}
        {page.nextCursor ? (
          <nav
            className="flex justify-end"
            aria-label="Feature request pagination"
          >
            <Button asChild variant="outline">
              <Link
                href={featureRequestPageHref({
                  cursor: page.nextCursor,
                  query,
                  sort,
                  status,
                })}
              >
                Next page
              </Link>
            </Button>
          </nav>
        ) : null}
      </section>
    </div>
  )
}
