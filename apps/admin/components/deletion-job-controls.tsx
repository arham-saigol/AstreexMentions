"use client"

import { Input } from "@astreex/ui/components/input"
import { Label } from "@astreex/ui/components/label"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import {
  cancelDeletionJobAction,
  initialAdminActionState,
  retryDeletionJobAction,
  type AdminActionState,
} from "@/app/actions"
import { ActionSubmit } from "@/components/action-submit"
import type { DeletionJob } from "@/lib/admin-data"

function ActionFeedback({ state }: { state: AdminActionState }) {
  const { pending } = useFormStatus()
  const message = pending ? "Applying operation…" : state.message
  if (!message) {
    return null
  }
  const error = !pending && state.status === "error"
  return (
    <p
      className={
        error ? "text-destructive text-sm" : "text-muted-foreground text-sm"
      }
      role={error ? "alert" : "status"}
    >
      {message}
    </p>
  )
}

function RetryControl({ deletionJobId }: { deletionJobId: string }) {
  const [state, action] = useActionState(
    retryDeletionJobAction,
    initialAdminActionState,
  )
  return (
    <form action={action} className="space-y-3 rounded-md border p-3">
      <input type="hidden" name="deletionJobId" value={deletionJobId} />
      <div className="space-y-1.5">
        <Label htmlFor={`retry-${deletionJobId}`}>Type RETRY</Label>
        <Input
          id={`retry-${deletionJobId}`}
          name="confirmation"
          autoComplete="off"
          placeholder="RETRY"
          required
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ActionSubmit>Queue operator retry</ActionSubmit>
        <ActionFeedback state={state} />
      </div>
    </form>
  )
}

function CancelControl({ deletionJobId }: { deletionJobId: string }) {
  const [state, action] = useActionState(
    cancelDeletionJobAction,
    initialAdminActionState,
  )
  return (
    <form action={action} className="space-y-3 rounded-md border p-3">
      <input type="hidden" name="deletionJobId" value={deletionJobId} />
      <div className="space-y-1.5">
        <Label htmlFor={`cancel-${deletionJobId}`}>Type CANCEL</Label>
        <Input
          id={`cancel-${deletionJobId}`}
          name="confirmation"
          autoComplete="off"
          placeholder="CANCEL"
          required
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ActionSubmit variant="outline">Cancel before quiescence</ActionSubmit>
        <ActionFeedback state={state} />
      </div>
    </form>
  )
}

export function DeletionJobControls({ job }: { job: DeletionJob }) {
  const canRetry = job.status === "dead" && job.workflowVersion === 2
  const canCancel =
    job.workflowVersion === 2 &&
    job.quiescedAt === undefined &&
    !["canceled", "completed", "dead"].includes(job.status)

  if (!canRetry && !canCancel) {
    return (
      <p className="text-muted-foreground text-sm">
        No safe operator transition is available for this job.
      </p>
    )
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {canRetry ? <RetryControl deletionJobId={job.id} /> : null}
      {canCancel ? <CancelControl deletionJobId={job.id} /> : null}
    </div>
  )
}
