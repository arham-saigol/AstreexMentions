import { type GenericId, v } from "convex/values"

import {
  creemReferenceId,
  creemSubscriptionSchema,
  creemWebhookLivemode,
  creemWebhookObjectId,
  isCreemSubscriptionWebhookEvent,
  normalizeCreemSubscription,
  parseCreemWebhookEvent,
  type CreemSubscriptionWebhookEvent,
  type CreemWebhookEvent,
} from "../integrations/creem"
import {
  internalActionReference,
  internalMutationReference,
  internalQueryReference,
} from "../lib/functionReferences"
import { canReconcileBillingWorkspace } from "../lib/creemBilling"
import { indexAtMost, withoutUndefinedValues } from "../lib/jobRuntime"
import {
  env,
  indexEquals,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../server"
import {
  isProviderUnconfigured,
  readCreemProductAllowlist,
  type CreemPlanMapping,
  type ProviderUnconfigured,
} from "./config"
import {
  completeCheckoutWithoutEntitlement,
  planCreemSubscriptionTransition,
  type BillingSubscriptionState,
  type BillingUsageCycleState,
} from "./lifecycle"

const planIdValidator = v.union(
  v.literal("starter"),
  v.literal("growth"),
  v.literal("scale"),
)

const CHECKOUT_RECORD_TTL_MS = 24 * 60 * 60 * 1_000
const WEBHOOK_RETRY_DELAY_MS = 30_000

type WorkspaceId = GenericId<"workspaces">
type UserId = GenericId<"users">
type SubscriptionId = GenericId<"subscriptions">
type UsageCycleId = GenericId<"usageCycles">
type BillingEventId = GenericId<"billingEvents">
type ProviderRunId = GenericId<"providerRuns">

type GenericMutationContext = MutationCtx

function metadataJson(value: Record<string, unknown>): string {
  return JSON.stringify(value)
}

function eventMode(event: CreemWebhookEvent): string {
  return event.object.mode
}

async function insertAuditEvent(
  ctx: GenericMutationContext,
  input: {
    action: string
    actorClerkUserId?: string
    actorType: "admin" | "provider" | "system" | "user"
    actorUserId?: UserId
    metadata?: Record<string, unknown>
    outcome: "denied" | "failure" | "success"
    requestId?: string
    targetId?: string
    targetType: string
    workspaceId?: WorkspaceId
  },
): Promise<void> {
  const now = Date.now()
  await ctx.db.insert("auditEvents", {
    action: input.action,
    actorType: input.actorType,
    createdAt: now,
    outcome: input.outcome,
    targetType: input.targetType,
    ...(input.actorClerkUserId === undefined
      ? {}
      : { actorClerkUserId: input.actorClerkUserId }),
    ...(input.actorUserId === undefined
      ? {}
      : { actorUserId: input.actorUserId }),
    ...(input.metadata === undefined
      ? {}
      : { metadataJson: metadataJson(input.metadata) }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
    ...(input.workspaceId === undefined
      ? {}
      : { workspaceId: input.workspaceId }),
  })
}

async function recordProviderRunAndMetric(
  ctx: GenericMutationContext,
  input: {
    durationMs: number
    errorCode?: string
    errorMessage?: string
    idempotencyKey: string
    operation: string
    status: "failed" | "succeeded"
    trigger: "manual" | "retry" | "scheduled" | "webhook"
    workspaceId?: WorkspaceId
  },
): Promise<void> {
  const existingRun = await ctx.db
    .query("providerRuns")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", input.idempotencyKey),
    )
    .unique()

  const now = Date.now()
  const durationMs = Math.max(0, Math.round(input.durationMs))
  if (existingRun) {
    if (
      existingRun.status !== "running" ||
      existingRun.provider !== "creem" ||
      existingRun.operation !== input.operation ||
      existingRun.workspaceId !== input.workspaceId
    ) {
      return
    }
    await ctx.db.patch(
      "providerRuns",
      existingRun._id as GenericId<"providerRuns">,
      {
        durationMs,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        finishedAt: now,
        outputCount: input.status === "succeeded" ? 1 : 0,
        status: input.status,
        updatedAt: now,
      },
    )
  } else {
    await ctx.db.insert("providerRuns", {
      attempt: 1,
      createdAt: now,
      durationMs,
      finishedAt: now,
      idempotencyKey: input.idempotencyKey,
      inputCount: 1,
      operation: input.operation,
      outputCount: input.status === "succeeded" ? 1 : 0,
      provider: "creem",
      startedAt: now - durationMs,
      status: input.status,
      trigger: input.trigger,
      updatedAt: now,
      ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
      ...(input.errorMessage === undefined
        ? {}
        : { errorMessage: input.errorMessage }),
      ...(input.workspaceId === undefined
        ? {}
        : { workspaceId: input.workspaceId }),
    })
  }

  const bucketStartAt = Math.floor(now / 3_600_000) * 3_600_000
  const bucketEndAt = bucketStartAt + 3_600_000
  const bucket = await ctx.db
    .query("providerMetricBuckets")
    .withIndex("by_provider_operation_granularity_and_bucket", (q) =>
      indexEquals(
        q,
        ["provider", "creem"],
        ["operation", input.operation],
        ["granularity", "hour"],
        ["bucketStartAt", bucketStartAt],
      ),
    )
    .unique()
  const failureIncrement = input.status === "failed" ? 1 : 0
  const successIncrement = input.status === "succeeded" ? 1 : 0
  const rateLimitedIncrement = input.errorCode === "HTTP_429" ? 1 : 0

  if (bucket) {
    await ctx.db.patch(
      "providerMetricBuckets",
      bucket._id as GenericId<"providerMetricBuckets">,
      {
        failureCount: (bucket.failureCount as number) + failureIncrement,
        inputItemCount: (bucket.inputItemCount as number) + 1,
        latencyMaxMs: Math.max(bucket.latencyMaxMs as number, durationMs),
        latencyTotalMs: (bucket.latencyTotalMs as number) + durationMs,
        outputItemCount: (bucket.outputItemCount as number) + successIncrement,
        rateLimitedCount:
          (bucket.rateLimitedCount as number) + rateLimitedIncrement,
        requestCount: (bucket.requestCount as number) + 1,
        successCount: (bucket.successCount as number) + successIncrement,
        updatedAt: now,
      },
    )
    return
  }

  await ctx.db.insert("providerMetricBuckets", {
    bucketEndAt,
    bucketStartAt,
    failureCount: failureIncrement,
    granularity: "hour",
    inputItemCount: 1,
    latencyMaxMs: durationMs,
    latencyTotalMs: durationMs,
    operation: input.operation,
    outputItemCount: successIncrement,
    provider: "creem",
    rateLimitedCount: rateLimitedIncrement,
    requestCount: 1,
    retryCount: 0,
    successCount: successIncrement,
    updatedAt: now,
  })
}

function subscriptionStateFromRow(
  row: Record<string, unknown>,
): BillingSubscriptionState {
  return {
    cancelAtPeriodEnd: row.cancelAtPeriodEnd as boolean,
    canceledAt: row.canceledAt as number | undefined,
    createdAt: row.createdAt as number,
    currentPeriodEnd: row.currentPeriodEnd as number,
    currentPeriodStart: row.currentPeriodStart as number,
    endedAt: row.endedAt as number | undefined,
    entitlementStatus: row.entitlementStatus as "active" | "inactive",
    lastSyncedAt: row.lastSyncedAt as number,
    planId: row.planId as BillingSubscriptionState["planId"],
    provider: "creem",
    providerCustomerId: row.providerCustomerId as string,
    providerPriceId: row.providerPriceId as string | undefined,
    providerSubscriptionId: row.providerSubscriptionId as string,
    status: row.status as string,
    updatedAt: row.updatedAt as number,
    workspaceId: String(row.workspaceId),
  }
}

function usageCycleStateFromRow(
  row: Record<string, unknown>,
): BillingUsageCycleState {
  return {
    warning100SentAt: row.warning100SentAt as number | undefined,
    warning80SentAt: row.warning80SentAt as number | undefined,
    closedAt: row.closedAt as number | undefined,
    createdAt: row.createdAt as number,
    idempotencyKey: row.idempotencyKey as string,
    keywordLimit: row.keywordLimit as number,
    mentionLimit: row.mentionLimit as number,
    mentionsUsed: row.mentionsUsed as number,
    periodEndAt: row.periodEndAt as number,
    periodStartAt: row.periodStartAt as number,
    planSnapshot: row.planSnapshot as BillingUsageCycleState["planSnapshot"],
    status: row.status as "closed" | "open",
    subscriptionId:
      row.subscriptionId === undefined ? undefined : String(row.subscriptionId),
    updatedAt: row.updatedAt as number,
    workspaceId: String(row.workspaceId),
  }
}

async function findOpenUsageCycle(
  ctx: GenericMutationContext,
  workspaceId: WorkspaceId,
): Promise<Record<string, unknown> | null> {
  const cycles = await ctx.db
    .query("usageCycles")
    .withIndex("by_workspace_status_and_period_end", (q) =>
      indexEquals(q, ["workspaceId", workspaceId], ["status", "open"]),
    )
    .collect()
  return (
    cycles.sort(
      (left, right) =>
        (right.periodStartAt as number) - (left.periodStartAt as number),
    )[0] ?? null
  )
}

async function findSubscriptionByProviderId(
  ctx: GenericMutationContext,
  providerSubscriptionId: string,
): Promise<Record<string, unknown> | null> {
  return await ctx.db
    .query("subscriptions")
    .withIndex("by_provider_subscription", (q) =>
      indexEquals(
        q,
        ["provider", "creem"],
        ["providerSubscriptionId", providerSubscriptionId],
      ),
    )
    .unique()
}

async function findWorkspaceForNewSubscription(
  ctx: GenericMutationContext,
  subscription: ReturnType<typeof normalizeCreemSubscription>,
  plan: CreemPlanMapping,
): Promise<WorkspaceId | null> {
  if (!subscription.metadataInternalCustomerId) {
    return null
  }

  const workspaceId = subscription.metadataInternalCustomerId as WorkspaceId
  let workspace: Record<string, unknown> | null
  try {
    workspace = await ctx.db.get("workspaces", workspaceId)
  } catch {
    return null
  }
  if (!canReconcileBillingWorkspace(workspace)) {
    return null
  }

  const checkouts = await ctx.db
    .query("billingCheckouts")
    .withIndex("by_workspace_and_created_at", (q) =>
      q.eq("workspaceId", workspaceId),
    )
    .collect()
  const matchingCheckout = checkouts.find(
    (checkout) =>
      checkout.provider === "creem" && checkout.planId === plan.planId,
  )

  return matchingCheckout ? workspaceId : null
}

async function synchronizeTrackingSourcesForBilling(
  ctx: GenericMutationContext,
  input: {
    entitlementStatus: "active" | "inactive"
    mentionLimit: number
    mentionsUsed: number
    now: number
    workspaceId: WorkspaceId
  },
): Promise<void> {
  if (input.entitlementStatus === "inactive") {
    const activeSources = await ctx.db
      .query("trackingSources")
      .withIndex("by_workspace_status_and_created_at", (q) =>
        indexEquals(
          q,
          ["workspaceId", input.workspaceId],
          ["status", "active"],
        ),
      )
      .collect()
    for (const source of activeSources) {
      await ctx.db.patch(
        "trackingSources",
        source._id as GenericId<"trackingSources">,
        {
          leaseExpiresAt: undefined,
          leaseToken: undefined,
          pauseReason: "paid",
          status: "paused",
          updatedAt: input.now,
        },
      )
    }
    return
  }

  const canConsumeMentions = input.mentionsUsed < input.mentionLimit
  const pausedSources = await ctx.db
    .query("trackingSources")
    .withIndex("by_workspace_status_and_created_at", (q) =>
      indexEquals(q, ["workspaceId", input.workspaceId], ["status", "paused"]),
    )
    .collect()
  for (const source of pausedSources) {
    const pauseReason = source.pauseReason
    if (
      pauseReason !== "paid" &&
      !(pauseReason === "usage" && canConsumeMentions)
    ) {
      continue
    }
    await ctx.db.patch(
      "trackingSources",
      source._id as GenericId<"trackingSources">,
      {
        pauseReason: undefined,
        status: "active",
        updatedAt: input.now,
      },
    )
  }
}

async function persistSubscriptionTransition(
  ctx: GenericMutationContext,
  input: {
    existingRow: Record<string, unknown> | null
    plan: CreemPlanMapping
    providerCreatedAt: number
    subscription: ReturnType<typeof normalizeCreemSubscription>
    workspaceId: WorkspaceId
  },
): Promise<"applied" | "incomplete_period" | "stale"> {
  const currentCycleRow = await findOpenUsageCycle(ctx, input.workspaceId)
  const existingId = input.existingRow?._id as SubscriptionId | undefined
  let transition = planCreemSubscriptionTransition({
    currentUsageCycle: currentCycleRow
      ? usageCycleStateFromRow(currentCycleRow)
      : null,
    existingSubscription: input.existingRow
      ? subscriptionStateFromRow(input.existingRow)
      : null,
    plan: input.plan,
    providerCreatedAt: input.providerCreatedAt,
    subscription: input.subscription,
    ...(existingId === undefined ? {} : { subscriptionId: String(existingId) }),
    workspaceId: String(input.workspaceId),
  })

  if (transition.kind !== "applied") {
    return transition.kind
  }

  let subscriptionId = existingId
  const subscriptionDocument = {
    ...transition.subscription,
    workspaceId: input.workspaceId,
  }
  if (subscriptionId === undefined) {
    subscriptionId = (await ctx.db.insert(
      "subscriptions",
      withoutUndefinedValues(subscriptionDocument),
    )) as SubscriptionId
    transition = {
      ...transition,
      usageCycle: {
        ...transition.usageCycle,
        subscriptionId: String(subscriptionId),
      },
    }
  } else {
    await ctx.db.patch("subscriptions", subscriptionId, subscriptionDocument)
  }

  if (transition.closedUsageCycle && currentCycleRow) {
    await ctx.db.patch("usageCycles", currentCycleRow._id as UsageCycleId, {
      closedAt: transition.closedUsageCycle.closedAt,
      status: "closed",
      updatedAt: transition.closedUsageCycle.updatedAt,
    })
  }

  const usageDocument = {
    ...transition.usageCycle,
    subscriptionId,
    workspaceId: input.workspaceId,
  }
  if (transition.usageKind === "preserved" && currentCycleRow) {
    await ctx.db.patch(
      "usageCycles",
      currentCycleRow._id as UsageCycleId,
      usageDocument,
    )
  } else {
    const existingCycle = await ctx.db
      .query("usageCycles")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", transition.usageCycle.idempotencyKey),
      )
      .unique()
    if (existingCycle) {
      await ctx.db.patch("usageCycles", existingCycle._id as UsageCycleId, {
        ...usageDocument,
        mentionsUsed: existingCycle.mentionsUsed,
        warning80SentAt: existingCycle.warning80SentAt,
        warning100SentAt: existingCycle.warning100SentAt,
      })
    } else {
      await ctx.db.insert("usageCycles", withoutUndefinedValues(usageDocument))
    }
  }

  await synchronizeTrackingSourcesForBilling(ctx, {
    entitlementStatus: transition.subscription.entitlementStatus,
    mentionLimit: transition.usageCycle.mentionLimit,
    mentionsUsed: transition.usageCycle.mentionsUsed,
    now: input.providerCreatedAt,
    workspaceId: input.workspaceId,
  })

  return "applied"
}

function productAllowlistOrUnconfigured():
  ReadonlyMap<string, CreemPlanMapping> | ProviderUnconfigured {
  return readCreemProductAllowlist(env)
}

function planForEvent(
  plans: ReadonlyMap<string, CreemPlanMapping>,
  productId: string,
): CreemPlanMapping | null {
  return plans.get(productId) ?? null
}

async function findCheckoutForCompletion(
  ctx: GenericMutationContext,
  event: Extract<CreemWebhookEvent, { eventType: "checkout.completed" }>,
): Promise<Record<string, unknown> | null> {
  const bySession = await ctx.db
    .query("billingCheckouts")
    .withIndex("by_provider_session", (q) =>
      indexEquals(
        q,
        ["provider", "creem"],
        ["providerCheckoutSessionId", event.object.id],
      ),
    )
    .unique()
  if (bySession) {
    return bySession
  }
  const requestId = event.object.request_id
  if (!requestId) {
    return null
  }
  return await ctx.db
    .query("billingCheckouts")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", requestId))
    .unique()
}

async function applyCheckoutEvent(
  ctx: GenericMutationContext,
  event: Extract<CreemWebhookEvent, { eventType: "checkout.completed" }>,
  plans: ReadonlyMap<string, CreemPlanMapping>,
): Promise<{
  errorCode?: string
  kind: "applied" | "dead" | "pending"
  workspaceId?: WorkspaceId
}> {
  const checkout = await findCheckoutForCompletion(ctx, event)
  if (!checkout) {
    return { kind: "pending" }
  }
  const workspaceId = checkout.workspaceId as WorkspaceId
  const workspace = await ctx.db.get("workspaces", workspaceId)
  if (!canReconcileBillingWorkspace(workspace)) {
    return { kind: "pending", workspaceId }
  }
  if (event.object.status !== "completed") {
    return {
      errorCode: "CHECKOUT_NOT_COMPLETED",
      kind: "dead",
      workspaceId,
    }
  }

  const productId = creemReferenceId(event.object.product)
  const plan = planForEvent(plans, productId)
  if (!plan || plan.planId !== checkout.planId) {
    return {
      errorCode: "PRODUCT_NOT_ALLOWED",
      kind: "dead",
      workspaceId: checkout.workspaceId as WorkspaceId,
    }
  }

  await ctx.db.patch(
    "billingCheckouts",
    checkout._id as GenericId<"billingCheckouts">,
    completeCheckoutWithoutEntitlement(event.created_at),
  )
  return {
    kind: "applied",
    workspaceId: checkout.workspaceId as WorkspaceId,
  }
}

async function applySubscriptionEvent(
  ctx: GenericMutationContext,
  event: CreemSubscriptionWebhookEvent,
  plans: ReadonlyMap<string, CreemPlanMapping>,
): Promise<{
  errorCode?: string
  kind: "applied" | "dead" | "incomplete_period" | "pending" | "stale"
  workspaceId?: WorkspaceId
}> {
  const normalized = normalizeCreemSubscription(event.object)
  const plan = planForEvent(plans, normalized.productId)
  if (!plan) {
    return { errorCode: "PRODUCT_NOT_ALLOWED", kind: "dead" }
  }

  const existing = await findSubscriptionByProviderId(
    ctx,
    normalized.providerSubscriptionId,
  )
  const workspaceId = existing
    ? (existing.workspaceId as WorkspaceId)
    : await findWorkspaceForNewSubscription(ctx, normalized, plan)
  const attributedWorkspaceId =
    workspaceId ??
    (normalized.metadataInternalCustomerId as WorkspaceId | undefined)
  if (!workspaceId) {
    return {
      kind: "pending",
      ...(attributedWorkspaceId === undefined
        ? {}
        : { workspaceId: attributedWorkspaceId }),
    }
  }
  const workspace = await ctx.db.get("workspaces", workspaceId)
  if (!canReconcileBillingWorkspace(workspace)) {
    return { kind: "pending", workspaceId }
  }

  const kind = await persistSubscriptionTransition(ctx, {
    existingRow: existing,
    plan,
    providerCreatedAt: event.created_at,
    subscription: normalized,
    workspaceId,
  })
  return { kind, workspaceId }
}

async function processWebhookEvent(
  ctx: GenericMutationContext,
  event: CreemWebhookEvent,
  plans: ReadonlyMap<string, CreemPlanMapping>,
): Promise<{
  errorCode?: string
  kind:
    "applied" | "dead" | "incomplete_period" | "ignored" | "pending" | "stale"
  workspaceId?: WorkspaceId
}> {
  if (event.eventType === "checkout.completed") {
    return await applyCheckoutEvent(ctx, event, plans)
  }
  if (isCreemSubscriptionWebhookEvent(event)) {
    return await applySubscriptionEvent(ctx, event, plans)
  }

  // Refund and dispute events are recorded and audited. They do not invent a
  // subscription state transition; Creem's subscription events remain canonical.
  return { kind: "ignored" }
}

export const getCustomerBillingActionContext = internalQuery({
  args: {
    idempotencyKey: v.optional(v.string()),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()
    const subscription =
      subscriptions.sort(
        (left, right) =>
          (right.lastSyncedAt as number) - (left.lastSyncedAt as number),
      )[0] ?? null
    const checkout = args.idempotencyKey
      ? await ctx.db
          .query("billingCheckouts")
          .withIndex("by_idempotency_key", (q) =>
            q.eq("idempotencyKey", args.idempotencyKey as string),
          )
          .unique()
      : null

    return { checkout, subscription }
  },
})

export const recordCheckout = internalMutation({
  args: {
    createdAt: v.number(),
    idempotencyKey: v.string(),
    planId: planIdValidator,
    providerCheckoutSessionId: v.string(),
    providerStatus: v.string(),
    requestedByUserId: v.id("users"),
    url: v.string(),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get("workspaces", args.workspaceId)
    if (
      !workspace ||
      workspace.deletedAt !== undefined ||
      workspace.deletionPendingAt !== undefined
    ) {
      throw new TypeError("Workspace is unavailable for checkout completion")
    }
    const existing = await ctx.db
      .query("billingCheckouts")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique()
    if (existing) {
      if (
        existing.workspaceId !== args.workspaceId ||
        existing.requestedByUserId !== args.requestedByUserId ||
        existing.planId !== args.planId
      ) {
        throw new TypeError(
          "Checkout idempotency key belongs to another request",
        )
      }
      return existing
    }

    const status =
      args.providerStatus === "completed"
        ? "complete"
        : args.providerStatus === "expired"
          ? "expired"
          : "open"
    const id = await ctx.db.insert("billingCheckouts", {
      createdAt: args.createdAt,
      expiresAt: args.createdAt + CHECKOUT_RECORD_TTL_MS,
      idempotencyKey: args.idempotencyKey,
      planId: args.planId,
      provider: "creem",
      providerCheckoutSessionId: args.providerCheckoutSessionId,
      requestedByUserId: args.requestedByUserId,
      status,
      updatedAt: args.createdAt,
      url: args.url,
      workspaceId: args.workspaceId,
      ...(status === "complete" ? { completedAt: args.createdAt } : {}),
    })
    return await ctx.db.get("billingCheckouts", id)
  },
})

export const applyUpgradeResponse = internalMutation({
  args: {
    providerCreatedAt: v.number(),
    rawSubscriptionJson: v.string(),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get("workspaces", args.workspaceId)
    if (
      !workspace ||
      workspace.deletedAt !== undefined ||
      workspace.deletionPendingAt !== undefined
    ) {
      throw new TypeError("Workspace is unavailable for upgrade completion")
    }
    const parsedJson = JSON.parse(args.rawSubscriptionJson) as unknown
    const parsed = creemSubscriptionSchema.safeParse(parsedJson)
    if (!parsed.success) {
      throw new TypeError("Validated Creem upgrade response is invalid")
    }
    const normalized = normalizeCreemSubscription(parsed.data)
    const allowlist = productAllowlistOrUnconfigured()
    if (isProviderUnconfigured(allowlist)) {
      return allowlist
    }
    const plan = planForEvent(allowlist, normalized.productId)
    if (!plan) {
      throw new TypeError("Creem upgrade product is not allowlisted")
    }

    const existing = await findSubscriptionByProviderId(
      ctx,
      normalized.providerSubscriptionId,
    )
    if (!existing || existing.workspaceId !== args.workspaceId) {
      throw new TypeError(
        "Creem upgrade subscription is not owned by workspace",
      )
    }

    return {
      kind: await persistSubscriptionTransition(ctx, {
        existingRow: existing,
        plan,
        providerCreatedAt: Math.max(
          args.providerCreatedAt,
          normalized.updatedAt,
        ),
        subscription: normalized,
        workspaceId: args.workspaceId,
      }),
      state: "configured" as const,
    }
  },
})

export const beginCreemProviderOperation = internalMutation({
  args: {
    idempotencyKey: v.string(),
    operation: v.string(),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerRuns")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique()
    if (existing) {
      if (
        existing.provider !== "creem" ||
        existing.operation !== args.operation ||
        existing.workspaceId !== args.workspaceId
      ) {
        throw new TypeError("Creem operation idempotency key is already in use")
      }
      if (existing.status === "failed") {
        const now = Date.now()
        await ctx.db.patch("providerRuns", existing._id as ProviderRunId, {
          attempt: (existing.attempt as number) + 1,
          durationMs: undefined,
          errorCode: undefined,
          errorMessage: undefined,
          finishedAt: undefined,
          startedAt: now,
          status: "running",
          updatedAt: now,
        })
        return { state: "started" as const }
      }
      return {
        state:
          existing.status === "running"
            ? ("running" as const)
            : ("completed" as const),
      }
    }

    const workspace = await ctx.db.get("workspaces", args.workspaceId)
    if (
      !workspace ||
      workspace.deletedAt !== undefined ||
      workspace.deletionPendingAt !== undefined
    ) {
      throw new TypeError("Workspace is unavailable for billing operations")
    }
    const now = Date.now()
    await ctx.db.insert("providerRuns", {
      attempt: 1,
      createdAt: now,
      idempotencyKey: args.idempotencyKey,
      inputCount: 1,
      operation: args.operation,
      outputCount: 0,
      provider: "creem",
      startedAt: now,
      status: "running",
      trigger: "manual",
      updatedAt: now,
      workspaceId: args.workspaceId,
    })
    return { state: "started" as const }
  },
})

export const markCreemProviderOperationUnresolved = internalMutation({
  args: {
    errorCode: v.string(),
    errorMessage: v.string(),
    idempotencyKey: v.string(),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("providerRuns")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique()
    if (
      !run ||
      run.provider !== "creem" ||
      run.status !== "running" ||
      run.workspaceId !== args.workspaceId
    ) {
      return { state: "stale" as const }
    }
    const now = Date.now()
    await ctx.db.patch("providerRuns", run._id as ProviderRunId, {
      durationMs: Math.max(0, now - (run.startedAt as number)),
      errorCode: args.errorCode.slice(0, 80),
      errorMessage: args.errorMessage.slice(0, 200),
      finishedAt: now,
      status: "failed",
      updatedAt: now,
    })
    return { state: "retryable" as const }
  },
})

export const recordCreemProviderOperation = internalMutation({
  args: {
    actorClerkUserId: v.optional(v.string()),
    actorUserId: v.optional(v.id("users")),
    durationMs: v.number(),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    idempotencyKey: v.string(),
    operation: v.string(),
    status: v.union(v.literal("failed"), v.literal("succeeded")),
    targetId: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    await recordProviderRunAndMetric(ctx, {
      durationMs: args.durationMs,
      idempotencyKey: args.idempotencyKey,
      operation: args.operation,
      status: args.status,
      trigger: "manual",
      ...(args.errorCode === undefined ? {} : { errorCode: args.errorCode }),
      ...(args.errorMessage === undefined
        ? {}
        : { errorMessage: args.errorMessage }),
      ...(args.workspaceId === undefined
        ? {}
        : { workspaceId: args.workspaceId }),
    })
    await insertAuditEvent(ctx, {
      action: `billing.creem.${args.operation}`,
      actorType: "user",
      outcome: args.status === "succeeded" ? "success" : "failure",
      targetType: "billing",
      ...(args.actorClerkUserId === undefined
        ? {}
        : { actorClerkUserId: args.actorClerkUserId }),
      ...(args.actorUserId === undefined
        ? {}
        : { actorUserId: args.actorUserId }),
      ...(args.errorCode === undefined
        ? {}
        : { metadata: { errorCode: args.errorCode } }),
      ...(args.targetId === undefined ? {} : { targetId: args.targetId }),
      ...(args.workspaceId === undefined
        ? {}
        : { workspaceId: args.workspaceId }),
    })
  },
})

async function ingestCreemWebhookBody(
  ctx: GenericMutationContext,
  args: {
    authoritativeSubscriptionJson?: string
    rawBody: string
    receivedAt: number
    scheduleIncompleteReconciliation?: boolean
  },
) {
  let event = parseCreemWebhookEvent(args.rawBody)
  const existing = await ctx.db
    .query("billingEvents")
    .withIndex("by_provider_event", (q) =>
      indexEquals(q, ["provider", "creem"], ["providerEventId", event.id]),
    )
    .unique()

  if (existing?.status === "processed" || existing?.status === "dead") {
    return { kind: "duplicate" as const, status: existing.status }
  }

  const attempt = existing ? (existing.attempts as number) + 1 : 1
  let billingEventId: BillingEventId
  if (existing) {
    billingEventId = existing._id as BillingEventId
    event = parseCreemWebhookEvent(existing.payloadJson as string)
    await ctx.db.patch("billingEvents", billingEventId, {
      attempts: attempt,
      updatedAt: args.receivedAt,
    })
  } else {
    billingEventId = (await ctx.db.insert("billingEvents", {
      attempts: attempt,
      createdAt: args.receivedAt,
      eventType: event.eventType,
      livemode: creemWebhookLivemode(event),
      objectId: creemWebhookObjectId(event),
      payloadJson: args.rawBody,
      provider: "creem",
      providerCreatedAt: event.created_at,
      providerEventId: event.id,
      receivedAt: args.receivedAt,
      status: "pending",
      updatedAt: args.receivedAt,
    })) as BillingEventId
  }

  if (args.authoritativeSubscriptionJson !== undefined) {
    if (!isCreemSubscriptionWebhookEvent(event)) {
      throw new TypeError("Billing event is not a subscription event")
    }
    const parsed = creemSubscriptionSchema.safeParse(
      JSON.parse(args.authoritativeSubscriptionJson) as unknown,
    )
    if (!parsed.success || parsed.data.id !== event.object.id) {
      throw new TypeError(
        "Authoritative subscription does not match the billing event",
      )
    }
    event = { ...event, object: parsed.data }
  }

  const allowlist = productAllowlistOrUnconfigured()
  if (isProviderUnconfigured(allowlist)) {
    await ctx.db.patch("billingEvents", billingEventId, {
      lastError: "PROVIDER_UNCONFIGURED",
      nextAttemptAt: args.receivedAt + WEBHOOK_RETRY_DELAY_MS,
      status: "pending",
      updatedAt: args.receivedAt,
    })
    return {
      kind: "provider_unconfigured" as const,
      missing: allowlist.missing,
    }
  }

  const startedAt = Date.now()
  const result = await processWebhookEvent(ctx, event, allowlist)
  const durationMs = Date.now() - startedAt
  const workspaceId = result.workspaceId
  if (workspaceId !== undefined) {
    await ctx.db.patch("billingEvents", billingEventId, { workspaceId })
  }

  if (result.kind === "pending") {
    await ctx.db.patch("billingEvents", billingEventId, {
      lastError: "TARGET_NOT_READY",
      nextAttemptAt: args.receivedAt + WEBHOOK_RETRY_DELAY_MS,
      status: "pending",
      updatedAt: args.receivedAt,
    })
    await recordProviderRunAndMetric(ctx, {
      durationMs,
      errorCode: "TARGET_NOT_READY",
      idempotencyKey: `creem-webhook:${event.id}:${attempt}`,
      operation: "webhook",
      status: "failed",
      trigger: "webhook",
      ...(workspaceId === undefined ? {} : { workspaceId }),
    })
    return { kind: "pending" as const }
  }

  if (result.kind === "incomplete_period") {
    await ctx.db.patch("billingEvents", billingEventId, {
      lastError: "INCOMPLETE_SUBSCRIPTION_PERIOD",
      nextAttemptAt: args.receivedAt + WEBHOOK_RETRY_DELAY_MS,
      status: "pending",
      updatedAt: args.receivedAt,
    })
    await recordProviderRunAndMetric(ctx, {
      durationMs,
      errorCode: "INCOMPLETE_SUBSCRIPTION_PERIOD",
      idempotencyKey: `creem-webhook:${event.id}:${attempt}`,
      operation: "webhook",
      status: "failed",
      trigger: "webhook",
      ...(workspaceId === undefined ? {} : { workspaceId }),
    })
    if (args.scheduleIncompleteReconciliation !== false) {
      await ctx.scheduler.runAfter(
        0,
        reconcileIncompleteCreemBillingEventReference,
        { billingEventId },
      )
    }
    return { kind: "pending" as const }
  }

  if (result.kind === "dead") {
    const errorCode = result.errorCode ?? "WEBHOOK_REJECTED"
    await ctx.db.patch("billingEvents", billingEventId, {
      lastError: errorCode,
      processedAt: args.receivedAt,
      status: "dead",
      updatedAt: args.receivedAt,
    })
    await recordProviderRunAndMetric(ctx, {
      durationMs,
      errorCode,
      idempotencyKey: `creem-webhook:${event.id}:${attempt}`,
      operation: "webhook",
      status: "failed",
      trigger: "webhook",
      ...(workspaceId === undefined ? {} : { workspaceId }),
    })
    await insertAuditEvent(ctx, {
      action: "billing.creem.webhook",
      actorType: "provider",
      metadata: {
        errorCode,
        eventType: event.eventType,
        mode: eventMode(event),
        result: result.kind,
      },
      outcome: "failure",
      requestId: event.id,
      targetId: creemWebhookObjectId(event),
      targetType: "billing_event",
      ...(workspaceId === undefined ? {} : { workspaceId }),
    })
    return { kind: "dead" as const }
  }

  await ctx.db.patch("billingEvents", billingEventId, {
    lastError: undefined,
    nextAttemptAt: undefined,
    processedAt: args.receivedAt,
    status: "processed",
    updatedAt: args.receivedAt,
  })
  await recordProviderRunAndMetric(ctx, {
    durationMs,
    idempotencyKey: `creem-webhook:${event.id}:${attempt}`,
    operation: "webhook",
    status: "succeeded",
    trigger: "webhook",
    ...(workspaceId === undefined ? {} : { workspaceId }),
  })
  await insertAuditEvent(ctx, {
    action: "billing.creem.webhook",
    actorType: "provider",
    metadata: {
      eventType: event.eventType,
      mode: eventMode(event),
      result: result.kind,
    },
    outcome: "success",
    requestId: event.id,
    targetId: creemWebhookObjectId(event),
    targetType: "billing_event",
    ...(workspaceId === undefined ? {} : { workspaceId }),
  })

  return { kind: result.kind }
}

export const ingestCreemWebhook = internalMutation({
  args: {
    rawBody: v.string(),
    receivedAt: v.number(),
  },
  handler: ingestCreemWebhookBody,
})

export const loadIncompleteCreemBillingEvent = internalQuery({
  args: { billingEventId: v.id("billingEvents") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("billingEvents", args.billingEventId)
    if (
      !row ||
      row.provider !== "creem" ||
      row.status !== "pending" ||
      row.lastError !== "INCOMPLETE_SUBSCRIPTION_PERIOD"
    ) {
      return { state: "not_pending" as const }
    }
    const event = parseCreemWebhookEvent(row.payloadJson)
    if (!isCreemSubscriptionWebhookEvent(event)) {
      return { state: "not_pending" as const }
    }
    return {
      providerSubscriptionId: event.object.id,
      state: "ready" as const,
    }
  },
})

export const applyIncompleteCreemBillingEvent = internalMutation({
  args: {
    authoritativeSubscriptionJson: v.string(),
    billingEventId: v.id("billingEvents"),
    receivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("billingEvents", args.billingEventId)
    if (
      !row ||
      row.provider !== "creem" ||
      row.status !== "pending" ||
      row.lastError !== "INCOMPLETE_SUBSCRIPTION_PERIOD"
    ) {
      return { kind: "duplicate" as const }
    }
    return await ingestCreemWebhookBody(ctx, {
      authoritativeSubscriptionJson: args.authoritativeSubscriptionJson,
      rawBody: row.payloadJson,
      receivedAt: args.receivedAt,
      scheduleIncompleteReconciliation: false,
    })
  },
})

const MAX_BILLING_EVENT_RETRIES_PER_DISPATCH = 16

export const dispatchPendingCreemBillingEvents = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const due = await ctx.db
      .query("billingEvents")
      .withIndex("by_status_and_next_attempt_at", (q) =>
        indexAtMost(
          indexEquals(q, ["status", "pending"]),
          "nextAttemptAt",
          now,
        ),
      )
      .take(MAX_BILLING_EVENT_RETRIES_PER_DISPATCH)
    const outcomes: Record<string, number> = {}

    for (const event of due.sort(
      (left, right) =>
        ((left.nextAttemptAt as number | undefined) ?? 0) -
          ((right.nextAttemptAt as number | undefined) ?? 0) ||
        String(left._id).localeCompare(String(right._id), "en"),
    )) {
      const result = await ingestCreemWebhookBody(ctx, {
        rawBody: event.payloadJson as string,
        receivedAt: now,
      })
      outcomes[result.kind] = (outcomes[result.kind] ?? 0) + 1
    }

    return { outcomes, state: "dispatched" as const }
  },
})

export type CustomerBillingActionContext = {
  checkout: Record<string, unknown> | null
  subscription: Record<string, unknown> | null
}

export const getCustomerBillingActionContextReference = internalQueryReference<
  { idempotencyKey?: string; workspaceId: WorkspaceId },
  CustomerBillingActionContext
>("billing/internal:getCustomerBillingActionContext")

type RecordCheckoutArguments = {
  createdAt: number
  idempotencyKey: string
  planId: "growth" | "scale" | "starter"
  providerCheckoutSessionId: string
  providerStatus: string
  requestedByUserId: UserId
  url: string
  workspaceId: WorkspaceId
}

export const recordCheckoutReference = internalMutationReference<
  RecordCheckoutArguments,
  Record<string, unknown> | null
>("billing/internal:recordCheckout")

export const applyUpgradeResponseReference = internalMutationReference<
  {
    providerCreatedAt: number
    rawSubscriptionJson: string
    workspaceId: WorkspaceId
  },
  { kind?: string; state: string }
>("billing/internal:applyUpgradeResponse")

export const beginCreemProviderOperationReference = internalMutationReference<
  {
    idempotencyKey: string
    operation: string
    workspaceId: WorkspaceId
  },
  { state: "completed" | "running" | "started" }
>("billing/internal:beginCreemProviderOperation")

export const markCreemProviderOperationUnresolvedReference =
  internalMutationReference<{
    errorCode: string
    errorMessage: string
    idempotencyKey: string
    workspaceId: WorkspaceId
  }>("billing/internal:markCreemProviderOperationUnresolved")

export const recordCreemProviderOperationReference = internalMutationReference<{
  actorClerkUserId?: string
  actorUserId?: UserId
  durationMs: number
  errorCode?: string
  errorMessage?: string
  idempotencyKey: string
  operation: string
  status: "failed" | "succeeded"
  targetId?: string
  workspaceId?: WorkspaceId
}>("billing/internal:recordCreemProviderOperation")

export const ingestCreemWebhookReference = internalMutationReference<
  { rawBody: string; receivedAt: number },
  { kind: string; missing?: readonly string[]; status?: string }
>("billing/internal:ingestCreemWebhook")

type BillingEventReconciliationArguments = {
  billingEventId: BillingEventId
}

export const reconcileIncompleteCreemBillingEventReference =
  internalActionReference<BillingEventReconciliationArguments>(
    "billing/reconciliation:reconcileIncompleteCreemBillingEvent",
  )

export const loadIncompleteCreemBillingEventReference = internalQueryReference<
  BillingEventReconciliationArguments,
  { state: "not_pending" } | { providerSubscriptionId: string; state: "ready" }
>("billing/internal:loadIncompleteCreemBillingEvent")

export const applyIncompleteCreemBillingEventReference =
  internalMutationReference<
    BillingEventReconciliationArguments & {
      authoritativeSubscriptionJson: string
      receivedAt: number
    }
  >("billing/internal:applyIncompleteCreemBillingEvent")

export const dispatchPendingCreemBillingEventsReference =
  internalMutationReference<{ now?: number }>(
    "billing/internal:dispatchPendingCreemBillingEvents",
  )
