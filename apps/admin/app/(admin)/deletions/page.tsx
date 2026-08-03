import { api } from "@astreex/backend/api"
import type { Id } from "@astreex/backend/data-model"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import { Label } from "@astreex/ui/components/label"
import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { AccessState } from "@/components/access-state"
import { DeletionJobControls } from "@/components/deletion-job-controls"
import { runAdminQuery } from "@/lib/admin-convex"
import {
  deletionJobStatuses,
  type DeletionJobDetail,
  type DeletionJobStatus,
  type DeletionJob,
} from "@/lib/admin-data"

export const metadata: Metadata = {
  title: "Account Deletions",
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
): DeletionJobStatus | undefined {
  const candidate = singleValue(value)
  return deletionJobStatuses.find((status) => status === candidate)
}

function formatDate(value: number | undefined): string {
  if (value === undefined) {
    return "Not reached"
  }
  const date = new Date(value)
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
        className={mono ? "font-mono text-xs break-all" : "text-sm break-words"}
      >
        {children}
      </dd>
    </div>
  )
}

function jobHref(
  job: DeletionJob,
  status: DeletionJobStatus | undefined,
): string {
  const query = new URLSearchParams({ job: job.id })
  if (status) {
    query.set("status", status)
  }
  return `/deletions?${query.toString()}`
}

export default async function DeletionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    job?: string | string[]
    status?: string | string[]
  }>
}) {
  const params = await searchParams
  const selectedJobId = singleValue(params.job)?.trim()
  const status = parseStatus(params.status)
  const result = await runAdminQuery(api.admin.listDeletionJobs, {
    limit: 200,
    ...(status ? { status } : {}),
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

  const jobs = result.data
  const visibleJobs = jobs
  let detail: DeletionJobDetail | null = null
  let detailUnavailable = false
  if (selectedJobId) {
    const detailResult = await runAdminQuery(api.admin.getDeletionJob, {
      deletionJobId: selectedJobId as Id<"deletionJobs">,
    })
    if (detailResult.status === "ready") {
      detail = detailResult.data
    } else {
      detailUnavailable = true
    }
  }

  const activeStatuses = new Set<DeletionJobStatus>([
    "pending",
    "leased",
    "running",
    "failed",
  ])
  const active = jobs.filter((job) => activeStatuses.has(job.status))
  const oldestActive = active.reduce<number | null>(
    (oldest, job) =>
      oldest === null ? job.createdAt : Math.min(oldest, job.createdAt),
    null,
  )
  const stats = [
    {
      label: "Active",
      value: active.length,
      description: "Pending or retryable jobs",
    },
    {
      label: "Blocked",
      value: jobs.filter((job) => job.status === "blocked").length,
      description: "Waiting on billing or reconciliation",
    },
    {
      label: "Dead",
      value: jobs.filter((job) => job.status === "dead").length,
      description: "Operator retry required",
    },
    {
      label: "Oldest active",
      value: oldestActive === null ? "None" : formatDate(oldestActive),
      description: "Creation time in UTC",
    },
  ] as const

  return (
    <div className="space-y-6">
      <section aria-labelledby="deletion-summary-title">
        <h2 id="deletion-summary-title" className="sr-only">
          Deletion queue summary
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="admin-panel min-w-0 p-4">
              <dt className="text-muted-foreground text-sm">{stat.label}</dt>
              <dd className="mt-2 text-2xl font-semibold tracking-tight">
                {stat.value}
              </dd>
              <p className="text-muted-foreground mt-1 text-xs">
                {stat.description}
              </p>
            </div>
          ))}
        </dl>
      </section>

      <form
        action="/deletions"
        className="admin-panel flex flex-wrap items-end gap-3 p-4"
        aria-label="Deletion queue filters"
      >
        <div className="mr-auto min-w-full sm:min-w-0">
          <p className="text-sm font-semibold">Queue filter</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Status is always shown with text; no operational state depends on
            color.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deletion-status">Status</Label>
          <select
            id="deletion-status"
            name="status"
            defaultValue={status ?? ""}
            className="border-input bg-background focus-visible:ring-ring h-9 min-w-48 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2"
          >
            <option value="">All statuses</option>
            {deletionJobStatuses.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.8fr)]">
        <section className="space-y-3" aria-labelledby="deletion-queue-title">
          <div>
            <h2 id="deletion-queue-title" className="font-semibold">
              Deletion jobs
            </h2>
            <p className="text-muted-foreground mt-1 text-sm" role="status">
              {visibleJobs.length} visible of {jobs.length} retained jobs
            </p>
          </div>
          {visibleJobs.length > 0 ? (
            <div className="space-y-3">
              {visibleJobs.map((job) => (
                <article key={job.id} className="admin-panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{job.status}</Badge>
                        <span className="text-muted-foreground text-xs">
                          {job.phase ?? "legacy phase"}
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-xs break-all">
                        {job.id}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={jobHref(job, status)}>Inspect</Link>
                    </Button>
                  </div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <MetadataItem label="Created">
                      {formatDate(job.createdAt)}
                    </MetadataItem>
                    <MetadataItem label="Attempts">
                      {job.attempts} / {job.maxAttempts}
                    </MetadataItem>
                    <MetadataItem label="Last error">
                      {job.lastErrorCode ?? "None"}
                    </MetadataItem>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="admin-panel p-8 text-center">
              <h3 className="font-semibold">No deletion jobs found</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Clear the status filter or wait for a customer request.
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-3" aria-labelledby="deletion-detail-title">
          <div>
            <h2 id="deletion-detail-title" className="font-semibold">
              Job detail
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Controls are available only for transitions the backend can prove
              safe.
            </p>
          </div>
          {detail ? (
            <div className="admin-panel space-y-5 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{detail.job.status}</Badge>
                <span className="text-muted-foreground text-sm">
                  {detail.job.phase ?? "Legacy workflow"}
                  {detail.job.purgeStage ? ` / ${detail.job.purgeStage}` : ""}
                </span>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <MetadataItem label="Operation ID" mono>
                  {detail.job.operationId ?? "Legacy operation"}
                </MetadataItem>
                <MetadataItem label="Workspace ID" mono>
                  {detail.job.workspaceId}
                </MetadataItem>
                <MetadataItem label="Next attempt">
                  {formatDate(detail.job.nextAttemptAt)}
                </MetadataItem>
                <MetadataItem label="Lease expires">
                  {formatDate(detail.job.leaseExpiresAt)}
                </MetadataItem>
                <MetadataItem label="Quiesced">
                  {formatDate(detail.job.quiescedAt)}
                </MetadataItem>
                <MetadataItem label="Data verified">
                  {formatDate(detail.job.dataDeletionVerifiedAt)}
                </MetadataItem>
                <MetadataItem label="Identity verified">
                  {formatDate(detail.job.identityDeletionVerifiedAt)}
                </MetadataItem>
                <MetadataItem label="Security fence expires">
                  {formatDate(detail.job.securityFenceExpiresAt)}
                </MetadataItem>
              </dl>

              <section aria-labelledby="deletion-events-title">
                <h3
                  id="deletion-events-title"
                  className="text-sm font-semibold"
                >
                  Lifecycle events
                </h3>
                {detail.events.length > 0 ? (
                  <ol className="mt-3 space-y-2">
                    {detail.events.map((event, index) => (
                      <li
                        key={`${event.action}-${event.createdAt}-${index}`}
                        className="rounded-md border p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {event.action}
                          </span>
                          <Badge variant="outline">{event.outcome}</Badge>
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {formatDate(event.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-muted-foreground mt-2 text-sm">
                    No retained lifecycle events.
                  </p>
                )}
              </section>

              <section aria-labelledby="deletion-controls-title">
                <h3
                  id="deletion-controls-title"
                  className="text-sm font-semibold"
                >
                  Operator controls
                </h3>
                <div className="mt-3">
                  <DeletionJobControls job={detail.job} />
                </div>
              </section>
            </div>
          ) : detailUnavailable ? (
            <div className="admin-panel p-8 text-center" role="alert">
              <h3 className="font-semibold">Job detail unavailable</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                The queue loaded, but this job’s retained detail could not be
                verified. Refresh before applying an operator action.
              </p>
            </div>
          ) : selectedJobId ? (
            <div className="admin-panel p-8 text-center" role="status">
              <h3 className="font-semibold">Job not found</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                The selected job is not present in the retained queue window.
              </p>
            </div>
          ) : (
            <div className="admin-panel p-8 text-center">
              <h3 className="font-semibold">Select a job</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Inspect a queue item to review phases, retries, and safe
                controls.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
