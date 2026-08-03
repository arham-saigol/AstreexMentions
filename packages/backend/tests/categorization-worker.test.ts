import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { convexTest } from "convex-test"
import { defineSchema, defineTable, makeFunctionReference } from "convex/server"
import { type GenericId, v } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  categorySnapshotJson,
  CATEGORIZATION_LEASE_MS,
} from "../convex/categorization/model"
import {
  buildDeepSeekCategorizationRequest,
  MAX_CATEGORIZATION_BATCH_PROMPT_CHARS,
  MAX_CATEGORIZATION_MENTION_TEXT_CHARS,
  type CategorizationCategory,
} from "../convex/lib/deepseekCategorization"

const NOW = Date.parse("2026-07-26T12:00:00.000Z")
const BLOCKED_CONFIGURATION_RETRY_MS = 5 * 60_000

const categorizationTestSchema = defineSchema({
  categories: defineTable(v.any()).index(
    "by_workspace_deleted_enabled_and_sort_order",
    ["workspaceId", "deletedAt", "enabled", "sortOrder"],
  ),
  categorizationJobs: defineTable(v.any())
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_status_and_next_attempt_at", ["status", "nextAttemptAt"])
    .index("by_status_and_lease_expires_at", ["status", "leaseExpiresAt"]),
  mentions: defineTable(v.any()),
  providerMetricBuckets: defineTable(v.any()).index(
    "by_provider_operation_granularity_and_bucket",
    ["provider", "operation", "granularity", "bucketStartAt"],
  ),
  providerRuns: defineTable(v.any()).index("by_idempotency_key", [
    "idempotencyKey",
  ]),
  systemMetricBuckets: defineTable(v.any()).index(
    "by_metric_scope_workspace_granularity_and_bucket",
    ["metric", "scope", "workspaceId", "granularity", "bucketStartAt"],
  ),
  usageCycles: defineTable(v.any()),
  workspaces: defineTable(v.any()),
})

const modules = {
  "./_generated/server.ts": async () => ({}),
  "./categorization/actions.ts": async () =>
    await import("../convex/categorization/actions"),
  "./categorization/internal.ts": async () =>
    await import("../convex/categorization/internal"),
}

function createBackendTest() {
  return convexTest({ modules, schema: categorizationTestSchema })
}

type BackendTest = ReturnType<typeof createBackendTest>
type CategorizationJobId = GenericId<"categorizationJobs">
type CategoryId = GenericId<"categories">
type MentionId = GenericId<"mentions">
type WorkspaceId = GenericId<"workspaces">

type BatchCase = {
  expectedBatchSizes: number[]
  mentionCount: number
}

type CategoryFixture = {
  description: string
  enabled: boolean
  isSystem: boolean
  name: string
  systemKey?: string
}

type CategorizationFixture = {
  batchCases: BatchCase[]
  categories: CategoryFixture[]
  disabledCategory: CategoryFixture
  invalidOutputs: Array<
    | "duplicate_mapping"
    | "missing_mapping"
    | "unknown_category"
    | "unknown_mention"
  >
  mentions: Array<{ body: string; title: string }>
  providerFailures: {
    permanentStatus: number
    transientStatus: number
  }
}

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("./fixtures/categorization/deepseek-cases.json", import.meta.url),
    ),
    "utf8",
  ),
) as CategorizationFixture

const dispatchReference = makeFunctionReference<
  "mutation",
  { now?: number },
  { batches: number; blockedCatalog: number; claimed: number; state: string }
>("categorization/internal:dispatchDueCategorizationJobs")

const executeReference = makeFunctionReference<
  "action",
  {
    categorySnapshotJson: string
    jobIds: CategorizationJobId[]
    leaseToken: string
  },
  unknown
>("categorization/actions:executeCategorizationBatch")

type SeededCategorization = {
  categories: Array<{
    description: string
    id: CategoryId
    name: string
  }>
  jobIds: CategorizationJobId[]
  mentionIds: MentionId[]
  usageCycleId: GenericId<"usageCycles">
  workspaceId: WorkspaceId
}

async function seedCategorization(
  t: BackendTest,
  options: {
    includeOther?: boolean
    maxAttempts?: number
    mentionCount: number
  },
): Promise<SeededCategorization> {
  return await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      createdAt: NOW - 10_000,
      name: "Categorization fixture workspace",
      updatedAt: NOW - 10_000,
    })
    const categories: SeededCategorization["categories"] = []
    let sortOrder = 0
    for (const category of fixture.categories) {
      if (category.systemKey === "other" && options.includeOther === false) {
        continue
      }
      const id = await ctx.db.insert("categories", {
        ...category,
        createdAt: NOW - 9_000 + sortOrder,
        normalizedName: category.name.toLowerCase(),
        sortOrder,
        updatedAt: NOW - 9_000 + sortOrder,
        workspaceId,
      })
      categories.push({
        description: category.description,
        id,
        name: category.name,
      })
      sortOrder += 1
    }
    await ctx.db.insert("categories", {
      ...fixture.disabledCategory,
      createdAt: NOW - 8_000,
      normalizedName: fixture.disabledCategory.name.toLowerCase(),
      sortOrder,
      updatedAt: NOW - 8_000,
      workspaceId,
    })

    const mentionIds: MentionId[] = []
    const jobIds: CategorizationJobId[] = []
    for (let index = 0; index < options.mentionCount; index += 1) {
      const mentionFixture = fixture.mentions[index % fixture.mentions.length]!
      const mentionId = await ctx.db.insert("mentions", {
        analysisState: "pending",
        body: `${mentionFixture.body} Fixture ${index}.`,
        firstSeenAt: NOW - 1_000 + index,
        title: mentionFixture.title,
        updatedAt: NOW - 1_000 + index,
        workspaceId,
      })
      const jobId = await ctx.db.insert("categorizationJobs", {
        attempts: 0,
        createdAt: NOW - 1_000 + index,
        idempotencyKey: `categorization:mention:${String(mentionId)}`,
        maxAttempts: options.maxAttempts ?? 3,
        mentionId,
        model: "deepseek-v4-pro",
        nextAttemptAt: NOW,
        status: "pending",
        updatedAt: NOW - 1_000 + index,
        workspaceId,
      })
      mentionIds.push(mentionId)
      jobIds.push(jobId)
    }

    const usageCycleId = await ctx.db.insert("usageCycles", {
      categorizationsUsed: 17,
      mentionsUsed: 23,
      updatedAt: NOW - 500,
      workspaceId,
    })

    return { categories, jobIds, mentionIds, usageCycleId, workspaceId }
  })
}

function snapshotJson(seeded: SeededCategorization): string {
  return categorySnapshotJson(
    seeded.categories.map((category) => ({
      description: category.description,
      id: String(category.id),
      name: category.name,
    })),
  )
}

async function leasedBatchArguments(
  t: BackendTest,
  seeded: SeededCategorization,
): Promise<
  Array<{
    categorySnapshotJson: string
    jobIds: CategorizationJobId[]
    leaseToken: string
  }>
> {
  const jobs = await t.run(
    async (ctx) => await ctx.db.query("categorizationJobs").collect(),
  )
  const byLease = new Map<string, CategorizationJobId[]>()
  for (const job of jobs) {
    if (job.status !== "leased" || typeof job.leaseToken !== "string") {
      continue
    }
    const ids = byLease.get(job.leaseToken) ?? []
    ids.push(job._id)
    byLease.set(job.leaseToken, ids)
  }
  return [...byLease.entries()]
    .map(([leaseToken, jobIds]) => ({
      categorySnapshotJson: snapshotJson(seeded),
      jobIds,
      leaseToken,
    }))
    .sort((left, right) => right.jobIds.length - left.jobIds.length)
}

function categorizationOutput(
  seeded: SeededCategorization,
  kind:
    | "duplicate_mapping"
    | "missing_mapping"
    | "unknown_category"
    | "unknown_mention"
    | "valid",
) {
  const questionId = String(seeded.categories[0]!.id)
  const bugId = String(seeded.categories[1]!.id)
  const first = {
    categoryId: questionId,
    mentionId: String(seeded.mentionIds[0]),
  }
  const second = {
    categoryId: bugId,
    mentionId: String(seeded.mentionIds[1] ?? seeded.mentionIds[0]),
  }

  switch (kind) {
    case "valid":
      return { results: [first, second].slice(0, seeded.mentionIds.length) }
    case "missing_mapping":
      return { results: [first] }
    case "duplicate_mapping":
      return { results: [first, first] }
    case "unknown_mention":
      return {
        results: [first, { ...second, mentionId: "unknown-mention-id" }],
      }
    case "unknown_category":
      return {
        results: [first, { ...second, categoryId: "unknown-category-id" }],
      }
  }
}

function completionFetch(output: unknown) {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(output) } }],
        }),
        { status: 200 },
      ),
  )
}

let previousApiKey: string | undefined
let previousTimeout: string | undefined

beforeEach(() => {
  previousApiKey = process.env.DEEPSEEK_API_KEY
  previousTimeout = process.env.DEEPSEEK_TIMEOUT_MS
  delete process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_TIMEOUT_MS
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  if (previousApiKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY
  } else {
    process.env.DEEPSEEK_API_KEY = previousApiKey
  }
  if (previousTimeout === undefined) {
    delete process.env.DEEPSEEK_TIMEOUT_MS
  } else {
    process.env.DEEPSEEK_TIMEOUT_MS = previousTimeout
  }
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("durable DeepSeek categorization worker", () => {
  it.each(fixture.batchCases)(
    "claims $mentionCount pending jobs as $expectedBatchSizes",
    async ({ expectedBatchSizes, mentionCount }) => {
      const t = createBackendTest()
      const seeded = await seedCategorization(t, { mentionCount })

      const result = await t.mutation(dispatchReference, { now: NOW })
      const batches = await leasedBatchArguments(t, seeded)

      expect(result).toMatchObject({
        batches: expectedBatchSizes.length,
        claimed: mentionCount,
        state: "dispatched",
      })
      expect(batches.map(({ jobIds }) => jobIds.length)).toEqual(
        expectedBatchSizes,
      )
      const jobs = await t.run(
        async (ctx) => await ctx.db.query("categorizationJobs").collect(),
      )
      expect(jobs).toHaveLength(mentionCount)
      expect(
        jobs.every(
          (job) =>
            job.attempts === 1 &&
            job.status === "leased" &&
            job.leaseExpiresAt === NOW + CATEGORIZATION_LEASE_MS,
        ),
      ).toBe(true)
    },
  )

  it("never combines categorization jobs from different workspaces", async () => {
    const t = createBackendTest()
    await seedCategorization(t, { mentionCount: 30 })
    await seedCategorization(t, { mentionCount: 30 })

    await expect(
      t.mutation(dispatchReference, { now: NOW }),
    ).resolves.toMatchObject({ batches: 2, claimed: 60 })
    const jobs = await t.run(
      async (ctx) => await ctx.db.query("categorizationJobs").collect(),
    )
    const workspacesByLease = new Map<string, Set<string>>()
    const countsByLease = new Map<string, number>()
    for (const job of jobs) {
      const leaseToken = job.leaseToken as string
      const workspaceIds =
        workspacesByLease.get(leaseToken) ?? new Set<string>()
      workspaceIds.add(String(job.workspaceId))
      workspacesByLease.set(leaseToken, workspaceIds)
      countsByLease.set(leaseToken, (countsByLease.get(leaseToken) ?? 0) + 1)
    }
    expect(
      [...workspacesByLease.values()].every(
        (workspaceIds) => workspaceIds.size === 1,
      ),
    ).toBe(true)
    expect(
      [...countsByLease.values()].sort((left, right) => right - left),
    ).toEqual([30, 30])
  })

  it("truncates mention text and leases batches within the prompt budget", async () => {
    const t = createBackendTest()
    const seeded = await seedCategorization(t, { mentionCount: 20 })
    await t.run(async (ctx) => {
      for (const mentionId of seeded.mentionIds) {
        await ctx.db.patch("mentions", mentionId, {
          body: "x".repeat(MAX_CATEGORIZATION_MENTION_TEXT_CHARS * 2),
          title: "Long mention",
        })
      }
    })

    await expect(
      t.mutation(dispatchReference, { now: NOW }),
    ).resolves.toMatchObject({ batches: 2, claimed: seeded.jobIds.length })
    const batches = await leasedBatchArguments(t, seeded)
    expect(batches).toHaveLength(2)
    expect(
      batches.every(
        ({ jobIds }) =>
          jobIds.length > 0 && jobIds.length < seeded.jobIds.length,
      ),
    ).toBe(true)

    const loadContext = makeFunctionReference<
      "query",
      {
        categorySnapshotJson: string
        jobIds: CategorizationJobId[]
        leaseToken: string
      },
      {
        mentions?: Array<{ id: string; text: string }>
        state: string
      }
    >("categorization/internal:loadCategorizationBatchContext")
    for (const args of batches) {
      const context = await t.query(loadContext, args)
      expect(context.state).toBe("ready")
      expect(
        JSON.stringify({ mentions: context.mentions }).length,
      ).toBeLessThanOrEqual(MAX_CATEGORIZATION_BATCH_PROMPT_CHARS)
      expect(
        context.mentions?.every(
          ({ text }) =>
            text.length <= MAX_CATEGORIZATION_MENTION_TEXT_CHARS &&
            text.endsWith("[truncated]"),
        ),
      ).toBe(true)
    }
  })

  it("puts every enabled category description in the prompt and sends required DeepSeek controls", async () => {
    const promptCategories: CategorizationCategory[] = fixture.categories.map(
      (category, index) => ({
        description: category.description,
        id: `fixture-category-${index}`,
        name: category.name,
      }),
    )
    const request = buildDeepSeekCategorizationRequest(
      [{ id: "fixture-mention", text: "Fixture mention text" }],
      promptCategories,
    )
    expect(request).toMatchObject({
      model: "deepseek-v4-pro",
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      temperature: 0,
      thinking: { type: "enabled" },
    })
    for (const category of fixture.categories) {
      expect(request.messages[0].content).toContain(category.description)
    }
    expect(request.messages[0].content).not.toContain(
      fixture.disabledCategory.description,
    )
    expect(() =>
      buildDeepSeekCategorizationRequest(
        [{ id: "fixture-mention", text: "Fixture mention text" }],
        promptCategories.filter((category) => category.name !== "Other"),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CATALOG" }))
    expect(() =>
      buildDeepSeekCategorizationRequest(
        [{ id: "fixture-mention", text: "Fixture mention text" }],
        promptCategories.map((category, index) =>
          index === 0 ? { ...category, description: "" } : category,
        ),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CATALOG" }))

    const t = createBackendTest()
    const seeded = await seedCategorization(t, { mentionCount: 1 })
    const fetchMock = completionFetch(categorizationOutput(seeded, "valid"))
    vi.stubGlobal("fetch", fetchMock)
    process.env.DEEPSEEK_API_KEY = "deepseek_fixture_key"
    await t.mutation(dispatchReference, { now: NOW })
    const [args] = await leasedBatchArguments(t, seeded)

    await expect(t.action(executeReference, args!)).resolves.toEqual({
      completed: 1,
      state: "completed",
    })
    const categoryMetrics = await t.run(
      async (ctx) => await ctx.db.query("systemMetricBuckets").collect(),
    )
    expect(
      categoryMetrics.filter((row) =>
        String(row.metric).startsWith("mentions_categorized:"),
      ),
    ).toEqual([
      expect.objectContaining({
        metric: "mentions_categorized:question",
        scope: "global",
        value: 1,
      }),
    ])

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      model: "deepseek-v4-pro",
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      temperature: 0,
      thinking: { type: "enabled" },
    })
    const systemPrompt = (
      body.messages as Array<{ content: string; role: string }>
    )[0]!.content
    for (const category of fixture.categories) {
      expect(systemPrompt).toContain(category.description)
    }
    expect(systemPrompt).not.toContain(fixture.disabledCategory.description)
  })

  it("blocks a workspace snapshot unless the enabled permanent Other category is present", async () => {
    const t = createBackendTest()
    await seedCategorization(t, { includeOther: false, mentionCount: 2 })

    await expect(
      t.mutation(dispatchReference, { now: NOW }),
    ).resolves.toMatchObject({
      batches: 0,
      blockedCatalog: 2,
      claimed: 0,
    })
    const state = await t.run(async (ctx) => ({
      jobs: await ctx.db.query("categorizationJobs").collect(),
      mentions: await ctx.db.query("mentions").collect(),
    }))
    expect(
      state.jobs.every((job) => job.status === "pending" && job.attempts === 0),
    ).toBe(true)
    expect(
      state.mentions.every((mention) => mention.analysisState === "pending"),
    ).toBe(true)
  })

  it.each(fixture.invalidOutputs)(
    "rejects %s for the whole leased batch without partial category writes",
    async (kind) => {
      const t = createBackendTest()
      const seeded = await seedCategorization(t, { mentionCount: 2 })
      await t.mutation(dispatchReference, { now: NOW })
      const [args] = await leasedBatchArguments(t, seeded)
      const fetchMock = completionFetch(categorizationOutput(seeded, kind))
      vi.stubGlobal("fetch", fetchMock)
      process.env.DEEPSEEK_API_KEY = "deepseek_fixture_key"

      await expect(t.action(executeReference, args!)).resolves.toMatchObject({
        dead: 0,
        pending: 2,
        state: "failed",
      })
      const state = await t.run(async (ctx) => ({
        jobs: await ctx.db.query("categorizationJobs").collect(),
        mentions: await ctx.db.query("mentions").collect(),
        metrics: (await ctx.db.query("providerMetricBuckets").collect()).filter(
          (metric) => metric.granularity === "hour",
        ),
        runs: await ctx.db.query("providerRuns").collect(),
      }))
      expect(
        state.mentions.every(
          (mention) =>
            mention.analysisState === "pending" &&
            mention.categoryId === undefined,
        ),
      ).toBe(true)
      expect(
        state.jobs.every(
          (job) =>
            job.status === "pending" &&
            job.attempts === 1 &&
            job.lastError === "invalid_model_output" &&
            typeof job.nextAttemptAt === "number",
        ),
      ).toBe(true)
      expect(state.runs).toEqual([
        expect.objectContaining({
          errorCode: "invalid_model_output",
          inputCount: 2,
          outputCount: 0,
          status: "failed",
        }),
      ])
      expect(state.metrics).toEqual([
        expect.objectContaining({
          failureCount: 1,
          inputItemCount: 2,
          outputItemCount: 0,
          requestCount: 1,
          successCount: 0,
        }),
      ])
    },
  )

  it("ignores a stale lease before configuration lookup or provider I/O", async () => {
    const t = createBackendTest()
    const seeded = await seedCategorization(t, { mentionCount: 1 })
    await t.mutation(dispatchReference, { now: NOW })
    const [args] = await leasedBatchArguments(t, seeded)
    const fetchMock = vi.fn(async () => {
      throw new Error("stale leases must not call DeepSeek")
    })
    vi.stubGlobal("fetch", fetchMock)
    process.env.DEEPSEEK_API_KEY = "deepseek_fixture_key"
    vi.setSystemTime(NOW + CATEGORIZATION_LEASE_MS)

    await expect(t.action(executeReference, args!)).resolves.toEqual({
      state: "stale_lease",
    })
    const state = await t.run(async (ctx) => ({
      jobs: await ctx.db.query("categorizationJobs").collect(),
      metrics: (await ctx.db.query("providerMetricBuckets").collect()).filter(
        (metric) => metric.granularity === "hour",
      ),
      runs: await ctx.db.query("providerRuns").collect(),
    }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(state.jobs[0]).toMatchObject({ attempts: 1, status: "leased" })
    expect(state.runs).toHaveLength(0)
    expect(state.metrics).toHaveLength(0)
  })

  it("retries transient failures with a new lease and becomes dead at the bound", async () => {
    const t = createBackendTest()
    const seeded = await seedCategorization(t, {
      maxAttempts: 2,
      mentionCount: 1,
    })
    const fetchMock = vi.fn(
      async () =>
        new Response("temporary provider failure", {
          status: fixture.providerFailures.transientStatus,
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    process.env.DEEPSEEK_API_KEY = "deepseek_fixture_key"

    await t.mutation(dispatchReference, { now: NOW })
    const [firstArgs] = await leasedBatchArguments(t, seeded)
    await expect(t.action(executeReference, firstArgs!)).resolves.toMatchObject(
      {
        dead: 0,
        pending: 1,
      },
    )
    const firstFailure = await t.run(
      async (ctx) => await ctx.db.get("categorizationJobs", seeded.jobIds[0]!),
    )
    expect(firstFailure).toMatchObject({
      attempts: 1,
      lastError: "SERVER_ERROR",
      status: "pending",
    })
    const nextAttemptAt = firstFailure!.nextAttemptAt as number
    expect(nextAttemptAt).toBeGreaterThan(NOW)

    vi.setSystemTime(nextAttemptAt)
    await t.mutation(dispatchReference, { now: nextAttemptAt })
    const [secondArgs] = await leasedBatchArguments(t, seeded)
    expect(secondArgs!.leaseToken).not.toBe(firstArgs!.leaseToken)
    await expect(
      t.action(executeReference, secondArgs!),
    ).resolves.toMatchObject({
      dead: 1,
      pending: 0,
    })

    const state = await t.run(async (ctx) => ({
      job: await ctx.db.get("categorizationJobs", seeded.jobIds[0]!),
      mention: await ctx.db.get("mentions", seeded.mentionIds[0]!),
      metrics: (await ctx.db.query("providerMetricBuckets").collect()).filter(
        (metric) => metric.granularity === "hour",
      ),
      runs: await ctx.db.query("providerRuns").collect(),
    }))
    expect(state.job).toMatchObject({
      attempts: 2,
      lastError: "SERVER_ERROR",
      status: "dead",
    })
    expect(state.mention).toMatchObject({ analysisState: "failed" })
    expect(state.runs).toHaveLength(2)
    expect(state.metrics).toEqual([
      expect.objectContaining({
        failureCount: 2,
        requestCount: 2,
        retryCount: 1,
        successCount: 0,
      }),
    ])
  })

  it("dead-letters a permanent provider failure without another retry", async () => {
    const t = createBackendTest()
    const seeded = await seedCategorization(t, { mentionCount: 1 })
    const fetchMock = vi.fn(
      async () =>
        new Response("authentication failed", {
          status: fixture.providerFailures.permanentStatus,
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    process.env.DEEPSEEK_API_KEY = "deepseek_fixture_key"

    await t.mutation(dispatchReference, { now: NOW })
    const [args] = await leasedBatchArguments(t, seeded)
    await expect(t.action(executeReference, args!)).resolves.toMatchObject({
      dead: 1,
      pending: 0,
    })
    const state = await t.run(async (ctx) => ({
      job: await ctx.db.get("categorizationJobs", seeded.jobIds[0]!),
      mention: await ctx.db.get("mentions", seeded.mentionIds[0]!),
    }))
    expect(state.job).toMatchObject({
      attempts: 1,
      lastError: "AUTH",
      status: "dead",
    })
    expect(state.job?.nextAttemptAt).toBeUndefined()
    expect(state.mention).toMatchObject({ analysisState: "failed" })
  })

  it("keeps missing provider configuration pending without attempt or telemetry churn", async () => {
    const t = createBackendTest()
    const seeded = await seedCategorization(t, { mentionCount: 1 })
    const fetchMock = vi.fn(async () => {
      throw new Error("missing configuration must not call DeepSeek")
    })
    vi.stubGlobal("fetch", fetchMock)

    await t.mutation(dispatchReference, { now: NOW })
    const [args] = await leasedBatchArguments(t, seeded)
    await expect(t.action(executeReference, args!)).resolves.toMatchObject({
      missing: ["DEEPSEEK_API_KEY"],
      state: "blocked_config",
    })
    const blocked = await t.run(async (ctx) => ({
      job: await ctx.db.get("categorizationJobs", seeded.jobIds[0]!),
      metrics: (await ctx.db.query("providerMetricBuckets").collect()).filter(
        (metric) => metric.granularity === "hour",
      ),
      runs: await ctx.db.query("providerRuns").collect(),
    }))
    expect(blocked.job).toMatchObject({
      attempts: 0,
      lastError: "blocked_config",
      nextAttemptAt: NOW + BLOCKED_CONFIGURATION_RETRY_MS,
      status: "pending",
    })
    expect(blocked.runs).toHaveLength(0)
    expect(blocked.metrics).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()

    await expect(
      t.mutation(dispatchReference, { now: NOW + 60_000 }),
    ).resolves.toMatchObject({ batches: 0, claimed: 0 })
    const unchanged = await t.run(
      async (ctx) => await ctx.db.get("categorizationJobs", seeded.jobIds[0]!),
    )
    expect(unchanged).toMatchObject({
      attempts: 0,
      nextAttemptAt: NOW + BLOCKED_CONFIGURATION_RETRY_MS,
      status: "pending",
    })
  })

  it("atomically applies a valid batch, records provider telemetry, and does not increment usage", async () => {
    const t = createBackendTest()
    const seeded = await seedCategorization(t, { mentionCount: 2 })
    const usageBefore = await t.run(
      async (ctx) => await ctx.db.get("usageCycles", seeded.usageCycleId),
    )
    const fetchMock = completionFetch(categorizationOutput(seeded, "valid"))
    vi.stubGlobal("fetch", fetchMock)
    process.env.DEEPSEEK_API_KEY = "deepseek_fixture_key"

    await t.mutation(dispatchReference, { now: NOW })
    const [args] = await leasedBatchArguments(t, seeded)
    await expect(t.action(executeReference, args!)).resolves.toEqual({
      completed: 2,
      state: "completed",
    })

    const state = await t.run(async (ctx) => ({
      jobs: await ctx.db.query("categorizationJobs").collect(),
      mentions: await ctx.db.query("mentions").collect(),
      metrics: (await ctx.db.query("providerMetricBuckets").collect()).filter(
        (metric) => metric.granularity === "hour",
      ),
      runs: await ctx.db.query("providerRuns").collect(),
      usage: await ctx.db.get("usageCycles", seeded.usageCycleId),
    }))
    expect(
      state.jobs.every(
        (job) => job.status === "completed" && job.attempts === 1,
      ),
    ).toBe(true)
    expect(state.mentions.map((mention) => String(mention.categoryId))).toEqual(
      [String(seeded.categories[0]!.id), String(seeded.categories[1]!.id)],
    )
    expect(
      state.mentions.every((mention) => mention.analysisState === "completed"),
    ).toBe(true)
    expect(state.runs).toEqual([
      expect.objectContaining({
        attempt: 1,
        inputCount: 2,
        operation: "chat.completions",
        outputCount: 2,
        provider: "deepseek",
        status: "succeeded",
        trigger: "scheduled",
      }),
    ])
    expect(state.metrics).toEqual([
      expect.objectContaining({
        failureCount: 0,
        inputItemCount: 2,
        outputItemCount: 2,
        requestCount: 1,
        successCount: 1,
      }),
    ])
    expect(state.usage).toEqual(usageBefore)
  })

  it("wires the categorization dispatcher to a one-minute cron", () => {
    const cronSource = readFileSync(
      fileURLToPath(new URL("../convex/crons.ts", import.meta.url)),
      "utf8",
    )
    expect(cronSource).toContain('import { internal } from "./_generated/api"')
    expect(cronSource).toMatch(
      /"dispatch mention categorization jobs",\s*\{ minutes: 1 \},\s*internal\.categorization\.internal\.dispatchDueCategorizationJobs/,
    )
  })
})
