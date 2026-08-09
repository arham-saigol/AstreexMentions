import { ConvexError, v } from "convex/values"

import { replaceWorkspaceKeywordConfiguration } from "./keywords"
import { authenticatedMutation } from "./lib/authorization"
import { ensureFreeEvaluationGrant } from "./lib/workspaceAccess"
import { resolveCurrentCustomer } from "./users"
import { normalizeWorkspaceName } from "./workspaces"

const platformValidator = v.union(
  v.literal("x"),
  v.literal("reddit"),
  v.literal("hacker_news"),
)
const accessPathValidator = v.union(
  v.literal("free"),
  v.literal("starter"),
  v.literal("growth"),
  v.literal("scale"),
)

export const saveOnboardingConfiguration = authenticatedMutation({
  args: {
    accessPath: accessPathValidator,
    companyDescription: v.string(),
    keywords: v.array(
      v.object({
        brandCandidate: v.optional(v.boolean()),
        description: v.optional(v.string()),
        phrase: v.string(),
        platforms: v.array(platformValidator),
        selectionOrder: v.number(),
      }),
    ),
    workspaceName: v.string(),
  },
  returns: v.object({
    activeCount: v.number(),
    keywordCount: v.number(),
    keywordIds: v.array(v.id("keywords")),
    pausedCount: v.number(),
    workspaceName: v.string(),
  }),
  handler: async (ctx, args) => {
    const customer = await resolveCurrentCustomer(ctx, ctx.identity)
    const workspaceName = normalizeWorkspaceName(args.workspaceName)
    const companyDescription = args.companyDescription.trim()
    if (!companyDescription || companyDescription.length > 1_000) {
      throw new ConvexError({
        code: "INVALID_COMPANY_DESCRIPTION",
        message: "Company description must contain 1 to 1,000 characters",
      })
    }
    const now = Date.now()
    if (args.accessPath === "free") {
      await ensureFreeEvaluationGrant(ctx, customer.workspace.id, now)
    }

    const applied = await replaceWorkspaceKeywordConfiguration(ctx, {
      keywords: args.keywords,
      userId: customer.viewer.id,
      workspaceId: customer.workspace.id,
    })
    await ctx.db.patch("workspaces", customer.workspace.id, {
      companyDescription,
      name: workspaceName,
      normalizedName: workspaceName.toLocaleLowerCase("en"),
      updatedAt: now,
    })

    return {
      activeCount: applied.activeCount,
      keywordCount: applied.keywordIds.length,
      keywordIds: applied.keywordIds,
      pausedCount: applied.pausedCount,
      workspaceName,
    }
  },
})
