import { z } from "zod"

export const MAX_INGESTION_CHUNK_SIZE = 25

const optionalNonnegativeInteger = z.number().int().nonnegative().optional()
const optionalIdentityPart = z.string().trim().min(1).optional()

export const ingestionCandidateSchema = z
  .object({
    authorDisplayName: z.string().optional(),
    authorHandle: z.string().optional(),
    body: z.string().min(1),
    canonicalUrl: z.string().url(),
    commentCount: optionalNonnegativeInteger,
    contentType: z.enum(["comment", "post", "story", "tweet"]),
    engagementScore: z.number().finite(),
    fallbackKey: optionalIdentityPart,
    language: z.string().optional(),
    likeCount: optionalNonnegativeInteger,
    platform: z.enum(["hacker_news", "reddit", "x"]),
    pointCount: optionalNonnegativeInteger,
    providerItemId: optionalIdentityPart,
    publishedAt: z.number().int().nonnegative(),
    quoteCount: optionalNonnegativeInteger,
    replyCount: optionalNonnegativeInteger,
    repostCount: optionalNonnegativeInteger,
    searchText: z.string().min(1),
    title: z.string().optional(),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.providerItemId === undefined &&
      candidate.fallbackKey === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "A candidate requires providerItemId or fallbackKey",
        path: ["providerItemId"],
      })
    }
  })

export const ingestionChunkSchema = z
  .object({
    candidates: z
      .array(ingestionCandidateSchema)
      .min(1)
      .max(MAX_INGESTION_CHUNK_SIZE),
    keywordId: z.string().trim().min(1),
    startPosition: z.number().int().nonnegative(),
    trackingSourceId: z.string().trim().min(1),
    workspaceId: z.string().trim().min(1),
  })
  .strict()

export type IngestionCandidate = z.output<typeof ingestionCandidateSchema>
export type IngestionChunk = z.output<typeof ingestionChunkSchema>

export class IngestionContractError extends Error {
  readonly code: "INVALID_CHUNK" | "INVALID_JSON"

  constructor(
    code: IngestionContractError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "IngestionContractError"
    this.code = code
  }
}

export function parseIngestionChunkJson(inputJson: string): IngestionChunk {
  let parsed: unknown
  try {
    parsed = JSON.parse(inputJson) as unknown
  } catch (error) {
    throw new IngestionContractError(
      "INVALID_JSON",
      "Ingestion chunk serialization is invalid",
      error,
    )
  }

  const result = ingestionChunkSchema.safeParse(parsed)
  if (!result.success) {
    throw new IngestionContractError(
      "INVALID_CHUNK",
      "Ingestion chunk does not match the normalized contract",
      result.error,
    )
  }
  return result.data
}
