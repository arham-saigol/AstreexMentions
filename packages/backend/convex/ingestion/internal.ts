import { v } from "convex/values"

import { readEmailSenderConfiguration } from "../email/config"
import { env, internalMutation } from "../_generated/server"
import { parseIngestionChunkJson } from "./contracts"
import {
  applyIngestionChunkAtomically,
  type IngestionChunkResult,
} from "./service"

export type ApplyIngestionChunkResult =
  | IngestionChunkResult
  | {
      missing: readonly string[]
      provider: "resend"
      state: "provider_unconfigured"
    }

export const applyIngestionChunk = internalMutation({
  args: { inputJson: v.string() },
  handler: async (ctx, args): Promise<ApplyIngestionChunkResult> => {
    const input = parseIngestionChunkJson(args.inputJson)
    const sender = readEmailSenderConfiguration(env)
    if (sender.state === "provider_unconfigured") {
      return sender
    }

    return await applyIngestionChunkAtomically(ctx, input, {
      emailFrom: sender.from,
      now: Date.now(),
      ...(sender.replyTo === undefined ? {} : { emailReplyTo: sender.replyTo }),
    })
  },
})
