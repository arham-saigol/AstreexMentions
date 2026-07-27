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
    categories: Array<{
      categoryId: GenericId<"categories">
      colorToken:
        | "blue"
        | "orange"
        | "green"
        | "red"
        | "purple"
        | "yellow"
        | "gray"
        | "pink"
        | "cyan"
        | "slate"
      description: string
      enabled: boolean
    }>
    keywords: Array<{
      phrase: string
      platforms: Array<"x" | "reddit" | "hacker_news">
    }>
    workspaceName: string
  },
  {
    keywordCount: number
    keywordIds: GenericId<"keywords">[]
    workspaceName: string
  }
>("onboarding:saveOnboardingConfiguration")

describe("atomic onboarding configuration", () => {
  it("rolls back destructive keyword changes if a later category validation fails", async () => {
    const t = convexTest({ modules, schema })
    const identity = {
      issuer: "https://clerk.example.test",
      subject: "onboarding-atomic-user",
      tokenIdentifier: "https://clerk.example.test|onboarding-atomic-user",
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
      await ctx.db.patch("users", userId, {
        personalWorkspaceId: workspaceId,
      })
      await ctx.db.insert("workspaceMembers", {
        createdAt: now,
        role: "owner",
        updatedAt: now,
        userId,
        workspaceId,
      })
      const oldKeywordId = await ctx.db.insert("keywords", {
        createdAt: now,
        createdByUserId: userId,
        normalizedPhrase: "old signal",
        phrase: "Old signal",
        platforms: ["x"],
        status: "active",
        updatedAt: now,
        workspaceId,
      })
      const oldSourceId = await ctx.db.insert("trackingSources", {
        backoffMs: 0,
        checkpointVersion: 0,
        consecutiveFailures: 0,
        createdAt: now,
        intervalMs: 60_000,
        keywordId: oldKeywordId,
        leaseVersion: 0,
        nextRunAt: now,
        pauseReason: "paid",
        providerQuery: "Old signal",
        sourceType: "x",
        status: "paused",
        totalFailures: 0,
        updatedAt: now,
        workspaceId,
      })
      const categoryId = await ctx.db.insert("categories", {
        colorToken: "blue",
        createdAt: now,
        description: "Questions",
        enabled: true,
        isSystem: true,
        name: "Question",
        normalizedName: "question",
        sortOrder: 0,
        systemKey: "question",
        updatedAt: now,
        workspaceId,
      })
      const otherCategoryId = await ctx.db.insert("categories", {
        colorToken: "slate",
        createdAt: now,
        description: "Other mentions",
        enabled: true,
        isSystem: true,
        name: "Other",
        normalizedName: "other",
        sortOrder: 1,
        systemKey: "other",
        updatedAt: now,
        workspaceId,
      })

      const foreignUserId = await ctx.db.insert("users", {
        clerkUserId: "foreign-user",
        createdAt: now,
        tokenIdentifier: "issuer|foreign-user",
        updatedAt: now,
      })
      const foreignWorkspaceId = await ctx.db.insert("workspaces", {
        createdAt: now,
        kind: "personal",
        name: "Foreign workspace",
        normalizedName: "foreign workspace",
        ownerUserId: foreignUserId,
        updatedAt: now,
      })
      const foreignCategoryId = await ctx.db.insert("categories", {
        colorToken: "red",
        createdAt: now,
        description: "Foreign",
        enabled: true,
        isSystem: false,
        name: "Foreign",
        normalizedName: "foreign",
        sortOrder: 0,
        updatedAt: now,
        workspaceId: foreignWorkspaceId,
      })
      return {
        categoryId,
        foreignCategoryId,
        oldKeywordId,
        oldSourceId,
        otherCategoryId,
        workspaceId,
      }
    })
    const customer = t.withIdentity(identity)

    await expect(
      customer.mutation(saveConfiguration, {
        categories: [
          {
            categoryId: seeded.foreignCategoryId,
            colorToken: "red",
            description: "Cannot update this",
            enabled: true,
          },
        ],
        keywords: [{ phrase: "New signal", platforms: ["x"] }],
        workspaceName: "Changed workspace",
      }),
    ).rejects.toThrow()

    const rolledBack = await t.run(async (ctx) => ({
      keywords: await ctx.db.query("keywords").collect(),
      source: await ctx.db.get("trackingSources", seeded.oldSourceId),
      workspace: await ctx.db.get("workspaces", seeded.workspaceId),
    }))
    expect(rolledBack.keywords).toEqual([
      expect.objectContaining({
        _id: seeded.oldKeywordId,
        status: "active",
      }),
    ])
    expect(rolledBack.source).toMatchObject({ status: "paused" })
    expect(rolledBack.workspace).toMatchObject({ name: "Original workspace" })

    await expect(
      customer.mutation(saveConfiguration, {
        categories: [
          {
            categoryId: seeded.categoryId,
            colorToken: "green",
            description: "Updated questions",
            enabled: true,
          },
          {
            categoryId: seeded.otherCategoryId,
            colorToken: "slate",
            description: "Other mentions",
            enabled: true,
          },
        ],
        keywords: [{ phrase: "New signal", platforms: ["x"] }],
        workspaceName: "Changed workspace",
      }),
    ).resolves.toMatchObject({
      keywordCount: 1,
      workspaceName: "Changed workspace",
    })

    const applied = await t.run(async (ctx) => ({
      category: await ctx.db.get("categories", seeded.categoryId),
      keywords: await ctx.db.query("keywords").collect(),
      sources: await ctx.db.query("trackingSources").collect(),
      workspace: await ctx.db.get("workspaces", seeded.workspaceId),
    }))
    expect(applied.category).toMatchObject({
      colorToken: "green",
      description: "Updated questions",
    })
    expect(applied.keywords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: seeded.oldKeywordId,
          status: "deleted",
        }),
        expect.objectContaining({
          normalizedPhrase: "new signal",
          status: "active",
        }),
      ]),
    )
    expect(
      applied.sources.filter((source) => source.status !== "deleted"),
    ).toEqual([
      expect.objectContaining({
        providerQuery: "New signal",
        sourceType: "x",
      }),
    ])
    expect(applied.workspace).toMatchObject({ name: "Changed workspace" })
  })
})
