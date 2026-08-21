import { convexTest } from "convex-test"
import { makeFunctionReference, type UserIdentity } from "convex/server"
import type { GenericId } from "convex/values"
import { describe, expect, it } from "vitest"

import schema from "../convex/schema"
import { GEMINI_MODEL } from "../convex/integrations/gemini"
import { RETENTION_BATCH_SIZE } from "../convex/retention"

const NOW = Date.parse("2026-08-01T12:00:00.000Z")
const modules = {
  "./_generated/server.ts": async () => ({}),
  "./mentions.ts": async () => await import("../convex/mentions"),
  "./retention.ts": async () => await import("../convex/retention"),
}
const listMentions = makeFunctionReference<
  "query",
  { now: number; limit?: number },
  unknown
>("mentions:listMentions")
const purgeExpired = makeFunctionReference<
  "mutation",
  { now?: number },
  { deleted: number; state: "completed" }
>("retention:purgeExpiredFreeMentions")

describe("free mention retention", () => {
  it("hides expired free mentions and drains bounded child batches before deleting them", async () => {
    const t = convexTest({ modules, schema })
    const identity = {
      issuer: "https://clerk.example.test",
      subject: "retention-user",
      tokenIdentifier: "https://clerk.example.test|retention-user",
    } as UserIdentity
    const seeded = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: identity.subject,
        createdAt: NOW,
        tokenIdentifier: identity.tokenIdentifier,
        updatedAt: NOW,
      })
      const workspaceId = await ctx.db.insert("workspaces", {
        createdAt: NOW,
        kind: "personal",
        name: "Retention",
        normalizedName: "retention",
        ownerUserId: userId,
        updatedAt: NOW,
      })
      await ctx.db.patch("users", userId, { personalWorkspaceId: workspaceId })
      await ctx.db.insert("workspaceMembers", {
        createdAt: NOW,
        role: "owner",
        updatedAt: NOW,
        userId,
        workspaceId,
      })
      const keywordId = await ctx.db.insert("keywords", {
        createdAt: NOW,
        createdByUserId: userId,
        normalizedPhrase: "retention",
        phrase: "Retention",
        platforms: ["x"],
        status: "active",
        updatedAt: NOW,
        workspaceId,
      })
      await ctx.db.insert("freeEvaluationGrants", {
        activatedAt: NOW,
        createdAt: NOW,
        mentionLimit: 100,
        mentionsUsed: 1,
        updatedAt: NOW,
        workspaceId,
      })
      const insertMention = async (
        index: number,
        retentionExpiresAt?: number,
      ) =>
        await ctx.db.insert("mentions", {
          analysisState: "pending",
          feedState: "pending",
          body: `Mention ${index}`,
          canonicalUrl: `https://example.com/${index}`,
          contentType: "tweet",
          engagementScore: 0,
          firstSeenAt: NOW - 1_000,
          lastMatchedAt: NOW - 1_000,
          platform: "x",
          publishedAt: NOW - index,
          ...(retentionExpiresAt === undefined ? {} : { retentionExpiresAt }),
          searchText: `mention ${index}`,
          status: "new",
          updatedAt: NOW,
          workspaceId,
        })
      const expiredIds: GenericId<"mentions">[] = []
      for (let index = 0; index < RETENTION_BATCH_SIZE; index += 1) {
        const mentionId = await insertMention(index, NOW)
        expiredIds.push(mentionId)
        await ctx.db.insert("mentionKeywordMatches", {
          createdAt: NOW,
          keywordId,
          matchKind: "provider",
          mentionId,
          workspaceId,
        })
        if (index === 0) {
          for (let match = 0; match < 16; match += 1) {
            await ctx.db.insert("mentionKeywordMatches", {
              createdAt: NOW + match + 1,
              keywordId,
              matchKind: "provider",
              mentionId,
              workspaceId,
            })
          }
        }
        await ctx.db.insert("mentionAnalysisJobs", {
          attempts: 0,
          createdAt: NOW,
          idempotencyKey: `retention:${index}`,
          maxAttempts: 3,
          mentionId,
          model: GEMINI_MODEL,
          nextAttemptAt: NOW,
          status: "pending",
          updatedAt: NOW,
          workspaceId,
        })
      }
      const paidMentionId = await insertMention(999)
      await ctx.db.patch("mentions", paidMentionId, {
        analysisState: "failed",
        feedState: "visible",
      })
      return { expiredIds, paidMentionId, workspaceId }
    })

    const page = (await t.withIdentity(identity).query(listMentions, {
      limit: 50,
      now: NOW,
    })) as { items: Array<{ id: GenericId<"mentions"> }> }
    expect(page.items.map(({ id }) => id)).toEqual([seeded.paidMentionId])

    await expect(t.mutation(purgeExpired, { now: NOW })).resolves.toEqual({
      deleted: RETENTION_BATCH_SIZE - 1,
      state: "completed",
    })
    await expect(t.mutation(purgeExpired, { now: NOW })).resolves.toEqual({
      deleted: 1,
      state: "completed",
    })
    const remaining = await t.run(async (ctx) => ({
      jobs: await ctx.db.query("mentionAnalysisJobs").collect(),
      matches: await ctx.db.query("mentionKeywordMatches").collect(),
      mentions: await ctx.db.query("mentions").collect(),
    }))
    expect(remaining.jobs).toEqual([])
    expect(remaining.matches).toEqual([])
    expect(remaining.mentions.map(({ _id }) => _id)).toEqual([
      seeded.paidMentionId,
    ])
  })
})
