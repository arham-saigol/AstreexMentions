import { z } from "zod"

import { MAX_MENTION_ANALYSIS_BATCH_SIZE } from "../lib/deepseekMentionAnalysis"

const nonEmptyStringSchema = z.string().trim().min(1)

export const analysisSnapshotContractSchema = z
  .object({
    categories: z
      .array(
        z
          .object({
            description: nonEmptyStringSchema,
            id: nonEmptyStringSchema,
            name: nonEmptyStringSchema,
          })
          .strict(),
      )
      .min(1),
    filteringContext: nonEmptyStringSchema.max(2_000),
    filteringGuidelines: z.string().trim().max(2_000),
  })
  .strict()

export const mentionAnalysisResultsContractSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            categoryId: nonEmptyStringSchema,
            mentionId: nonEmptyStringSchema,
            priority: z.enum(["low", "medium", "high"]),
            priorityReason: nonEmptyStringSchema.max(500),
            relevant: z.boolean(),
            relevanceReason: nonEmptyStringSchema.max(500),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_MENTION_ANALYSIS_BATCH_SIZE),
  })
  .strict()

export type AnalysisSnapshotContract = z.output<
  typeof analysisSnapshotContractSchema
>
export type MentionAnalysisResultsContract = z.output<
  typeof mentionAnalysisResultsContractSchema
>

export class MentionAnalysisContractError extends Error {
  readonly code: "INVALID_JSON" | "INVALID_SNAPSHOT" | "INVALID_RESULTS"

  constructor(
    code: MentionAnalysisContractError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "MentionAnalysisContractError"
    this.code = code
  }
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input) as unknown
  } catch (error) {
    throw new MentionAnalysisContractError(
      "INVALID_JSON",
      "Mention analysis serialization is invalid",
      error,
    )
  }
}

export function parseAnalysisSnapshotJson(
  input: string,
): AnalysisSnapshotContract {
  const result = analysisSnapshotContractSchema.safeParse(parseJson(input))
  if (!result.success) {
    throw new MentionAnalysisContractError(
      "INVALID_SNAPSHOT",
      "Mention analysis snapshot does not match the internal contract",
      result.error,
    )
  }
  return result.data
}

export function parseMentionAnalysisResultsJson(
  input: string,
): MentionAnalysisResultsContract {
  const result = mentionAnalysisResultsContractSchema.safeParse(
    parseJson(input),
  )
  if (!result.success) {
    throw new MentionAnalysisContractError(
      "INVALID_RESULTS",
      "Mention analysis results do not match the internal contract",
      result.error,
    )
  }
  return result.data
}
