export type MentionEngagementMetrics = {
  commentCount?: number | undefined
  engagementScore: number
  likeCount?: number | undefined
  pointCount?: number | undefined
  quoteCount?: number | undefined
  replyCount?: number | undefined
  repostCount?: number | undefined
}

export type MentionRediscoveryPatch = Partial<MentionEngagementMetrics> & {
  engagementScore: number
  lastMatchedAt: number
  updatedAt: number
}

/** Rediscovery intentionally cannot patch content, status, category, or analysis. */
export function buildMentionRediscoveryPatch(
  metrics: MentionEngagementMetrics,
  matchedAt: number,
): MentionRediscoveryPatch {
  if (!Number.isFinite(matchedAt)) {
    throw new TypeError("matchedAt must be finite")
  }

  const patch: MentionRediscoveryPatch = {
    engagementScore: metrics.engagementScore,
    lastMatchedAt: matchedAt,
    updatedAt: matchedAt,
  }
  for (const field of [
    "commentCount",
    "likeCount",
    "pointCount",
    "quoteCount",
    "replyCount",
    "repostCount",
  ] as const) {
    const value = metrics[field]
    if (value !== undefined) {
      patch[field] = value
    }
  }
  return patch
}
