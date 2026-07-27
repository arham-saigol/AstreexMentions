import { convexTest } from "convex-test"
import {
  defineSchema,
  defineTable,
  makeFunctionReference,
  type UserIdentity,
} from "convex/server"
import { v } from "convex/values"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const schema = defineSchema({
  auditEvents: defineTable(v.any()).index("by_target_and_created_at", [
    "targetType",
    "targetId",
    "createdAt",
  ]),
  categories: defineTable(v.any()).index("by_workspace_and_system_key", [
    "workspaceId",
    "systemKey",
  ]),
  categorizationJobs: defineTable(v.any()),
  changelogEntries: defineTable(v.any())
    .index("by_slug", ["slug"])
    .index("by_status_and_published_at", ["status", "publishedAt"])
    .index("by_status_and_updated_at", ["status", "updatedAt"])
    .index("by_updated_at", ["updatedAt"]),
  digestPreferences: defineTable(v.any())
    .index("by_workspace_and_user", ["workspaceId", "userId"])
    .index("by_workspace_and_updated_at", ["workspaceId", "updatedAt"]),
  deletionJobs: defineTable(v.any())
    .index("by_resource_key_and_created_at", ["resourceKey", "createdAt"])
    .index("by_kind_and_created_at", ["kind", "createdAt"])
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"]),
  featureRequests: defineTable(v.any())
    .index("by_workspace_creator_and_created_at", [
      "workspaceId",
      "createdByUserId",
      "createdAt",
    ])
    .index("by_creator_and_created_at", ["createdByUserId", "createdAt"])
    .index("by_created_at", ["createdAt"])
    .index("by_status_and_created_at", ["status", "createdAt"])
    .searchIndex("search_content", {
      searchField: "searchText",
      filterFields: ["status"],
    }),
  mentions: defineTable(v.any()),
  keywords: defineTable(v.any()),
  providerMetricBuckets: defineTable(v.any()).index(
    "by_granularity_and_bucket",
    ["granularity", "bucketStartAt"],
  ),
  subscriptions: defineTable(v.any()).index("by_workspace_and_last_synced_at", [
    "workspaceId",
    "lastSyncedAt",
  ]),
  systemMetricBuckets: defineTable(v.any())
    .index("by_granularity_and_bucket", ["granularity", "bucketStartAt"])
    .index("by_scope_granularity_and_bucket", [
      "scope",
      "granularity",
      "bucketStartAt",
    ])
    .index("by_metric_scope_workspace_granularity_and_bucket", [
      "metric",
      "scope",
      "workspaceId",
      "granularity",
      "bucketStartAt",
    ]),
  trackingSources: defineTable(v.any()).index("by_workspace_and_created_at", [
    "workspaceId",
    "createdAt",
  ]),
  usageCycles: defineTable(v.any()).index(
    "by_workspace_status_and_period_end",
    ["workspaceId", "status", "periodEndAt"],
  ),
  users: defineTable(v.any())
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_token_identifier", ["tokenIdentifier"]),
  workspaceMembers: defineTable(v.any()).index("by_workspace_and_user", [
    "workspaceId",
    "userId",
  ]),
  workspaces: defineTable(v.any())
    .index("by_owner_and_kind", ["ownerUserId", "kind"])
    .index("by_last_mention_at", ["lastMentionAt"]),
})

const modules = {
  "convex/_generated/server.ts": async () => ({}),
  "convex/admin.ts": () => import("../convex/admin"),
  "convex/changelog.ts": () => import("../convex/changelog"),
  "convex/featureRequests.ts": () => import("../convex/featureRequests"),
  "convex/users.ts": () => import("../convex/users"),
}

const customerIdentity = {
  email: "customer@example.com",
  issuer: "https://clerk.example.test",
  name: "Customer",
  subject: "user_customer",
  tokenIdentifier: "https://clerk.example.test|user_customer",
} satisfies Partial<UserIdentity>

const adminIdentity = {
  email: "admin@example.com",
  issuer: "https://clerk.example.test",
  name: "Admin",
  subject: "user_admin",
  tokenIdentifier: "https://clerk.example.test|user_admin",
} satisfies Partial<UserIdentity>

const bootstrapCurrentUser = makeFunctionReference<"mutation">(
  "users:bootstrapCurrentUser",
)
const createFeatureRequest = makeFunctionReference<"mutation">(
  "featureRequests:createFeatureRequest",
)
const listMyFeatureRequests = makeFunctionReference<"query">(
  "featureRequests:listMyFeatureRequests",
)
const listPublishedEntries = makeFunctionReference<"query">(
  "changelog:listPublishedEntries",
)
const getPublishedEntry = makeFunctionReference<"query">(
  "changelog:getPublishedEntry",
)
const getMetricsOverview = makeFunctionReference<"query">(
  "admin:getMetricsOverview",
)
const listFeatureRequests = makeFunctionReference<"query">(
  "admin:listFeatureRequests",
)
const updateFeatureRequest = makeFunctionReference<"mutation">(
  "admin:updateFeatureRequest",
)
const listChangelogEntries = makeFunctionReference<"query">(
  "admin:listChangelogEntries",
)
const createChangelogEntry = makeFunctionReference<"mutation">(
  "admin:createChangelogEntry",
)
const updateChangelogEntry = makeFunctionReference<"mutation">(
  "admin:updateChangelogEntry",
)
const publishChangelogEntry = makeFunctionReference<"mutation">(
  "admin:publishChangelogEntry",
)
const unpublishChangelogEntry = makeFunctionReference<"mutation">(
  "admin:unpublishChangelogEntry",
)
const deleteChangelogEntry = makeFunctionReference<"mutation">(
  "admin:deleteChangelogEntry",
)
const listDeletionJobs = makeFunctionReference<"query">(
  "admin:listDeletionJobs",
)
const getDeletionJob = makeFunctionReference<"query">("admin:getDeletionJob")
const retryDeletionJob = makeFunctionReference<"mutation">(
  "admin:retryDeletionJob",
)
const cancelDeletionJob = makeFunctionReference<"mutation">(
  "admin:cancelDeletionJob",
)

const previousAdminClerkUserId = process.env.ADMIN_CLERK_USER_ID

beforeEach(() => {
  process.env.ADMIN_CLERK_USER_ID = adminIdentity.subject
})

afterEach(() => {
  if (previousAdminClerkUserId === undefined) {
    delete process.env.ADMIN_CLERK_USER_ID
  } else {
    process.env.ADMIN_CLERK_USER_ID = previousAdminClerkUserId
  }
})

async function setup() {
  const t = convexTest({ modules, schema })
  const customer = t.withIdentity(customerIdentity)
  const admin = t.withIdentity(adminIdentity)
  const bootstrap = (await customer.mutation(bootstrapCurrentUser, {})) as {
    userId: string
    workspaceId: string
  }
  return { admin, bootstrap, customer, t }
}

describe("customer feature request functions", () => {
  it("derives the current customer and never returns admin-only fields", async () => {
    const { admin, bootstrap, customer, t } = await setup()
    const created = (await customer.mutation(createFeatureRequest, {
      description: "  A detailed description for the requested workflow.  ",
      title: "  Better   alerts  ",
    })) as { id: string }

    await expect(customer.query(listMyFeatureRequests, {})).resolves.toEqual([
      {
        body: "A detailed description for the requested workflow.",
        createdAt: expect.any(Number),
        id: created.id,
        status: "new",
        title: "Better alerts",
        updatedAt: expect.any(Number),
      },
    ])

    await admin.mutation(updateFeatureRequest, {
      adminNote: "Planned after the next ingestion release.",
      requestId: created.id,
      status: "planned",
    })
    const customerRows = (await customer.query(
      listMyFeatureRequests,
      {},
    )) as Array<Record<string, unknown>>
    expect(customerRows[0]).not.toHaveProperty("adminNote")

    const persisted = await t.run(
      async (ctx) => await ctx.db.get(created.id as never),
    )
    expect(persisted).toMatchObject({
      createdByUserId: bootstrap.userId,
      workspaceId: bootstrap.workspaceId,
    })
  })

  it("rejects invalid customer input at runtime", async () => {
    const { customer } = await setup()
    await expect(
      customer.mutation(createFeatureRequest, {
        description: "too short",
        title: "x",
      }),
    ).rejects.toMatchObject({ data: { code: "INVALID_FEATURE_REQUEST" } })
  })

  it("bounds customer history to the newest feature requests", async () => {
    const { bootstrap, customer, t } = await setup()
    await t.run(async (ctx) => {
      for (let index = 0; index < 105; index += 1) {
        await ctx.db.insert("featureRequests", {
          body: `Detailed retained feature request ${index}.`,
          createdAt: index,
          createdByUserId: bootstrap.userId,
          searchText: `retained feature request ${index}`,
          status: "new",
          title: `Retained request ${index}`,
          updatedAt: index,
          workspaceId: bootstrap.workspaceId,
        })
      }
    })

    const rows = (await customer.query(listMyFeatureRequests, {})) as Array<{
      title: string
    }>
    expect(rows).toHaveLength(100)
    expect(rows[0]?.title).toBe("Retained request 104")
    expect(rows.at(-1)?.title).toBe("Retained request 5")
  })
})

describe("admin feature request and changelog functions", () => {
  it("requires the exact configured admin Clerk subject and fails closed", async () => {
    const { t } = await setup()
    await expect(
      t
        .withIdentity({
          ...adminIdentity,
          subject: "user_other",
          tokenIdentifier: "https://clerk.example.test|user_other",
        })
        .query(listFeatureRequests, {}),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } })

    delete process.env.ADMIN_CLERK_USER_ID
    await expect(
      t.withIdentity(adminIdentity).query(listFeatureRequests, {}),
    ).rejects.toMatchObject({ data: { code: "ADMIN_NOT_CONFIGURED" } })
  })

  it("returns persisted metadata and audits every privileged mutation", async () => {
    const { admin, customer, t } = await setup()
    const request = (await customer.mutation(createFeatureRequest, {
      description: "Please add a weekly summary for saved mentions.",
      title: "Weekly saved mention summary",
    })) as { id: string }

    const updatedRequest = (await admin.mutation(updateFeatureRequest, {
      adminNote: "Included in the next planning review.",
      requestId: request.id,
      status: "planned",
    })) as Record<string, unknown>
    expect(updatedRequest).toMatchObject({
      adminNote: "Included in the next planning review.",
      status: "planned",
      user: { email: customerIdentity.email, name: customerIdentity.name },
      workspace: { name: "Personal workspace" },
    })

    const publicationDate = Date.UTC(2026, 6, 26)
    const created = (await admin.mutation(createChangelogEntry, {
      body: "Initial release details.",
      label: "  Product  ",
      publishedAt: publicationDate,
      slug: "initial-release",
      summary: "Initial release summary.",
      title: "Initial release",
    })) as { id: string; status: string }
    expect(created.status).toBe("draft")
    await expect(t.query(listPublishedEntries, {})).resolves.toEqual({
      entries: [],
      isDone: true,
      nextCursor: null,
    })

    await admin.mutation(updateChangelogEntry, {
      body: "Updated release details.",
      entryId: created.id,
      label: "Product",
      publishedAt: publicationDate,
      slug: "initial-release",
      summary: "Updated release summary.",
      title: "Initial release updated",
    })
    await admin.mutation(publishChangelogEntry, { entryId: created.id })

    const publicPage = (await t.query(listPublishedEntries, {})) as {
      entries: Array<Record<string, unknown>>
    }
    expect(publicPage.entries).toEqual([
      {
        publishedAt: publicationDate,
        slug: "initial-release",
        summary: "Updated release summary.",
        title: "Initial release updated",
        updatedAt: expect.any(Number),
      },
    ])
    expect(publicPage.entries[0]).not.toHaveProperty("body")
    expect(publicPage.entries[0]).not.toHaveProperty("createdByClerkUserId")
    expect(publicPage.entries[0]).not.toHaveProperty("label")
    expect(publicPage.entries[0]).not.toHaveProperty("status")
    await expect(
      t.query(getPublishedEntry, { slug: "initial-release" }),
    ).resolves.toEqual({
      body: "Updated release details.",
      publishedAt: publicationDate,
      slug: "initial-release",
      summary: "Updated release summary.",
      title: "Initial release updated",
      updatedAt: expect.any(Number),
    })

    await admin.mutation(unpublishChangelogEntry, { entryId: created.id })
    await expect(t.query(listPublishedEntries, {})).resolves.toEqual({
      entries: [],
      isDone: true,
      nextCursor: null,
    })
    await expect(
      t.query(getPublishedEntry, { slug: "initial-release" }),
    ).resolves.toBeNull()
    await admin.mutation(deleteChangelogEntry, { entryId: created.id })

    await expect(admin.query(listChangelogEntries, {})).resolves.toEqual({
      items: [],
    })
    const auditEvents = await t.run(
      async (ctx) => await ctx.db.query("auditEvents").collect(),
    )
    expect(auditEvents).toHaveLength(6)
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "admin.feature_request.updated",
          actorClerkUserId: adminIdentity.subject,
          actorType: "admin",
          outcome: "success",
        }),
        expect.objectContaining({ action: "admin.changelog.created" }),
        expect.objectContaining({ action: "admin.changelog.updated" }),
        expect.objectContaining({ action: "admin.changelog.published" }),
        expect.objectContaining({ action: "admin.changelog.unpublished" }),
        expect.objectContaining({ action: "admin.changelog.deleted" }),
      ]),
    )
  })

  it("paginates public changelog summaries and looks up one published body by slug", async () => {
    const { admin, t } = await setup()
    const now = Date.now()
    await t.run(async (ctx) => {
      for (let index = 0; index < 26; index += 1) {
        await ctx.db.insert("changelogEntries", {
          body: `Published body ${index}`,
          createdAt: now + index,
          createdByClerkUserId: adminIdentity.subject,
          publishedAt: now + index,
          slug: `published-entry-${index}`,
          status: "published",
          summary: `Published summary ${index}`,
          title: `Published entry ${index}`,
          updatedAt: now + index,
          updatedByClerkUserId: adminIdentity.subject,
        })
      }
    })

    const first = (await t.query(listPublishedEntries, {})) as {
      entries: Array<Record<string, unknown>>
      isDone: boolean
      nextCursor: string | null
    }
    expect(first.entries).toHaveLength(24)
    expect(first.isDone).toBe(false)
    expect(first.nextCursor).toEqual(expect.any(String))
    expect(first.entries.every((entry) => !("body" in entry))).toBe(true)

    const second = (await t.query(listPublishedEntries, {
      cursor: first.nextCursor,
    })) as {
      entries: Array<Record<string, unknown>>
      isDone: boolean
      nextCursor: string | null
    }
    expect(second.entries).toHaveLength(2)
    expect(second).toMatchObject({ isDone: true, nextCursor: null })
    await expect(
      t.query(getPublishedEntry, { slug: "published-entry-25" }),
    ).resolves.toMatchObject({ body: "Published body 25" })

    const adminFirst = (await admin.query(listChangelogEntries, {})) as {
      items: Array<Record<string, unknown>>
      nextCursor?: string
    }
    expect(adminFirst.items).toHaveLength(25)
    expect(adminFirst.nextCursor).toEqual(expect.any(String))
    const adminSecond = (await admin.query(listChangelogEntries, {
      cursor: adminFirst.nextCursor,
    })) as { items: Array<Record<string, unknown>>; nextCursor?: string }
    expect(adminSecond.items).toHaveLength(1)
    expect(adminSecond.nextCursor).toBeUndefined()
  })

  it("paginates the global feature request queue with opaque cursors", async () => {
    const { admin, customer } = await setup()
    for (const title of ["First request", "Second request"]) {
      await customer.mutation(createFeatureRequest, {
        description: `A sufficiently detailed description for ${title}.`,
        title,
      })
    }

    const first = (await admin.query(listFeatureRequests, {
      limit: 1,
      sort: "newest",
    })) as {
      items: Array<{ id: string }>
      nextCursor?: string
    }
    expect(first.items).toHaveLength(1)
    expect(first.nextCursor).toEqual(expect.any(String))

    const second = (await admin.query(listFeatureRequests, {
      cursor: first.nextCursor,
      limit: 1,
      sort: "newest",
    })) as {
      items: Array<{ id: string }>
    }
    expect(second.items).toHaveLength(1)
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id)
  })

  it("searches the complete feature request queue before pagination", async () => {
    const { admin, customer } = await setup()
    await customer.mutation(createFeatureRequest, {
      description:
        "A sufficiently detailed description for the buried search result.",
      title: "Buried needle request",
    })
    for (let index = 0; index < 30; index += 1) {
      await customer.mutation(createFeatureRequest, {
        description: `A sufficiently detailed filler request ${index}.`,
        title: `Newer filler request ${index}`,
      })
    }

    const result = (await admin.query(listFeatureRequests, {
      limit: 25,
      query: "Buried needle",
    })) as {
      items: Array<{ title: string }>
      nextCursor?: string
    }
    expect(result.items.map(({ title }) => title)).toEqual([
      "Buried needle request",
    ])
    expect(result.nextCursor).toBeUndefined()
  })

  it("sorts searched feature requests chronologically across cursor pages", async () => {
    const { admin, customer, t } = await setup()
    const seeded = await Promise.all(
      [
        { createdAt: 100, title: "Chronology marker older" },
        { createdAt: 200, title: "Chronology marker middle" },
        { createdAt: 300, title: "Chronology marker newer" },
      ].map(async ({ createdAt, title }) => {
        const created = (await customer.mutation(createFeatureRequest, {
          description: `A sufficiently detailed description for ${title}.`,
          title,
        })) as { id: string }
        return { createdAt, id: created.id, title }
      }),
    )
    await t.run(async (ctx) => {
      for (const request of seeded) {
        const requestId = ctx.db.normalizeId("featureRequests", request.id)
        expect(requestId).not.toBeNull()
        await ctx.db.patch("featureRequests", requestId!, {
          createdAt: request.createdAt,
          updatedAt: request.createdAt,
        })
      }
    })

    const first = (await admin.query(listFeatureRequests, {
      limit: 1,
      query: "Chronology marker",
      sort: "oldest",
    })) as {
      items: Array<{ title: string }>
      nextCursor?: string
    }
    expect(first.items.map(({ title }) => title)).toEqual([
      "Chronology marker older",
    ])
    expect(first.nextCursor).toEqual(expect.any(String))

    await customer.mutation(createFeatureRequest, {
      description:
        "A sufficiently detailed description for a later chronology marker.",
      title: "Chronology marker added later",
    })

    const second = (await admin.query(listFeatureRequests, {
      cursor: first.nextCursor,
      limit: 1,
      query: "Chronology marker",
      sort: "oldest",
    })) as {
      items: Array<{ title: string }>
      nextCursor?: string
    }
    expect(second.items.map(({ title }) => title)).toEqual([
      "Chronology marker middle",
    ])
    expect(second.nextCursor).toEqual(expect.any(String))

    const third = (await admin.query(listFeatureRequests, {
      cursor: second.nextCursor,
      limit: 1,
      query: "Chronology marker",
      sort: "oldest",
    })) as {
      items: Array<{ title: string }>
      nextCursor?: string
    }
    expect(third.items.map(({ title }) => title)).toEqual([
      "Chronology marker newer",
    ])
    expect(third.nextCursor).toBeUndefined()

    await expect(
      admin.query(listFeatureRequests, {
        cursor: first.nextCursor,
        limit: 1,
        query: "Chronology marker",
        sort: "newest",
      }),
    ).rejects.toMatchObject({ data: { code: "INVALID_ADMIN_INPUT" } })
  })
})

describe("admin metrics", () => {
  it("aggregates provider, product, billing, usage, and delivery metrics", async () => {
    const { admin, bootstrap, t } = await setup()
    const now = Date.now()
    const hour = Math.floor(now / 3_600_000) * 3_600_000
    const categories = await t.run(
      async (ctx) => await ctx.db.query("categories").collect(),
    )
    const categoryId = categories[0]?._id

    await t.run(async (ctx) => {
      await ctx.db.insert("providerMetricBuckets", {
        bucketEndAt: hour + 3_600_000,
        bucketStartAt: hour,
        failureCount: 1,
        granularity: "hour",
        inputItemCount: 4,
        latencyMaxMs: 250,
        latencyTotalMs: 400,
        operation: "search",
        outputItemCount: 3,
        provider: "x",
        rateLimitedCount: 1,
        requestCount: 2,
        retryCount: 1,
        successCount: 1,
        updatedAt: now,
      })
      for (const metric of [
        {
          metric: "mentions_ingested",
          scope: "global",
          value: 5,
        },
        {
          metric: "mentions_ingested_platform:x",
          scope: "global",
          value: 1,
        },
        {
          metric: "mentions_ingested_platform:reddit",
          scope: "global",
          value: 1,
        },
        {
          metric: `mentions_categorized:${String(categoryId)}`,
          scope: "global",
          value: 1,
        },
        {
          metric: "email_delivery_delivered",
          scope: "global",
          value: 2,
        },
      ]) {
        await ctx.db.insert("systemMetricBuckets", {
          bucketEndAt: hour + 3_600_000,
          bucketStartAt: hour,
          count: metric.value,
          granularity: "hour",
          maximum: metric.value,
          metric: metric.metric,
          minimum: metric.value,
          scope: metric.scope,
          sum: metric.value,
          updatedAt: now,
          value: metric.value,
          ...(metric.workspaceId === undefined
            ? {}
            : { workspaceId: metric.workspaceId }),
        })
      }
      await ctx.db.insert("subscriptions", {
        entitlementStatus: "active",
        planId: "starter",
        workspaceId: bootstrap.workspaceId,
      })
      await ctx.db.insert("trackingSources", {
        pauseReason: "usage",
        status: "paused",
        workspaceId: bootstrap.workspaceId,
      })
      await ctx.db.insert("mentions", {
        categoryId,
        firstSeenAt: now,
        platform: "x",
      })
      await ctx.db.insert("mentions", {
        firstSeenAt: now,
        platform: "reddit",
      })
      await ctx.db.patch("workspaces", bootstrap.workspaceId, {
        lastMentionAt: now,
      })
      await ctx.db.insert("categorizationJobs", { status: "completed" })
      await ctx.db.insert("categorizationJobs", { status: "pending" })
      await ctx.db.insert("categorizationJobs", { status: "dead" })
      for (const [status, value] of [
        ["completed", 1],
        ["pending", 1],
        ["leased", 0],
        ["dead", 1],
      ] as const) {
        await ctx.db.insert("systemMetricBuckets", {
          bucketEndAt: 3_600_000,
          bucketStartAt: 0,
          count: value,
          granularity: "hour",
          maximum: value,
          metric: `categorization_jobs_status:${status}`,
          minimum: value,
          scope: "global",
          sum: value,
          updatedAt: now,
          value,
        })
      }
      for (const [metric, value] of [
        ["operational_subscriptions:starter:total", 1],
        ["operational_subscriptions:starter:active", 1],
        ["operational_usage_paused_workspaces", 1],
      ] as const) {
        await ctx.db.insert("systemMetricBuckets", {
          bucketEndAt: 3_600_000,
          bucketStartAt: 0,
          count: value,
          granularity: "hour",
          maximum: value,
          metric,
          minimum: value,
          scope: "global",
          sum: value,
          updatedAt: now,
          value,
        })
      }
    })

    const result = (await admin.query(getMetricsOverview, {
      days: 30,
    })) as Record<string, any>
    expect(result.stats).toEqual({
      activeWorkspaces: 1,
      emailsDelivered: 2,
      mentions: 5,
      workspaces: 1,
    })
    expect(result.providerHealth).toEqual([
      {
        averageLatencyMs: 200,
        failureCount: 1,
        inputItemCount: 4,
        maxLatencyMs: 250,
        outputItemCount: 3,
        provider: "x",
        rateLimitedCount: 1,
        requestCount: 2,
        retryCount: 1,
        successCount: 1,
      },
    ])
    expect(result.mentions).toMatchObject({
      last30Days: 5,
      today: 5,
    })
    expect(result.mentions.byPlatform).toEqual([
      { count: 1, platform: "x" },
      { count: 1, platform: "reddit" },
      { count: 0, platform: "hacker_news" },
    ])
    expect(result.categoryBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 1 }),
        { category: "Uncategorized", count: 4 },
      ]),
    )
    expect(result.categorization).toEqual({
      completed: 1,
      failed: 1,
      leased: 0,
      pending: 1,
      total: 3,
    })
    expect(result.subscriptionsByPlan[0]).toEqual({
      activeCount: 1,
      count: 1,
      planId: "starter",
    })
    expect(result.usagePausedWorkspaces).toBe(1)
    expect(result.digestDelivery).toMatchObject({ delivered: 2, total: 2 })
  })
})

describe("admin account deletion controls", () => {
  it("requires exact admin authorization and explicit retry confirmation, then audits a bounded new generation", async () => {
    const { admin, bootstrap, t } = await setup()
    const now = Date.now()
    const originalId = await t.run(
      async (ctx) =>
        await ctx.db.insert("deletionJobs", {
          accountUserId: bootstrap.userId,
          accessFencedAt: now - 1_000,
          attempts: 10,
          billingGuardStatus: "confirmed_inactive",
          createdAt: now - 2_000,
          generation: 1,
          idempotencyKey: `account:${bootstrap.userId}:1`,
          identityClerkUserId: customerIdentity.subject,
          kind: "account",
          lastError: "CLERK_IDENTITY_STILL_PRESENT",
          lastErrorCode: "CLERK_IDENTITY_STILL_PRESENT",
          leaseVersion: 3,
          maxAttempts: 10,
          operationId: `account:${bootstrap.userId}:1`,
          phase: "identity_delete",
          requestedByUserId: bootstrap.userId,
          resourceKey: `account:${bootstrap.userId}`,
          scheduledAt: now - 2_000,
          status: "dead",
          updatedAt: now - 1_000,
          workflowVersion: 2,
          workspaceId: bootstrap.workspaceId,
        }),
    )

    await expect(
      t.withIdentity(customerIdentity).query(listDeletionJobs, {}),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } })
    await expect(
      admin.mutation(retryDeletionJob, {
        confirmation: "retry",
        deletionJobId: originalId,
      }),
    ).rejects.toMatchObject({ data: { code: "CONFIRMATION_MISMATCH" } })

    const retry = (await admin.mutation(retryDeletionJob, {
      confirmation: "RETRY",
      deletionJobId: originalId,
    })) as Record<string, unknown>
    expect(retry).toMatchObject({
      attempts: 0,
      generation: 2,
      phase: "billing_check",
      status: "pending",
      supersedesJobId: originalId,
      workflowVersion: 2,
    })
    const listed = (await admin.query(listDeletionJobs, {
      limit: 10,
    })) as Array<Record<string, unknown>>
    expect(listed).toHaveLength(2)
    const detail = (await admin.query(getDeletionJob, {
      deletionJobId: retry.id,
    })) as { events: Array<Record<string, unknown>> }
    expect(detail.events).toEqual([
      expect.objectContaining({
        action: "admin.account_deletion.retry_created",
        outcome: "success",
      }),
    ])
  })

  it("allows exact-confirmed cancellation only before quiescence and restores only its own access fence", async () => {
    const { admin, bootstrap, t } = await setup()
    const now = Date.now()
    const recoveryRows = await t.run(async (ctx) => {
      await ctx.db.patch(bootstrap.userId as never, {
        disabledAt: now,
        updatedAt: now,
      })
      await ctx.db.patch(bootstrap.workspaceId as never, {
        deletionPendingAt: now,
        updatedAt: now,
      })
      const preference = await ctx.db
        .query("digestPreferences")
        .withIndex("by_workspace_and_user", (q) =>
          q
            .eq("workspaceId", bootstrap.workspaceId as never)
            .eq("userId", bootstrap.userId as never),
        )
        .unique()
      await ctx.db.patch(preference!._id, {
        deletionPausedAt: now,
        enabled: false,
        updatedAt: now + 1,
      })
      const keywordId = await ctx.db.insert("keywords", {
        createdAt: now - 1,
        deletedAt: undefined,
        status: "active",
        updatedAt: now - 1,
        workspaceId: bootstrap.workspaceId,
      })
      const sourceId = await ctx.db.insert("trackingSources", {
        createdAt: now - 1,
        deletionPausedAt: now,
        keywordId,
        pauseReason: "user",
        status: "paused",
        updatedAt: now + 1,
        workspaceId: bootstrap.workspaceId,
      })
      const userPausedSourceId = await ctx.db.insert("trackingSources", {
        createdAt: now,
        keywordId,
        pauseReason: "user",
        status: "paused",
        updatedAt: now,
        workspaceId: bootstrap.workspaceId,
      })
      const subscriptionId = await ctx.db.insert("subscriptions", {
        currentPeriodEnd: now + 86_400_000,
        currentPeriodStart: now - 86_400_000,
        entitlementStatus: "active",
        lastSyncedAt: now,
        status: "active",
        workspaceId: bootstrap.workspaceId,
      })
      await ctx.db.insert("usageCycles", {
        mentionLimit: 100,
        mentionsUsed: 5,
        periodEndAt: now + 86_400_000,
        periodStartAt: now - 86_400_000,
        status: "open",
        subscriptionId,
        workspaceId: bootstrap.workspaceId,
      })
      return {
        digestPreferenceId: preference!._id,
        sourceId,
        userPausedSourceId,
      }
    })
    const pendingId = await t.run(
      async (ctx) =>
        await ctx.db.insert("deletionJobs", {
          accountUserId: bootstrap.userId,
          accessFencedAt: now,
          attempts: 0,
          billingGuardStatus: "confirmed_inactive",
          createdAt: now,
          generation: 1,
          idempotencyKey: `account:${bootstrap.userId}:1`,
          identityClerkUserId: customerIdentity.subject,
          kind: "account",
          leaseVersion: 0,
          maxAttempts: 10,
          nextAttemptAt: now,
          operationId: `account:${bootstrap.userId}:1`,
          phase: "billing_check",
          requestedByUserId: bootstrap.userId,
          resourceKey: `account:${bootstrap.userId}`,
          scheduledAt: now,
          status: "pending",
          updatedAt: now,
          workflowVersion: 2,
          workspaceId: bootstrap.workspaceId,
        }),
    )

    await expect(
      admin.mutation(cancelDeletionJob, {
        confirmation: "CANCEL",
        deletionJobId: pendingId,
      }),
    ).resolves.toMatchObject({ status: "canceled" })
    const restored = await t.run(async (ctx) => ({
      digest: await ctx.db.get(recoveryRows.digestPreferenceId),
      source: await ctx.db.get(recoveryRows.sourceId),
      userPausedSource: await ctx.db.get(recoveryRows.userPausedSourceId),
      user: await ctx.db.get(bootstrap.userId as never),
      workspace: await ctx.db.get(bootstrap.workspaceId as never),
    }))
    expect(restored.user?.disabledAt).toBeUndefined()
    expect(restored.workspace?.deletionPendingAt).toBeUndefined()
    expect(restored.source).toMatchObject({ status: "active" })
    expect(restored.source?.pauseReason).toBeUndefined()
    expect(restored.source?.deletionPausedAt).toBeUndefined()
    expect(restored.digest).toMatchObject({ enabled: true })
    expect(restored.digest?.deletionPausedAt).toBeUndefined()
    expect(restored.userPausedSource).toMatchObject({
      pauseReason: "user",
      status: "paused",
    })

    const quiescedId = await t.run(
      async (ctx) =>
        await ctx.db.insert("deletionJobs", {
          accountUserId: bootstrap.userId,
          accessFencedAt: now,
          attempts: 1,
          billingGuardStatus: "confirmed_inactive",
          createdAt: now + 1,
          generation: 2,
          idempotencyKey: `account:${bootstrap.userId}:2`,
          identityClerkUserId: customerIdentity.subject,
          kind: "account",
          leaseVersion: 1,
          maxAttempts: 10,
          operationId: `account:${bootstrap.userId}:2`,
          phase: "purge",
          purgeStage: "mentions",
          quiescedAt: now + 1,
          requestedByUserId: bootstrap.userId,
          resourceKey: `account:${bootstrap.userId}`,
          scheduledAt: now + 1,
          status: "failed",
          updatedAt: now + 1,
          workflowVersion: 2,
          workspaceId: bootstrap.workspaceId,
        }),
    )
    await expect(
      admin.mutation(cancelDeletionJob, {
        confirmation: "CANCEL",
        deletionJobId: quiescedId,
      }),
    ).rejects.toMatchObject({ data: { code: "DELETION_CANCEL_REJECTED" } })
  })

  it("keeps legacy deletion jobs review-only", async () => {
    const { admin, bootstrap, t } = await setup()
    const now = Date.now()
    const legacyId = await t.run(
      async (ctx) =>
        await ctx.db.insert("deletionJobs", {
          accountUserId: bootstrap.userId,
          attempts: 10,
          billingGuardStatus: "failed",
          createdAt: now,
          idempotencyKey: "legacy",
          kind: "workspace",
          maxAttempts: 10,
          requestedByUserId: bootstrap.userId,
          scheduledAt: now,
          status: "dead",
          updatedAt: now,
          workspaceId: bootstrap.workspaceId,
        }),
    )
    await expect(
      admin.mutation(retryDeletionJob, {
        confirmation: "RETRY",
        deletionJobId: legacyId,
      }),
    ).rejects.toMatchObject({ data: { code: "DELETION_RETRY_REJECTED" } })
    await expect(
      admin.mutation(cancelDeletionJob, {
        confirmation: "CANCEL",
        deletionJobId: legacyId,
      }),
    ).rejects.toMatchObject({ data: { code: "DELETION_CANCEL_REJECTED" } })
  })
})
