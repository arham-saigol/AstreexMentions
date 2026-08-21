import { z } from "zod"

import {
  MAX_ANALYSIS_REASON_CHARS,
  MAX_FILTERING_CONTEXT_CHARS,
  MAX_FILTERING_GUIDELINES_CHARS,
  MAX_MENTION_ANALYSIS_BATCH_SIZE,
  MENTION_ANALYSIS_VERSION,
} from "../lib/mentionAnalysis"

const nonEmptyStringSchema = z.string().trim().min(1)

export const analysisSnapshotContractSchema = z
  .object({
    analysisVersion: z.literal(MENTION_ANALYSIS_VERSION),
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
    filteringContext: nonEmptyStringSchema.max(MAX_FILTERING_CONTEXT_CHARS),
    filteringGuidelines: z.string().trim().max(MAX_FILTERING_GUIDELINES_CHARS),
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
            priorityReason: nonEmptyStringSchema.max(MAX_ANALYSIS_REASON_CHARS),
            relevant: z.boolean(),
            relevanceReason: nonEmptyStringSchema.max(
              MAX_ANALYSIS_REASON_CHARS,
            ),
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
