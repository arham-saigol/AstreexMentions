import { convexTest } from "convex-test"
import {
  defineSchema,
  defineTable,
  makeFunctionReference,
  type UserIdentity,
} from "convex/server"
import { type GenericId, v } from "convex/values"
import { describe, expect, it } from "vitest"

import { MAX_DRAFT_KEYWORDS } from "../convex/keywords"
import { safeCanonicalUrl } from "../convex/mentions"

const modules = {
  "./_generated/server.ts": async () => ({}),
  "./keywords.ts": async () => await import("../convex/keywords"),
  "./mentions.ts": async () => await import("../convex/mentions"),
}

const testSchema = defineSchema({
  categories: defineTable(v.any()),
  keywords: defineTable(v.any())
    .index("by_workspace_phrase_and_deleted_at", [
      "workspaceId",
      "normalizedPhrase",
      "deletedAt",
    ])
    .index("by_workspace_status_and_created_at", [
      "workspaceId",
      "status",
      "createdAt",
    ])
    .index("by_workspace_and_updated_at", ["workspaceId", "updatedAt"]),
  mentionKeywordMatches: defineTable(v.any())
    .index("by_keyword_and_mention", ["keywordId", "mentionId"])
    .index("by_workspace_and_mention", ["workspaceId", "mentionId"]),
  mentions: defineTable(v.any())
    .index("by_workspace_and_published_at", ["workspaceId", "publishedAt"])
    .index("by_workspace_engagement_and_published_at", [
      "workspaceId",
      "engagementScore",
      "publishedAt",
    ]),
  providerMetricBuckets: defineTable(v.any()).index(
    "by_provider_operation_granularity_and_bucket",
    ["provider", "operation", "granularity", "bucketStartAt"],
  ),
  providerRuns: defineTable(v.any()).index("by_idempotency_key", [
    "idempotencyKey",
  ]),
  savedViews: defineTable(v.any()).index(
    "by_workspace_deleted_and_updated_at",
    ["workspaceId", "deletedAt", "updatedAt"],
  ),
  freeEvaluationGrants: defineTable(v.any()).index("by_workspace", [
    "workspaceId",
  ]),
  subscriptions: defineTable(v.any())
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_last_synced_at", ["workspaceId", "lastSyncedAt"]),
  systemMetricBuckets: defineTable(v.any()).index(
    "by_metric_scope_workspace_granularity_and_bucket",
    ["metric", "scope", "workspaceId", "granularity", "bucketStartAt"],
  ),
  trackingSources: defineTable(v.any())
    .index("by_keyword_and_source_type", ["keywordId", "sourceType"])
    .index("by_workspace_status_and_created_at", [
      "workspaceId",
      "status",
      "createdAt",
    ]),
  usageCycles: defineTable(v.any()).index(
    "by_workspace_status_and_period_end",
    ["workspaceId", "status", "periodEndAt"],
  ),
  users: defineTable(v.any()).index("by_token_identifier", ["tokenIdentifier"]),
  workspaceMembers: defineTable(v.any()).index("by_workspace_and_user", [
    "workspaceId",
    "userId",
  ]),
  workspaces: defineTable(v.any()),
})

function createBackendTest() {
  return convexTest({ modules, schema: testSchema })
}

type BackendTest = ReturnType<typeof createBackendTest>
type UserId = GenericId<"users">
type WorkspaceId = GenericId<"workspaces">
type KeywordId = GenericId<"keywords">
type MentionId = GenericId<"mentions">

const createKeywordReference = makeFunctionReference<
  "mutation",
  {
    description?: string
    phrase: string
    platforms: Array<"x" | "reddit" | "hacker_news">
  },
  unknown
>("keywords:createKeyword")
const listKeywordsReference = makeFunctionReference<"query", object, unknown>(
  "keywords:listKeywords",
)
const getKeywordSummaryReference = makeFunctionReference<
  "query",
  { now: number },
  unknown
>("keywords:getKeywordSummary")
const updateKeywordReference = makeFunctionReference<
  "mutation",
  {
    keywordId: KeywordId
    phrase: string
    platforms: Array<"x" | "reddit" | "hacker_news">
  },
  unknown
>("keywords:updateKeyword")
const pauseKeywordReference = makeFunctionReference<
  "mutation",
  { keywordId: KeywordId },
  unknown
>("keywords:pauseKeyword")
const resumeKeywordReference = makeFunctionReference<
  "mutation",
  { keywordId: KeywordId },
  unknown
>("keywords:resumeKeyword")
const deleteKeywordReference = makeFunctionReference<
  "mutation",
  { keywordId: KeywordId },
  unknown
>("keywords:deleteKeyword")
const listMentionsReference = makeFunctionReference<
  "query",
  {
    cursor?: string
    filters?: {
      categoryIds?: GenericId<"categories">[]
      keywordIds?: KeywordId[]
      mentionStatuses?: Array<"new" | "saved" | "dismissed">
      platforms?: Array<"x" | "reddit" | "hacker_news">
      publishedAfter?: number
      publishedBefore?: number
    }
    limit?: number
    now: number
    query?: string
    sort?: "newest" | "oldest" | "most_engaged"
  },
  unknown
>("mentions:listMentions")
const getMentionReference = makeFunctionReference<
  "query",
  { mentionId: MentionId; now: number },
  unknown
>("mentions:getMention")
const updateMentionStatusReference = makeFunctionReference<
  "mutation",
  { mentionId: MentionId; status: "new" | "saved" | "dismissed" },
  unknown
>("mentions:updateMentionStatus")

type SeededCustomer = {
  client: ReturnType<BackendTest["withIdentity"]>
  identity: UserIdentity
  subscriptionId?: GenericId<"subscriptions">
  userId: UserId
  workspaceId: WorkspaceId
}

async function seedCustomer(
  t: BackendTest,
  input: {
    evaluation?: boolean
    keywordLimit?: number
    mentionLimit?: number
    mentionsUsed?: number
    paid?: boolean
    suffix: string
  },
): Promise<SeededCustomer> {
  const now = Date.now()
  const identity = {
    issuer: "https://clerk.example.test",
    subject: `clerk_${input.suffix}`,
    tokenIdentifier: `https://clerk.example.test|clerk_${input.suffix}`,
  } as UserIdentity

  const seeded = await t.run(async (ctx) => {
    const userId = (await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      createdAt: now - 10_000,
      tokenIdentifier: identity.tokenIdentifier,
      updatedAt: now - 10_000,
    })) as UserId
    const workspaceId = (await ctx.db.insert("workspaces", {
      createdAt: now - 9_000,
      kind: "personal",
      name: `Workspace ${input.suffix}`,
      normalizedName: `workspace ${input.suffix}`,
      ownerUserId: userId,
      updatedAt: now - 9_000,
    })) as WorkspaceId
    await ctx.db.patch("users", userId, { personalWorkspaceId: workspaceId })
    await ctx.db.insert("workspaceMembers", {
      createdAt: now - 8_000,
      role: "owner",
      updatedAt: now - 8_000,
      userId,
      workspaceId,
    })

    if (input.evaluation) {
      await ctx.db.insert("freeEvaluationGrants", {
        activatedAt: now - 7_000,
        createdAt: now - 7_000,
        mentionLimit: 100,
        mentionsUsed: 0,
        updatedAt: now - 7_000,
        workspaceId,
      })
    }

    let subscriptionId: GenericId<"subscriptions"> | undefined
    if (input.paid) {
      subscriptionId = (await ctx.db.insert("subscriptions", {
        cancelAtPeriodEnd: false,
        createdAt: now - 7_000,
        currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1_000,
        currentPeriodStart: now - 60_000,
        entitlementStatus: "active",
        lastSyncedAt: now - 1_000,
        planId: "growth",
        provider: "creem",
        providerCustomerId: `customer_${input.suffix}`,
        providerSubscriptionId: `subscription_${input.suffix}`,
        status: "active",
        updatedAt: now - 1_000,
        workspaceId,
      })) as GenericId<"subscriptions">
      const keywordLimit = input.keywordLimit ?? 6
      const mentionLimit = input.mentionLimit ?? 100
      await ctx.db.insert("usageCycles", {
        createdAt: now - 6_000,
        idempotencyKey: `usage_${input.suffix}`,
        keywordLimit,
        mentionLimit,
        mentionsUsed: input.mentionsUsed ?? 0,
        periodEndAt: now + 30 * 24 * 60 * 60 * 1_000,
        periodStartAt: now - 60_000,
        planSnapshot: {
          keywordLimit,
          mentionLimit,
          planId: "growth",
        },
        status: "open",
        subscriptionId,
        updatedAt: now - 6_000,
        workspaceId,
      })
    }

    return { subscriptionId, userId, workspaceId }
  })

  return {
    client: t.withIdentity(identity),
    identity,
    ...seeded,
  }
}

function keywordResult(value: unknown) {
  return value as {
    description: string | null
    id: KeywordId
    pauseReason: string | null
    phrase: string
    platforms: string[]
    sources: Array<{
      intervalMs: number
      pauseReason: string | null
      sourceType: string
      status: string
    }>
    status: string
  }
}

function mentionPage(value: unknown) {
  return value as {
    isDone: boolean
    items: Array<Record<string, unknown> & { id: MentionId; status: string }>
    monitoringState: string
    nextCursor: string | null
    totalCount?: number
  }
}

describe("keyword Convex functions", () => {
  it("creates one free-evaluation keyword with independent scheduled Reddit sources", async () => {
    const t = createBackendTest()
    const customer = await seedCustomer(t, {
      evaluation: true,
      paid: false,
      suffix: "evaluation",
    })

    const created = keywordResult(
      await customer.client.mutation(createKeywordReference, {
        phrase: "  Astreex   Monitor ",
        platforms: ["reddit", "x", "reddit"],
      }),
    )
    expect(created).toMatchObject({
      phrase: "Astreex Monitor",
      platforms: ["x", "reddit"],
      status: "active",
    })
    expect(created.sources.map((source) => source.sourceType)).toEqual([
      "x",
      "reddit_posts",
      "reddit_comments",
    ])
    expect(created.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pauseReason: null, status: "active" }),
      ]),
    )
    expect(created.sources.every((source) => source.intervalMs > 0)).toBe(true)

    const rows = await t.run(async (ctx) => ({
      keywords: await ctx.db.query("keywords").collect(),
      sources: await ctx.db.query("trackingSources").collect(),
    }))
    expect(rows.keywords).toHaveLength(1)
    expect(rows.sources).toHaveLength(3)
    expect(rows.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backoffMs: 0,
          checkpointVersion: 0,
          leaseVersion: 0,
          sourceType: "reddit_posts",
          totalFailures: 0,
        }),
        expect.objectContaining({ sourceType: "reddit_comments" }),
      ]),
    )

    await expect(
      customer.client.mutation(createKeywordReference, {
        phrase: "astreex monitor",
        platforms: ["hacker_news"],
      }),
    ).rejects.toMatchObject({ data: { code: "KEYWORD_ALREADY_EXISTS" } })

    const summary = (await customer.client.query(getKeywordSummaryReference, {
      now: Date.now(),
    })) as Record<string, unknown>
    expect(summary).toMatchObject({
      canCreate: true,
      count: 1,
      activeLimit: 1,
      limit: 1,
      monitoringState: "active",
      remaining: 9,
    })
  })

  it("enforces the ten-keyword draft ceiling without an active subscription", async () => {
    const t = createBackendTest()
    const customer = await seedCustomer(t, {
      paid: false,
      suffix: "draft-limit",
    })

    for (let index = 0; index < MAX_DRAFT_KEYWORDS; index += 1) {
      await customer.client.mutation(createKeywordReference, {
        phrase: `Draft keyword ${index}`,
        platforms: ["x"],
      })
    }
    await expect(
      customer.client.mutation(createKeywordReference, {
        phrase: "Draft keyword over limit",
        platforms: ["x"],
      }),
    ).rejects.toMatchObject({ data: { code: "KEYWORD_LIMIT_REACHED" } })
  })

  it("counts one keyword across platforms against the active usage-cycle limit", async () => {
    const t = createBackendTest()
    const customer = await seedCustomer(t, {
      keywordLimit: 1,
      paid: true,
      suffix: "paid-limit",
    })

    const created = keywordResult(
      await customer.client.mutation(createKeywordReference, {
        phrase: "One configured keyword",
        platforms: ["x", "reddit", "hacker_news"],
      }),
    )
    expect(created.sources).toHaveLength(4)
    expect(created.sources.every((source) => source.status === "active")).toBe(
      true,
    )

    const overflow = keywordResult(
      await customer.client.mutation(createKeywordReference, {
        phrase: "Second keyword",
        platforms: ["x"],
      }),
    )
    expect(overflow).toMatchObject({
      pauseReason: "capacity",
      status: "paused",
    })
    expect(
      (await customer.client.query(listKeywordsReference, {})) as unknown[],
    ).toHaveLength(2)
  })

  it("does not resume a paused keyword beyond the active plan limit", async () => {
    const t = createBackendTest()
    const customer = await seedCustomer(t, {
      keywordLimit: 1,
      paid: true,
      suffix: "resume-limit",
    })
    await customer.client.mutation(createKeywordReference, {
      phrase: "Retained active keyword",
      platforms: ["x"],
    })
    const pausedKeywordId = await t.run(
      async (ctx) =>
        (await ctx.db.insert("keywords", {
          createdAt: Date.now(),
          createdByUserId: customer.userId,
          normalizedPhrase: "paused excess keyword",
          pausedAt: Date.now(),
          phrase: "Paused excess keyword",
          platforms: ["x"],
          status: "paused",
          updatedAt: Date.now(),
          workspaceId: customer.workspaceId,
        })) as KeywordId,
    )

    await expect(
      customer.client.mutation(resumeKeywordReference, {
        keywordId: pausedKeywordId,
      }),
    ).rejects.toMatchObject({ data: { code: "KEYWORD_LIMIT_REACHED" } })
  })

  it("persists free keyword context and requires an explicit slot swap", async () => {
    const t = createBackendTest()
    const customer = await seedCustomer(t, {
      evaluation: true,
      paid: false,
      suffix: "free-slot-swap",
    })
    const first = keywordResult(
      await customer.client.mutation(createKeywordReference, {
        description: "The primary company name.",
        phrase: "Primary signal",
        platforms: ["x"],
      }),
    )
    const second = keywordResult(
      await customer.client.mutation(createKeywordReference, {
        description: "A product name worth monitoring.",
        phrase: "Product signal",
        platforms: ["reddit"],
      }),
    )
    expect(first).toMatchObject({
      description: "The primary company name.",
      status: "active",
    })
    expect(second).toMatchObject({
      description: "A product name worth monitoring.",
      pauseReason: "capacity",
      status: "paused",
    })
    await expect(
      customer.client.mutation(resumeKeywordReference, {
        keywordId: second.id,
      }),
    ).rejects.toMatchObject({ data: { code: "KEYWORD_LIMIT_REACHED" } })

    await customer.client.mutation(pauseKeywordReference, {
      keywordId: first.id,
    })
    const resumed = keywordResult(
      await customer.client.mutation(resumeKeywordReference, {
        keywordId: second.id,
      }),
    )
    expect(resumed.status).toBe("active")
    expect(resumed.sources.every((source) => source.status === "active")).toBe(
      true,
    )
  })

  it("reactivates an errored source after its provider query is corrected", async () => {
    const t = createBackendTest()
    const customer = await seedCustomer(t, {
      paid: true,
      suffix: "query-correction",
    })
    const created = keywordResult(
      await customer.client.mutation(createKeywordReference, {
        phrase: "Rejected query",
        platforms: ["x"],
      }),
    )
    const sourceId = created.sources[0]!.id
    await t.run(async (ctx) => {
      const now = Date.now()
      await ctx.db.patch("trackingSources", sourceId, {
        backoffMs: 60_000,
        backoffUntil: now + 60_000,
        consecutiveFailures: 3,
        lastError: "invalid_query:Provider rejected the search query",
        nextRunAt: now + 60_000,
        pauseReason: "config",
        status: "error",
      })
    })

    const updateStartedAt = Date.now()
    await customer.client.mutation(updateKeywordReference, {
      keywordId: created.id,
      phrase: "Corrected query",
      platforms: ["x"],
    })
    const corrected = await t.run(
      async (ctx) => await ctx.db.get("trackingSources", sourceId),
    )

    expect(corrected).toMatchObject({
      backoffMs: 0,
      consecutiveFailures: 0,
      nextRunAt: expect.any(Number),
      providerQuery: "Corrected query",
      status: "active",
    })
    expect(corrected!.nextRunAt).toBeGreaterThanOrEqual(updateStartedAt)
    expect(corrected).not.toHaveProperty("backoffUntil")
    expect(corrected).not.toHaveProperty("lastError")
    expect(corrected).not.toHaveProperty("pauseReason")
  })

  it("keeps keyword status and source status reversible before soft deletion", async () => {
    const t = createBackendTest()
    const customer = await seedCustomer(t, { paid: true, suffix: "lifecycle" })
    const created = keywordResult(
      await customer.client.mutation(createKeywordReference, {
        phrase: "Lifecycle",
        platforms: ["reddit"],
      }),
    )

    await expect(
      customer.client.mutation(updateKeywordReference, {
        keywordId: created.id,
        phrase: "Lifecycle",
        platforms: [],
      }),
    ).rejects.toMatchObject({
      data: { code: "INVALID_KEYWORD_PLATFORMS" },
    })

    const leasedSourceId = created.sources[0]!.id
    await t.run(async (ctx) => {
      const now = Date.now()
      await ctx.db.patch("trackingSources", leasedSourceId, {
        inProgressCursor: "old-query-cursor",
        inProgressPage: 2,
        leaseExpiresAt: now + 60_000,
        leaseToken: "old-query-lease",
        leaseVersion: 3,
      })
      await ctx.db.insert("providerRuns", {
        attempt: 1,
        createdAt: now,
        idempotencyKey: `tracking:${String(leasedSourceId)}:3`,
        inputCount: 1,
        operation: "posts.search",
        outputCount: 0,
        provider: "reddit_posts",
        startedAt: now,
        status: "running",
        trackingSourceId: leasedSourceId,
        trigger: "scheduled",
        updatedAt: now,
        workspaceId: customer.workspaceId,
      })
    })
    await customer.client.mutation(updateKeywordReference, {
      keywordId: created.id,
      phrase: "Updated lifecycle",
      platforms: ["reddit"],
    })
    const queryChangedSource = await t.run(
      async (ctx) => await ctx.db.get("trackingSources", leasedSourceId),
    )
    expect(queryChangedSource).toMatchObject({
      leaseVersion: 4,
      providerQuery: "Updated lifecycle",
    })
    expect(queryChangedSource).not.toHaveProperty("inProgressCursor")
    expect(queryChangedSource).not.toHaveProperty("inProgressPage")
    expect(queryChangedSource).not.toHaveProperty("leaseExpiresAt")
    expect(queryChangedSource).not.toHaveProperty("leaseToken")
    const queryChangedRun = await t.run(
      async (ctx) =>
        await ctx.db
          .query("providerRuns")
          .withIndex("by_idempotency_key", (q) =>
            q.eq("idempotencyKey", `tracking:${String(leasedSourceId)}:3`),
          )
          .unique(),
    )
    expect(queryChangedRun).toMatchObject({
      errorCode: "source_changed",
      status: "failed",
    })
    expect(queryChangedRun?.finishedAt).toEqual(expect.any(Number))

    const updated = keywordResult(
      await customer.client.mutation(updateKeywordReference, {
        keywordId: created.id,
        phrase: "Updated lifecycle",
        platforms: ["x", "hacker_news"],
      }),
    )
    expect(updated.sources.map((source) => source.sourceType)).toEqual([
      "x",
      "hacker_news",
    ])

    const pauseLeasedSourceId = updated.sources[0]!.id
    await t.run(async (ctx) => {
      const now = Date.now()
      await ctx.db.patch("trackingSources", pauseLeasedSourceId, {
        leaseExpiresAt: now + 60_000,
        leaseToken: "pause-lease",
        leaseVersion: 7,
      })
      await ctx.db.insert("providerRuns", {
        attempt: 1,
        createdAt: now,
        idempotencyKey: `tracking:${String(pauseLeasedSourceId)}:7`,
        inputCount: 1,
        operation: "tweets.search",
        outputCount: 0,
        provider: "x",
        startedAt: now,
        status: "running",
        trackingSourceId: pauseLeasedSourceId,
        trigger: "scheduled",
        updatedAt: now,
        workspaceId: customer.workspaceId,
      })
    })
    const paused = keywordResult(
      await customer.client.mutation(pauseKeywordReference, {
        keywordId: created.id,
      }),
    )
    expect(paused.status).toBe("paused")
    expect(
      paused.sources.every((source) => source.pauseReason === "user"),
    ).toBe(true)
    const pausedRun = await t.run(
      async (ctx) =>
        await ctx.db
          .query("providerRuns")
          .withIndex("by_idempotency_key", (q) =>
            q.eq("idempotencyKey", `tracking:${String(pauseLeasedSourceId)}:7`),
          )
          .unique(),
    )
    expect(pausedRun).toMatchObject({
      errorCode: "source_paused",
      status: "failed",
    })
    expect(pausedRun?.finishedAt).toEqual(expect.any(Number))

    const resumed = keywordResult(
      await customer.client.mutation(resumeKeywordReference, {
        keywordId: created.id,
      }),
    )
    expect(resumed.status).toBe("active")
    expect(resumed.sources.every((source) => source.status === "active")).toBe(
      true,
    )

    const savedViewId = await t.run(
      async (ctx) =>
        await ctx.db.insert("savedViews", {
          createdAt: Date.now(),
          filters: {
            keywordIds: [created.id],
            platforms: ["x"],
          },
          name: "Keyword view",
          position: 0,
          updatedAt: Date.now(),
          userId: customer.userId,
          workspaceId: customer.workspaceId,
        }),
    )
    await customer.client.mutation(deleteKeywordReference, {
      keywordId: created.id,
    })
    expect(
      (await customer.client.query(listKeywordsReference, {})) as unknown[],
    ).toEqual([])
    const persisted = await t.run(async (ctx) => ({
      keyword: await ctx.db.get("keywords", created.id),
      savedView: await ctx.db.get("savedViews", savedViewId),
      sources: await ctx.db.query("trackingSources").collect(),
    }))
    expect(persisted.keyword).toMatchObject({ status: "deleted" })
    expect(persisted.savedView?.filters).toEqual({ platforms: ["x"] })
    expect(
      persisted.sources.every((source) => source.status === "deleted"),
    ).toBe(true)
  })
})

describe("mention model", () => {
  it("accepts only safe canonical HTTP(S) URLs", () => {
    expect(safeCanonicalUrl("https://example.com/post/1")).toBe(
      "https://example.com/post/1",
    )
    expect(() => safeCanonicalUrl("javascript:alert(1)")).toThrow(/HTTP\(S\)/)
    expect(() =>
      safeCanonicalUrl("https://user:secret@example.com/post"),
    ).toThrow(/credentials/)
  })
})

async function seedMentions(t: BackendTest, customer: SeededCustomer) {
  const now = Date.now()
  return await t.run(async (ctx) => {
    const keywordId = (await ctx.db.insert("keywords", {
      createdAt: now - 10_000,
      createdByUserId: customer.userId,
      normalizedPhrase: "astreex",
      phrase: "Astreex",
      platforms: ["x"],
      status: "active",
      updatedAt: now - 10_000,
      workspaceId: customer.workspaceId,
    })) as KeywordId
    await ctx.db.insert("trackingSources", {
      createdAt: now - 9_000,
      keywordId,
      sourceType: "x",
      status: "active",
      updatedAt: now - 9_000,
      workspaceId: customer.workspaceId,
    })
    const categoryId = (await ctx.db.insert("categories", {
      colorToken: "green",
      createdAt: now - 8_000,
      description: "Positive feedback",
      enabled: true,
      isSystem: true,
      name: "Praise",
      normalizedName: "praise",
      sortOrder: 2,
      systemKey: "praise",
      updatedAt: now - 8_000,
      workspaceId: customer.workspaceId,
    })) as GenericId<"categories">

    const definitions = [
      {
        body: "Astreex is a great product for tracking conversations.",
        engagementScore: 4,
        platform: "x",
        publishedAt: now - 1_000,
        status: "new",
        title: "Fresh mention",
      },
      {
        body: "A detailed Astreex review with strong engagement.",
        engagementScore: 20,
        platform: "reddit",
        publishedAt: now - 2_000,
        status: "saved",
        title: "Popular review",
      },
      {
        body: "Astreex appeared in this Hacker News discussion.",
        engagementScore: 8,
        platform: "hacker_news",
        publishedAt: now - 3_000,
        status: "dismissed",
        title: "HN discussion",
      },
    ] as const
    const mentionIds: MentionId[] = []
    for (const [index, definition] of definitions.entries()) {
      const mentionId = (await ctx.db.insert("mentions", {
        analysisState: "completed",
        authorDisplayName: `Author ${index}`,
        body: definition.body,
        canonicalUrl: `https://example.com/mention/${index}`,
        categoryId: index === 2 ? undefined : categoryId,
        commentCount: index,
        contentType: index === 0 ? "tweet" : "post",
        engagementScore: definition.engagementScore,
        firstSeenAt: now - 4_000,
        lastMatchedAt: now - 4_000,
        platform: definition.platform,
        publishedAt: definition.publishedAt,
        searchText: `${definition.title} ${definition.body}`.toLocaleLowerCase(
          "en",
        ),
        status: definition.status,
        title: definition.title,
        updatedAt: now - 4_000,
        workspaceId: customer.workspaceId,
      })) as MentionId
      mentionIds.push(mentionId)
      if (index < 2) {
        await ctx.db.insert("mentionKeywordMatches", {
          createdAt: now - 3_000,
          keywordId,
          matchKind: "phrase",
          mentionId,
          workspaceId: customer.workspaceId,
        })
      }
    }

    return { categoryId, keywordId, mentionIds }
  })
}

describe("mention Convex functions", () => {
  it("returns joined canonical data with search, filters, sorts, and cursor pages", async () => {
    const t = createBackendTest()
    const customer = await seedCustomer(t, { paid: true, suffix: "mentions" })
    const seeded = await seedMentions(t, customer)

    const firstPage = mentionPage(
      await customer.client.query(listMentionsReference, {
        filters: { keywordIds: [seeded.keywordId] },
        limit: 1,
        now: Date.now(),
        query: "astreex",
        sort: "most_engaged",
      }),
    )
    expect(firstPage).toMatchObject({
      isDone: false,
      monitoringState: "active",
    })
    expect(firstPage.items).toHaveLength(1)
    expect(firstPage.items[0]).toMatchObject({
      body: expect.any(String),
      canonicalUrl: "https://example.com/mention/1",
      category: expect.objectContaining({ name: "Praise" }),
      matchedKeywords: [{ id: seeded.keywordId, phrase: "Astreex" }],
      status: "saved",
    })
    expect(firstPage.items[0]).not.toHaveProperty("searchText")
    expect(firstPage.items[0]).not.toHaveProperty("providerItemId")
    expect(firstPage.items[0]).not.toHaveProperty("trackingSourceId")

    const secondPage = mentionPage(
      await customer.client.query(listMentionsReference, {
        cursor: firstPage.nextCursor ?? undefined,
        filters: { keywordIds: [seeded.keywordId] },
        limit: 1,
        now: Date.now(),
        query: "astreex",
        sort: "most_engaged",
      }),
    )
    expect(secondPage).toMatchObject({ isDone: true })
    expect(secondPage.items[0]?.id).toBe(seeded.mentionIds[0])

    const filtered = mentionPage(
      await customer.client.query(listMentionsReference, {
        filters: {
          categoryIds: [seeded.categoryId],
          mentionStatuses: ["new"],
          platforms: ["x"],
        },
        now: Date.now(),
        sort: "oldest",
      }),
    )
    expect(filtered.items.map((item) => item.id)).toEqual([
      seeded.mentionIds[0],
    ])
  })

  it("fills a filtered page beyond the first scan batch", async () => {
    const t = createBackendTest()
    const customer = await seedCustomer(t, {
      paid: true,
      suffix: "mention-scan-gap",
    })
    const seeded = await seedMentions(t, customer)
    const now = Date.now()
    await t.run(async (ctx) => {
      for (let index = 0; index < 251; index += 1) {
        await ctx.db.insert("mentions", {
          analysisState: "completed",
          body: `Unrelated result ${index}`,
          canonicalUrl: `https://example.com/unrelated/${index}`,
          contentType: "post",
          engagementScore: 0,
          firstSeenAt: now,
          lastMatchedAt: now,
          platform: "reddit",
          publishedAt: now + index + 1,
          searchText: `unrelated result ${index}`,
          status: "new",
          updatedAt: now,
          workspaceId: customer.workspaceId,
        })
      }
    })

    const page = mentionPage(
      await customer.client.query(listMentionsReference, {
        limit: 1,
        now,
        query: "fresh mention",
        sort: "newest",
      }),
    )
    expect(page.items.map((item) => item.id)).toEqual([seeded.mentionIds[0]])
  })

  it("orders engagement-score ties by publication time", async () => {
    const t = createBackendTest()
    const customer = await seedCustomer(t, {
      paid: true,
      suffix: "mention-engagement-ties",
    })
    await seedMentions(t, customer)
    const now = Date.now()
    const [newerId, olderId] = await t.run(async (ctx) => {
      const insertMention = async (suffix: string, publishedAt: number) =>
        (await ctx.db.insert("mentions", {
          analysisState: "completed",
          body: `Tied engagement ${suffix}`,
          canonicalUrl: `https://example.com/tied/${suffix}`,
          contentType: "post",
          engagementScore: 100,
          firstSeenAt: now,
          lastMatchedAt: now,
          platform: "reddit",
          publishedAt,
          searchText: `tied engagement ${suffix}`,
          status: "new",
          updatedAt: now,
          workspaceId: customer.workspaceId,
        })) as MentionId
      const newer = await insertMention("newer", now)
      const older = await insertMention("older", now - 10_000)
      return [newer, older] as const
    })

    const page = mentionPage(
      await customer.client.query(listMentionsReference, {
        limit: 2,
        now,
        sort: "most_engaged",
      }),
    )
    expect(page.items.map((item) => item.id)).toEqual([newerId, olderId])
  })

  it("binds cursors and mention ids to the authenticated workspace", async () => {
    const t = createBackendTest()
    const firstCustomer = await seedCustomer(t, {
      paid: true,
      suffix: "tenant-one",
    })
    const secondCustomer = await seedCustomer(t, {
      paid: true,
      suffix: "tenant-two",
    })
    const seeded = await seedMentions(t, firstCustomer)
    const page = mentionPage(
      await firstCustomer.client.query(listMentionsReference, {
        limit: 1,
        now: Date.now(),
        sort: "newest",
      }),
    )
    expect(page.nextCursor).not.toBeNull()

    await expect(
      secondCustomer.client.query(listMentionsReference, {
        cursor: page.nextCursor ?? undefined,
        limit: 1,
        now: Date.now(),
        sort: "newest",
      }),
    ).rejects.toMatchObject({ data: { code: "INVALID_CURSOR" } })
    await expect(
      secondCustomer.client.query(getMentionReference, {
        mentionId: seeded.mentionIds[0]!,
        now: Date.now(),
      }),
    ).rejects.toMatchObject({ data: { code: "MENTION_NOT_FOUND" } })
  })

  it("allows every mention status to be reversed without side effects", async () => {
    const t = createBackendTest()
    const customer = await seedCustomer(t, {
      paid: true,
      suffix: "status-reversible",
    })
    const seeded = await seedMentions(t, customer)
    const mentionId = seeded.mentionIds[0]!

    for (const status of ["saved", "new", "dismissed", "new"] as const) {
      const updated = (await customer.client.mutation(
        updateMentionStatusReference,
        { mentionId, status },
      )) as { status: string }
      expect(updated.status).toBe(status)
    }
    const counts = await t.run(async (ctx) => ({
      matches: (await ctx.db.query("mentionKeywordMatches").collect()).length,
      mentions: (await ctx.db.query("mentions").collect()).length,
      sources: (await ctx.db.query("trackingSources").collect()).length,
    }))
    expect(counts).toEqual({ matches: 2, mentions: 3, sources: 1 })
  })
})
