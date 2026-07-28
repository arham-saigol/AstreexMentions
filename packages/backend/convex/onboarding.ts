import type { GenericId } from "convex/values"
import { v } from "convex/values"

import { applyOnboardingCategoryConfiguration } from "./categories"
import { replaceWorkspaceKeywordConfiguration } from "./keywords"
import { authenticatedMutation } from "./lib/authorization"
import { categoryColorTokenValidator } from "./schema"
import { resolveCurrentCustomer } from "./users"
import { normalizeWorkspaceName } from "./workspaces"

const platformValidator = v.union(
  v.literal("x"),
  v.literal("reddit"),
  v.literal("hacker_news"),
)

export const saveOnboardingConfiguration = authenticatedMutation({
  args: {
    categories: v.array(
      v.object({
        categoryId: v.id("categories"),
        colorToken: categoryColorTokenValidator,
        description: v.string(),
        enabled: v.boolean(),
      }),
    ),
    keywords: v.array(
      v.object({
        phrase: v.string(),
        platforms: v.array(platformValidator),
      }),
    ),
    workspaceName: v.string(),
  },
  returns: v.object({
    keywordCount: v.number(),
    keywordIds: v.array(v.id("keywords")),
    workspaceName: v.string(),
  }),
  handler: async (ctx, args) => {
    const customer = await resolveCurrentCustomer(ctx, ctx.identity)
    const workspaceName = normalizeWorkspaceName(args.workspaceName)
    const workspaceId = customer.workspace.id

    const keywordIds = await replaceWorkspaceKeywordConfiguration(ctx, {
      keywords: args.keywords,
      userId: customer.viewer.id,
      workspaceId,
    })
    await applyOnboardingCategoryConfiguration(ctx, {
      categories: args.categories.map((category) => ({
        ...category,
        categoryId: category.categoryId as GenericId<"categories">,
      })),
      workspaceId,
    })
    await ctx.db.patch("workspaces", workspaceId, {
      name: workspaceName,
      normalizedName: workspaceName.toLocaleLowerCase("en"),
      updatedAt: Date.now(),
    })

    return {
      keywordCount: keywordIds.length,
      keywordIds,
      workspaceName,
    }
  },
})
