"use server"

import { api } from "@astreex/backend/api"
import type { Id } from "@astreex/backend/data-model"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { AdminAccessError, requireAdminAccess } from "@/lib/admin-auth"
import { runAdminMutation } from "@/lib/admin-convex"
import type { FeatureRequestStatus } from "@/lib/admin-data"
import { isPublicationDate, publicationDateToTimestamp } from "@/lib/changelog"

export type AdminActionState = Readonly<{
  status: "idle" | "success" | "error"
  message: string
}>

export const initialAdminActionState: AdminActionState = {
  status: "idle",
  message: "",
}

const featureRequestInput = z.object({
  requestId: z.string().trim().min(1).max(200),
  status: z.enum(["new", "planned", "in_progress", "completed", "declined"]),
  adminNote: z.string().trim().max(2_000),
})

const changelogInput = z.object({
  body: z.string().trim().min(1).max(30_000),
  label: z.string().trim().max(40),
  publicationDate: z.string().trim().refine(isPublicationDate),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().trim().min(1).max(280),
  title: z.string().trim().min(1).max(160),
})

const changelogEntryInput = z.object({
  entryId: z.string().trim().min(1).max(200),
})

const deletionJobInput = z.object({
  confirmation: z.enum(["RETRY", "CANCEL"]),
  deletionJobId: z.string().trim().min(1).max(200),
})

function accessErrorState(error: unknown): AdminActionState | null {
  if (!(error instanceof AdminAccessError)) {
    return null
  }

  return {
    status: "error",
    message:
      error.access.kind === "configuration"
        ? "Admin authentication is not configured."
        : error.access.kind === "signed-out"
          ? "Sign in before performing this action."
          : "This Clerk account is not authorized.",
  }
}

function dataErrorState(
  status: "access-denied" | "configuration" | "unavailable",
): AdminActionState {
  if (status === "configuration") {
    return {
      status: "error",
      message: "The authenticated Convex connection is not configured.",
    }
  }

  if (status === "access-denied") {
    return { status: "error", message: "Administrative access was denied." }
  }

  return {
    status: "error",
    message: "Convex did not accept the change. No local fallback was applied.",
  }
}

function changelogValidationErrorState(): AdminActionState {
  return {
    status: "error",
    message:
      "Complete every required field. Use a valid date and a slug containing only lowercase letters, numbers, and hyphens.",
  }
}

export async function updateFeatureRequestAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let access

  try {
    access = await requireAdminAccess()
  } catch (error) {
    return (
      accessErrorState(error) ?? {
        status: "error",
        message: "The administrator session could not be verified.",
      }
    )
  }

  const parsed = featureRequestInput.safeParse({
    requestId: formData.get("requestId"),
    status: formData.get("status"),
    adminNote: formData.get("adminNote"),
  })

  if (!parsed.success) {
    return {
      status: "error",
      message:
        "Choose a valid status and keep the admin note under 2,000 characters.",
    }
  }

  const result = await runAdminMutation(
    api.admin.updateFeatureRequest,
    {
      requestId: parsed.data.requestId as Id<"featureRequests">,
      status: parsed.data.status as FeatureRequestStatus,
      adminNote: parsed.data.adminNote,
    },
    access,
  )

  if (result.status !== "ready") {
    return dataErrorState(result.status)
  }

  revalidatePath("/feature-requests")
  return { status: "success", message: "Feature request updated." }
}

export async function createChangelogEntryAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let access

  try {
    access = await requireAdminAccess()
  } catch (error) {
    return (
      accessErrorState(error) ?? {
        status: "error",
        message: "The administrator session could not be verified.",
      }
    )
  }

  const parsed = changelogInput.safeParse({
    body: formData.get("body"),
    label: formData.get("label"),
    publicationDate: formData.get("publicationDate"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    title: formData.get("title"),
  })

  if (!parsed.success) {
    return changelogValidationErrorState()
  }

  const result = await runAdminMutation(
    api.admin.createChangelogEntry,
    {
      body: parsed.data.body,
      publishedAt: publicationDateToTimestamp(parsed.data.publicationDate),
      slug: parsed.data.slug,
      summary: parsed.data.summary,
      title: parsed.data.title,
      ...(parsed.data.label ? { label: parsed.data.label } : {}),
    },
    access,
  )

  if (result.status !== "ready") {
    return dataErrorState(result.status)
  }

  revalidatePath("/changelog")
  return { status: "success", message: "Draft changelog entry created." }
}

export async function updateChangelogEntryAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let access

  try {
    access = await requireAdminAccess()
  } catch (error) {
    return (
      accessErrorState(error) ?? {
        status: "error",
        message: "The administrator session could not be verified.",
      }
    )
  }

  const parsed = changelogInput.and(changelogEntryInput).safeParse({
    body: formData.get("body"),
    entryId: formData.get("entryId"),
    label: formData.get("label"),
    publicationDate: formData.get("publicationDate"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    title: formData.get("title"),
  })

  if (!parsed.success) {
    return changelogValidationErrorState()
  }

  const result = await runAdminMutation(
    api.admin.updateChangelogEntry,
    {
      body: parsed.data.body,
      entryId: parsed.data.entryId as Id<"changelogEntries">,
      label: parsed.data.label,
      publishedAt: publicationDateToTimestamp(parsed.data.publicationDate),
      slug: parsed.data.slug,
      summary: parsed.data.summary,
      title: parsed.data.title,
    },
    access,
  )

  if (result.status !== "ready") {
    return dataErrorState(result.status)
  }

  revalidatePath("/changelog")
  return { status: "success", message: "Draft changes saved." }
}

export async function publishChangelogEntryAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let access

  try {
    access = await requireAdminAccess()
  } catch (error) {
    return (
      accessErrorState(error) ?? {
        status: "error",
        message: "The administrator session could not be verified.",
      }
    )
  }

  const parsed = changelogEntryInput.safeParse({
    entryId: formData.get("entryId"),
  })

  if (!parsed.success) {
    return { status: "error", message: "A changelog entry is required." }
  }

  const result = await runAdminMutation(
    api.admin.publishChangelogEntry,
    { entryId: parsed.data.entryId as Id<"changelogEntries"> },
    access,
  )

  if (result.status !== "ready") {
    return dataErrorState(result.status)
  }

  revalidatePath("/changelog")
  return { status: "success", message: "Changelog entry published." }
}

export async function unpublishChangelogEntryAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let access

  try {
    access = await requireAdminAccess()
  } catch (error) {
    return (
      accessErrorState(error) ?? {
        status: "error",
        message: "The administrator session could not be verified.",
      }
    )
  }

  const parsed = changelogEntryInput.safeParse({
    entryId: formData.get("entryId"),
  })

  if (!parsed.success) {
    return { status: "error", message: "A changelog entry is required." }
  }

  const result = await runAdminMutation(
    api.admin.unpublishChangelogEntry,
    { entryId: parsed.data.entryId as Id<"changelogEntries"> },
    access,
  )

  if (result.status !== "ready") {
    return dataErrorState(result.status)
  }

  revalidatePath("/changelog")
  return { status: "success", message: "Entry returned to drafts." }
}

export async function deleteChangelogEntryAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let access

  try {
    access = await requireAdminAccess()
  } catch (error) {
    return (
      accessErrorState(error) ?? {
        status: "error",
        message: "The administrator session could not be verified.",
      }
    )
  }

  const parsed = changelogEntryInput.safeParse({
    entryId: formData.get("entryId"),
  })

  if (!parsed.success) {
    return { status: "error", message: "A changelog entry is required." }
  }

  const result = await runAdminMutation(
    api.admin.deleteChangelogEntry,
    { entryId: parsed.data.entryId as Id<"changelogEntries"> },
    access,
  )

  if (result.status !== "ready") {
    return dataErrorState(result.status)
  }

  revalidatePath("/changelog")
  return { status: "success", message: "Changelog entry deleted." }
}

async function runDeletionControl(
  kind: "retry" | "cancel",
  formData: FormData,
  access: Awaited<ReturnType<typeof requireAdminAccess>>,
): Promise<AdminActionState> {
  const parsed = deletionJobInput.safeParse({
    confirmation: formData.get("confirmation"),
    deletionJobId: formData.get("deletionJobId"),
  })
  const expected = kind === "retry" ? "RETRY" : "CANCEL"
  if (!parsed.success || parsed.data.confirmation !== expected) {
    return {
      status: "error",
      message: `Type ${expected} exactly to confirm this operation.`,
    }
  }

  const result = await runAdminMutation(
    kind === "retry" ? api.admin.retryDeletionJob : api.admin.cancelDeletionJob,
    {
      confirmation: expected,
      deletionJobId: parsed.data.deletionJobId as Id<"deletionJobs">,
    },
    access,
  )
  if (result.status !== "ready") {
    return dataErrorState(result.status)
  }

  revalidatePath("/deletions")
  return {
    status: "success",
    message:
      kind === "retry"
        ? "A new deletion operation was queued."
        : "The pre-quiescence deletion operation was canceled.",
  }
}

export async function retryDeletionJobAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let access
  try {
    access = await requireAdminAccess()
  } catch (error) {
    return (
      accessErrorState(error) ?? {
        status: "error",
        message: "The administrator session could not be verified.",
      }
    )
  }
  return await runDeletionControl("retry", formData, access)
}

export async function cancelDeletionJobAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let access
  try {
    access = await requireAdminAccess()
  } catch (error) {
    return (
      accessErrorState(error) ?? {
        status: "error",
        message: "The administrator session could not be verified.",
      }
    )
  }
  return await runDeletionControl("cancel", formData, access)
}
