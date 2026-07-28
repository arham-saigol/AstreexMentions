"use client"

import {
  CircleNotchIcon,
  KeyIcon,
  NewspaperIcon,
  PauseIcon,
  PlayIcon,
  RedditLogoIcon,
  TrashIcon,
  XLogoIcon,
} from "@phosphor-icons/react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@astreex/ui/components/alert-dialog"
import { Button } from "@astreex/ui/components/button"
import { Checkbox } from "@astreex/ui/components/checkbox"
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
import { cn } from "@astreex/ui/lib/utils"
import { useId, useState, type FormEvent } from "react"

import type { Platform } from "@/lib/customer-convex"
import {
  backendErrorMessage,
  PLATFORM_OPTIONS,
  type KeywordItem,
} from "@/lib/keywords"

function PlatformIcon({ platform }: { platform: Platform }) {
  const Icon =
    platform === "x"
      ? XLogoIcon
      : platform === "reddit"
        ? RedditLogoIcon
        : NewspaperIcon
  return <Icon aria-hidden="true" className="size-4" />
}

type KeywordFormValue = {
  phrase: string
  platforms: Platform[]
}

export function KeywordFormDialog({
  atLimit,
  keyword,
  monitoringActive,
  onOpenChange,
  onSubmit,
  open,
}: {
  atLimit: boolean
  keyword: KeywordItem | null
  monitoringActive: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (value: KeywordFormValue) => Promise<void>
  open: boolean
}) {
  const phraseId = useId()
  const errorId = useId()
  const [phrase, setPhrase] = useState(keyword?.phrase ?? "")
  const [platforms, setPlatforms] = useState<Platform[]>(
    keyword?.platforms ?? ["x"],
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const editing = keyword !== null

  const togglePlatform = (platform: Platform, checked: boolean) => {
    if (!checked && platforms.length === 1 && platforms.includes(platform)) {
      setError("At least one platform must remain selected.")
      return
    }

    setError(null)
    setPlatforms((current) =>
      checked
        ? [...new Set([...current, platform])]
        : current.filter((value) => value !== platform),
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedPhrase = phrase.trim().replace(/\s+/g, " ")

    if (!normalizedPhrase) {
      setError("Enter a keyword phrase.")
      return
    }
    if (normalizedPhrase.length > 160) {
      setError("Keyword phrases can contain at most 160 characters.")
      return
    }
    if (platforms.length === 0) {
      setError("Select at least one platform.")
      return
    }
    if (!editing && atLimit) {
      setError("The current keyword limit has been reached.")
      return
    }

    setPending(true)
    setError(null)
    try {
      await onSubmit({ phrase: normalizedPhrase, platforms })
      onOpenChange(false)
    } catch (submissionError) {
      setError(
        backendErrorMessage(
          submissionError,
          editing
            ? "The keyword could not be updated."
            : "The keyword could not be added.",
        ),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit keyword" : "Add keyword"}</DialogTitle>
          <DialogDescription>
            A keyword uses one plan slot regardless of how many platforms are
            selected.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <Label htmlFor={phraseId}>Keyword phrase</Label>
            <Input
              id={phraseId}
              value={phrase}
              onChange={(event) => {
                setPhrase(event.target.value)
                setError(null)
              }}
              className="mt-2"
              placeholder="Brand, product, competitor, or problem phrase"
              maxLength={160}
              autoComplete="off"
              autoFocus
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
            <p className="text-muted-foreground mt-2 text-xs leading-5">
              Matching is managed by the configured providers. Use the precise
              wording customers are likely to use.
            </p>
          </div>

          <fieldset>
            <legend className="text-foreground text-sm font-medium">
              Platforms
            </legend>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              At least one platform must remain selected.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {PLATFORM_OPTIONS.map((option) => {
                const checked = platforms.includes(option.value)
                const checkboxId = `${phraseId}-${option.value}`
                return (
                  <label
                    key={option.value}
                    htmlFor={checkboxId}
                    className={cn(
                      "border-border flex items-start gap-3 rounded-md border p-3 transition-colors",
                      checked && "border-primary bg-primary/5",
                      checked && platforms.length === 1
                        ? "cursor-not-allowed"
                        : "cursor-pointer",
                    )}
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={checked}
                      disabled={checked && platforms.length === 1}
                      onCheckedChange={(value) =>
                        togglePlatform(option.value, value === true)
                      }
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="text-foreground flex items-center gap-1.5 text-sm font-medium">
                        <PlatformIcon platform={option.value} />
                        {option.label}
                      </span>
                      <span className="text-muted-foreground mt-1 block text-xs leading-5">
                        {option.description}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          {!monitoringActive && (
            <div className="border-border bg-muted/35 flex items-start gap-3 rounded-md border px-3 py-2.5">
              <KeyIcon
                aria-hidden="true"
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
              />
              <p className="text-muted-foreground text-xs leading-5">
                This configuration will remain a draft. No provider checks begin
                until Convex reports an active subscription.
              </p>
            </div>
          )}

          {error && (
            <p id={errorId} role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || (!editing && atLimit)}>
              {pending ? (
                <CircleNotchIcon aria-hidden="true" className="animate-spin" />
              ) : (
                <KeyIcon aria-hidden="true" />
              )}
              {editing ? "Save changes" : "Add keyword"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export type KeywordConfirmationAction = "delete" | "pause" | "resume"

const confirmationCopy = {
  pause: {
    title: "Pause this keyword?",
    description:
      "Provider checks for this keyword will stop. Existing mentions remain available, and you can resume the keyword later.",
    action: "Pause keyword",
    Icon: PauseIcon,
  },
  resume: {
    title: "Resume this keyword?",
    description:
      "Astreex will request that configured sources resume on their next expected schedule. Backend limits and subscription state still apply.",
    action: "Resume keyword",
    Icon: PlayIcon,
  },
  delete: {
    title: "Delete this keyword?",
    description:
      "This removes the keyword from the active configuration and stops its source checks. Existing collected mentions are not presented as deleted here.",
    action: "Delete keyword",
    Icon: TrashIcon,
  },
} as const

export function KeywordConfirmationDialog({
  action,
  keyword,
  onOpenChange,
  onConfirm,
  open,
}: {
  action: KeywordConfirmationAction
  keyword: KeywordItem | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  open: boolean
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = confirmationCopy[action]
  const ConfirmationIcon = copy.Icon

  const confirm = async () => {
    setPending(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (confirmationError) {
      setError(
        backendErrorMessage(
          confirmationError,
          `The keyword could not be ${action === "delete" ? "deleted" : action === "pause" ? "paused" : "resumed"}.`,
        ),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {keyword ? (
              <>
                <span className="text-foreground font-medium">
                  {keyword.phrase}
                </span>
                {" — "}
                {copy.description}
              </>
            ) : (
              copy.description
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant={action === "delete" ? "destructive" : "default"}
            onClick={() => void confirm()}
            disabled={pending}
          >
            {pending ? (
              <CircleNotchIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <ConfirmationIcon aria-hidden="true" />
            )}
            {copy.action}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
