import { z } from "zod"

import { mentionCategorySchema, type MentionCategory } from "./enums"

export const MAX_CATEGORIZATION_BATCH_SIZE = 50

export const categorizationMentionSchema = z.strictObject({
  id: z.string().trim().min(1).max(500),
  text: z.string().trim().min(1).max(20_000),
})
export type CategorizationMention = z.infer<typeof categorizationMentionSchema>

export const categorizationResultSchema = z.strictObject({
  mentionId: z.string().trim().min(1).max(500),
  category: mentionCategorySchema,
})
export type CategorizationResult = z.infer<typeof categorizationResultSchema>

export class CategorizationValidationError extends Error {
  readonly code:
    | "EMPTY_BATCH"
    | "BATCH_TOO_LARGE"
    | "DUPLICATE_INPUT_ID"
    | "INVALID_INPUT"
    | "INVALID_OUTPUT"

  constructor(
    code: CategorizationValidationError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "CategorizationValidationError"
    this.code = code
  }
}

function parseMention(value: unknown): CategorizationMention {
  const parsed = categorizationMentionSchema.safeParse(value)
  if (!parsed.success) {
    throw new CategorizationValidationError(
      "INVALID_INPUT",
      "Every categorization input requires a non-empty id and text",
      { cause: parsed.error },
    )
  }
  return parsed.data
}

function parseMentionsAndAssertUnique(
  mentions: readonly unknown[],
): CategorizationMention[] {
  const parsed = mentions.map(parseMention)
  const ids = new Set<string>()
  for (const mention of parsed) {
    if (ids.has(mention.id)) {
      throw new CategorizationValidationError(
        "DUPLICATE_INPUT_ID",
        `Duplicate categorization input id: ${mention.id}`,
      )
    }
    ids.add(mention.id)
  }
  return parsed
}

export function validateCategorizationBatch(
  mentions: readonly unknown[],
): CategorizationMention[] {
  if (mentions.length === 0) {
    throw new CategorizationValidationError(
      "EMPTY_BATCH",
      "Categorization batches cannot be empty",
    )
  }
  if (mentions.length > MAX_CATEGORIZATION_BATCH_SIZE) {
    throw new CategorizationValidationError(
      "BATCH_TOO_LARGE",
      `Categorization batches are limited to ${MAX_CATEGORIZATION_BATCH_SIZE} mentions`,
    )
  }
  return parseMentionsAndAssertUnique(mentions)
}

export const assertValidCategorizationBatch = validateCategorizationBatch

export function partitionCategorizationMentions(
  mentions: readonly unknown[],
): CategorizationMention[][] {
  if (mentions.length === 0) {
    return []
  }
  const parsed = parseMentionsAndAssertUnique(mentions)
  const batches: CategorizationMention[][] = []
  for (
    let index = 0;
    index < parsed.length;
    index += MAX_CATEGORIZATION_BATCH_SIZE
  ) {
    batches.push(parsed.slice(index, index + MAX_CATEGORIZATION_BATCH_SIZE))
  }
  return batches
}

export const chunkCategorizationMentions = partitionCategorizationMentions

function parseRawOutput(rawOutput: unknown): unknown {
  if (typeof rawOutput !== "string") {
    return rawOutput
  }
  try {
    return JSON.parse(rawOutput) as unknown
  } catch (error) {
    throw new CategorizationValidationError(
      "INVALID_OUTPUT",
      "Categorization output must be valid JSON",
      { cause: error },
    )
  }
}

const categorizationOutputSchema = z.strictObject({
  results: z.array(categorizationResultSchema),
})

/** Validates the entire response and returns results in input order. */
export function validateCategorizationOutput(
  mentions: readonly unknown[],
  rawOutput: unknown,
): CategorizationResult[] {
  const parsedMentions = validateCategorizationBatch(mentions)
  const output = categorizationOutputSchema.safeParse(parseRawOutput(rawOutput))
  if (!output.success) {
    throw new CategorizationValidationError(
      "INVALID_OUTPUT",
      "Categorization output must contain only a results array of valid assignments",
      { cause: output.error },
    )
  }
  if (output.data.results.length !== parsedMentions.length) {
    throw new CategorizationValidationError(
      "INVALID_OUTPUT",
      "Categorization output must contain exactly one result per input mention",
    )
  }

  const inputIds = new Set(parsedMentions.map(({ id }) => id))
  const byMentionId = new Map<string, MentionCategory>()
  for (const result of output.data.results) {
    if (!inputIds.has(result.mentionId)) {
      throw new CategorizationValidationError(
        "INVALID_OUTPUT",
        `Unknown categorization mention id: ${result.mentionId}`,
      )
    }
    if (byMentionId.has(result.mentionId)) {
      throw new CategorizationValidationError(
        "INVALID_OUTPUT",
        `Duplicate categorization result id: ${result.mentionId}`,
      )
    }
    byMentionId.set(result.mentionId, result.category)
  }

  return parsedMentions.map(({ id }) => {
    const category = byMentionId.get(id)
    if (!category) {
      throw new CategorizationValidationError(
        "INVALID_OUTPUT",
        `Categorization output omitted mention id: ${id}`,
      )
    }
    return { mentionId: id, category }
  })
}
