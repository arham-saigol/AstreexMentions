"use node"

import { renderDailyDigestEmail, type DailyDigestCounts } from "@astreex/email"
import { v } from "convex/values"

import { readEmailCompositionConfiguration } from "../email/config"
import { env, internalAction } from "../server"
import {
  enqueueRenderedDailyDigestReference,
  loadDailyDigestRenderContextReference,
  markDailyDigestFailedReference,
} from "./internal"
import {
  createDailyDigestEmailModel,
  type DigestMentionCandidate,
} from "./model"

type DigestRenderContext =
  | { state: "not_pending" }
  | { state: "recipient_unavailable" }
  | {
      localDate: string
      counts: DailyDigestCounts
      mentions: DigestMentionCandidate[]
      recipientEmail: string
      recipientName?: string | undefined
      state: "ready"
      topMentionIds: string[]
      workspaceName: string
    }

export const renderDailyDigest = internalAction({
  args: { digestRunId: v.id("digestRuns") },
  handler: async (ctx, args) => {
    const context = (await ctx.runQuery(
      loadDailyDigestRenderContextReference,
      args,
    )) as DigestRenderContext
    if (context.state === "not_pending") {
      return context
    }
    if (context.state === "recipient_unavailable") {
      await ctx.runMutation(markDailyDigestFailedReference, {
        ...args,
        error: "recipient_unavailable",
      })
      return context
    }

    const configuration = readEmailCompositionConfiguration(env)
    if (configuration.state === "provider_unconfigured") {
      await ctx.runMutation(markDailyDigestFailedReference, {
        ...args,
        error: "blocked_config",
      })
      return configuration
    }

    try {
      const emailModel = createDailyDigestEmailModel({
        counts: context.counts,
        mentions: context.mentions,
        topMentionIds: context.topMentionIds,
      })
      const rendered = await renderDailyDigestEmail({
        astreexUrl: new URL("/app/mentions", configuration.appUrl).toString(),
        counts: emailModel.counts,
        localDate: context.localDate,
        topMentions: emailModel.topMentions,
        workspaceName: context.workspaceName,
        ...(context.recipientName === undefined
          ? {}
          : { recipientName: context.recipientName }),
      })
      return await ctx.runMutation(enqueueRenderedDailyDigestReference, {
        digestRunId: args.digestRunId,
        from: configuration.from,
        html: rendered.html,
        subject: rendered.subject,
        text: rendered.text,
        to: context.recipientEmail,
        ...(configuration.replyTo === undefined
          ? {}
          : { replyTo: configuration.replyTo }),
      })
    } catch {
      await ctx.runMutation(markDailyDigestFailedReference, {
        ...args,
        error: "digest_render_failed",
      })
      return { state: "failed" as const }
    }
  },
})
