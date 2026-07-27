import { z } from "zod"

import { MAX_CATEGORIZATION_BATCH_SIZE } from "../lib/deepseekCategorization"

const nonEmptyStringSchema = z.string().trim().min(1)

export const categorySnapshotContractSchema = z
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
  })
  .strict()

export const categorizationResultsContractSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            categoryId: nonEmptyStringSchema,
            mentionId: nonEmptyStringSchema,
          })
          .strict(),
      )
      .min(1)
      .max(MAX_CATEGORIZATION_BATCH_SIZE),
  })
  .strict()

export type CategorySnapshotContract = z.output<
  typeof categorySnapshotContractSchema
>
export type CategorizationResultsContract = z.output<
  typeof categorizationResultsContractSchema
>

export class CategorizationContractError extends Error {
  readonly code: "INVALID_JSON" | "INVALID_SNAPSHOT" | "INVALID_RESULTS"

  constructor(
    code: CategorizationContractError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "CategorizationContractError"
    this.code = code
  }
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input) as unknown
  } catch (error) {
    throw new CategorizationContractError(
      "INVALID_JSON",
      "Categorization serialization is invalid",
      error,
    )
  }
}

export function parseCategorySnapshotJson(
  input: string,
): CategorySnapshotContract {
  const result = categorySnapshotContractSchema.safeParse(parseJson(input))
  if (!result.success) {
    throw new CategorizationContractError(
      "INVALID_SNAPSHOT",
      "Category snapshot does not match the internal contract",
      result.error,
    )
  }
  return result.data
}

export function parseCategorizationResultsJson(
  input: string,
): CategorizationResultsContract {
  const result = categorizationResultsContractSchema.safeParse(parseJson(input))
  if (!result.success) {
    throw new CategorizationContractError(
      "INVALID_RESULTS",
      "Categorization results do not match the internal contract",
      result.error,
    )
  }
  return result.data
}
