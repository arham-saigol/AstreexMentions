import { v } from "convex/values"

import { readEmailSenderConfiguration } from "../email/config"
import { env, internalMutation } from "../_generated/server"
import { parseIngestionChunkJson } from "./contracts"
import {
  applyIngestionChunkAtomically,
  scheduleIngestionDispatchers,
  type IngestionChunkResult,
} from "./service"

export const applyIngestionChunk = internalMutation({
  args: { inputJson: v.string() },
  handler: async (ctx, args): Promise<IngestionChunkResult> => {
    const input = parseIngestionChunkJson(args.inputJson)
    const sender = readEmailSenderConfiguration(env)

    const result = await applyIngestionChunkAtomically(ctx, input, {
      ...(sender.state === "configured"
        ? {
            emailFrom: sender.from,
            ...(sender.replyTo === undefined
              ? {}
              : { emailReplyTo: sender.replyTo }),
          }
        : {}),
      now: Date.now(),
    })
    await scheduleIngestionDispatchers(ctx, {
      mentionAnalysisJobsEnqueued: result.mentionAnalysisJobsEnqueued,
      usageWarningEmailsEnqueued: result.warningThresholdsEnqueued.length,
    })
    return result
  },
})
