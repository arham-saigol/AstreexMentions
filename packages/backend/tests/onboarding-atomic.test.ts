import { convexTest } from "convex-test"
import { makeFunctionReference, type UserIdentity } from "convex/server"
import type { GenericId } from "convex/values"
import { describe, expect, it } from "vitest"

import schema from "../convex/schema"

const modules = {
  "./_generated/server.ts": async () => ({}),
  "./onboarding.ts": async () => await import("../convex/onboarding"),
}

const saveConfiguration = makeFunctionReference<
  "mutation",
  {
    accessPath: "free" | "starter" | "growth" | "scale"
    companyDescription: string
    keywords: Array<{
      brandCandidate?: boolean
      description?: string
      phrase: string
      platforms: Array<"x" | "reddit" | "hacker_news">
      selectionOrder: number
    }>
    workspaceName: string
  },
  {
    activeCount: number
    keywordCount: number
    keywordIds: GenericId<"keywords">[]
    pausedCount: number
    workspaceName: string
  }
>("onboarding:saveOnboardingConfiguration")

async function seedCustomer() {
  const t = convexTest({ modules, schema })
  const identity = {
    issuer: "https://clerk.example.test",
    subject: "onboarding-user",
    tokenIdentifier: "https://clerk.example.test|onboarding-user",
  } as UserIdentity
  const seeded = await t.run(async (ctx) => {
    const now = Date.now()
    const userId = await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      createdAt: now,
      tokenIdentifier: identity.tokenIdentifier,
      updatedAt: now,
    })
    const workspaceId = await ctx.db.insert("workspaces", {
      createdAt: now,
      kind: "personal",
      name: "Original workspace",
      normalizedName: "original workspace",
      ownerUserId: userId,
      updatedAt: now,
    })
    await ctx.db.patch("users", userId, { personalWorkspaceId: workspaceId })
    await ctx.db.insert("workspaceMembers", {
      createdAt: now,
      role: "owner",
      updatedAt: now,
      userId,
      workspaceId,
    })
    return { userId, workspaceId }
  })
  return { client: t.withIdentity(identity), seeded, t }
}

const keywords = [
  {
    description: "A product phrase selected first by the user.",
    phrase: "First selected",
    platforms: ["x" as const],
    selectionOrder: 0,
  },
  {
    brandCandidate: true,
    description: "The suggested company brand.",
    phrase: "Brand candidate",
    platforms: ["reddit" as const],
    selectionOrder: 1,
  },
  {
    description: "An overflow phrase that remains configured.",
    phrase: "Third signal",
    platforms: ["hacker_news" as const],
    selectionOrder: 2,
  },
]

describe("atomic onboarding configuration", () => {
  it("creates one durable free grant, preserves over-cap keywords, and activates the selected brand candidate", async () => {
    const { client, seeded, t } = await seedCustomer()

    await expect(
      client.mutation(saveConfiguration, {
        accessPath: "free",
        companyDescription: "A company that monitors customer conversations.",
        keywords,
        workspaceName: "Astreex",
      }),
    ).resolves.toMatchObject({
      activeCount: 1,
      keywordCount: 3,
      pausedCount: 2,
    })

    await client.mutation(saveConfiguration, {
      accessPath: "free",
      companyDescription: "A company that monitors customer conversations.",
      keywords,
      workspaceName: "Astreex",
    })

    const state = await t.run(async (ctx) => ({
      grants: await ctx.db.query("freeEvaluationGrants").collect(),
      keywords: await ctx.db
        .query("keywords")
        .withIndex("by_workspace_and_updated_at", (q) =>
          q.eq("workspaceId", seeded.workspaceId),
        )
        .collect(),
      sources: await ctx.db.query("trackingSources").collect(),
      workspace: await ctx.db.get("workspaces", seeded.workspaceId),
    }))
    expect(state.grants).toHaveLength(1)
    expect(state.grants[0]).toMatchObject({
      mentionLimit: 100,
      mentionsUsed: 0,
    })
    expect(
      state.keywords.filter((keyword) => keyword.status === "active"),
    ).toEqual([
      expect.objectContaining({
        description: "The suggested company brand.",
        phrase: "Brand candidate",
      }),
    ])
    expect(
      state.keywords.filter((keyword) => keyword.status === "paused"),
    ).toHaveLength(2)
    expect(
      state.sources
        .filter((source) => source.pauseReason === "capacity")
        .every((source) => source.status === "paused"),
    ).toBe(true)
    expect(state.workspace).toMatchObject({
      companyDescription: "A company that monitors customer conversations.",
      name: "Astreex",
    })
  })

  it("saves a paid selection without granting client-selected paid monitoring", async () => {
    const { client, t } = await seedCustomer()
    await expect(
      client.mutation(saveConfiguration, {
        accessPath: "growth",
        companyDescription: "Paid onboarding context.",
        keywords,
        workspaceName: "Paid workspace",
      }),
    ).resolves.toMatchObject({
      activeCount: 0,
      keywordCount: 3,
      pausedCount: 3,
    })

    const state = await t.run(async (ctx) => ({
      grants: await ctx.db.query("freeEvaluationGrants").collect(),
      keywords: await ctx.db.query("keywords").collect(),
      sources: await ctx.db.query("trackingSources").collect(),
    }))
    expect(state.grants).toEqual([])
    expect(
      state.keywords.every((keyword) => keyword.pauseReason === "payment"),
    ).toBe(true)
    expect(state.sources.every((source) => source.pauseReason === "paid")).toBe(
      true,
    )
  })
})
