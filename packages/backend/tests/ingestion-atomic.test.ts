import { readFileSync } from "node:fs"

import { convexTest } from "convex-test"
import { defineSchema, defineTable } from "convex/server"
import { type GenericId, v } from "convex/values"
import { describe, expect, it } from "vitest"
import {
  ingestionCandidateSchema,
  ingestionChunkSchema,
  parseIngestionChunkJson,
  type IngestionCandidate,
  type IngestionChunk,
} from "../convex/ingestion/contracts"
import {
  applyIngestionChunkAtomically,
  type IngestionChunkResult,
} from "../convex/ingestion/service"
import { normalizeMentionFallbackKey } from "../convex/ingestion/model"

const NOW = Date.parse("2026-07-26T12:00:00.000Z")
const EMAIL_OPTIONS = {
  emailFrom: "Astreex <notifications@example.com>",
  emailReplyTo: "support@example.com",
}

function readCandidateFixtures(): Record<string, IngestionCandidate> {
  const raw = JSON.parse(
    readFileSync(
      new URL("./fixtures/ingestion/chunk-candidates.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(raw).map(([name, candidate]) => [
      name,
      ingestionCandidateSchema.parse(candidate),
    ]),
  )
}

const candidates = readCandidateFixtures()

function candidate(name: string): IngestionCandidate {
  const value = candidates[name]
  if (!value) {
    throw new Error(`Missing ingestion fixture ${name}`)
  }
  return structuredClone(value)
}

// convex-test 0.0.54 rejects the corrected numeric warning field names while
// loading a strict schema. A permissive test schema preserves the production
// indexes exercised by the service and lets the exact persisted fields run.
const ingestionTestSchema = defineSchema({
  mentionAnalysisJobs: defineTable(v.any()).index("by_idempotency_key", [
    "idempotencyKey",
  ]),
  emailOutbox: defineTable(v.any()).index("by_idempotency_key", [
    "idempotencyKey",
  ]),
  freeEvaluationGrants: defineTable(v.any()).index("by_workspace", [
    "workspaceId",
  ]),
  keywords: defineTable(v.any()),
  mentionKeywordMatches: defineTable(v.any()).index("by_mention_and_keyword", [
    "mentionId",
    "keywordId",
  ]),
  mentions: defineTable(v.any())
    .index("by_workspace_platform_content_provider_item", [
      "workspaceId",
      "platform",
      "contentType",
      "providerItemId",
    ])
    .index("by_workspace_platform_content_fallback", [
      "workspaceId",
      "platform",
      "contentType",
      "fallbackKey",
    ]),
  providerMetricBuckets: defineTable(v.any()).index(
    "by_provider_operation_granularity_and_bucket",
    ["provider", "operation", "granularity", "bucketStartAt"],
  ),
  providerRuns: defineTable(v.any()).index("by_idempotency_key", [
    "idempotencyKey",
  ]),
  subscriptions: defineTable(v.any()).index("by_workspace_and_last_synced_at", [
    "workspaceId",
    "lastSyncedAt",
  ]),
  systemMetricBuckets: defineTable(v.any()).index(
    "by_metric_scope_workspace_granularity_and_bucket",
    ["metric", "scope", "workspaceId", "granularity", "bucketStartAt"],
  ),
  trackingSources: defineTable(v.any()).index(
    "by_workspace_status_and_created_at",
    ["workspaceId", "status", "createdAt"],
  ),
  usageCycles: defineTable(v.any()).index(
    "by_workspace_status_and_period_end",
    ["workspaceId", "status", "periodEndAt"],
  ),
  users: defineTable(v.any()),
  workspaces: defineTable(v.any()),
})

function createBackendTest() {
  return convexTest({
    modules: { "convex/_generated/server.ts": async () => ({}) },
    schema: ingestionTestSchema,
  })
}

type BackendTest = ReturnType<typeof createBackendTest>

type SeededWorkspace = {
  keywordIds: GenericId<"keywords">[]
  sourceIds: GenericId<"trackingSources">[]
  usageCycleId: GenericId<"usageCycles">
  userId: GenericId<"users">
  workspaceId: GenericId<"workspaces">
}

async function seedWorkspace(
  t: BackendTest,
  options: {
    mentionLimit: number
    mentionsUsed?: number
    ownerEmail?: string | null
    sourceCount?: number
  },
): Promise<SeededWorkspace> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkUserId: "clerk_owner",
      createdAt: NOW - 10_000,
      name: "Workspace Owner",
      tokenIdentifier: "https://clerk.example|owner",
      updatedAt: NOW - 10_000,
      ...(options.ownerEmail === null
        ? {}
        : { email: options.ownerEmail ?? "owner@example.com" }),
    })
    const workspaceId = await ctx.db.insert("workspaces", {
      createdAt: NOW - 9_000,
      kind: "personal",
      name: "Fixture Workspace",
      normalizedName: "fixture workspace",
      ownerUserId: userId,
      updatedAt: NOW - 9_000,
    })
    await ctx.db.patch("users", userId, { personalWorkspaceId: workspaceId })

    const subscriptionId = await ctx.db.insert("subscriptions", {
      cancelAtPeriodEnd: false,
      createdAt: NOW - 8_500,
      currentPeriodEnd: NOW + 30 * 24 * 60 * 60 * 1_000,
      currentPeriodStart: NOW - 24 * 60 * 60 * 1_000,
      entitlementStatus: "active",
      lastSyncedAt: NOW - 8_500,
      planId: "growth",
      provider: "creem",
      providerCustomerId: `customer:${String(workspaceId)}`,
      providerSubscriptionId: `subscription:${String(workspaceId)}`,
      status: "active",
      updatedAt: NOW - 8_500,
      workspaceId,
    })
    const usageCycleId = await ctx.db.insert("usageCycles", {
      createdAt: NOW - 8_000,
      idempotencyKey: `usage:${String(workspaceId)}:2026-07`,
      keywordLimit: 10,
      mentionLimit: options.mentionLimit,
      mentionsUsed: options.mentionsUsed ?? 0,
      periodEndAt: NOW + 30 * 24 * 60 * 60 * 1_000,
      periodStartAt: NOW - 24 * 60 * 60 * 1_000,
      planSnapshot: {
        keywordLimit: 10,
        mentionLimit: options.mentionLimit,
        planId: "growth",
      },
      status: "open",
      subscriptionId,
      updatedAt: NOW - 8_000,
      workspaceId,
    })

    const keywordIds: GenericId<"keywords">[] = []
    const sourceIds: GenericId<"trackingSources">[] = []
    for (let index = 0; index < (options.sourceCount ?? 2); index += 1) {
      const keywordId = await ctx.db.insert("keywords", {
        createdAt: NOW - 7_000 + index,
        createdByUserId: userId,
        normalizedPhrase: `astreex ${index}`,
        phrase: `Astreex ${index}`,
        platforms: ["x"],
        status: "active",
        updatedAt: NOW - 7_000 + index,
        workspaceId,
      })
      const sourceId = await ctx.db.insert("trackingSources", {
        backoffMs: 0,
        checkpointVersion: 7,
        consecutiveFailures: 0,
        createdAt: NOW - 6_000 + index,
        intervalMs: 300_000,
        keywordId,
        leaseExpiresAt: NOW + 60_000,
        leaseToken: `lease-${index}`,
        leaseVersion: 3,
        nextRunAt: NOW,
        providerQuery: `Astreex ${index}`,
        sourceType: "x",
        status: "active",
        totalFailures: 0,
        updatedAt: NOW - 6_000 + index,
        workspaceId,
      })
      keywordIds.push(keywordId)
      sourceIds.push(sourceId)
    }

    return { keywordIds, sourceIds, usageCycleId, userId, workspaceId }
  })
}

function chunk(
  seeded: SeededWorkspace,
  input: {
    candidates: IngestionCandidate[]
    sourceIndex?: number
    startPosition?: number
  },
): IngestionChunk {
  const sourceIndex = input.sourceIndex ?? 0
  return ingestionChunkSchema.parse({
    candidates: input.candidates,
    keywordId: String(seeded.keywordIds[sourceIndex]),
    startPosition: input.startPosition ?? 0,
    trackingSourceId: String(seeded.sourceIds[sourceIndex]),
    workspaceId: String(seeded.workspaceId),
  })
}

async function applyChunk(
  t: BackendTest,
  input: IngestionChunk,
  now = NOW,
): Promise<IngestionChunkResult> {
  return await t.mutation(
    async (ctx) =>
      await applyIngestionChunkAtomically(ctx, input, {
        ...EMAIL_OPTIONS,
        now,
      }),
  )
}

async function snapshot(t: BackendTest, seeded: SeededWorkspace) {
  return await t.run(async (ctx) => ({
    jobs: await ctx.db.query("mentionAnalysisJobs").collect(),
    matches: await ctx.db.query("mentionKeywordMatches").collect(),
    mentions: await ctx.db.query("mentions").collect(),
    metrics: await ctx.db.query("systemMetricBuckets").collect(),
    outbox: await ctx.db.query("emailOutbox").collect(),
    providerRuns: await ctx.db.query("providerRuns").collect(),
    sources: await Promise.all(
      seeded.sourceIds.map(
        async (sourceId) => await ctx.db.get("trackingSources", sourceId),
      ),
    ),
    usage: await ctx.db.get("usageCycles", seeded.usageCycleId),
    workspace: await ctx.db.get("workspaces", seeded.workspaceId),
  }))
}

describe("ingestion external contract", () => {
  it("uses strict Zod validation and requires one dedupe identity", () => {
    const valid = {
      candidates: [candidate("providerCandidate")],
      keywordId: "keyword",
      startPosition: 0,
      trackingSourceId: "source",
      workspaceId: "workspace",
    }
    expect(parseIngestionChunkJson(JSON.stringify(valid))).toEqual(valid)
    expect(() =>
      parseIngestionChunkJson(
        JSON.stringify({
          ...valid,
          candidates: [
            {
              ...candidate("providerCandidate"),
              providerItemId: undefined,
              fallbackKey: undefined,
            },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CHUNK" }))
    expect(() =>
      parseIngestionChunkJson(
        JSON.stringify({ ...valid, undocumentedProviderField: "rejected" }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CHUNK" }))
  })
})

describe("serializable atomic ingestion", () => {
  it("replays without double counting and only adds a missing overlapping keyword", async () => {
    const t = createBackendTest()
    const seeded = await seedWorkspace(t, { mentionLimit: 10 })
    const original = candidate("providerCandidate")
    const changedRediscovery = {
      ...candidate("providerCandidate"),
      body: "Rediscovery content must not overwrite the original body.",
      engagementScore: 99,
      likeCount: 42,
    }

    await expect(
      applyChunk(t, chunk(seeded, { candidates: [original] }), NOW),
    ).resolves.toMatchObject({
      associationsAdded: 1,
      mentionAnalysisJobsEnqueued: 1,
      inserted: 1,
      rediscovered: 0,
      state: "applied",
    })
    await expect(
      applyChunk(
        t,
        chunk(seeded, { candidates: [changedRediscovery] }),
        NOW + 1,
      ),
    ).resolves.toMatchObject({
      associationsAdded: 0,
      mentionAnalysisJobsEnqueued: 0,
      inserted: 0,
      rediscovered: 1,
    })
    await expect(
      applyChunk(
        t,
        chunk(seeded, {
          candidates: [changedRediscovery],
          sourceIndex: 1,
        }),
        NOW + 2,
      ),
    ).resolves.toMatchObject({
      associationsAdded: 1,
      mentionAnalysisJobsEnqueued: 0,
      inserted: 0,
      rediscovered: 1,
    })

    const state = await snapshot(t, seeded)
    expect(state.mentions).toHaveLength(1)
    expect(state.mentions[0]).toMatchObject({
      body: original.body,
      engagementScore: 99,
      lastMatchedAt: NOW + 2,
      likeCount: 42,
    })
    expect(state.usage?.mentionsUsed).toBe(1)
    expect(state.jobs).toHaveLength(1)
    expect(state.matches).toHaveLength(2)
    expect(state.outbox).toHaveLength(0)
    expect(state.workspace?.lastMentionAt).toBe(NOW)
    expect(state.metrics).toHaveLength(5)
    expect(state.metrics.map(({ value }) => value)).toEqual([1, 1, 1, 1, 1])
  })

  it("deduplicates normalized fallback keys without provider identifiers", async () => {
    const t = createBackendTest()
    const seeded = await seedWorkspace(t, { mentionLimit: 10 })
    const original = candidate("fallbackCandidate")
    const rediscovered = {
      ...candidate("fallbackCandidate"),
      engagementScore: 12,
      fallbackKey: "canonical thread 42",
    }

    await applyChunk(t, chunk(seeded, { candidates: [original] }))
    await applyChunk(t, chunk(seeded, { candidates: [rediscovered] }), NOW + 1)

    const state = await snapshot(t, seeded)
    expect(state.mentions).toHaveLength(1)
    expect(state.mentions[0]).toMatchObject({
      engagementScore: 12,
      fallbackKey: normalizeMentionFallbackKey(original.fallbackKey ?? ""),
    })
    expect(state.usage?.mentionsUsed).toBe(1)
    expect(state.jobs).toHaveLength(1)
    expect(state.matches).toHaveLength(1)
  })

  it("serializes concurrent discovery of the same identity without double counting", async () => {
    const t = createBackendTest()
    const seeded = await seedWorkspace(t, { mentionLimit: 10 })
    const input = chunk(seeded, {
      candidates: [candidate("providerCandidate")],
    })

    const results = await Promise.all([
      applyChunk(t, input),
      applyChunk(t, input, NOW + 1),
    ])
    expect(results.map(({ inserted }) => inserted).sort()).toEqual([0, 1])
    expect(results.map(({ rediscovered }) => rediscovered).sort()).toEqual([
      0, 1,
    ])

    const state = await snapshot(t, seeded)
    expect(state.mentions).toHaveLength(1)
    expect(state.usage?.mentionsUsed).toBe(1)
    expect(state.jobs).toHaveLength(1)
    expect(state.matches).toHaveLength(1)
    expect(state.metrics.map(({ value }) => value)).toEqual([1, 1, 1, 1, 1])
  })

  it("holds the checkpoint at the first over-cap position and keeps all side effects exactly once", async () => {
    const t = createBackendTest()
    const seeded = await seedWorkspace(t, { mentionLimit: 2 })
    await t.run(async (ctx) => {
      for (const sourceId of seeded.sourceIds) {
        await ctx.db.insert("providerRuns", {
          attempt: 1,
          createdAt: NOW,
          idempotencyKey: `tracking:${String(sourceId)}:3`,
          inputCount: 1,
          operation: "tweets.search",
          outputCount: 0,
          provider: "x",
          startedAt: NOW,
          status: "running",
          trackingSourceId: sourceId,
          trigger: "scheduled",
          updatedAt: NOW,
          workspaceId: seeded.workspaceId,
        })
      }
    })
    const input = chunk(seeded, {
      candidates: [
        candidate("providerCandidate"),
        candidate("secondProviderCandidate"),
        candidate("thirdProviderCandidate"),
      ],
      startPosition: 40,
    })

    await expect(applyChunk(t, input)).resolves.toEqual({
      associationsAdded: 2,
      mentionAnalysisJobsEnqueued: 2,
      checkpoint: "hold",
      inserted: 2,
      nextPosition: 42,
      pausedSourceCount: 2,
      rediscovered: 0,
      state: "usage_exhausted",
      unprocessedPosition: 42,
      usage: { exhausted: true, mentionLimit: 2, mentionsUsed: 2 },
      warningThresholdsEnqueued: [80, 100],
    })

    const firstState = await snapshot(t, seeded)
    expect(firstState.mentions).toHaveLength(2)
    expect(firstState.usage).toMatchObject({
      warning100SentAt: NOW,
      warning80SentAt: NOW,
      mentionsUsed: 2,
    })
    expect(firstState.jobs).toHaveLength(2)
    expect(firstState.matches).toHaveLength(2)
    expect(firstState.outbox).toHaveLength(2)
    expect(firstState.metrics).toHaveLength(7)
    expect(firstState.metrics.map(({ value }) => value)).toEqual([
      2, 2, 2, 2, 2, 1, 1,
    ])
    expect(firstState.sources).toEqual([
      expect.objectContaining({
        checkpointVersion: 7,
        pauseReason: "usage",
        status: "paused",
      }),
      expect.objectContaining({
        checkpointVersion: 7,
        pauseReason: "usage",
        status: "paused",
      }),
    ])
    for (const pausedSource of firstState.sources) {
      expect(pausedSource).not.toHaveProperty("leaseExpiresAt")
      expect(pausedSource).not.toHaveProperty("leaseToken")
    }
    expect(
      firstState.providerRuns.find(
        (run) =>
          run.idempotencyKey === `tracking:${String(seeded.sourceIds[0])}:3`,
      ),
    ).toMatchObject({ status: "running" })
    const concurrentlyPausedRun = firstState.providerRuns.find(
      (run) =>
        run.idempotencyKey === `tracking:${String(seeded.sourceIds[1])}:3`,
    )
    expect(concurrentlyPausedRun).toMatchObject({
      errorCode: "source_paused",
      status: "failed",
    })
    expect(concurrentlyPausedRun?.finishedAt).toBe(NOW)

    await expect(applyChunk(t, input, NOW + 1)).resolves.toMatchObject({
      mentionAnalysisJobsEnqueued: 0,
      checkpoint: "hold",
      inserted: 0,
      rediscovered: 2,
      state: "usage_exhausted",
      unprocessedPosition: 42,
      warningThresholdsEnqueued: [],
    })
    const replayedState = await snapshot(t, seeded)
    expect(replayedState.mentions).toHaveLength(2)
    expect(replayedState.usage?.mentionsUsed).toBe(2)
    expect(replayedState.jobs).toHaveLength(2)
    expect(replayedState.outbox).toHaveLength(2)
    expect(replayedState.metrics.map(({ value }) => value)).toEqual([
      2, 2, 2, 2, 2, 1, 1,
    ])
  })

  it("does not roll back threshold-crossing ingestion when the owner has no email", async () => {
    const t = createBackendTest()
    const seeded = await seedWorkspace(t, {
      mentionLimit: 10,
      mentionsUsed: 7,
      ownerEmail: null,
    })

    await expect(
      applyChunk(
        t,
        chunk(seeded, { candidates: [candidate("providerCandidate")] }),
      ),
    ).resolves.toMatchObject({
      inserted: 1,
      state: "applied",
      usage: { mentionLimit: 10, mentionsUsed: 8 },
      warningThresholdsEnqueued: [],
    })

    const state = await snapshot(t, seeded)
    expect(state.mentions).toHaveLength(1)
    expect(state.outbox).toHaveLength(0)
    expect(state.usage).toMatchObject({
      mentionsUsed: 8,
      warning80SentAt: NOW,
    })
  })

  it("commits the 100th free mention once, sets retention, and holds later provider results", async () => {
    const t = createBackendTest()
    const seeded = await seedWorkspace(t, { mentionLimit: 100 })
    const grantId = await t.run(async (ctx) => {
      const cycles = await ctx.db.query("usageCycles").collect()
      for (const cycle of cycles) await ctx.db.delete("usageCycles", cycle._id)
      const subscriptions = await ctx.db.query("subscriptions").collect()
      for (const subscription of subscriptions) {
        await ctx.db.delete("subscriptions", subscription._id)
      }
      return await ctx.db.insert("freeEvaluationGrants", {
        activatedAt: NOW - 10_000,
        createdAt: NOW - 10_000,
        mentionLimit: 100,
        mentionsUsed: 99,
        updatedAt: NOW - 10_000,
        workspaceId: seeded.workspaceId,
      })
    })

    await expect(
      applyChunk(
        t,
        chunk(seeded, {
          candidates: [
            candidate("providerCandidate"),
            candidate("secondProviderCandidate"),
          ],
          startPosition: 5,
        }),
      ),
    ).resolves.toMatchObject({
      checkpoint: "hold",
      inserted: 1,
      state: "usage_exhausted",
      unprocessedPosition: 6,
      usage: { exhausted: true, mentionLimit: 100, mentionsUsed: 100 },
    })

    const state = await t.run(async (ctx) => ({
      grant: await ctx.db.get("freeEvaluationGrants", grantId),
      mentions: await ctx.db.query("mentions").collect(),
      sources: await ctx.db.query("trackingSources").collect(),
    }))
    expect(state.grant).toMatchObject({ mentionsUsed: 100, exhaustedAt: NOW })
    expect(state.mentions).toHaveLength(1)
    expect(state.mentions[0]?.retentionExpiresAt).toBe(
      NOW + 60 * 24 * 60 * 60 * 1_000,
    )
    expect(
      state.sources.every(
        (source) =>
          source.status === "paused" && source.pauseReason === "usage",
      ),
    ).toBe(true)

    await expect(
      applyChunk(
        t,
        chunk(seeded, { candidates: [candidate("providerCandidate")] }),
        NOW + 1,
      ),
    ).resolves.toMatchObject({ inserted: 0, rediscovered: 1 })
    const replayed = await t.run(async (ctx) => ({
      grant: await ctx.db.get("freeEvaluationGrants", grantId),
      mentions: await ctx.db.query("mentions").collect(),
    }))
    expect(replayed.grant?.mentionsUsed).toBe(100)
    expect(replayed.mentions[0]?.retentionExpiresAt).toBe(
      NOW + 60 * 24 * 60 * 60 * 1_000,
    )
  })

  it("serializes concurrent unique candidates so only one can consume the last slot", async () => {
    const t = createBackendTest()
    const seeded = await seedWorkspace(t, { mentionLimit: 1 })
    const first = chunk(seeded, {
      candidates: [candidate("providerCandidate")],
      startPosition: 10,
    })
    const second = chunk(seeded, {
      candidates: [candidate("secondProviderCandidate")],
      sourceIndex: 1,
      startPosition: 20,
    })

    const results = await Promise.all([
      applyChunk(t, first),
      applyChunk(t, second, NOW + 1),
    ])
    expect(results.map(({ state }) => state).sort()).toEqual([
      "applied",
      "usage_exhausted",
    ])
    const exhausted = results.find(({ state }) => state === "usage_exhausted")
    expect(exhausted).toMatchObject({
      checkpoint: "hold",
      inserted: 0,
      usage: { exhausted: true, mentionLimit: 1, mentionsUsed: 1 },
    })
    expect([10, 20]).toContain(exhausted?.unprocessedPosition)

    const state = await snapshot(t, seeded)
    expect(state.mentions).toHaveLength(1)
    expect(state.usage?.mentionsUsed).toBe(1)
    expect(state.jobs).toHaveLength(1)
    expect(state.matches).toHaveLength(1)
    expect(state.outbox).toHaveLength(2)
    expect(state.metrics).toHaveLength(7)
    expect(state.metrics.map(({ value }) => value)).toEqual([
      1, 1, 1, 1, 1, 1, 1,
    ])
    expect(
      state.sources.every((source) => source?.checkpointVersion === 7),
    ).toBe(true)
  })
})
