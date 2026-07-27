import { z } from "zod"

const engagementCountSchema = z.number().finite()

export const redditEngagementSchema = z.strictObject({
  source: z.literal("reddit"),
  score: engagementCountSchema,
  comments: engagementCountSchema,
})
export type RedditEngagement = z.infer<typeof redditEngagementSchema>

export const xEngagementSchema = z.strictObject({
  source: z.literal("x"),
  likes: engagementCountSchema,
  replies: engagementCountSchema,
  quotes: engagementCountSchema,
  reposts: engagementCountSchema,
})
export type XEngagement = z.infer<typeof xEngagementSchema>

export const hackerNewsEngagementSchema = z.strictObject({
  source: z.literal("hacker_news"),
  points: engagementCountSchema,
  comments: engagementCountSchema,
})
export type HackerNewsEngagement = z.infer<typeof hackerNewsEngagementSchema>

export const mentionEngagementSchema = z.discriminatedUnion("source", [
  xEngagementSchema,
  redditEngagementSchema,
  hackerNewsEngagementSchema,
])
export type MentionEngagement = z.infer<typeof mentionEngagementSchema>

export type RankableMention = {
  engagement: MentionEngagement
  publishedAt: number
  stableId: string
}

export type RankedMention<T extends RankableMention> = T & {
  engagementScore: number
  rank: number
}

function count(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)))
}

function safeWeightedSum(
  parts: readonly (readonly [number, number])[],
): number {
  let total = 0
  for (const [value, weight] of parts) {
    total += count(value) * weight
    if (total >= Number.MAX_SAFE_INTEGER) {
      return Number.MAX_SAFE_INTEGER
    }
  }
  return total
}

export function engagementScore(engagement: MentionEngagement): number {
  switch (engagement.source) {
    case "x":
      return safeWeightedSum([
        [engagement.likes, 1],
        [engagement.replies, 3],
        [engagement.quotes, 3],
        [engagement.reposts, 4],
      ])
    case "reddit":
      return safeWeightedSum([
        [engagement.score, 1],
        [engagement.comments, 3],
      ])
    case "hacker_news":
      return safeWeightedSum([
        [engagement.points, 1],
        [engagement.comments, 3],
      ])
  }
}

function interactionCount(engagement: MentionEngagement): number {
  switch (engagement.source) {
    case "x":
      return safeWeightedSum([
        [engagement.replies, 1],
        [engagement.quotes, 1],
        [engagement.reposts, 1],
      ])
    case "reddit":
    case "hacker_news":
      return count(engagement.comments)
  }
}

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

type ScoredMention<T extends RankableMention> = {
  engagementScore: number
  interactionCount: number
  mention: T
}

function compareScoredMentions<T extends RankableMention>(
  left: ScoredMention<T>,
  right: ScoredMention<T>,
): number {
  if (left.engagementScore !== right.engagementScore) {
    return left.engagementScore > right.engagementScore ? -1 : 1
  }

  if (left.interactionCount !== right.interactionCount) {
    return left.interactionCount > right.interactionCount ? -1 : 1
  }

  if (left.mention.publishedAt !== right.mention.publishedAt) {
    return left.mention.publishedAt > right.mention.publishedAt ? -1 : 1
  }

  const sourceDifference = compareText(
    left.mention.engagement.source,
    right.mention.engagement.source,
  )
  return (
    sourceDifference ||
    compareText(left.mention.stableId, right.mention.stableId)
  )
}

export function rankMentionsDeterministically<T extends RankableMention>(
  mentions: readonly T[],
  limit = mentions.length,
): RankedMention<T>[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("limit must be a non-negative integer")
  }
  for (const mention of mentions) {
    if (
      mention.stableId.length === 0 ||
      !Number.isSafeInteger(mention.publishedAt)
    ) {
      throw new TypeError(
        "Every ranked mention requires a stable id and safe integer publishedAt",
      )
    }
    mentionEngagementSchema.parse(mention.engagement)
  }

  return mentions
    .map((mention) => ({
      mention,
      engagementScore: engagementScore(mention.engagement),
      interactionCount: interactionCount(mention.engagement),
    }))
    .sort(compareScoredMentions)
    .slice(0, limit)
    .map(({ engagementScore: score, mention }, index) => ({
      ...mention,
      engagementScore: score,
      rank: index + 1,
    }))
}
