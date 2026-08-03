"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@astreex/ui/components/alert-dialog"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import { Input } from "@astreex/ui/components/input"
import { Label } from "@astreex/ui/components/label"
import { Textarea } from "@astreex/ui/components/textarea"
import { CircleNotchIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useActionState, useId, useState } from "react"

import {
  createChangelogEntryAction,
  deleteChangelogEntryAction,
  initialAdminActionState,
  publishChangelogEntryAction,
  unpublishChangelogEntryAction,
  updateChangelogEntryAction,
  type AdminActionState,
} from "@/app/actions"
import type { ChangelogEntry } from "@/lib/admin-data"
import {
  currentPublicationDate,
  isPublicationDate,
  sanitizeChangelogPreview,
  timestampToPublicationDate,
} from "@/lib/changelog"
import type { ChangelogStatus } from "@/lib/admin-data"

type ChangelogEditorValues = {
  body: string
  label: string
  publicationDate: string
  slug: string
  summary: string
  title: string
}

const previewDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
})

function emptyEditorValues(): ChangelogEditorValues {
  return {
    body: "",
    label: "",
    publicationDate: currentPublicationDate(),
    slug: "",
    summary: "",
    title: "",
  }
}

function entryEditorValues(entry: ChangelogEntry): ChangelogEditorValues {
  return {
    body: entry.body,
    label: entry.label ?? "",
    publicationDate:
      timestampToPublicationDate(entry.publishedAt) || currentPublicationDate(),
    slug: entry.slug,
    summary: entry.summary,
    title: entry.title,
  }
}

function formatPreviewDate(value: string): string {
  if (!isPublicationDate(value)) {
    return "Publication date not set"
  }

  return previewDateFormatter.format(new Date(`${value}T00:00:00.000Z`))
}

function ActionFeedback({
  pending,
  pendingMessage,
  state,
}: {
  pending: boolean
  pendingMessage: string
  state: AdminActionState
}) {
  const message = pending ? pendingMessage : state.message

  if (!message) {
    return null
  }

  const isError = !pending && state.status === "error"
  const isSuccess = !pending && state.status === "success"

  return (
    <p
      className={
        isError
          ? "text-destructive text-sm"
          : isSuccess
            ? "text-praise-foreground text-sm"
            : "text-muted-foreground text-sm"
      }
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      {message}
    </p>
  )
}

export function ChangelogPreview({
  status,
  values,
}: {
  status: ChangelogStatus
  values: ChangelogEditorValues
}) {
  const title = sanitizeChangelogPreview(values.title)
  const summary = sanitizeChangelogPreview(values.summary)
  const body = sanitizeChangelogPreview(values.body)
  const label = sanitizeChangelogPreview(values.label)

  return (
    <section aria-label="Sanitized changelog preview" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Sanitized preview</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            HTML and executable markup are removed before this preview is
            rendered.
          </p>
        </div>
        <Badge variant={status === "published" ? "default" : "outline"}>
          {status === "published" ? "Published" : "Draft preview"}
        </Badge>
      </div>

      <article className="bg-background rounded-lg border p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {label ? <Badge variant="muted">{label}</Badge> : null}
          <p className="text-muted-foreground text-xs">
            {formatPreviewDate(values.publicationDate)}
          </p>
        </div>
        <h4 className="mt-3 text-xl font-semibold tracking-tight break-words">
          {title || "Untitled changelog entry"}
        </h4>
        <p className="text-foreground/90 mt-2 text-sm font-medium break-words">
          {summary || "Add a summary to preview the entry introduction."}
        </p>
        <div className="mt-4 border-t pt-4">
          <p className="text-muted-foreground text-sm leading-7 break-words whitespace-pre-wrap">
            {body || "Add body content to preview the full update."}
          </p>
        </div>
      </article>
    </section>
  )
}

function ChangelogEditor({ entry }: { entry?: ChangelogEntry }) {
  const id = useId()
  const [values, setValues] = useState<ChangelogEditorValues>(() =>
    entry ? entryEditorValues(entry) : emptyEditorValues(),
  )
  const [state, action, pending] = useActionState(
    entry ? updateChangelogEntryAction : createChangelogEntryAction,
    initialAdminActionState,
  )

  function setValue<Key extends keyof ChangelogEditorValues>(
    key: Key,
    value: ChangelogEditorValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  return (
    <form
      action={action}
      className={entry ? "border-t" : "admin-panel overflow-hidden"}
      aria-label={
        entry ? `Edit draft ${entry.title}` : "Create changelog draft"
      }
    >
      {entry ? <input type="hidden" name="entryId" value={entry.id} /> : null}
      <div className="border-b px-4 py-4 sm:px-5">
        <h2 className="font-semibold">
          {entry ? "Edit draft" : "New changelog draft"}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {entry
            ? "Save content changes before publishing this entry."
            : "Drafts remain private until an authorized publish action succeeds."}
        </p>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
        <div className="space-y-4 p-4 sm:p-5 xl:border-r">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${id}-title`}>Title</Label>
              <Input
                id={`${id}-title`}
                name="title"
                value={values.title}
                onChange={(event) => setValue("title", event.target.value)}
                required
                maxLength={160}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-slug`}>Slug</Label>
              <Input
                id={`${id}-slug`}
                name="slug"
                value={values.slug}
                onChange={(event) => setValue("slug", event.target.value)}
                required
                maxLength={100}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="product-update"
                autoComplete="off"
                aria-describedby={`${id}-slug-help`}
              />
              <p
                id={`${id}-slug-help`}
                className="text-muted-foreground text-xs"
              >
                Lowercase letters, numbers, and hyphens only.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-publication-date`}>Publication date</Label>
              <Input
                id={`${id}-publication-date`}
                name="publicationDate"
                type="date"
                value={values.publicationDate}
                onChange={(event) =>
                  setValue("publicationDate", event.target.value)
                }
                required
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${id}-label`}>Label (optional)</Label>
              <Input
                id={`${id}-label`}
                name="label"
                value={values.label}
                onChange={(event) => setValue("label", event.target.value)}
                maxLength={40}
                placeholder="Product"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${id}-summary`}>Summary</Label>
              <Textarea
                id={`${id}-summary`}
                name="summary"
                value={values.summary}
                onChange={(event) => setValue("summary", event.target.value)}
                required
                maxLength={280}
                rows={3}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${id}-body`}>Body</Label>
              <Textarea
                id={`${id}-body`}
                name="body"
                value={values.body}
                onChange={(event) => setValue("body", event.target.value)}
                required
                maxLength={30_000}
                rows={12}
                aria-describedby={`${id}-body-help`}
              />
              <p
                id={`${id}-body-help`}
                className="text-muted-foreground text-xs"
              >
                Plain text is safest. The preview removes HTML and executable
                markup.
              </p>
            </div>
          </div>

          <div className="flex min-h-9 flex-wrap items-center gap-3 border-t pt-4">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <CircleNotchIcon className="animate-spin" aria-hidden="true" />
              ) : null}
              {pending
                ? "Saving…"
                : entry
                  ? "Save draft changes"
                  : "Create draft"}
            </Button>
            <ActionFeedback
              state={state}
              pending={pending}
              pendingMessage="Saving draft…"
            />
          </div>
        </div>

        <div className="bg-muted/25 p-4 sm:p-5">
          <ChangelogPreview status="draft" values={values} />
        </div>
      </div>
    </form>
  )
}

export function CreateChangelogForm() {
  return <ChangelogEditor />
}

export function EditChangelogDraft({ entry }: { entry: ChangelogEntry }) {
  return <ChangelogEditor entry={entry} />
}

function PublicationAction({
  entryId,
  status,
}: {
  entryId: string
  status: ChangelogStatus
}) {
  const isPublished = status === "published"
  const [state, action, pending] = useActionState(
    isPublished ? unpublishChangelogEntryAction : publishChangelogEntryAction,
    initialAdminActionState,
  )

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="entryId" value={entryId} />
      <Button
        type="submit"
        variant={isPublished ? "outline" : "default"}
        disabled={pending}
      >
        {pending ? (
          <CircleNotchIcon className="animate-spin" aria-hidden="true" />
        ) : null}
        {pending
          ? isPublished
            ? "Unpublishing…"
            : "Publishing…"
          : isPublished
            ? "Unpublish"
            : "Publish"}
      </Button>
      <ActionFeedback
        state={state}
        pending={pending}
        pendingMessage={
          isPublished ? "Returning entry to drafts…" : "Publishing entry…"
        }
      />
    </form>
  )
}

function DeleteChangelogEntry({
  entryId,
  entryTitle,
}: {
  entryId: string
  entryTitle: string
}) {
  const [state, action, pending] = useActionState(
    deleteChangelogEntryAction,
    initialAdminActionState,
  )

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          <TrashIcon aria-hidden="true" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this changelog entry?</AlertDialogTitle>
          <AlertDialogDescription>
            “{entryTitle}” will be permanently removed. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="entryId" value={entryId} />
          <ActionFeedback
            state={state}
            pending={pending}
            pendingMessage="Deleting entry…"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? (
                <CircleNotchIcon className="animate-spin" aria-hidden="true" />
              ) : (
                <TrashIcon aria-hidden="true" />
              )}
              {pending ? "Deleting…" : "Delete entry"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function ChangelogEntryActions({
  entryId,
  entryTitle,
  status,
}: {
  entryId: string
  entryTitle: string
  status: ChangelogStatus
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <PublicationAction entryId={entryId} status={status} />
      <DeleteChangelogEntry entryId={entryId} entryTitle={entryTitle} />
    </div>
  )
}
