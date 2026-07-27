import { ConvexError, v } from "convex/values"
import { z } from "zod"

import { customerMutation, customerQuery } from "../lib/authorization"
import { nextDailyDigestRunAt } from "../lib/dailyDigest"
import { indexEquals } from "../server"

const digestPreferenceSchema = z
  .object({
    enabled: z.boolean(),
    hour: z.number().int().min(0).max(23),
    mentionLimit: z.number().int().min(1).max(100),
    minute: z.number().int().min(0).max(59),
    timeZone: z.string().trim().min(1),
  })
  .strict()

const digestPreferenceResultValidator = v.object({
  enabled: v.boolean(),
  hour: v.number(),
  mentionLimit: v.number(),
  minute: v.number(),
  nextRunAt: v.number(),
  timeZone: v.string(),
})
const updatedDigestPreferenceResultValidator = v.object({
  enabled: v.boolean(),
  hour: v.number(),
  mentionLimit: v.number(),
  minute: v.number(),
  nextRunAt: v.number(),
  timeZone: v.string(),
  updatedAt: v.number(),
})

function invalidPreference(): never {
  throw new ConvexError({
    code: "INVALID_DIGEST_PREFERENCE",
    message: "Daily digest preferences are invalid",
  })
}

export const getDailyDigestPreference = customerQuery({
  args: {},
  returns: digestPreferenceResultValidator,
  handler: async (ctx) => {
    const preference = await ctx.db
      .query("digestPreferences")
      .withIndex("by_workspace_and_user", (q) =>
        indexEquals(
          q,
          ["workspaceId", ctx.workspace.id],
          ["userId", ctx.viewer.id],
        ),
      )
      .unique()

    if (!preference) {
      throw new ConvexError({
        code: "DIGEST_PREFERENCE_NOT_FOUND",
        message: "Daily digest preferences were not initialized",
      })
    }

    return {
      enabled: preference.enabled,
      hour: preference.hour,
      mentionLimit: preference.mentionLimit,
      minute: preference.minute,
      nextRunAt: preference.nextRunAt,
      timeZone: preference.timeZone,
    }
  },
})

export const updateDailyDigestPreference = customerMutation({
  args: {
    enabled: v.boolean(),
    hour: v.number(),
    mentionLimit: v.number(),
    minute: v.number(),
    timeZone: v.string(),
  },
  returns: updatedDigestPreferenceResultValidator,
  handler: async (ctx, args) => {
    const parsed = digestPreferenceSchema.safeParse(args)
    if (!parsed.success) {
      invalidPreference()
    }

    let nextRunAt: number
    try {
      nextRunAt = nextDailyDigestRunAt(Date.now(), parsed.data)
    } catch {
      invalidPreference()
    }

    const preference = await ctx.db
      .query("digestPreferences")
      .withIndex("by_workspace_and_user", (q) =>
        indexEquals(
          q,
          ["workspaceId", ctx.workspace.id],
          ["userId", ctx.viewer.id],
        ),
      )
      .unique()
    if (!preference) {
      throw new ConvexError({
        code: "DIGEST_PREFERENCE_NOT_FOUND",
        message: "Daily digest preferences were not initialized",
      })
    }

    const now = Date.now()
    await ctx.db.patch("digestPreferences", preference._id, {
      ...parsed.data,
      deletionPausedAt: undefined,
      nextRunAt,
      updatedAt: now,
    })

    return { ...parsed.data, nextRunAt, updatedAt: now }
  },
})
