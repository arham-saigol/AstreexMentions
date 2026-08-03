"use client"

import { api } from "@astreex/backend/api"
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  LightbulbIcon,
  PaperPlaneTiltIcon,
} from "@phosphor-icons/react"
import { Button } from "@astreex/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@astreex/ui/components/dialog"
import { Input } from "@astreex/ui/components/input"
import { Label } from "@astreex/ui/components/label"
import { Textarea } from "@astreex/ui/components/textarea"
import { useMutation } from "convex/react"
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react"

import {
  FEATURE_REQUEST_DESCRIPTION_MAX_LENGTH,
  FEATURE_REQUEST_TITLE_MAX_LENGTH,
  featureRequestInputSchema,
  type FeatureRequestInput,
} from "@/lib/feature-requests"

type SubmissionPhase = "editing" | "submitting" | "success"
type FieldErrors = Partial<Record<keyof FeatureRequestInput, string>>

function describedBy(...ids: Array<string | false | null | undefined>): string {
  return ids.filter(Boolean).join(" ")
}

function clearFieldError(
  errors: FieldErrors,
  field: keyof FeatureRequestInput,
): FieldErrors {
  const nextErrors = { ...errors }
  delete nextErrors[field]
  return nextErrors
}

function FeatureRequestForm({
  onClose,
  onPendingChange,
}: {
  onClose: () => void
  onPendingChange: (pending: boolean) => void
}) {
  const createFeatureRequest = useMutation(
    api.featureRequests.createFeatureRequest,
  )
  const titleId = useId()
  const titleHelpId = useId()
  const titleErrorId = useId()
  const descriptionId = useId()
  const descriptionHelpId = useId()
  const descriptionErrorId = useId()
  const submissionErrorId = useId()
  const titleRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const successTitleRef = useRef<HTMLHeadingElement>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [phase, setPhase] = useState<SubmissionPhase>("editing")
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const pending = phase === "submitting"

  useEffect(() => {
    if (phase === "success") {
      successTitleRef.current?.focus()
    }
  }, [phase])

  const reset = () => {
    setTitle("")
    setDescription("")
    setFieldErrors({})
    setSubmissionError(null)
    setPhase("editing")
  }

  const sendAnother = () => {
    reset()
    window.requestAnimationFrame(() => titleRef.current?.focus())
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedInput = featureRequestInputSchema.safeParse({
      description,
      title,
    })

    if (!parsedInput.success) {
      const errors = parsedInput.error.flatten().fieldErrors
      const nextErrors: FieldErrors = {
        ...(errors.title?.[0] ? { title: errors.title[0] } : {}),
        ...(errors.description?.[0]
          ? { description: errors.description[0] }
          : {}),
      }

      setFieldErrors(nextErrors)
      setSubmissionError(null)
      if (nextErrors.title) {
        titleRef.current?.focus()
      } else if (nextErrors.description) {
        descriptionRef.current?.focus()
      }
      return
    }

    setFieldErrors({})
    setSubmissionError(null)
    setPhase("submitting")
    onPendingChange(true)

    try {
      await createFeatureRequest(parsedInput.data)

      setTitle("")
      setDescription("")
      setPhase("success")
    } catch {
      setSubmissionError(
        "Astreex could not confirm the submission. Wait a moment before trying the same request again.",
      )
      setPhase("editing")
    } finally {
      onPendingChange(false)
    }
  }

  if (phase === "success") {
    return (
      <div className="border-border bg-muted/30 rounded-lg border px-5 py-6 sm:px-6">
        <CheckCircleIcon
          aria-hidden="true"
          className="text-praise-foreground size-7"
          weight="fill"
        />
        <h3
          ref={successTitleRef}
          tabIndex={-1}
          className="text-foreground mt-4 text-base font-semibold outline-none"
        >
          Request submitted
        </h3>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Thanks for the context. Astreex staff can now review the request tied
          to this account.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={sendAnother}>
            <ArrowCounterClockwiseIcon aria-hidden="true" />
            Send another
          </Button>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      <div className="space-y-2">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          ref={titleRef}
          id={titleId}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setFieldErrors((current) => clearFieldError(current, "title"))
            setSubmissionError(null)
          }}
          placeholder="What would make Astreex more useful?"
          maxLength={FEATURE_REQUEST_TITLE_MAX_LENGTH}
          autoComplete="off"
          autoFocus
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.title) || undefined}
          aria-describedby={describedBy(
            titleHelpId,
            fieldErrors.title && titleErrorId,
          )}
        />
        <div className="flex items-start justify-between gap-4 text-xs leading-5">
          <p id={titleHelpId} className="text-muted-foreground">
            Use a short, specific outcome.
          </p>
          <span className="text-muted-foreground shrink-0" aria-hidden="true">
            {title.length}/{FEATURE_REQUEST_TITLE_MAX_LENGTH}
          </span>
        </div>
        {fieldErrors.title && (
          <p
            id={titleErrorId}
            role="alert"
            className="text-destructive text-xs"
          >
            {fieldErrors.title}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={descriptionId}>Description</Label>
        <Textarea
          ref={descriptionRef}
          id={descriptionId}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
            setFieldErrors((current) => clearFieldError(current, "description"))
            setSubmissionError(null)
          }}
          placeholder="Describe the workflow, the problem, and what a useful result would look like."
          rows={7}
          maxLength={FEATURE_REQUEST_DESCRIPTION_MAX_LENGTH}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.description) || undefined}
          aria-describedby={describedBy(
            descriptionHelpId,
            fieldErrors.description && descriptionErrorId,
          )}
        />
        <div className="flex items-start justify-between gap-4 text-xs leading-5">
          <p id={descriptionHelpId} className="text-muted-foreground">
            Do not include passwords, API keys, or other sensitive information.
          </p>
          <span className="text-muted-foreground shrink-0" aria-hidden="true">
            {description.length.toLocaleString("en-US")}/
            {FEATURE_REQUEST_DESCRIPTION_MAX_LENGTH.toLocaleString("en-US")}
          </span>
        </div>
        {fieldErrors.description && (
          <p
            id={descriptionErrorId}
            role="alert"
            className="text-destructive text-xs"
          >
            {fieldErrors.description}
          </p>
        )}
      </div>

      {submissionError && (
        <div
          id={submissionErrorId}
          role="alert"
          className="border-destructive/35 bg-destructive/5 text-destructive rounded-md border px-3 py-2.5 text-sm leading-6"
        >
          {submissionError}
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {pending ? "Submitting feature request." : ""}
      </p>

      <DialogFooter className="border-border border-t pt-5">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <CircleNotchIcon aria-hidden="true" className="animate-spin" />
          ) : (
            <PaperPlaneTiltIcon aria-hidden="true" />
          )}
          {pending ? "Submitting…" : "Submit request"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function FeatureRequestDialogBodySlot({
  children,
  onClose,
  onPendingChange,
}: {
  children?: ReactNode
  onClose: () => void
  onPendingChange: (pending: boolean) => void
}) {
  return (
    <div className="border-border mt-5 border-t pt-5">
      {children ?? (
        <FeatureRequestForm
          onClose={onClose}
          onPendingChange={onPendingChange}
        />
      )}
    </div>
  )
}

export function FeatureRequestDialogShell({
  children,
  onOpenChange,
  open,
  returnFocusRef,
}: {
  children?: ReactNode
  onOpenChange: (open: boolean) => void
  open: boolean
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const [submissionPending, setSubmissionPending] = useState(false)

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && submissionPending) {
      return
    }
    onOpenChange(nextOpen)
  }
  const close = () => changeOpen(false)

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] max-w-xl gap-0 overflow-y-auto"
        showCloseButton={!submissionPending}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current
          if (!target?.isConnected) {
            return
          }

          event.preventDefault()
          window.requestAnimationFrame(() => target.focus())
        }}
      >
        <DialogHeader>
          <span className="border-border bg-muted text-primary mb-1 grid size-9 place-items-center rounded-md border">
            <LightbulbIcon aria-hidden="true" className="size-4.5" />
          </span>
          <DialogTitle>Feature Requests</DialogTitle>
          <DialogDescription className="leading-6">
            Share a product idea or workflow improvement. The request is
            submitted through the authenticated account data service.
          </DialogDescription>
        </DialogHeader>
        <FeatureRequestDialogBodySlot
          onClose={close}
          onPendingChange={setSubmissionPending}
        >
          {children}
        </FeatureRequestDialogBodySlot>
      </DialogContent>
    </Dialog>
  )
}
