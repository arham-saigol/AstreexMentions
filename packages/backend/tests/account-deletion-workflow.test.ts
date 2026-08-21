import rateLimiterTest from "@convex-dev/rate-limiter/test"
import { convexTest } from "convex-test"
import { makeFunctionReference, type UserIdentity } from "convex/server"
import type { GenericId } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createClerkAdminClient,
  ClerkIntegrationError,
} from "../convex/integrations/clerk"
import {
  evaluateCompositeDeletionBillingGuard,
  PROVIDER_OPERATION_STALE_MS,
} from "../convex/lib/billingDeletionGuard"
import {
  ACCOUNT_DELETION_LEASE_MS,
  ACCOUNT_DELETION_PURGE_STAGES,
  ACCOUNT_DELETION_WORKFLOW_VERSION,
  canClaimDeletionJob,
  createDeletionContinuationLease,
  createDeletionLease,
  planDeletionFailure,
} from "../convex/deletion/model"
import schema from "../convex/schema"

const NOW = Date.parse("2026-07-27T06:00:00.000Z")
const FENCE_MS = 60_000

const modules = {
  "./_generated/server.ts": async () => ({}),
  "./admin.ts": async () => await import("../convex/admin"),
  "./deletion/actions.ts": async () =>
    await import("../convex/deletion/actions"),
  "./deletion/internal.ts": async () =>
    await import("../convex/deletion/internal"),
  "./users.ts": async () => await import("../convex/users"),
  "./workspaces.ts": async () => await import("../convex/workspaces"),
}

type BackendTest = ReturnType<typeof createBackendTest>
type DeletionJobId = GenericId<"deletionJobs">

const bootstrapReference = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { userId: string; workspaceId: string }
>("users:bootstrapCurrentUser")
const currentWorkspaceReference = makeFunctionReference<
  "query",
  Record<string, never>,
  unknown
>("workspaces:getCurrentWorkspace")
const deleteAccountReference = makeFunctionReference<
  "mutation",
  { confirmation: string },
  {
    code: string
    deletionJobId: DeletionJobId
    state: string
    status?: string
  }
>("workspaces:deleteAccount")
const dispatchReference = makeFunctionReference<
  "mutation",
  { now?: number },
  { claimed: number; dead: number; state: string }
>("deletion/internal:dispatchDueAccountDeletions")
const startReference = makeFunctionReference<
  "mutation",
  {
    deletionJobId: DeletionJobId
    leaseToken: string
    leaseVersion: number
    now?: number
  },
  { billingGuard?: { code?: string; status: string }; state: string }
>("deletion/internal:startAccountDeletionAttempt")
const beginPurgeReference = makeFunctionReference<
  "mutation",
  {
    deletionJobId: DeletionJobId
    leaseToken: string
    leaseVersion: number
    now?: number
    providerVerifiedAt: number
  },
  { code?: string; state: string }
>("deletion/internal:beginAccountDeletionPurge")
const blockForBillingReference = makeFunctionReference<
  "mutation",
  {
    code: string
    deletionJobId: DeletionJobId
    leaseToken: string
    leaseVersion: number
    now?: number
  },
  { state: string }
>("deletion/internal:blockAccountDeletionForBilling")
const purgeBatchReference = makeFunctionReference<
  "mutation",
  {
    deletionJobId: DeletionJobId
    leaseToken: string
    leaseVersion: number
    now?: number
  },
  { phase?: string; state: string }
>("deletion/internal:purgeAccountDeletionBatch")
const verifyDataReference = makeFunctionReference<
  "mutation",
  {
    deletionJobId: DeletionJobId
    leaseToken: string
    leaseVersion: number
    now?: number
  },
  { state: string }
>("deletion/internal:verifyAccountDeletionData")
const identityContextReference = makeFunctionReference<
  "query",
  {
    deletionJobId: DeletionJobId
    leaseToken: string
    leaseVersion: number
  },
  { clerkUserId?: string; state: string }
>("deletion/internal:loadIdentityDeletionContext")
const failAttemptReference = makeFunctionReference<
  "mutation",
  {
    code: string
    deletionJobId: DeletionJobId
    leaseToken: string
    leaseVersion: number
    now?: number
    retryable: boolean
  },
  { state: string }
>("deletion/internal:failAccountDeletionAttempt")

const primaryIdentity = {
  email: "deletion-owner@example.test",
  issuer: "https://clerk.example.test",
  name: "Deletion Owner",
  subject: "user_delete_primary",
  tokenIdentifier: "https://clerk.example.test|user_delete_primary",
} satisfies Partial<UserIdentity>

const otherIdentity = {
  email: "other-owner@example.test",
  issuer: "https://clerk.example.test",
  name: "Other Owner",
  subject: "user_delete_other",
  tokenIdentifier: "https://clerk.example.test|user_delete_other",
} satisfies Partial<UserIdentity>

function createBackendTest() {
  const t = convexTest({ modules, schema })
  rateLimiterTest.register(t)
  return t
}

async function bootstrap(
  t: BackendTest,
  identity: Partial<UserIdentity> = primaryIdentity,
) {
  const customer = t.withIdentity(identity)
  const account = await customer.mutation(bootstrapReference, {})
  return { account, customer }
}

async function acceptedDeletion(t: BackendTest) {
  const { account, customer } = await bootstrap(t)
  const accepted = await customer.mutation(deleteAccountReference, {
    confirmation: "DELETE",
  })
  return { account, accepted, customer }
}

async function persistedJob(t: BackendTest, deletionJobId: DeletionJobId) {
  return await t.run(
    async (ctx) => await ctx.db.get("deletionJobs", deletionJobId),
  )
}

function leaseArguments(
  job: NonNullable<Awaited<ReturnType<typeof persistedJob>>>,
) {
  return {
    deletionJobId: job._id,
    leaseToken: job.leaseToken!,
    leaseVersion: job.leaseVersion!,
  }
}

const previousEnvironment = {
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  creemApiKey: process.env.CREEM_API_KEY,
  creemMode: process.env.CREEM_MODE,
  deletionFenceMs: process.env.DELETION_IDENTITY_FENCE_MS,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  process.env.CLERK_SECRET_KEY = "sk_test_deletion_fixture"
  process.env.CREEM_API_KEY = "creem_test_deletion_fixture"
  process.env.CREEM_MODE = "test"
  process.env.DELETION_IDENTITY_FENCE_MS = String(FENCE_MS)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const [name, value] of [
    ["CLERK_SECRET_KEY", previousEnvironment.clerkSecretKey],
    ["CREEM_API_KEY", previousEnvironment.creemApiKey],
    ["CREEM_MODE", previousEnvironment.creemMode],
    ["DELETION_IDENTITY_FENCE_MS", previousEnvironment.deletionFenceMs],
  ] as const) {
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
})

describe("account deletion request and billing boundary", () => {
  it("ignores pending billing events owned by another workspace", async () => {
    const t = createBackendTest()
    const primary = await bootstrap(t)
    const other = await bootstrap(t, otherIdentity)

    await t.run(async (ctx) => {
      await ctx.db.insert("billingEvents", {
        attempts: 0,
        createdAt: NOW,
        eventType: "subscription.updated",
        livemode: false,
        payloadJson: "{}",
        provider: "creem",
        providerCreatedAt: NOW,
        providerEventId: "event_other_workspace",
        receivedAt: NOW,
        status: "pending",
        updatedAt: NOW,
        workspaceId: other.account.workspaceId as GenericId<"workspaces">,
      })
    })

    await expect(
      primary.customer.mutation(deleteAccountReference, {
        confirmation: "DELETE",
      }),
    ).resolves.toMatchObject({
      code: "ACCOUNT_DELETION_ACCEPTED",
      state: "accepted",
    })
  })

  it("accepts once, returns the same operation for duplicates, and fences stale credentials", async () => {
    const t = createBackendTest()
    const { accepted, customer } = await acceptedDeletion(t)

    expect(accepted).toMatchObject({
      code: "ACCOUNT_DELETION_ACCEPTED",
      state: "accepted",
    })
    await expect(
      customer.mutation(deleteAccountReference, { confirmation: "DELETE" }),
    ).resolves.toMatchObject({
      code: "ACCOUNT_DELETION_IN_PROGRESS",
      deletionJobId: accepted.deletionJobId,
      state: "in_progress",
    })
    await expect(
      customer.mutation(bootstrapReference, {}),
    ).rejects.toMatchObject({
      data: { code: "ACCOUNT_DISABLED" },
    })
    await expect(
      customer.query(currentWorkspaceReference, {}),
    ).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    })

    const jobs = await t.run(
      async (ctx) => await ctx.db.query("deletionJobs").collect(),
    )
    expect(jobs).toHaveLength(1)
  })

  it.each([
    {
      name: "active entitlement",
      input: {
        activeSideEffectCount: 0,
        checkouts: [],
        pendingBillingEventCount: 0,
        providerConfigured: true,
        providerRuns: [],
        subscriptions: [
          {
            cancelAtPeriodEnd: false,
            entitlementStatus: "active",
            status: "active",
          },
        ],
      },
      code: "BILLING_PORTAL_REQUIRED",
    },
    {
      name: "pending checkout",
      input: {
        activeSideEffectCount: 0,
        checkouts: [{ expiresAt: NOW + 1, status: "open" }],
        pendingBillingEventCount: 0,
        providerConfigured: true,
        providerRuns: [],
        subscriptions: [],
      },
      code: "BILLING_RECONCILIATION_REQUIRED",
    },
    {
      name: "running provider operation",
      input: {
        activeSideEffectCount: 0,
        checkouts: [],
        pendingBillingEventCount: 0,
        providerConfigured: true,
        providerRuns: [{ provider: "creem", status: "running" }],
        subscriptions: [],
      },
      code: "BILLING_RECONCILIATION_REQUIRED",
    },
    {
      name: "pending billing event",
      input: {
        activeSideEffectCount: 0,
        checkouts: [],
        pendingBillingEventCount: 1,
        providerConfigured: true,
        providerRuns: [],
        subscriptions: [],
      },
      code: "BILLING_RECONCILIATION_REQUIRED",
    },
    {
      name: "leased side effect",
      input: {
        activeSideEffectCount: 1,
        checkouts: [],
        pendingBillingEventCount: 0,
        providerConfigured: true,
        providerRuns: [],
        subscriptions: [],
      },
      code: "BILLING_RECONCILIATION_REQUIRED",
    },
    {
      name: "provider uncertainty",
      input: {
        activeSideEffectCount: 0,
        checkouts: [],
        pendingBillingEventCount: 0,
        providerConfigured: false,
        providerRuns: [],
        subscriptions: [],
      },
      code: "BILLING_CONFIGURATION_REQUIRED",
    },
  ])("fails closed for $name", ({ code, input }) => {
    expect(
      evaluateCompositeDeletionBillingGuard({ ...input, checkedAt: NOW }),
    ).toMatchObject({ code })
  })

  it("does not let an expired provider operation block deletion forever", () => {
    expect(
      evaluateCompositeDeletionBillingGuard({
        activeSideEffectCount: 0,
        checkedAt: NOW,
        checkouts: [],
        pendingBillingEventCount: 0,
        providerConfigured: true,
        providerRuns: [
          {
            provider: "creem",
            startedAt: NOW - PROVIDER_OPERATION_STALE_MS,
            status: "running",
          },
        ],
        subscriptions: [],
      }),
    ).toMatchObject({ status: "confirmed_inactive" })
  })

  it("rechecks billing transactionally before quiescence and catches a checkout race", async () => {
    const t = createBackendTest()
    const { accepted, account } = await acceptedDeletion(t)
    const deletionJob = (await persistedJob(t, accepted.deletionJobId))!
    await t.run(async (ctx) => {
      const keywordId = await ctx.db.insert("keywords", {
        createdAt: NOW,
        createdByUserId: account.userId as GenericId<"users">,
        normalizedPhrase: "fence recovery",
        phrase: "Fence recovery",
        platforms: ["x"],
        status: "active",
        updatedAt: NOW,
        workspaceId: account.workspaceId as GenericId<"workspaces">,
      })
      await ctx.db.insert("trackingSources", {
        backoffMs: 0,
        checkpointVersion: 1,
        consecutiveFailures: 0,
        createdAt: NOW,
        deletionPausedAt: deletionJob.accessFencedAt,
        intervalMs: 60_000,
        keywordId,
        leaseVersion: 1,
        nextRunAt: NOW,
        pauseReason: "user",
        providerQuery: "fence recovery",
        sourceType: "x",
        status: "paused",
        totalFailures: 0,
        updatedAt: NOW,
        workspaceId: account.workspaceId as GenericId<"workspaces">,
      })
      const digest = await ctx.db
        .query("digestPreferences")
        .withIndex("by_workspace_and_user", (q) =>
          q
            .eq("workspaceId", account.workspaceId as GenericId<"workspaces">)
            .eq("userId", account.userId as GenericId<"users">),
        )
        .unique()
      await ctx.db.patch(digest!._id, {
        deletionPausedAt: deletionJob.accessFencedAt,
        enabled: false,
        updatedAt: NOW,
      })
      await ctx.db.insert("billingCheckouts", {
        createdAt: NOW,
        expiresAt: NOW + 60_000,
        idempotencyKey: "checkout-race",
        planId: "starter",
        provider: "creem",
        providerCheckoutSessionId: "checkout_race",
        requestedByUserId: account.userId as GenericId<"users">,
        status: "open",
        updatedAt: NOW,
        workspaceId: account.workspaceId as GenericId<"workspaces">,
      })
    })

    await t.mutation(dispatchReference, { now: NOW })
    const claimed = await persistedJob(t, accepted.deletionJobId)
    const lease = leaseArguments(claimed!)
    const started = await t.mutation(startReference, { ...lease, now: NOW })
    expect(started.billingGuard).toMatchObject({
      code: "BILLING_RECONCILIATION_REQUIRED",
      status: "blocked_active",
    })
    await expect(
      t.mutation(beginPurgeReference, {
        ...lease,
        now: NOW,
        providerVerifiedAt: NOW,
      }),
    ).resolves.toEqual({
      code: "BILLING_RECONCILIATION_REQUIRED",
      state: "billing_blocked",
    })
    await expect(
      t.mutation(blockForBillingReference, {
        ...lease,
        code: "BILLING_RECONCILIATION_REQUIRED",
        now: NOW,
      }),
    ).resolves.toEqual({ state: "blocked" })
    const restored = await t.run(async (ctx) => ({
      digest: await ctx.db
        .query("digestPreferences")
        .withIndex("by_workspace_and_user", (q) =>
          q
            .eq("workspaceId", account.workspaceId as GenericId<"workspaces">)
            .eq("userId", account.userId as GenericId<"users">),
        )
        .unique(),
      source: await ctx.db
        .query("trackingSources")
        .withIndex("by_workspace_and_created_at", (q) =>
          q.eq("workspaceId", account.workspaceId as GenericId<"workspaces">),
        )
        .first(),
    }))
    expect(restored.source).toMatchObject({
      pauseReason: "paid",
      status: "paused",
    })
    expect(restored.source?.deletionPausedAt).toBeUndefined()
    expect(restored.digest).toMatchObject({ enabled: true })
    expect(restored.digest?.deletionPausedAt).toBeUndefined()
  })
})

describe("account deletion leases, purge isolation, and ordering", () => {
  it("fences stale leases and converges after an expired-worker crash", async () => {
    const t = createBackendTest()
    const { accepted } = await acceptedDeletion(t)
    await t.mutation(dispatchReference, { now: NOW })
    const first = (await persistedJob(t, accepted.deletionJobId))!
    const oldLease = leaseArguments(first)

    await expect(
      t.mutation(startReference, {
        ...oldLease,
        leaseToken: `${oldLease.leaseToken}-stale`,
        now: NOW,
      }),
    ).resolves.toEqual({ state: "stale_lease" })
    await expect(
      t.mutation(startReference, { ...oldLease, now: NOW }),
    ).resolves.toMatchObject({ state: "ready" })

    const reclaimedAt = NOW + ACCOUNT_DELETION_LEASE_MS + 1
    await t.mutation(dispatchReference, { now: reclaimedAt })
    const reclaimed = (await persistedJob(t, accepted.deletionJobId))!
    expect(reclaimed).toMatchObject({
      attempts: 2,
      leaseVersion: 2,
      status: "leased",
    })
    await expect(
      t.mutation(failAttemptReference, {
        ...oldLease,
        code: "OLD_WORKER_FAILURE",
        now: reclaimedAt,
        retryable: true,
      }),
    ).resolves.toEqual({ state: "stale_lease" })
    expect((await persistedJob(t, accepted.deletionJobId))?.status).toBe(
      "leased",
    )
  })

  it("purges only the selected tenant and exposes identity deletion only after durable verification", async () => {
    const t = createBackendTest()
    const { account: otherAccount } = await bootstrap(t, otherIdentity)
    const { accepted, account, customer } = await acceptedDeletion(t)
    const otherKeywordId = await t.run(
      async (ctx) =>
        await ctx.db.insert("keywords", {
          createdAt: NOW,
          createdByUserId: otherAccount.userId as GenericId<"users">,
          normalizedPhrase: "other tenant",
          phrase: "Other tenant",
          platforms: ["reddit"],
          status: "active",
          updatedAt: NOW,
          workspaceId: otherAccount.workspaceId as GenericId<"workspaces">,
        }),
    )

    await t.mutation(dispatchReference, { now: NOW })
    const claimed = (await persistedJob(t, accepted.deletionJobId))!
    const lease = leaseArguments(claimed)
    await t.mutation(startReference, { ...lease, now: NOW })
    await expect(t.query(identityContextReference, lease)).resolves.toEqual({
      state: "not_ready",
    })
    await expect(
      t.mutation(beginPurgeReference, {
        ...lease,
        now: NOW,
        providerVerifiedAt: NOW,
      }),
    ).resolves.toEqual({ state: "ready" })
    await expect(
      customer.query(currentWorkspaceReference, {}),
    ).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    })

    for (const _stage of ACCOUNT_DELETION_PURGE_STAGES) {
      await expect(
        t.mutation(purgeBatchReference, { ...lease, now: NOW }),
      ).resolves.toMatchObject({ state: "advanced" })
    }
    await expect(t.query(identityContextReference, lease)).resolves.toEqual({
      state: "not_ready",
    })
    await expect(
      t.mutation(verifyDataReference, { ...lease, now: NOW }),
    ).resolves.toEqual({ state: "verified" })
    await expect(t.query(identityContextReference, lease)).resolves.toEqual({
      clerkUserId: primaryIdentity.subject,
      state: "ready",
    })

    const retained = await t.run(async (ctx) => ({
      deletedKeyword: await ctx.db.get("keywords", otherKeywordId),
      deletedUser: await ctx.db.get(
        "users",
        account.userId as GenericId<"users">,
      ),
      otherWorkspace: await ctx.db.get(
        "workspaces",
        otherAccount.workspaceId as GenericId<"workspaces">,
      ),
    }))
    expect(retained.deletedKeyword?.workspaceId).toBe(otherAccount.workspaceId)
    expect(retained.otherWorkspace).not.toBeNull()
    expect(retained.deletedUser).toMatchObject({
      clerkUserId: primaryIdentity.subject,
      deletedAt: NOW,
      disabledAt: NOW,
    })
  })

  it("never auto-claims a legacy job without the current workflow version", async () => {
    const t = createBackendTest()
    const { account } = await bootstrap(t)
    const legacyId = await t.run(
      async (ctx) =>
        await ctx.db.insert("deletionJobs", {
          accountUserId: account.userId as GenericId<"users">,
          attempts: 0,
          billingGuardStatus: "confirmed_inactive",
          createdAt: NOW,
          idempotencyKey: "legacy-delete",
          kind: "account",
          maxAttempts: 10,
          nextAttemptAt: NOW,
          requestedByUserId: account.userId as GenericId<"users">,
          scheduledAt: NOW,
          status: "pending",
          updatedAt: NOW,
          workspaceId: account.workspaceId as GenericId<"workspaces">,
        }),
    )

    await expect(t.mutation(dispatchReference, { now: NOW })).resolves.toEqual({
      claimed: 0,
      dead: 0,
      state: "dispatched",
    })
    expect((await persistedJob(t, legacyId))?.status).toBe("pending")
  })
})

describe("account deletion model and Clerk outcomes", () => {
  it("uses monotonic lease fencing and bounded retry plans", () => {
    expect(
      canClaimDeletionJob({ now: NOW, status: "pending", nextAttemptAt: NOW }),
    ).toBe(true)
    const lease = createDeletionLease({
      attempts: 2,
      jobId: "job",
      leaseVersion: 4,
      now: NOW,
    })
    expect(lease).toMatchObject({ attempts: 3, version: 5 })
    expect(
      createDeletionContinuationLease({
        attempts: lease.attempts,
        jobId: "job",
        leaseVersion: lease.version,
        now: NOW,
      }),
    ).toMatchObject({ attempts: 3, version: 6 })
    expect(
      planDeletionFailure({
        attempts: 3,
        maxAttempts: 10,
        now: NOW,
        retryable: true,
      }),
    ).toMatchObject({ status: "failed" })
    expect(
      planDeletionFailure({
        attempts: 3,
        maxAttempts: 10,
        now: NOW,
        retryable: false,
      }),
    ).toEqual({ status: "dead" })
  })

  it("classifies Clerk success, absence, transient, permanent, and configuration outcomes", async () => {
    const calls: string[] = []
    const success = createClerkAdminClient({
      secretKey: "sk_test_fixture",
      fetch: vi.fn(async (_input, init) => {
        calls.push(init?.method ?? "GET")
        if (init?.method === "DELETE") {
          return new Response("{}", { status: 200 })
        }
        return new Response(JSON.stringify({ id: "user_fixture" }), {
          status: 200,
        })
      }),
    })
    await expect(success.getUserState("user_fixture")).resolves.toBe("present")
    await expect(success.deleteUser("user_fixture")).resolves.toBe("deleted")
    expect(calls).toEqual(["GET", "DELETE"])

    const absent = createClerkAdminClient({
      secretKey: "sk_test_fixture",
      fetch: vi.fn(async () => new Response(null, { status: 404 })),
    })
    await expect(absent.getUserState("user_missing")).resolves.toBe("absent")
    await expect(absent.deleteUser("user_missing")).resolves.toBe("absent")

    for (const [status, retryable] of [
      [503, true],
      [400, false],
    ] as const) {
      const client = createClerkAdminClient({
        secretKey: "sk_test_fixture",
        fetch: vi.fn(async () => new Response("{}", { status })),
      })
      await expect(client.getUserState("user_fixture")).rejects.toMatchObject({
        code: `HTTP_${status}`,
        retryable,
      })
    }
    expect(() =>
      createClerkAdminClient({ secretKey: "", timeoutMs: 0 }),
    ).toThrowError(ClerkIntegrationError)
  })

  it("runs the durable worker through purge, Clerk verification, security fence, and completion", async () => {
    const t = createBackendTest()
    const { accepted, account } = await acceptedDeletion(t)
    const clerkCalls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        clerkCalls.push(init?.method ?? "GET")
        if (clerkCalls.length === 1) {
          return new Response(JSON.stringify({ id: primaryIdentity.subject }), {
            status: 200,
          })
        }
        if (clerkCalls.length === 2) {
          return new Response("{}", { status: 200 })
        }
        return new Response(null, { status: 404 })
      }),
    )

    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()
    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()
    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()
    const fenced = await persistedJob(t, accepted.deletionJobId)
    expect(fenced).toMatchObject({
      attempts: 1,
      phase: "security_fence",
      status: "pending",
      workflowVersion: ACCOUNT_DELETION_WORKFLOW_VERSION,
    })
    expect(fenced?.dataDeletionVerifiedAt).toEqual(expect.any(Number))
    expect(fenced?.identityDeletionVerifiedAt).toBe(
      fenced?.dataDeletionVerifiedAt,
    )
    expect(fenced?.nextAttemptAt).toBe(fenced?.securityFenceExpiresAt)
    expect(
      (fenced?.securityFenceExpiresAt ?? 0) -
        (fenced?.identityDeletionVerifiedAt ?? 0),
    ).toBe(FENCE_MS)
    expect(clerkCalls).toEqual(["GET", "DELETE", "GET"])

    await vi.advanceTimersByTimeAsync(FENCE_MS)
    await t.finishInProgressScheduledFunctions()
    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()
    expect(await persistedJob(t, accepted.deletionJobId)).toMatchObject({
      completedAt: expect.any(Number),
      phase: "done",
      status: "completed",
    })
    const erased = await t.run(async (ctx) => ({
      user: await ctx.db.get("users", account.userId as GenericId<"users">),
      workspace: await ctx.db.get(
        "workspaces",
        account.workspaceId as GenericId<"workspaces">,
      ),
    }))
    expect(erased).toEqual({ user: null, workspace: null })
  })
})
