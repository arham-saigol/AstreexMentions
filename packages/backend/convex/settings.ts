import { ConvexError, v } from "convex/values"

import { authenticatedMutation, authenticatedQuery } from "./lib/authorization"
import { nextDailyDigestRunAt } from "./lib/dailyDigest"
import { resolveCurrentCustomer } from "./users"

type DigestPreferenceInput = {
  enabled: boolean
  hour: number
  mentionLimit: number
  minute: number
  timeZone: string
}

type ValidatedDigestPreference = DigestPreferenceInput & {
  nextRunAt: number
}

const digestResultValidator = v.object({
  enabled: v.boolean(),
  hour: v.number(),
  mentionLimit: v.number(),
  minute: v.number(),
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
  if (
    !Number.isInteger(input.hour) ||
    input.hour < 0 ||
    input.hour > 23 ||
    !Number.isInteger(input.minute) ||
    input.minute < 0 ||
    input.minute > 59
  ) {
    settingsError(
      "INVALID_DIGEST_PREFERENCE",
      "Digest local time must use an hour from 0-23 and minute from 0-59",
    )
  }
  if (
    !Number.isInteger(input.mentionLimit) ||
    input.mentionLimit < 1 ||
    input.mentionLimit > 100
  ) {
    settingsError(
      "INVALID_DIGEST_PREFERENCE",
      "Digest mention limit must be an integer from 1-100",
    )
  }

  const timeZone = input.timeZone.trim()
  if (timeZone.length === 0 || timeZone.length > 120) {
    settingsError(
      "INVALID_DIGEST_PREFERENCE",
      "Digest timezone must be a valid IANA timezone",
    )
  }

  let nextRunAt: number
  try {
    nextRunAt = nextDailyDigestRunAt(now, {
      hour: input.hour,
      minute: input.minute,
      timeZone,
    })
  } catch {
    settingsError(
      "INVALID_DIGEST_PREFERENCE",
      "Digest timezone or local time is invalid",
    )
  }

  return {
    enabled: input.enabled,
    hour: input.hour,
    mentionLimit: input.mentionLimit,
    minute: input.minute,
    nextRunAt,
    timeZone,
  }
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
        enabled: preference.enabled as boolean,
        hour: preference.hour as number,
        mentionLimit: preference.mentionLimit as number,
        minute: preference.minute as number,
        nextRunAt: preference.nextRunAt as number,
        timeZone: preference.timeZone as string,
      },
    }
  },
})

export const updateDigestPreferences = authenticatedMutation({
  args: {
    enabled: v.boolean(),
    hour: v.number(),
    mentionLimit: v.number(),
    minute: v.number(),
    timeZone: v.string(),
  },
  returns: v.object({ digest: digestResultValidator }),
  handler: async (ctx, args) => {
    const { viewer, workspace } = await resolveCurrentCustomer(
      ctx,
      ctx.identity,
    )
    const preference = validateDigestPreferenceInput(args)
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
      updatedAt: Date.now(),
    })

    return { digest: preference }
  },
})
