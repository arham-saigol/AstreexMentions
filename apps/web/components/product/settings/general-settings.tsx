"use client"

import { useClerk, useUser } from "@clerk/nextjs"
import {
  ArrowSquareOutIcon,
  CircleNotchIcon,
  FloppyDiskIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@astreex/ui/components/alert-dialog"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@astreex/ui/components/avatar"
import { Button } from "@astreex/ui/components/button"
import { Input } from "@astreex/ui/components/input"
import { Label } from "@astreex/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@astreex/ui/components/select"
import { useMutation, useQuery } from "convex/react"
import { useMemo, useState, type FormEvent } from "react"

import { useProductContext } from "@/components/product/product-context"
import { useBillingActions } from "@/components/product/settings/use-billing-actions"
import { customerConvex } from "@/lib/customer-convex"
import { clearOnboardingDraftStorage } from "@/lib/onboarding-draft"
import {
  accountDeletionReadinessSchema,
  accountDeletionResponseSchema,
  settingsResultSchema,
} from "@/lib/settings-convex"

function initials(
  name: string | null | undefined,
  email: string | null | undefined,
) {
  const source = name?.trim() || email?.trim() || "Astreex user"
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function timeZoneOptions(selected: string): string[] {
  const fallback = [
    "UTC",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
  ]
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[]
  }

  let supported = fallback
  try {
    supported = intl.supportedValuesOf?.("timeZone") ?? fallback
  } catch {
    supported = fallback
  }

  return Array.from(
    new Set([selected, browserTimeZone(), "UTC", ...supported]),
  ).sort((left, right) => left.localeCompare(right))
}

function FieldStatus({
  message,
  error = false,
}: {
  message: string | null
  error?: boolean
}) {
  if (!message) {
    return null
  }

  return (
    <p
      role={error ? "alert" : "status"}
      className={
        error ? "text-destructive text-xs" : "text-muted-foreground text-xs"
      }
    >
      {message}
    </p>
  )
}

function AccountDeletion() {
  const { signOut } = useClerk()
  const { billing, workspace } = useProductContext()
  const { error: portalError, openPortal, pending } = useBillingActions()
  const readinessValue = useQuery(
    customerConvex.workspaces.getAccountDeletionReadiness,
    {},
  )
  const readiness = useMemo(
    () =>
      readinessValue === undefined
        ? null
        : accountDeletionReadinessSchema.safeParse(readinessValue),
    [readinessValue],
  )
  const [confirmation, setConfirmation] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const readinessState = readiness?.success ? readiness.data : null
  const deletionAvailable = readinessState?.state === "available"
  const portalRequired = readinessState?.state === "portal_required"
  const portalAvailable =
    billing.providerState === "configured" && Boolean(billing.subscription)
  const readinessMessage =
    readinessState === null
      ? readinessValue === undefined
        ? "Checking billing and deletion readiness."
        : "Deletion readiness could not be verified."
      : readinessState.state === "available"
        ? "A durable deletion job will remove account data before the Clerk identity is removed."
        : readinessState.message

  const deleteAccount = async () => {
    if (confirmation !== "DELETE" || !deletionAvailable) {
      return
    }

    setDeleting(true)
    setDeleteError(null)

    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      })
      const payload: unknown = await response.json().catch(() => null)
      const parsed = accountDeletionResponseSchema.safeParse(payload)

      if (!parsed.success) {
        setDeleteError("Account deletion returned an unexpected response.")
        return
      }

      if (
        "state" in parsed.data &&
        (parsed.data.state === "accepted" ||
          parsed.data.state === "in_progress")
      ) {
        clearOnboardingDraftStorage(window.localStorage, workspace.workspace.id)
        await signOut({ redirectUrl: "/" })
        return
      }
      if (parsed.data.code === "BILLING_PORTAL_REQUIRED" && portalAvailable) {
        const opened = await openPortal()
        if (!opened) {
          setDeleteError(
            "Deletion remains blocked. Open Billing settings and end the subscription before trying again.",
          )
        }
        return
      }
      setDeleteError(parsed.data.message)
    } catch {
      setDeleteError(
        "Account deletion could not be requested. No completion was assumed.",
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section
      aria-labelledby="delete-account-title"
      className="border-destructive/35 border-t pt-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <h4
            id="delete-account-title"
            className="text-foreground text-sm font-semibold"
          >
            Delete account
          </h4>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Permanently removes this Astreex account data. This cannot be
            undone.
          </p>
          <p className="text-muted-foreground mt-2 text-xs leading-5">
            {readinessMessage}
          </p>
        </div>

        {portalRequired ? (
          <Button
            variant="outline"
            onClick={() => void openPortal()}
            disabled={!portalAvailable || pending === "portal"}
          >
            {pending === "portal" ? (
              <CircleNotchIcon className="animate-spin" />
            ) : (
              <ArrowSquareOutIcon />
            )}
            Open Creem portal
          </Button>
        ) : (
          <AlertDialog
            open={deleteOpen}
            onOpenChange={(open) => {
              if (deleting || !deletionAvailable) {
                return
              }
              setDeleteOpen(open)
              if (!open) {
                setConfirmation("")
                setDeleteError(null)
              }
            }}
          >
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={!deletionAvailable}>
                <TrashIcon />
                {readinessState?.state === "in_progress"
                  ? "Deletion in progress"
                  : readinessValue === undefined
                    ? "Checking deletion"
                    : deletionAvailable
                      ? "Delete account"
                      : "Deletion unavailable"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete this Astreex account?
                </AlertDialogTitle>
                <AlertDialogDescription className="leading-6">
                  This accepts a durable deletion operation. Astreex data is
                  verified absent before the Clerk identity is removed. Enter
                  DELETE to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="account-delete-confirmation">
                  Confirmation
                </Label>
                <Input
                  id="account-delete-confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  placeholder="DELETE"
                  aria-invalid={Boolean(deleteError) || undefined}
                />
                <FieldStatus message={deleteError} error />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    variant="destructive"
                    disabled={confirmation !== "DELETE" || deleting}
                    onClick={(event) => {
                      event.preventDefault()
                      void deleteAccount()
                    }}
                  >
                    {deleting && <CircleNotchIcon className="animate-spin" />}
                    Start permanent deletion
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <FieldStatus message={portalError} error />
    </section>
  )
}

export function GeneralSettings() {
  const { user: clerkUser } = useUser()
  const { workspace } = useProductContext()
  const settingsValue = useQuery(customerConvex.settings.get, {})
  const updateCurrentUser = useMutation(customerConvex.users.updateCurrentUser)
  const updateCurrentWorkspace = useMutation(
    customerConvex.workspaces.updateCurrentWorkspace,
  )
  const updateDigest = useMutation(customerConvex.settings.updateDigest)
  const parsedSettings = useMemo(
    () =>
      settingsValue === undefined
        ? null
        : settingsResultSchema.safeParse(settingsValue),
    [settingsValue],
  )
  const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? null
  const profileName = workspace.user?.name ?? clerkUser?.fullName ?? ""
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState<string | null>(
    null,
  )
  const [timeZoneDraft, setTimeZoneDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState<
    "name" | "workspace" | "timezone" | null
  >(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const name = nameDraft ?? profileName
  const workspaceName = workspaceNameDraft ?? workspace.workspace.name
  const timeZone =
    timeZoneDraft ??
    (parsedSettings?.success
      ? parsedSettings.data.digest.timeZone
      : browserTimeZone())

  const saveName = async (event: FormEvent) => {
    event.preventDefault()
    const normalized = name.trim()
    if (!normalized) {
      setError("Name cannot be empty.")
      return
    }

    setSaving("name")
    setError(null)
    setStatus(null)
    try {
      await updateCurrentUser({ name: normalized })
      setNameDraft(normalized)
      setStatus("Profile name saved.")
    } catch {
      setError("Profile name could not be saved.")
    } finally {
      setSaving(null)
    }
  }

  const saveWorkspaceName = async (event: FormEvent) => {
    event.preventDefault()
    const normalized = workspaceName.trim()
    if (!normalized) {
      setError("Brand name cannot be empty.")
      return
    }

    setSaving("workspace")
    setError(null)
    setStatus(null)
    try {
      await updateCurrentWorkspace({ name: normalized })
      setWorkspaceNameDraft(normalized)
      setStatus("Brand name saved.")
    } catch {
      setError("Brand name could not be saved.")
    } finally {
      setSaving(null)
    }
  }

  const saveTimeZone = async () => {
    if (!parsedSettings?.success) {
      setError(
        "Digest preferences are unavailable, so the timezone was not changed.",
      )
      return
    }

    setSaving("timezone")
    setError(null)
    setStatus(null)
    const digest = parsedSettings.data.digest
    try {
      await updateDigest({
        enabled: digest.enabled,
        hour: digest.hour,
        mentionLimit: digest.mentionLimit,
        minute: digest.minute,
        timeZone,
      })
      setStatus("Timezone saved for account scheduling.")
    } catch {
      setError("Timezone could not be saved.")
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="profile-heading">
        <h4
          id="profile-heading"
          className="text-foreground text-sm font-semibold"
        >
          Profile
        </h4>
        <div className="mt-4 flex items-center gap-3">
          <Avatar className="size-11">
            {clerkUser?.imageUrl && (
              <AvatarImage
                src={clerkUser.imageUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}
            <AvatarFallback>
              {initials(profileName, primaryEmail)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-medium">
              {profileName || "Astreex user"}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {primaryEmail ?? "No supported email is available"}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-xs leading-5">
          Profile image and email are supplied by the configured Clerk account.
        </p>

        <form
          onSubmit={saveName}
          className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        >
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setNameDraft(event.target.value)}
              maxLength={160}
              autoComplete="name"
            />
          </div>
          <Button type="submit" variant="outline" disabled={saving !== null}>
            {saving === "name" ? (
              <CircleNotchIcon className="animate-spin" />
            ) : (
              <FloppyDiskIcon />
            )}
            Save name
          </Button>
        </form>
      </section>

      <section
        aria-labelledby="workspace-name-heading"
        className="border-border border-t pt-6"
      >
        <h4
          id="workspace-name-heading"
          className="text-foreground text-sm font-semibold"
        >
          Monitoring profile
        </h4>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          This private brand label identifies the mentions monitored by the
          account.
        </p>
        <form
          onSubmit={saveWorkspaceName}
          className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        >
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Brand name</Label>
            <Input
              id="workspace-name"
              value={workspaceName}
              onChange={(event) => setWorkspaceNameDraft(event.target.value)}
              maxLength={160}
            />
          </div>
          <Button type="submit" variant="outline" disabled={saving !== null}>
            {saving === "workspace" ? (
              <CircleNotchIcon className="animate-spin" />
            ) : (
              <FloppyDiskIcon />
            )}
            Save brand
          </Button>
        </form>
      </section>

      <section
        aria-labelledby="timezone-heading"
        className="border-border border-t pt-6"
      >
        <h4
          id="timezone-heading"
          className="text-foreground text-sm font-semibold"
        >
          Timezone
        </h4>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Used for the daily digest and other account-local schedules.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="account-timezone">Timezone</Label>
            <Select
              value={parsedSettings?.success ? timeZone : ""}
              onValueChange={setTimeZoneDraft}
            >
              <SelectTrigger
                id="account-timezone"
                className="w-full"
                disabled={!parsedSettings?.success}
              >
                <SelectValue
                  placeholder={
                    settingsValue === undefined
                      ? "Loading timezone…"
                      : "Select timezone"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {timeZoneOptions(timeZone).map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void saveTimeZone()}
            disabled={saving !== null || !parsedSettings?.success}
          >
            {saving === "timezone" ? (
              <CircleNotchIcon className="animate-spin" />
            ) : (
              <FloppyDiskIcon />
            )}
            Save timezone
          </Button>
        </div>
        {parsedSettings && !parsedSettings.success && (
          <FieldStatus
            message="Connected settings data could not be validated, so no timezone is being guessed."
            error
          />
        )}
      </section>

      <div className="space-y-2" aria-live="polite">
        <FieldStatus message={status} />
        <FieldStatus message={error} error />
      </div>

      <AccountDeletion />
    </div>
  )
}
