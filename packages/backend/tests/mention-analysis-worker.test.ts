import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { convexTest } from "convex-test"
import { defineSchema, defineTable, makeFunctionReference } from "convex/server"
import { type GenericId, v } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  analysisSnapshotJson,
  MENTION_ANALYSIS_LEASE_MS,
  mentionText,
} from "../convex/mentionAnalysis/model"
import {
  buildDeepSeekMentionAnalysisRequest,
  MAX_MENTION_ANALYSIS_BATCH_PROMPT_CHARS,
  MAX_MENTION_ANALYSIS_MENTION_TEXT_CHARS,
  type MentionAnalysisCategory,
} from "../convex/lib/deepseekMentionAnalysis"

const NOW = Date.parse("2026-07-26T12:00:00.000Z")
const BLOCKED_CONFIGURATION_RETRY_MS = 5 * 60_000
const FILTERING_CONTEXT =
  "Astreex monitors customer conversations for the Astreex product."
const FILTERING_GUIDELINES =
  "Keep ambiguous mentions relevant. Filter clearly unrelated meanings."

const mentionAnalysisTestSchema = defineSchema({
  categories: defineTable(v.any()).index(
    "by_workspace_deleted_enabled_and_sort_order",
    ["workspaceId", "deletedAt", "enabled", "sortOrder"],
  ),
  mentionAnalysisJobs: defineTable(v.any())
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_status_and_next_attempt_at", ["status", "nextAttemptAt"])
    .index("by_status_and_lease_expires_at", ["status", "leaseExpiresAt"]),
  keywords: defineTable(v.any()),
  mentionKeywordMatches: defineTable(v.any()).index(
    "by_workspace_and_mention",
    ["workspaceId", "mentionId"],
  ),
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
  "./mentionAnalysis/actions.ts": async () =>
    await import("../convex/mentionAnalysis/actions"),
  "./mentionAnalysis/internal.ts": async () =>
    await import("../convex/mentionAnalysis/internal"),
}

function createBackendTest() {
  return convexTest({ modules, schema: mentionAnalysisTestSchema })
}

type BackendTest = ReturnType<typeof createBackendTest>
type MentionAnalysisJobId = GenericId<"mentionAnalysisJobs">
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

type MentionAnalysisFixture = {
  batchCases: BatchCase[]
  categories: CategoryFixture[]
  disabledCategory: CategoryFixture
  invalidOutputs: Array<
    | "duplicate_mapping"
    | "extra_field"
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
      new URL(
        "./fixtures/mention-analysis/deepseek-cases.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as MentionAnalysisFixture

const dispatchReference = makeFunctionReference<
  "mutation",
  { now?: number },
  { batches: number; blockedCatalog: number; claimed: number; state: string }
>("mentionAnalysis/internal:dispatchDueMentionAnalysisJobs")

const executeReference = makeFunctionReference<
  "action",
  {
    analysisSnapshotJson: string
    jobIds: MentionAnalysisJobId[]
    leaseToken: string
    mentionContextJson: string
  },
  unknown
>("mentionAnalysis/actions:executeMentionAnalysisBatch")

type SeededMentionAnalysis = {
  categories: Array<{
    description: string
    id: CategoryId
    name: string
  }>
  jobIds: MentionAnalysisJobId[]
  mentionIds: MentionId[]
  usageCycleId: GenericId<"usageCycles">
  workspaceId: WorkspaceId
}

async function seedMentionAnalysis(
  t: BackendTest,
  options: {
    includeOther?: boolean
    maxAttempts?: number
    mentionCount: number
  },
): Promise<SeededMentionAnalysis> {
  return await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      createdAt: NOW - 10_000,
      filteringContext: FILTERING_CONTEXT,
      filteringGuidelines: FILTERING_GUIDELINES,
      name: "Mention analysis fixture workspace",
      updatedAt: NOW - 10_000,
    })
    const categories: SeededMentionAnalysis["categories"] = []
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
    const jobIds: MentionAnalysisJobId[] = []
    for (let index = 0; index < options.mentionCount; index += 1) {
      const mentionFixture = fixture.mentions[index % fixture.mentions.length]!
      const mentionId = await ctx.db.insert("mentions", {
        analysisState: "pending",
        feedState: "pending",
        body: `${mentionFixture.body} Fixture ${index}.`,
        firstSeenAt: NOW - 1_000 + index,
        title: mentionFixture.title,
        updatedAt: NOW - 1_000 + index,
        workspaceId,
      })
      const jobId = await ctx.db.insert("mentionAnalysisJobs", {
        attempts: 0,
        createdAt: NOW - 1_000 + index,
        idempotencyKey: `mention-analysis:mention:${String(mentionId)}`,
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
      mentionsUsed: 23,
      updatedAt: NOW - 500,
      workspaceId,
    })

    return { categories, jobIds, mentionIds, usageCycleId, workspaceId }
  })
}

function snapshotJson(seeded: SeededMentionAnalysis): string {
  return analysisSnapshotJson(
    seeded.categories.map((category) => ({
      description: category.description,
      id: String(category.id),
      name: category.name,
    })),
    {
      filteringContext: FILTERING_CONTEXT,
      filteringGuidelines: FILTERING_GUIDELINES,
    },
  )
}

async function leasedBatchArguments(
  t: BackendTest,
  seeded: SeededMentionAnalysis,
): Promise<
  Array<{
    analysisSnapshotJson: string
    jobIds: MentionAnalysisJobId[]
    leaseToken: string
    mentionContextJson: string
  }>
> {
  const jobs = await t.run(
    async (ctx) => await ctx.db.query("mentionAnalysisJobs").collect(),
  )
  const byLease = new Map<string, MentionAnalysisJobId[]>()
  for (const job of jobs) {
    if (job.status !== "leased" || typeof job.leaseToken !== "string") {
      continue
    }
    const ids = byLease.get(job.leaseToken) ?? []
    ids.push(job._id)
    byLease.set(job.leaseToken, ids)
  }
  const batches = await Promise.all(
    [...byLease.entries()].map(async ([leaseToken, jobIds]) => ({
      analysisSnapshotJson: snapshotJson(seeded),
      jobIds,
      leaseToken,
      mentionContextJson: JSON.stringify(
        await t.run(
          async (ctx) =>
            await Promise.all(
              jobIds.map(async (jobId) => {
                const job = await ctx.db.get("mentionAnalysisJobs", jobId)
                const mention = job
                  ? await ctx.db.get("mentions", job.mentionId as MentionId)
                  : null
                if (!mention) throw new TypeError("Leased mention is missing")
                const matches = await ctx.db
                  .query("mentionKeywordMatches")
                  .withIndex("by_workspace_and_mention", (q) =>
                    q
                      .eq("workspaceId", mention.workspaceId)
                      .eq("mentionId", mention._id),
                  )
                  .take(3)
                const keywordRows = await Promise.all(
                  matches.map(
                    async (match) =>
                      await ctx.db.get("keywords", match.keywordId),
                  ),
                )
                const keywords = keywordRows
                  .filter((keyword) => keyword !== null)
                  .map((keyword) => ({
                    phrase: keyword.phrase as string,
                    ...(typeof keyword.description === "string"
                      ? { description: keyword.description }
                      : {}),
                  }))
                  .sort((left, right) =>
                    left.phrase.localeCompare(right.phrase, "en"),
                  )
                return {
                  id: String(mention._id),
                  text: mentionText({
                    body: mention.body as string,
                    ...(typeof mention.title === "string"
                      ? { title: mention.title }
                      : {}),
                  }),
                  ...(keywords.length ? { keywords } : {}),
                }
              }),
            ),
        ),
      ),
    })),
  )
  return batches.sort((left, right) => right.jobIds.length - left.jobIds.length)
}

function mentionAnalysisOutput(
  seeded: SeededMentionAnalysis,
  kind:
    | "duplicate_mapping"
    | "extra_field"
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
    priority: "medium" as const,
    priorityReason: "A customer question should be reviewed soon.",
    relevant: true,
    relevanceReason: "The mention discusses the monitored product.",
  }
  const second = {
    categoryId: bugId,
    mentionId: String(seeded.mentionIds[1] ?? seeded.mentionIds[0]),
    priority: "high" as const,
    priorityReason: "The severe regression needs immediate review.",
    relevant: false,
    relevanceReason: "The text uses an unrelated meaning of the keyword.",
  }

  switch (kind) {
    case "valid":
      return { results: [first, second].slice(0, seeded.mentionIds.length) }
    case "missing_mapping":
      return { results: [first] }
    case "duplicate_mapping":
      return { results: [first, first] }
    case "extra_field":
      return { explanation: "untrusted model output", results: [first, second] }
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

describe("durable DeepSeek mention analysis worker", () => {
  it.each(fixture.batchCases)(
    "claims $mentionCount pending jobs as $expectedBatchSizes",
    async ({ expectedBatchSizes, mentionCount }) => {
      const t = createBackendTest()
      const seeded = await seedMentionAnalysis(t, { mentionCount })

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
        async (ctx) => await ctx.db.query("mentionAnalysisJobs").collect(),
      )
      expect(jobs).toHaveLength(mentionCount)
      expect(
        jobs.every(
          (job) =>
            job.attempts === 1 &&
            job.status === "leased" &&
            job.leaseExpiresAt === NOW + MENTION_ANALYSIS_LEASE_MS,
        ),
      ).toBe(true)
    },
  )

  it("reanalyzes completed mentions that do not have priority results", async () => {
    const t = createBackendTest()
    const seeded = await seedMentionAnalysis(t, { mentionCount: 1 })
    await t.run(
      async (ctx) =>
        await ctx.db.patch("mentions", seeded.mentionIds[0]!, {
          analysisState: "completed",
          categoryId: seeded.categories[0]!.id,
        }),
    )

    await expect(
      t.mutation(dispatchReference, { now: NOW }),
    ).resolves.toMatchObject({ batches: 1, claimed: 1 })
    const job = await t.run(
      async (ctx) => await ctx.db.get("mentionAnalysisJobs", seeded.jobIds[0]!),
    )
    expect(job).toMatchObject({ attempts: 1, status: "leased" })
  })

  it("never combines mention analysis jobs from different workspaces", async () => {
    const t = createBackendTest()
    await seedMentionAnalysis(t, { mentionCount: 30 })
    await seedMentionAnalysis(t, { mentionCount: 30 })

    await expect(
      t.mutation(dispatchReference, { now: NOW }),
    ).resolves.toMatchObject({ batches: 4, claimed: 60 })
    const jobs = await t.run(
      async (ctx) => await ctx.db.query("mentionAnalysisJobs").collect(),
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
    ).toEqual([20, 20, 10, 10])
  })

  it("truncates mention text and leases batches within the prompt budget", async () => {
    const t = createBackendTest()
    const seeded = await seedMentionAnalysis(t, { mentionCount: 20 })
    await t.run(async (ctx) => {
      for (const mentionId of seeded.mentionIds) {
        await ctx.db.patch("mentions", mentionId, {
          body: "x".repeat(MAX_MENTION_ANALYSIS_MENTION_TEXT_CHARS * 2),
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
        analysisSnapshotJson: string
        jobIds: MentionAnalysisJobId[]
        leaseToken: string
        mentionContextJson: string
      },
      {
        mentions?: Array<{ id: string; text: string }>
        state: string
      }
    >("mentionAnalysis/internal:loadMentionAnalysisBatchContext")
    for (const args of batches) {
      const context = await t.query(loadContext, args)
      expect(context.state).toBe("ready")
      expect(
        JSON.stringify({ mentions: context.mentions }).length,
      ).toBeLessThanOrEqual(MAX_MENTION_ANALYSIS_BATCH_PROMPT_CHARS)
      expect(
        context.mentions?.every(
          ({ text }) =>
            text.length <= MAX_MENTION_ANALYSIS_MENTION_TEXT_CHARS &&
            text.endsWith("[truncated]"),
        ),
      ).toBe(true)
    }
  })

  it("puts every enabled category description in the prompt and sends required DeepSeek controls", async () => {
    const promptCategories: MentionAnalysisCategory[] = fixture.categories.map(
      (category, index) => ({
        description: category.description,
        id: `fixture-category-${index}`,
        name: category.name,
      }),
    )
    const request = buildDeepSeekMentionAnalysisRequest(
      [{ id: "fixture-mention", text: "Fixture mention text" }],
      promptCategories,
      {
        filteringContext: "Astreex is a mention monitoring product.",
        filteringGuidelines: "Keep ambiguous mentions relevant.",
      },
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
      buildDeepSeekMentionAnalysisRequest(
        [{ id: "fixture-mention", text: "Fixture mention text" }],
        promptCategories.filter((category) => category.name !== "Other"),
        { filteringContext: "Astreex is a mention monitoring product." },
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CATALOG" }))
    expect(() =>
      buildDeepSeekMentionAnalysisRequest(
        [{ id: "fixture-mention", text: "Fixture mention text" }],
        promptCategories.map((category, index) =>
          index === 0 ? { ...category, description: "" } : category,
        ),
        { filteringContext: "Astreex is a mention monitoring product." },
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CATALOG" }))

    const t = createBackendTest()
    const seeded = await seedMentionAnalysis(t, { mentionCount: 1 })
    const fetchMock = completionFetch(mentionAnalysisOutput(seeded, "valid"))
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
        String(row.metric).startsWith("mentions_analyzed_category:"),
      ),
    ).toEqual([
      expect.objectContaining({
        metric: "mentions_analyzed_category:question",
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

  it("leaves jobs pending when one mention cannot fit the analysis prompt", async () => {
    const t = createBackendTest()
    const seeded = await seedMentionAnalysis(t, { mentionCount: 1 })
    await t.run(async (ctx) => {
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("categories", {
          createdAt: NOW,
          description: `${index} ${"x".repeat(498)}`,
          enabled: true,
          isSystem: false,
          name: `Large category ${index}`,
          normalizedName: `large category ${index}`,
          sortOrder: index + 10,
          updatedAt: NOW,
          workspaceId: seeded.workspaceId,
        })
      }
    })

    await expect(
      t.mutation(dispatchReference, { now: NOW }),
    ).resolves.toMatchObject({ batches: 0, blockedCatalog: 1, claimed: 0 })
    const job = await t.run(
      async (ctx) => await ctx.db.get("mentionAnalysisJobs", seeded.jobIds[0]!),
    )
    expect(job).toMatchObject({ attempts: 0, status: "pending" })
  })

  it("blocks a workspace snapshot unless the enabled permanent Other category is present", async () => {
    const t = createBackendTest()
    await seedMentionAnalysis(t, { includeOther: false, mentionCount: 2 })

    await expect(
      t.mutation(dispatchReference, { now: NOW }),
    ).resolves.toMatchObject({
      batches: 0,
      blockedCatalog: 2,
      claimed: 0,
    })
    const state = await t.run(async (ctx) => ({
      jobs: await ctx.db.query("mentionAnalysisJobs").collect(),
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
      const seeded = await seedMentionAnalysis(t, { mentionCount: 2 })
      await t.mutation(dispatchReference, { now: NOW })
      const [args] = await leasedBatchArguments(t, seeded)
      const fetchMock = completionFetch(mentionAnalysisOutput(seeded, kind))
      vi.stubGlobal("fetch", fetchMock)
      process.env.DEEPSEEK_API_KEY = "deepseek_fixture_key"

      await expect(t.action(executeReference, args!)).resolves.toMatchObject({
        dead: 0,
        pending: 2,
        state: "failed",
      })
      const state = await t.run(async (ctx) => ({
        jobs: await ctx.db.query("mentionAnalysisJobs").collect(),
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

  it("rejects a stale snapshot after filtering guidance changes", async () => {
    const t = createBackendTest()
    const seeded = await seedMentionAnalysis(t, { mentionCount: 1 })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await t.mutation(dispatchReference, { now: NOW })
    const [args] = await leasedBatchArguments(t, seeded)
    await t.run(async (ctx) => {
      await ctx.db.patch("workspaces", seeded.workspaceId, {
        filteringGuidelines: "The reviewed guidance changed after leasing.",
      })
    })
    await expect(t.action(executeReference, args!)).resolves.toMatchObject({
      pending: 1,
      state: "failed",
    })
    const job = await t.run(
      async (ctx) => await ctx.db.get("mentionAnalysisJobs", seeded.jobIds[0]!),
    )
    expect(job).toMatchObject({
      lastError: "analysis_snapshot_changed",
      status: "pending",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a stale snapshot after matched keyword context changes", async () => {
    const t = createBackendTest()
    const seeded = await seedMentionAnalysis(t, { mentionCount: 1 })
    const keywordId = await t.run(async (ctx) => {
      const keywordId = await ctx.db.insert("keywords", {
        description: "Original keyword context",
        phrase: "Astreex",
        workspaceId: seeded.workspaceId,
      })
      await ctx.db.insert("mentionKeywordMatches", {
        keywordId,
        mentionId: seeded.mentionIds[0]!,
        workspaceId: seeded.workspaceId,
      })
      return keywordId
    })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await t.mutation(dispatchReference, { now: NOW })
    const [args] = await leasedBatchArguments(t, seeded)
    await t.run(
      async (ctx) =>
        await ctx.db.patch("keywords", keywordId, {
          description: "Changed keyword context",
        }),
    )

    await expect(t.action(executeReference, args!)).resolves.toMatchObject({
      pending: 1,
      state: "failed",
    })
    const job = await t.run(
      async (ctx) => await ctx.db.get("mentionAnalysisJobs", seeded.jobIds[0]!),
    )
    expect(job).toMatchObject({
      lastError: "analysis_snapshot_changed",
      status: "pending",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("ignores a stale lease before configuration lookup or provider I/O", async () => {
    const t = createBackendTest()
    const seeded = await seedMentionAnalysis(t, { mentionCount: 1 })
    await t.mutation(dispatchReference, { now: NOW })
    const [args] = await leasedBatchArguments(t, seeded)
    const fetchMock = vi.fn(async () => {
      throw new Error("stale leases must not call DeepSeek")
    })
    vi.stubGlobal("fetch", fetchMock)
    process.env.DEEPSEEK_API_KEY = "deepseek_fixture_key"
    vi.setSystemTime(NOW + MENTION_ANALYSIS_LEASE_MS)

    await expect(t.action(executeReference, args!)).resolves.toEqual({
      state: "stale_lease",
    })
    const state = await t.run(async (ctx) => ({
      jobs: await ctx.db.query("mentionAnalysisJobs").collect(),
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
    const seeded = await seedMentionAnalysis(t, {
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
      async (ctx) => await ctx.db.get("mentionAnalysisJobs", seeded.jobIds[0]!),
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
      job: await ctx.db.get("mentionAnalysisJobs", seeded.jobIds[0]!),
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
    expect(state.mention).toMatchObject({
      analysisState: "failed",
      feedState: "visible",
    })
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
    const seeded = await seedMentionAnalysis(t, { mentionCount: 1 })
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
      job: await ctx.db.get("mentionAnalysisJobs", seeded.jobIds[0]!),
      mention: await ctx.db.get("mentions", seeded.mentionIds[0]!),
    }))
    expect(state.job).toMatchObject({
      attempts: 1,
      lastError: "AUTH",
      status: "dead",
    })
    expect(state.job?.nextAttemptAt).toBeUndefined()
    expect(state.mention).toMatchObject({
      analysisState: "failed",
      feedState: "visible",
    })
  })

  it("keeps missing provider configuration pending without attempt or telemetry churn", async () => {
    const t = createBackendTest()
    const seeded = await seedMentionAnalysis(t, { mentionCount: 1 })
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
      job: await ctx.db.get("mentionAnalysisJobs", seeded.jobIds[0]!),
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
      async (ctx) => await ctx.db.get("mentionAnalysisJobs", seeded.jobIds[0]!),
    )
    expect(unchanged).toMatchObject({
      attempts: 0,
      nextAttemptAt: NOW + BLOCKED_CONFIGURATION_RETRY_MS,
      status: "pending",
    })
  })

  it("atomically applies a valid batch, records provider telemetry, and does not increment usage", async () => {
    const t = createBackendTest()
    const seeded = await seedMentionAnalysis(t, { mentionCount: 2 })
    const usageBefore = await t.run(
      async (ctx) => await ctx.db.get("usageCycles", seeded.usageCycleId),
    )
    const fetchMock = completionFetch(mentionAnalysisOutput(seeded, "valid"))
    vi.stubGlobal("fetch", fetchMock)
    process.env.DEEPSEEK_API_KEY = "deepseek_fixture_key"

    await t.mutation(dispatchReference, { now: NOW })
    const [args] = await leasedBatchArguments(t, seeded)
    await expect(t.action(executeReference, args!)).resolves.toEqual({
      completed: 2,
      state: "completed",
    })

    const state = await t.run(async (ctx) => ({
      jobs: await ctx.db.query("mentionAnalysisJobs").collect(),
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
    expect(state.mentions).toEqual([
      expect.objectContaining({
        analysisState: "completed",
        analysisVersion: "mention-analysis-v1",
        feedState: "visible",
        priority: "medium",
        priorityReason: "A customer question should be reviewed soon.",
        relevanceReason: "The mention discusses the monitored product.",
      }),
      expect.objectContaining({
        analysisState: "completed",
        analysisVersion: "mention-analysis-v1",
        feedState: "filtered",
        priority: "high",
        priorityReason: "The severe regression needs immediate review.",
        relevanceReason: "The text uses an unrelated meaning of the keyword.",
      }),
    ])
    expect(state.runs).toEqual([
      expect.objectContaining({
        attempt: 1,
        inputCount: 2,
        operation: "mention_analysis:mention-analysis-v1",
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
})
