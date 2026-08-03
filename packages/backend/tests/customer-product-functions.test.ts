import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { convexTest } from "convex-test"
import {
  defineSchema,
  defineTable,
  makeFunctionReference,
  type UserIdentity,
} from "convex/server"
import { v } from "convex/values"
import { afterEach, describe, expect, it, vi } from "vitest"

const customerTestSchema = defineSchema({
  auditEvents: defineTable(v.any()),
  categories: defineTable(v.any())
    .index("by_workspace_and_system_key", ["workspaceId", "systemKey"])
    .index("by_workspace_normalized_name_and_deleted_at", [
      "workspaceId",
      "normalizedName",
      "deletedAt",
    ])
    .index("by_workspace_deleted_enabled_and_sort_order", [
      "workspaceId",
      "deletedAt",
      "enabled",
      "sortOrder",
    ])
    .index("by_workspace_and_sort_order", ["workspaceId", "sortOrder"]),
  deletionJobs: defineTable(v.any())
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"])
    .index("by_account_user_and_created_at", ["accountUserId", "createdAt"])
    .index("by_account_user_kind_and_created_at", [
      "accountUserId",
      "kind",
      "createdAt",
    ]),
  billingCheckouts: defineTable(v.any())
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"])
    .index("by_workspace_plan_and_created_at", [
      "workspaceId",
      "planId",
      "createdAt",
    ])
    .index("by_workspace_status_and_expires_at", [
      "workspaceId",
      "status",
      "expiresAt",
    ])
    .index("by_workspace_status_plan_and_completed_at", [
      "workspaceId",
      "status",
      "planId",
      "completedAt",
    ]),
  billingEvents: defineTable(v.any())
    .index("by_status_and_received_at", ["status", "receivedAt"])
    .index("by_workspace_and_received_at", ["workspaceId", "receivedAt"])
    .index("by_workspace_status_and_received_at", [
      "workspaceId",
      "status",
      "receivedAt",
    ]),
  emailOutbox: defineTable(v.any())
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"])
    .index("by_workspace_status_and_lease_expires_at", [
      "workspaceId",
      "status",
      "leaseExpiresAt",
    ]),
  digestPreferences: defineTable(v.any()).index("by_workspace_and_user", [
    "workspaceId",
    "userId",
  ]),
  keywords: defineTable(v.any())
    .index("by_workspace_status_and_created_at", [
      "workspaceId",
      "status",
      "createdAt",
    ])
    .index("by_workspace_and_updated_at", ["workspaceId", "updatedAt"]),
  mentions: defineTable(v.any()).index(
    "by_workspace_category_and_published_at",
    ["workspaceId", "categoryId", "publishedAt"],
  ),
  savedViews: defineTable(v.any())
    .index("by_workspace_user_normalized_name_and_deleted_at", [
      "workspaceId",
      "userId",
      "normalizedName",
      "deletedAt",
    ])
    .index("by_workspace_user_deleted_and_position", [
      "workspaceId",
      "userId",
      "deletedAt",
      "position",
    ])
    .index("by_workspace_deleted_and_updated_at", [
      "workspaceId",
      "deletedAt",
      "updatedAt",
    ]),
  subscriptions: defineTable(v.any())
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_last_synced_at", ["workspaceId", "lastSyncedAt"])
    .index("by_workspace_plan_and_last_synced_at", [
      "workspaceId",
      "planId",
      "lastSyncedAt",
    ]),
  systemMetricBuckets: defineTable(v.any()).index(
    "by_metric_scope_workspace_granularity_and_bucket",
    ["metric", "scope", "workspaceId", "granularity", "bucketStartAt"],
  ),
  providerRuns: defineTable(v.any()).index(
    "by_workspace_status_and_started_at",
    ["workspaceId", "status", "startedAt"],
  ),
  usageCycles: defineTable(v.any()).index(
    "by_workspace_status_and_period_end",
    ["workspaceId", "status", "periodEndAt"],
  ),
  users: defineTable(v.any())
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_token_identifier", ["tokenIdentifier"]),
  workspaceMembers: defineTable(v.any())
    .index("by_workspace_and_user", ["workspaceId", "userId"])
    .index("by_workspace", ["workspaceId"]),
  workspaces: defineTable(v.any()).index("by_owner_and_kind", [
    "ownerUserId",
    "kind",
  ]),
})

afterEach(() => {
  vi.useRealTimers()
})

const modules = {
  "convex/_generated/server.ts": async () => ({}),
  "convex/billing/customer.ts": () => import("../convex/billing/customer"),
  "convex/categories.ts": () => import("../convex/categories"),
  "convex/savedViews.ts": () => import("../convex/savedViews"),
  "convex/settings.ts": () => import("../convex/settings"),
  "convex/users.ts": () => import("../convex/users"),
  "convex/workspaces.ts": () => import("../convex/workspaces"),
}

const identity = {
  email: "owner@example.com",
  issuer: "https://clerk.example.test",
  name: "Workspace Owner",
  subject: "user_clerk_customer",
  tokenIdentifier: "https://clerk.example.test|user_clerk_customer",
} satisfies Partial<UserIdentity>

const bootstrapCurrentUser = makeFunctionReference<"mutation">(
  "users:bootstrapCurrentUser",
)
const getCurrentUser = makeFunctionReference<"query">("users:getCurrentUser")
const getBillingOverview = makeFunctionReference<"query">(
  "billing/customer:getBillingOverview",
)
const updateCurrentUser = makeFunctionReference<"mutation">(
  "users:updateCurrentUser",
)
const getCurrentWorkspace = makeFunctionReference<"query">(
  "workspaces:getCurrentWorkspace",
)
const updateCurrentWorkspace = makeFunctionReference<"mutation">(
  "workspaces:updateCurrentWorkspace",
)
const deleteAccount = makeFunctionReference<"mutation">(
  "workspaces:deleteAccount",
)
const getAccountDeletionReadiness = makeFunctionReference<"query">(
  "workspaces:getAccountDeletionReadiness",
)
const getAccountDeletionStatus = makeFunctionReference<"query">(
  "workspaces:getAccountDeletionStatus",
)
const listCategories = makeFunctionReference<"query">(
  "categories:listCategories",
)
const createCategory = makeFunctionReference<"mutation">(
  "categories:createCategory",
)
const updateCategory = makeFunctionReference<"mutation">(
  "categories:updateCategory",
)
const deleteCategory = makeFunctionReference<"mutation">(
  "categories:deleteCategory",
)
const listSavedViews = makeFunctionReference<"query">(
  "savedViews:listSavedViews",
)
const createSavedView = makeFunctionReference<"mutation">(
  "savedViews:createSavedView",
)
const reorderSavedViews = makeFunctionReference<"mutation">(
  "savedViews:reorderSavedViews",
)
const getSettings = makeFunctionReference<"query">("settings:getSettings")
const updateDigestPreferences = makeFunctionReference<"mutation">(
  "settings:updateDigestPreferences",
)

async function bootstrappedCustomer() {
  const t = convexTest({ modules, schema: customerTestSchema })
  const customer = t.withIdentity(identity)
  const bootstrap = (await customer.mutation(bootstrapCurrentUser, {})) as {
    userId: string
    workspaceId: string
  }
  return { bootstrap, customer, t }
}

describe("customer user and workspace functions", () => {
  it("bootstraps and derives the current account without client tenant ids", async () => {
    const { bootstrap, customer } = await bootstrappedCustomer()

    await expect(customer.query(getCurrentUser, {})).resolves.toMatchObject({
      clerkUserId: identity.subject,
      email: identity.email,
      id: bootstrap.userId,
      name: identity.name,
    })
    await expect(customer.query(getCurrentWorkspace, {})).resolves.toEqual({
      keywordCount: 0,
      membership: { role: "owner" },
      onboardingComplete: false,
      user: {
        clerkUserId: identity.subject,
        email: identity.email,
        id: bootstrap.userId,
        name: identity.name,
      },
      workspace: {
        id: bootstrap.workspaceId,
        kind: "personal",
        name: "Personal workspace",
      },
    })

    await expect(
      customer.mutation(updateCurrentUser, { name: "  Updated Owner  " }),
    ).resolves.toMatchObject({ name: "Updated Owner" })
    await expect(
      customer.mutation(updateCurrentWorkspace, { name: "  Launch Watch  " }),
    ).resolves.toMatchObject({ name: "Launch Watch" })
  })

  it("counts only indexed live keyword states during workspace bootstrap", async () => {
    const { bootstrap, customer, t } = await bootstrappedCustomer()
    await t.run(async (ctx) => {
      const now = Date.now()
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("keywords", {
          createdAt: now - index,
          deletedAt: now,
          status: "deleted",
          updatedAt: now,
          workspaceId: bootstrap.workspaceId,
        })
      }
      for (const [index, status] of ["active", "paused"].entries()) {
        await ctx.db.insert("keywords", {
          createdAt: now + index,
          status,
          updatedAt: now + index,
          workspaceId: bootstrap.workspaceId,
        })
      }
    })

    await expect(
      customer.query(getCurrentWorkspace, {}),
    ).resolves.toMatchObject({
      keywordCount: 2,
      onboardingComplete: true,
    })
  })

  it("derives billing context without a client-supplied workspace id", async () => {
    const { customer } = await bootstrappedCustomer()

    await expect(
      customer.query(getBillingOverview, { now: Date.now() }),
    ).resolves.toMatchObject({
      providerState: expect.stringMatching(
        /^(configured|provider_unconfigured)$/u,
      ),
      subscription: null,
      usage: null,
    })
  })

  it("derives entitlement from the caller's refreshable time", async () => {
    const { bootstrap, customer, t } = await bootstrappedCustomer()
    const now = Date.now()
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        cancelAtPeriodEnd: false,
        createdAt: now,
        currentPeriodEnd: now + 1_000,
        currentPeriodStart: now - 1_000,
        entitlementStatus: "active",
        lastSyncedAt: now,
        planId: "starter",
        provider: "creem",
        providerCustomerId: "cust_refreshable_time",
        providerSubscriptionId: "sub_refreshable_time",
        status: "active",
        updatedAt: now,
        workspaceId: bootstrap.workspaceId as never,
      })
    })

    await expect(
      customer.query(getBillingOverview, { now }),
    ).resolves.toMatchObject({
      subscription: { entitlementStatus: "active" },
    })
    await expect(
      customer.query(getBillingOverview, { now: now + 1_000 }),
    ).resolves.toMatchObject({
      subscription: { entitlementStatus: "inactive" },
    })
  })

  it("stages portal-blocked deletion before scheduling the inactive job", async () => {
    const { bootstrap, customer, t } = await bootstrappedCustomer()
    const now = Date.now()
    const subscriptionId = await t.run(
      async (ctx) =>
        await ctx.db.insert("subscriptions", {
          cancelAtPeriodEnd: true,
          createdAt: now,
          currentPeriodEnd: now + 86_400_000,
          currentPeriodStart: now,
          entitlementStatus: "active",
          lastSyncedAt: now,
          planId: "starter",
          provider: "creem",
          providerCustomerId: "cust_fixture",
          providerSubscriptionId: "sub_fixture",
          status: "active",
          updatedAt: now,
          workspaceId: bootstrap.workspaceId as never,
        }),
    )
    await expect(
      customer.query(getAccountDeletionReadiness, {}),
    ).resolves.toMatchObject({
      code: "BILLING_PORTAL_REQUIRED",
      state: "portal_required",
    })

    await expect(
      customer.mutation(deleteAccount, { confirmation: "DELETE" }),
    ).resolves.toMatchObject({
      code: "BILLING_PORTAL_REQUIRED",
      deletionJobId: expect.any(String),
      state: "portal_required",
    })
    const blocked = await t.run(
      async (ctx) => await ctx.db.query("deletionJobs").collect(),
    )
    expect(blocked).toHaveLength(1)
    expect(blocked[0]).toMatchObject({
      billingGuardStatus: "blocked_active",
      kind: "account",
      lastError: "BILLING_PORTAL_REQUIRED",
      status: "blocked",
    })

    await t.run(async (ctx) => {
      await ctx.db.patch(subscriptionId, {
        cancelAtPeriodEnd: false,
        entitlementStatus: "inactive",
        status: "canceled",
      })
    })
    const previousApiKey = process.env.CREEM_API_KEY
    const previousMode = process.env.CREEM_MODE
    process.env.CREEM_API_KEY = "creem_test_fixture"
    process.env.CREEM_MODE = "test"
    await expect(
      customer.mutation(deleteAccount, { confirmation: "DELETE" }),
    ).resolves.toMatchObject({
      code: "ACCOUNT_DELETION_ACCEPTED",
      deletionJobId: expect.any(String),
      state: "accepted",
    })
    if (previousApiKey === undefined) {
      delete process.env.CREEM_API_KEY
    } else {
      process.env.CREEM_API_KEY = previousApiKey
    }
    if (previousMode === undefined) {
      delete process.env.CREEM_MODE
    } else {
      process.env.CREEM_MODE = previousMode
    }

    const persisted = await t.run(async (ctx) => ({
      jobs: await ctx.db.query("deletionJobs").collect(),
      user: await ctx.db.get(bootstrap.userId as never),
      workspace: await ctx.db.get(bootstrap.workspaceId as never),
    }))
    expect(persisted.jobs).toHaveLength(1)
    expect(persisted.jobs[0]).toMatchObject({
      billingGuardStatus: "confirmed_inactive",
      kind: "account",
      status: "pending",
    })
    expect(persisted.user?.deletedAt).toBeUndefined()
    expect(persisted.workspace?.deletedAt).toBeUndefined()
  })

  it("creates a new deletion generation after operator cancellation", async () => {
    const { bootstrap, customer, t } = await bootstrappedCustomer()
    const now = Date.now()
    const canceledId = await t.run(
      async (ctx) =>
        await ctx.db.insert("deletionJobs", {
          accountUserId: bootstrap.userId,
          accessFencedAt: now - 1,
          attempts: 0,
          billingGuardStatus: "confirmed_inactive",
          createdAt: now - 1,
          generation: 1,
          idempotencyKey: `account:${bootstrap.userId}:1`,
          identityClerkUserId: identity.subject,
          kind: "account",
          leaseVersion: 0,
          maxAttempts: 10,
          operationId: `account:${bootstrap.userId}:1`,
          phase: "billing_check",
          requestedByUserId: bootstrap.userId,
          resourceKey: `account:${bootstrap.userId}`,
          scheduledAt: now - 1,
          status: "canceled",
          updatedAt: now - 1,
          workflowVersion: 2,
          workspaceId: bootstrap.workspaceId,
        }),
    )
    const previousApiKey = process.env.CREEM_API_KEY
    const previousMode = process.env.CREEM_MODE
    process.env.CREEM_API_KEY = "creem_test_fixture"
    process.env.CREEM_MODE = "test"
    try {
      await expect(
        customer.query(getAccountDeletionReadiness, {}),
      ).resolves.toEqual({ state: "available" })
      await expect(
        customer.query(getAccountDeletionStatus, {}),
      ).resolves.toEqual({ state: "available" })

      const accepted = (await customer.mutation(deleteAccount, {
        confirmation: "DELETE",
      })) as { deletionJobId: string; state: string }
      expect(accepted).toMatchObject({
        deletionJobId: expect.any(String),
        state: "accepted",
      })
      expect(accepted.deletionJobId).not.toBe(String(canceledId))
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.CREEM_API_KEY
      } else {
        process.env.CREEM_API_KEY = previousApiKey
      }
      if (previousMode === undefined) {
        delete process.env.CREEM_MODE
      } else {
        process.env.CREEM_MODE = previousMode
      }
    }

    const jobs = await t.run(
      async (ctx) => await ctx.db.query("deletionJobs").collect(),
    )
    expect(jobs).toHaveLength(2)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generation: 2,
          status: "pending",
          supersedesJobId: canceledId,
        }),
      ]),
    )
  })
})

describe("customer category functions", () => {
  it("rejects category creation at the active catalog limit", async () => {
    const { bootstrap, customer, t } = await bootstrappedCustomer()
    await t.run(async (ctx) => {
      for (let index = 0; index < 43; index += 1) {
        const now = Date.now() + index
        await ctx.db.insert("categories", {
          colorToken: "blue",
          createdAt: now,
          description: `Custom category ${index}`,
          enabled: true,
          isSystem: false,
          name: `Custom ${index}`,
          normalizedName: `custom ${index}`,
          sortOrder: 7 + index,
          updatedAt: now,
          workspaceId: bootstrap.workspaceId,
        })
      }
    })

    await expect(
      customer.mutation(createCategory, {
        colorToken: "cyan",
        description: "One category too many",
        name: "Overflow",
      }),
    ).rejects.toMatchObject({ data: { code: "CATEGORY_LIMIT_REACHED" } })
  })

  it("preserves default and Other invariants while soft-deleting custom categories", async () => {
    const { bootstrap, customer, t } = await bootstrappedCustomer()
    const defaults = (await customer.query(listCategories, {})) as Array<{
      id: string
      name: string
      systemKey?: string
    }>
    expect(defaults).toHaveLength(7)
    const other = defaults.find((category) => category.systemKey === "other")
    expect(other).toMatchObject({ name: "Other" })

    await expect(
      customer.mutation(updateCategory, {
        categoryId: other?.id,
        enabled: false,
      }),
    ).rejects.toMatchObject({ data: { code: "OTHER_CATEGORY_IMMUTABLE" } })

    const custom = (await customer.mutation(createCategory, {
      colorToken: "cyan",
      description: "Purchase intent and evaluation questions",
      name: "Sales Lead",
    })) as { id: string }
    await expect(
      customer.mutation(createCategory, {
        colorToken: "blue",
        description: "Duplicate",
        name: " sales lead ",
      }),
    ).rejects.toMatchObject({ data: { code: "CATEGORY_NAME_CONFLICT" } })
    await customer.mutation(createSavedView, {
      filters: { categoryIds: [custom.id, other!.id] },
      icon: "funnel",
      name: "Sales leads",
      sort: "newest",
    })
    await customer.mutation(updateCategory, {
      categoryId: custom.id,
      enabled: false,
    })
    let savedViews = (await customer.query(listSavedViews, {})) as Array<{
      filters: { categoryIds?: string[] }
      name: string
    }>
    expect(
      savedViews.find(({ name }) => name === "Sales leads")?.filters
        .categoryIds,
    ).toEqual([other?.id])
    await customer.mutation(updateCategory, {
      categoryId: custom.id,
      enabled: true,
    })
    await customer.mutation(createSavedView, {
      filters: { categoryIds: [custom.id, other!.id] },
      icon: "funnel",
      name: "Sales leads for deletion",
      sort: "newest",
    })

    await t.run(async (ctx) => {
      for (let index = 0; index < 205; index += 1) {
        await ctx.db.insert("mentions", {
          categoryId: custom.id,
          publishedAt: index,
          workspaceId: bootstrap.workspaceId,
        })
      }
    })
    vi.useFakeTimers()
    await expect(
      customer.mutation(deleteCategory, { categoryId: custom.id }),
    ).resolves.toEqual({ state: "accepted" })
    await expect(customer.query(listCategories, {})).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: custom.id,
        }),
      ]),
    )
    await expect(
      customer.mutation(updateCategory, {
        categoryId: custom.id,
        name: "Too late",
      }),
    ).rejects.toMatchObject({ data: { code: "CATEGORY_NOT_FOUND" } })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const row = await t.run(async (ctx) => await ctx.db.get(custom.id as never))
    expect(row).toMatchObject({ enabled: false })
    expect(row?.deletedAt).toEqual(expect.any(Number))
    const reassigned = await t.run(
      async (ctx) => await ctx.db.query("mentions").collect(),
    )
    expect(reassigned).toHaveLength(205)
    expect(
      reassigned.every((mention) => mention.categoryId === other?.id),
    ).toBe(true)
    savedViews = (await customer.query(listSavedViews, {})) as Array<{
      filters: { categoryIds?: string[] }
      name: string
    }>
    expect(
      savedViews.find(({ name }) => name === "Sales leads for deletion")
        ?.filters.categoryIds,
    ).toEqual([other?.id])
  })
})

describe("customer saved view functions", () => {
  it("returns All Mentions first without persisting it", async () => {
    const { customer, t } = await bootstrappedCustomer()
    await expect(customer.query(listSavedViews, {})).resolves.toEqual([
      {
        filters: {},
        icon: "funnel",
        id: "all-mentions",
        name: "All Mentions",
        position: 0,
        sort: "newest",
      },
    ])

    const saved = (await customer.mutation(createSavedView, {
      filters: { mentionStatuses: ["saved"] },
      icon: "funnel",
      name: "Saved mentions",
      sort: "newest",
    })) as { id: string }
    await expect(
      customer.mutation(createSavedView, {
        filters: {},
        icon: "funnel",
        name: " all mentions ",
        sort: "newest",
      }),
    ).rejects.toMatchObject({ data: { code: "INVALID_SAVED_VIEW" } })

    await expect(
      customer.mutation(reorderSavedViews, {
        savedViewIds: ["all-mentions", saved.id],
      }),
    ).resolves.toBeNull()
    const persisted = await t.run(
      async (ctx) => await ctx.db.query("savedViews").collect(),
    )
    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.name).toBe("Saved mentions")
  })

  it("rejects creation after fifty active saved views", async () => {
    const { bootstrap, customer, t } = await bootstrappedCustomer()
    await t.run(async (ctx) => {
      for (let index = 0; index < 50; index += 1) {
        await ctx.db.insert("savedViews", {
          createdAt: index,
          filters: {},
          icon: "funnel",
          name: `View ${index + 1}`,
          normalizedName: `view ${index + 1}`,
          position: index + 1,
          sort: "newest",
          updatedAt: index,
          userId: bootstrap.userId,
          workspaceId: bootstrap.workspaceId,
        })
      }
    })

    await expect(
      customer.mutation(createSavedView, {
        filters: {},
        icon: "funnel",
        name: "One too many",
        sort: "newest",
      }),
    ).rejects.toMatchObject({
      data: { code: "SAVED_VIEW_LIMIT_EXCEEDED" },
    })
    await expect(customer.query(listSavedViews, {})).resolves.toHaveLength(51)
  })
})

describe("customer settings functions", () => {
  it("returns initialized settings and rejects invalid timezone or local time", async () => {
    const { customer } = await bootstrappedCustomer()
    await expect(customer.query(getSettings, {})).resolves.toMatchObject({
      digest: {
        enabled: true,
        hour: 9,
        mentionLimit: 20,
        minute: 0,
        timeZone: "UTC",
      },
    })

    await expect(
      customer.mutation(updateDigestPreferences, {
        enabled: true,
        hour: 24,
        mentionLimit: 20,
        minute: 0,
        timeZone: "UTC",
      }),
    ).rejects.toMatchObject({ data: { code: "INVALID_DIGEST_PREFERENCE" } })
    await expect(
      customer.mutation(updateDigestPreferences, {
        enabled: true,
        hour: 8,
        mentionLimit: 25,
        minute: 30,
        timeZone: "Not/A_Timezone",
      }),
    ).rejects.toMatchObject({ data: { code: "INVALID_DIGEST_PREFERENCE" } })
    await expect(
      customer.mutation(updateDigestPreferences, {
        enabled: false,
        hour: 8,
        mentionLimit: 25,
        minute: 30,
        timeZone: "America/New_York",
      }),
    ).resolves.toMatchObject({
      digest: {
        enabled: false,
        hour: 8,
        mentionLimit: 25,
        minute: 30,
        timeZone: "America/New_York",
      },
    })
  })
})

describe("customer frontend function inventory", () => {
  it("exports exact names through authenticated wrappers and avoids direct deletion", () => {
    const convexDirectory = fileURLToPath(
      new URL("../convex/", import.meta.url),
    )
    const sources = Object.fromEntries(
      ["users", "workspaces", "categories", "savedViews", "settings"].map(
        (name) => [name, readFileSync(`${convexDirectory}/${name}.ts`, "utf8")],
      ),
    )
    const deletionBillingSource = readFileSync(
      `${convexDirectory}/deletion/billing.ts`,
      "utf8",
    )

    for (const name of [
      "bootstrapCurrentUser",
      "getCurrentUser",
      "updateCurrentUser",
    ]) {
      expect(sources.users).toContain(`export const ${name}`)
    }
    for (const name of [
      "getCurrentWorkspace",
      "updateCurrentWorkspace",
      "getAccountDeletionReadiness",
      "getAccountDeletionStatus",
      "deleteAccount",
    ]) {
      expect(sources.workspaces).toContain(`export const ${name}`)
    }
    for (const name of [
      "listCategories",
      "createCategory",
      "updateCategory",
      "deleteCategory",
    ]) {
      expect(sources.categories).toContain(`export const ${name}`)
    }
    for (const name of [
      "listSavedViews",
      "createSavedView",
      "updateSavedView",
      "reorderSavedViews",
      "deleteSavedView",
    ]) {
      expect(sources.savedViews).toContain(`export const ${name}`)
    }
    expect(sources.settings).toContain("export const getSettings")
    expect(sources.settings).toContain("export const updateDigestPreferences")

    for (const source of Object.values(sources)) {
      expect(source).toMatch(/authenticated(Query|Mutation)/)
      expect(source).not.toContain("ctx.db.delete(")
    }
    expect(sources.workspaces).toContain('"deletionJobs"')
    expect(sources.workspaces).toContain("withoutUndefinedValues")
    const keywordCountQuery = sources.workspaces.slice(
      sources.workspaces.indexOf("async function activeKeywordCount"),
      sources.workspaces.indexOf("export const getCurrentWorkspace"),
    )
    expect(keywordCountQuery).toContain('"by_workspace_status_and_created_at"')
    expect(keywordCountQuery).toContain('["active", "paused"]')
    expect(keywordCountQuery).not.toContain('"by_workspace_and_updated_at"')
    expect(deletionBillingSource).toContain(
      '"by_workspace_status_and_received_at"',
    )
    expect(deletionBillingSource).toContain('.eq("status", "pending")')
    expect(deletionBillingSource).toContain('.eq("status", "leased")')
    expect(deletionBillingSource).not.toContain(
      '.query("billingEvents")\n      .withIndex("by_workspace_and_received_at"',
    )
  })
})
