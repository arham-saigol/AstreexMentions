import type { UserIdentity } from "convex/server"
import { ConvexError, type GenericId, v } from "convex/values"

import { readDeletionBillingSnapshot } from "./deletion/billing"
import {
  ACCOUNT_DELETION_MAX_ATTEMPTS,
  ACCOUNT_DELETION_WORKFLOW_VERSION,
  accountDeletionOperationId,
  accountDeletionResourceKey,
} from "./deletion/model"
import { authenticatedMutation, authenticatedQuery } from "./lib/authorization"
import { assertAccountDeletionAllowed } from "./lib/workspaceDeletion"
import { withoutUndefinedValues } from "./lib/jobRuntime"
import { type MutationCtx, type QueryCtx } from "./server"
import {
  currentUserResult,
  resolveCurrentCustomer,
  type CurrentCustomer,
} from "./users"

type DeletionJobId = GenericId<"deletionJobs">
type UserId = GenericId<"users">
type WorkspaceId = GenericId<"workspaces">
type GenericRow = Record<string, unknown> & { _id: GenericId<string> }
type DatabaseCtx = Pick<QueryCtx | MutationCtx, "db">

const currentWorkspaceResultValidator = v.object({
  keywordCount: v.number(),
  membership: v.object({ role: v.literal("owner") }),
  onboardingComplete: v.boolean(),
  user: v.object({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    id: v.id("users"),
    imageUrl: v.optional(v.string()),
    name: v.optional(v.string()),
  }),
  workspace: v.object({
    id: v.id("workspaces"),
    kind: v.literal("personal"),
    name: v.string(),
  }),
})

const portalRequiredDeletionResultValidator = v.object({
  code: v.literal("BILLING_PORTAL_REQUIRED"),
  deletionJobId: v.optional(v.id("deletionJobs")),
  message: v.string(),
  state: v.literal("portal_required"),
})
const acceptedDeletionResultValidator = v.object({
  code: v.literal("ACCOUNT_DELETION_ACCEPTED"),
  deletionJobId: v.id("deletionJobs"),
  message: v.string(),
  state: v.literal("accepted"),
})
const inProgressDeletionResultValidator = v.object({
  code: v.literal("ACCOUNT_DELETION_IN_PROGRESS"),
  deletionJobId: v.id("deletionJobs"),
  message: v.string(),
  state: v.literal("in_progress"),
  status: v.string(),
})
const supportRequiredDeletionResultValidator = v.object({
  code: v.string(),
  deletionJobId: v.optional(v.id("deletionJobs")),
  message: v.string(),
  state: v.literal("support_required"),
})
const deletionRequestResultValidator = v.union(
  acceptedDeletionResultValidator,
  inProgressDeletionResultValidator,
  portalRequiredDeletionResultValidator,
  supportRequiredDeletionResultValidator,
)
const deletionReadinessResultValidator = v.union(
  v.object({ state: v.literal("available") }),
  acceptedDeletionResultValidator,
  inProgressDeletionResultValidator,
  portalRequiredDeletionResultValidator,
  supportRequiredDeletionResultValidator,
)

type DeletionRequestResult =
  | {
      code: "ACCOUNT_DELETION_ACCEPTED"
      deletionJobId: DeletionJobId
      message: string
      state: "accepted"
    }
  | {
      code: "ACCOUNT_DELETION_IN_PROGRESS"
      deletionJobId: DeletionJobId
      message: string
      state: "in_progress"
      status: string
    }
  | {
      code: "BILLING_PORTAL_REQUIRED"
      deletionJobId?: DeletionJobId
      message: string
      state: "portal_required"
    }
  | {
      code: string
      deletionJobId?: DeletionJobId
      message: string
      state: "support_required"
    }

function workspaceError(code: string, message: string): never {
  throw new ConvexError({ code, message })
}

export function normalizeWorkspaceName(value: string): string {
  const name = value.trim()
  if (name.length === 0 || name.length > 160) {
    workspaceError(
      "INVALID_WORKSPACE_NAME",
      "Workspace name must contain between 1 and 160 characters",
    )
  }
  return name
}

function portalRequiredResult(
  deletionJobId?: DeletionJobId,
): DeletionRequestResult {
  return {
    code: "BILLING_PORTAL_REQUIRED",
    message:
      "Cancel the Creem subscription and wait for it to become inactive before requesting deletion again.",
    state: "portal_required",
    ...(deletionJobId === undefined ? {} : { deletionJobId }),
  }
}

function supportRequiredResult(
  code: string,
  message: string,
  deletionJobId?: DeletionJobId,
): DeletionRequestResult {
  return {
    code,
    message,
    state: "support_required",
    ...(deletionJobId === undefined ? {} : { deletionJobId }),
  }
}

function inProgressResult(job: GenericRow): DeletionRequestResult {
  return {
    code: "ACCOUNT_DELETION_IN_PROGRESS",
    deletionJobId: job._id as DeletionJobId,
    message:
      "Account deletion is running in the background. The operation is durable and safe to leave.",
    state: "in_progress",
    status: String(job.status),
  }
}

function resultForExistingJob(job: GenericRow): DeletionRequestResult {
  if (job.workflowVersion !== ACCOUNT_DELETION_WORKFLOW_VERSION) {
    return supportRequiredResult(
      "DELETION_REVIEW_REQUIRED",
      "A legacy deletion request requires operator review before it can continue.",
      job._id as DeletionJobId,
    )
  }
  if (
    job.status === "pending" ||
    job.status === "leased" ||
    job.status === "running" ||
    job.status === "failed"
  ) {
    return inProgressResult(job)
  }
  if (job.status === "blocked") {
    return job.lastErrorCode === "BILLING_PORTAL_REQUIRED" ||
      job.lastError === "BILLING_PORTAL_REQUIRED"
      ? portalRequiredResult(job._id as DeletionJobId)
      : supportRequiredResult(
          String(job.lastErrorCode ?? "DELETION_SUPPORT_REQUIRED"),
          "Billing or provider state could not be reconciled safely. Contact support before retrying deletion.",
          job._id as DeletionJobId,
        )
  }
  return supportRequiredResult(
    job.status === "dead"
      ? "DELETION_OPERATOR_RETRY_REQUIRED"
      : `DELETION_${String(job.status).toUpperCase()}`,
    "This deletion operation is terminal and requires operator review.",
    job._id as DeletionJobId,
  )
}

async function latestAccountDeletionJob(
  ctx: DatabaseCtx,
  userId: UserId,
): Promise<GenericRow | null> {
  const rows = (await ctx.db
    .query("deletionJobs")
    .withIndex("by_account_user_and_created_at", (q) =>
      q.eq("accountUserId", userId),
    )
    .collect()) as GenericRow[]
  return (
    rows
      .filter((row) => row.kind === "account")
      .sort(
        (left, right) =>
          (right.createdAt as number) - (left.createdAt as number) ||
          String(right._id).localeCompare(String(left._id), "en"),
      )[0] ?? null
  )
}

async function legacyWorkspaceDeletionJob(
  ctx: DatabaseCtx,
  workspaceId: WorkspaceId,
): Promise<GenericRow | null> {
  const rows = (await ctx.db
    .query("deletionJobs")
    .withIndex("by_workspace_and_created_at", (q) =>
      q.eq("workspaceId", workspaceId),
    )
    .collect()) as GenericRow[]
  return (
    rows.find(
      (row) =>
        row.workflowVersion !== ACCOUNT_DELETION_WORKFLOW_VERSION &&
        row.status !== "completed" &&
        row.status !== "canceled",
    ) ?? null
  )
}

type DeletionRequester =
  | { customer: CurrentCustomer; state: "active" }
  | { job: GenericRow; state: "fenced" }

async function resolveDeletionRequester(
  ctx: DatabaseCtx,
  identity: Pick<UserIdentity, "subject" | "tokenIdentifier">,
): Promise<DeletionRequester> {
  const user = (await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique()) as GenericRow | null
  if (!user) {
    workspaceError(
      "BOOTSTRAP_REQUIRED",
      "Complete account setup before deletion",
    )
  }
  if (user.clerkUserId !== identity.subject) {
    workspaceError("FORBIDDEN", "Account identity does not match")
  }
  if (user.disabledAt === undefined && user.deletedAt === undefined) {
    return {
      customer: await resolveCurrentCustomer(ctx, identity),
      state: "active",
    }
  }

  const job = await latestAccountDeletionJob(ctx, user._id as UserId)
  if (!job || job.workflowVersion !== ACCOUNT_DELETION_WORKFLOW_VERSION) {
    workspaceError("FORBIDDEN", "This account cannot request deletion")
  }
  if (
    job.accountUserId !== user._id ||
    job.identityClerkUserId !== identity.subject
  ) {
    workspaceError("FORBIDDEN", "Deletion operation identity does not match")
  }
  return { job, state: "fenced" }
}

async function createBlockedDeletionJob(
  ctx: MutationCtx,
  customer: CurrentCustomer,
  code: string,
  now: number,
): Promise<DeletionJobId> {
  const existing = await latestAccountDeletionJob(ctx, customer.viewer.id)
  if (existing) {
    if (existing.workflowVersion !== ACCOUNT_DELETION_WORKFLOW_VERSION) {
      return existing._id as DeletionJobId
    }
    if (existing.status !== "blocked") {
      return existing._id as DeletionJobId
    }
    await ctx.db.patch("deletionJobs", existing._id as DeletionJobId, {
      billingCheckedAt: now,
      billingGuardStatus:
        code === "BILLING_CONFIGURATION_REQUIRED" ? "failed" : "blocked_active",
      lastError: code,
      lastErrorCode: code,
      updatedAt: now,
    })
    return existing._id as DeletionJobId
  }

  const generation = 1
  const operationId = accountDeletionOperationId(
    String(customer.viewer.id),
    generation,
  )
  return (await ctx.db.insert(
    "deletionJobs",
    withoutUndefinedValues({
      accountUserId: customer.viewer.id,
      attempts: 0,
      billingCheckedAt: now,
      billingGuardStatus:
        code === "BILLING_CONFIGURATION_REQUIRED" ? "failed" : "blocked_active",
      createdAt: now,
      generation,
      idempotencyKey: operationId,
      identityClerkUserId: customer.viewer.clerkUserId,
      kind: "account",
      lastError: code,
      lastErrorCode: code,
      leaseVersion: 0,
      maxAttempts: ACCOUNT_DELETION_MAX_ATTEMPTS,
      operationId,
      phase: "billing_check",
      requestedByUserId: customer.viewer.id,
      resourceKey: accountDeletionResourceKey(String(customer.viewer.id)),
      scheduledAt: now,
      status: "blocked",
      updatedAt: now,
      workflowVersion: ACCOUNT_DELETION_WORKFLOW_VERSION,
      workspaceId: customer.workspace.id,
    }),
  )) as DeletionJobId
}

async function acceptDeletion(
  ctx: MutationCtx,
  customer: CurrentCustomer,
  now: number,
): Promise<DeletionJobId> {
  const existing = await latestAccountDeletionJob(ctx, customer.viewer.id)
  if (
    existing &&
    existing.workflowVersion !== ACCOUNT_DELETION_WORKFLOW_VERSION
  ) {
    return existing._id as DeletionJobId
  }
  if (existing && existing.status !== "blocked") {
    return existing._id as DeletionJobId
  }

  let deletionJobId: DeletionJobId
  if (existing) {
    deletionJobId = existing._id as DeletionJobId
    await ctx.db.patch("deletionJobs", deletionJobId, {
      accessFencedAt: now,
      billingCheckedAt: now,
      billingGuardStatus: "confirmed_inactive",
      identityClerkUserId: customer.viewer.clerkUserId,
      lastError: undefined,
      lastErrorCode: undefined,
      nextAttemptAt: now,
      phase: "billing_check",
      scheduledAt: now,
      status: "pending",
      updatedAt: now,
    })
  } else {
    const generation = 1
    const operationId = accountDeletionOperationId(
      String(customer.viewer.id),
      generation,
    )
    deletionJobId = (await ctx.db.insert(
      "deletionJobs",
      withoutUndefinedValues({
        accountUserId: customer.viewer.id,
        accessFencedAt: now,
        attempts: 0,
        billingCheckedAt: now,
        billingGuardStatus: "confirmed_inactive",
        createdAt: now,
        generation,
        idempotencyKey: operationId,
        identityClerkUserId: customer.viewer.clerkUserId,
        kind: "account",
        leaseVersion: 0,
        maxAttempts: ACCOUNT_DELETION_MAX_ATTEMPTS,
        nextAttemptAt: now,
        operationId,
        phase: "billing_check",
        requestedByUserId: customer.viewer.id,
        resourceKey: accountDeletionResourceKey(String(customer.viewer.id)),
        scheduledAt: now,
        status: "pending",
        updatedAt: now,
        workflowVersion: ACCOUNT_DELETION_WORKFLOW_VERSION,
        workspaceId: customer.workspace.id,
      }),
    )) as DeletionJobId
  }

  await ctx.db.patch("users", customer.viewer.id, {
    disabledAt: now,
    updatedAt: now,
  })
  await ctx.db.patch("workspaces", customer.workspace.id, {
    deletionPendingAt: now,
    updatedAt: now,
  })
  return deletionJobId
}

async function activeKeywordCount(
  ctx: Parameters<typeof resolveCurrentCustomer>[0],
  workspaceId: CurrentCustomer["workspace"]["id"],
): Promise<number> {
  const keywords = await ctx.db
    .query("keywords")
    .withIndex("by_workspace_and_updated_at", (q) =>
      q.eq("workspaceId", workspaceId),
    )
    .collect()

  return keywords.filter(
    (keyword) =>
      keyword.deletedAt === undefined && keyword.status !== "deleted",
  ).length
}

export const getCurrentWorkspace = authenticatedQuery({
  args: {},
  returns: currentWorkspaceResultValidator,
  handler: async (ctx) => {
    const customer = await resolveCurrentCustomer(ctx, ctx.identity)
    const keywordCount = await activeKeywordCount(ctx, customer.workspace.id)

    return {
      keywordCount,
      membership: { role: "owner" as const },
      onboardingComplete: keywordCount > 0,
      user: currentUserResult(customer.viewer),
      workspace: {
        id: customer.workspace.id,
        kind: "personal" as const,
        name: customer.workspace.name,
      },
    }
  },
})

export const updateCurrentWorkspace = authenticatedMutation({
  args: { name: v.string() },
  returns: v.object({
    id: v.id("workspaces"),
    kind: v.literal("personal"),
    name: v.string(),
  }),
  handler: async (ctx, { name: rawName }) => {
    const customer = await resolveCurrentCustomer(ctx, ctx.identity)
    const name = normalizeWorkspaceName(rawName)
    await ctx.db.patch("workspaces", customer.workspace.id, {
      name,
      normalizedName: name.toLocaleLowerCase("en"),
      updatedAt: Date.now(),
    })

    return { id: customer.workspace.id, kind: "personal" as const, name }
  },
})

export const getAccountDeletionReadiness = authenticatedQuery({
  args: {},
  returns: deletionReadinessResultValidator,
  handler: async (
    ctx,
  ): Promise<{ state: "available" } | DeletionRequestResult> => {
    const requester = await resolveDeletionRequester(ctx, ctx.identity)
    if (requester.state === "fenced") {
      return resultForExistingJob(requester.job)
    }
    const existing = await latestAccountDeletionJob(
      ctx,
      requester.customer.viewer.id,
    )
    if (existing && existing.status !== "blocked") {
      return resultForExistingJob(existing)
    }
    const legacy = await legacyWorkspaceDeletionJob(
      ctx,
      requester.customer.workspace.id,
    )
    if (legacy) {
      return supportRequiredResult(
        "DELETION_REVIEW_REQUIRED",
        "A legacy deletion request requires operator review.",
        legacy._id as DeletionJobId,
      )
    }
    const snapshot = await readDeletionBillingSnapshot(
      ctx.db,
      requester.customer.workspace.id,
    )
    if (snapshot.guard.status === "confirmed_inactive") {
      return { state: "available" }
    }
    if (
      snapshot.guard.status === "blocked_active" &&
      snapshot.guard.code === "BILLING_PORTAL_REQUIRED"
    ) {
      if (existing) {
        return portalRequiredResult(existing._id as DeletionJobId)
      }
      return portalRequiredResult()
    }
    return supportRequiredResult(
      "code" in snapshot.guard
        ? snapshot.guard.code
        : "BILLING_RECONCILIATION_REQUIRED",
      "Billing state cannot currently authorize deletion safely.",
      existing?._id as DeletionJobId | undefined,
    )
  },
})

export const getAccountDeletionStatus = authenticatedQuery({
  args: {},
  returns: deletionReadinessResultValidator,
  handler: async (
    ctx,
  ): Promise<{ state: "available" } | DeletionRequestResult> => {
    const requester = await resolveDeletionRequester(ctx, ctx.identity)
    if (requester.state === "fenced") {
      return resultForExistingJob(requester.job)
    }
    const job = await latestAccountDeletionJob(
      ctx,
      requester.customer.viewer.id,
    )
    return job ? resultForExistingJob(job) : { state: "available" }
  },
})

export const deleteAccount = authenticatedMutation({
  args: { confirmation: v.string() },
  returns: deletionRequestResultValidator,
  handler: async (ctx, { confirmation }): Promise<DeletionRequestResult> => {
    if (confirmation !== "DELETE") {
      workspaceError(
        "CONFIRMATION_MISMATCH",
        "Type DELETE to confirm account deletion",
      )
    }
    const requester = await resolveDeletionRequester(ctx, ctx.identity)
    if (requester.state === "fenced") {
      return resultForExistingJob(requester.job)
    }
    const customer = requester.customer
    const existing = await latestAccountDeletionJob(ctx, customer.viewer.id)
    if (existing && existing.status !== "blocked") {
      return resultForExistingJob(existing)
    }
    const legacy = await legacyWorkspaceDeletionJob(ctx, customer.workspace.id)
    if (legacy) {
      return supportRequiredResult(
        "DELETION_REVIEW_REQUIRED",
        "A legacy deletion request requires operator review before it can continue.",
        legacy._id as DeletionJobId,
      )
    }

    const now = Date.now()
    const snapshot = await readDeletionBillingSnapshot(
      ctx.db,
      customer.workspace.id,
      now,
    )
    if (snapshot.guard.status !== "confirmed_inactive") {
      const code =
        "code" in snapshot.guard
          ? snapshot.guard.code
          : "BILLING_RECONCILIATION_REQUIRED"
      const deletionJobId = await createBlockedDeletionJob(
        ctx,
        customer,
        code,
        now,
      )
      await ctx.db.insert("auditEvents", {
        action: "account.deletion.blocked",
        actorClerkUserId: customer.viewer.clerkUserId,
        actorType: "user",
        actorUserId: customer.viewer.id,
        createdAt: now,
        metadataJson: JSON.stringify({ code }),
        outcome: "denied",
        targetId: String(deletionJobId),
        targetType: "deletionJob",
        workspaceId: customer.workspace.id,
      })
      return code === "BILLING_PORTAL_REQUIRED"
        ? portalRequiredResult(deletionJobId)
        : supportRequiredResult(
            code,
            "Billing or provider state cannot currently authorize deletion safely.",
            deletionJobId,
          )
    }

    assertAccountDeletionAllowed(
      {
        _id: customer.viewer.id,
        deletedAt: customer.viewer.deletedAt,
        personalWorkspaceId: customer.viewer.personalWorkspaceId,
      },
      {
        _id: customer.workspace.id,
        kind: customer.workspace.kind,
        ownerUserId: customer.workspace.ownerUserId,
      },
      customer.membership,
      snapshot.guard,
    )
    const deletionJobId = await acceptDeletion(ctx, customer, now)
    await ctx.db.insert("auditEvents", {
      action: "account.deletion.accepted",
      actorClerkUserId: customer.viewer.clerkUserId,
      actorType: "user",
      actorUserId: customer.viewer.id,
      createdAt: now,
      outcome: "success",
      targetId: String(deletionJobId),
      targetType: "deletionJob",
      workspaceId: customer.workspace.id,
    })

    return {
      code: "ACCOUNT_DELETION_ACCEPTED",
      deletionJobId,
      message:
        "Account deletion was accepted and will continue durably in the background.",
      state: "accepted",
    }
  },
})
