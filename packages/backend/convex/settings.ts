import { ConvexError, v } from "convex/values"

import { authenticatedMutation, authenticatedQuery } from "./lib/authorization"
import {
  nextDailyDigestRunAt,
  validateDailyDigestTimeZone,
} from "./lib/dailyDigest"
import { resolveCurrentCustomer } from "./users"

type DigestPreferenceInput = {
  enabled: boolean
  timeZone: string
}

type ValidatedDigestPreference = DigestPreferenceInput & {
  nextRunAt: number
}

const digestResultValidator = v.object({
  enabled: v.boolean(),
  nextRunAt: v.number(),
  timeZone: v.string(),
})

function settingsError(code: string, message: string): never {
  throw new ConvexError({ code, message })
}

export function validateDigestPreferenceInput(
  input: DigestPreferenceInput,
  now = Date.now(),
): ValidatedDigestPreference {
  let timeZone: string
  let nextRunAt: number
  try {
    timeZone = validateDailyDigestTimeZone(input.timeZone)
    nextRunAt = nextDailyDigestRunAt(now, timeZone)
  } catch {
    settingsError(
      "INVALID_DIGEST_PREFERENCE",
      "Digest timezone must be a valid IANA timezone",
    )
  }

  return { enabled: input.enabled, nextRunAt, timeZone }
}

export const getSettings = authenticatedQuery({
  args: {},
  returns: v.object({ digest: digestResultValidator }),
  handler: async (ctx) => {
    const { viewer, workspace } = await resolveCurrentCustomer(
      ctx,
      ctx.identity,
    )
    const preference = await ctx.db
      .query("digestPreferences")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", workspace.id).eq("userId", viewer.id),
      )
      .unique()

    if (!preference) {
      settingsError(
        "DIGEST_PREFERENCE_NOT_FOUND",
        "Daily digest preferences were not initialized",
      )
    }

    return {
      digest: {
        enabled: preference.enabled,
        nextRunAt: preference.nextRunAt,
        timeZone: preference.timeZone,
      },
    }
  },
})

export const updateDigestPreferences = authenticatedMutation({
  args: {
    enabled: v.boolean(),
    timeZone: v.string(),
  },
  returns: v.object({ digest: digestResultValidator }),
  handler: async (ctx, args) => {
    const { viewer, workspace } = await resolveCurrentCustomer(
      ctx,
      ctx.identity,
    )
    const now = Date.now()
    const preference = validateDigestPreferenceInput(args, now)
    const existing = await ctx.db
      .query("digestPreferences")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", workspace.id).eq("userId", viewer.id),
      )
      .unique()

    if (!existing) {
      settingsError(
        "DIGEST_PREFERENCE_NOT_FOUND",
        "Daily digest preferences were not initialized",
      )
    }

    await ctx.db.patch("digestPreferences", existing._id, {
      ...preference,
      deletionPausedAt: undefined,
      updatedAt: now,
    })

    return { digest: preference }
  },
})
