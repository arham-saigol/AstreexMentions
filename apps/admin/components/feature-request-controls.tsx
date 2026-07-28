"use client"

import { Label, Textarea } from "@astreex/ui"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import {
  initialAdminActionState,
  updateFeatureRequestAction,
  type AdminActionState,
} from "@/app/actions"
import { ActionSubmit } from "@/components/action-submit"
import { featureRequestStatuses } from "@/lib/admin-data"
import { featureRequestStatusLabels } from "@/lib/feature-requests"
import type { FeatureRequestStatus } from "@/lib/convex-references"

function ActionFeedback({ state }: { state: AdminActionState }) {
  const { pending } = useFormStatus()
  const message = pending ? "Saving changes…" : state.message

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

export function FeatureRequestControls({
  adminNote,
  requestId,
  requestTitle,
  status,
}: {
  adminNote: string | undefined
  requestId: string
  requestTitle: string
  status: FeatureRequestStatus
}) {
  const [state, action] = useActionState(
    updateFeatureRequestAction,
    initialAdminActionState,
  )

  return (
    <form
      action={action}
      className="space-y-4"
      aria-label={`Update ${requestTitle}`}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`status-${requestId}`}>Status</Label>
          <select
            id={`status-${requestId}`}
            name="status"
            defaultValue={status}
            required
            className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2"
          >
            {featureRequestStatuses.map((value) => (
              <option key={value} value={value}>
                {featureRequestStatusLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`note-${requestId}`}>Admin note</Label>
          <Textarea
            id={`note-${requestId}`}
            name="adminNote"
            defaultValue={adminNote}
            maxLength={2_000}
            rows={3}
            placeholder="Optional internal context"
            aria-describedby={`note-help-${requestId}`}
          />
          <p
            id={`note-help-${requestId}`}
            className="text-muted-foreground text-xs"
          >
            Internal only. Submit an empty note to clear the current value.
          </p>
        </div>
      </div>
      <div className="flex min-h-9 flex-wrap items-center gap-3">
        <ActionSubmit>Save changes</ActionSubmit>
        <ActionFeedback state={state} />
      </div>
    </form>
  )
}
