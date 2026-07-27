import type { MentionCategory, Platform } from "@astreex/domain"
import {
  createDailyDigestCounts,
  type DailyDigestMention,
} from "@astreex/email"

import {
  rankMentionsDeterministically,
  type MentionEngagement,
  type RankedMention,
  type RankableMention,
} from "../lib/engagementRanking"
import type { CategorySystemKey } from "../lib/categories"

const CATEGORY_LABELS: Record<CategorySystemKey, MentionCategory> = {
  bug: "Bug",
  complaint: "Complaint",
  competitor_mention: "Competitor Mention",
  feature_request: "Feature Request",
  other: "Other",
  praise: "Praise",
  question: "Question",
}

export type DigestMentionCandidate = {
  authorDisplayName?: string | undefined
  authorHandle?: string | undefined
  body: string
  canonicalUrl: string
  categorySystemKey?: CategorySystemKey | undefined
  commentCount?: number | undefined
  engagementScore: number
  id: string
  likeCount?: number | undefined
  platform: Platform
  pointCount?: number | undefined
  publishedAt: number
  quoteCount?: number | undefined
  replyCount?: number | undefined
  repostCount?: number | undefined
  title?: string | undefined
}

export type RankedDigestMention = RankedMention<
  RankableMention & { candidate: DigestMentionCandidate }
>

function count(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value)
    ? 0
    : Math.max(0, Math.floor(value))
}

export function digestEngagement(
  mention: DigestMentionCandidate,
): MentionEngagement {
  switch (mention.platform) {
    case "x":
      return {
        likes: count(mention.likeCount),
        quotes: count(mention.quoteCount),
        replies: count(mention.replyCount),
        reposts: count(mention.repostCount),
        source: "x",
      }
    case "hacker_news":
      return {
        comments: count(mention.commentCount),
        points: count(mention.pointCount),
        source: "hacker_news",
      }
    case "reddit": {
      const comments = count(mention.commentCount ?? mention.replyCount)
      return {
        comments,
        score: Math.max(0, count(mention.engagementScore) - comments * 3),
        source: "reddit",
      }
    }
  }
}

export function rankableDigestCandidate(candidate: DigestMentionCandidate) {
  return {
    candidate,
    engagement: digestEngagement(candidate),
    publishedAt: candidate.publishedAt,
    stableId: candidate.id,
  }
}

export function rankDigestMentions(
  mentions: readonly DigestMentionCandidate[],
  limit: number,
): RankedDigestMention[] {
  return rankMentionsDeterministically(
    mentions.map(rankableDigestCandidate),
    limit,
  )
}

export function digestCategory(
  systemKey: CategorySystemKey | undefined,
): MentionCategory {
  return systemKey === undefined ? "Other" : CATEGORY_LABELS[systemKey]
}

export function digestMentionTitle(mention: {
  body: string
  title?: string | undefined
}): string {
  const title = mention.title?.trim()
  if (title) {
    return title
  }
  const body = mention.body.trim().replace(/\s+/g, " ")
  return body.length <= 96
    ? body || "Untitled mention"
    : `${body.slice(0, 93)}...`
}

export function digestMentionExcerpt(body: string): string | undefined {
  const normalized = body.trim().replace(/\s+/g, " ")
  if (normalized.length === 0) {
    return undefined
  }
  return normalized.length <= 280
    ? normalized
    : `${normalized.slice(0, 277)}...`
}

function safeEngagementScore(value: number): number {
  return Number.isFinite(value)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)))
    : 0
}

export function dailyDigestEmailMention(
  mention: DigestMentionCandidate,
): DailyDigestMention {
  const excerpt = digestMentionExcerpt(mention.body)
  const author =
    mention.authorDisplayName?.trim() || mention.authorHandle?.trim()
  return {
    category: digestCategory(mention.categorySystemKey),
    engagementScore: safeEngagementScore(mention.engagementScore),
    platform: mention.platform,
    title: digestMentionTitle(mention),
    url: mention.canonicalUrl,
    ...(author ? { author } : {}),
    ...(excerpt === undefined ? {} : { excerpt }),
  }
}

/**
 * Counts the complete daily period while limiting the detail list to the
 * persisted deterministic ranking. The ordered ids are the snapshot selected
 * by the scheduling mutation, so rendering never silently changes the top list.
 */
export function createDailyDigestEmailModel(input: {
  mentions: readonly DigestMentionCandidate[]
  topMentionIds: readonly string[]
}) {
  const mentionsById = new Map(
    input.mentions.map((mention) => [mention.id, mention] as const),
  )
  if (mentionsById.size !== input.mentions.length) {
    throw new TypeError("Digest mention ids must be unique")
  }

  const seenTopIds = new Set<string>()
  const topMentions = input.topMentionIds.map((mentionId) => {
    if (seenTopIds.has(mentionId)) {
      throw new TypeError("Digest top mention ids must be unique")
    }
    seenTopIds.add(mentionId)
    const mention = mentionsById.get(mentionId)
    if (!mention) {
      throw new TypeError("Digest mention snapshot is unavailable")
    }
    return dailyDigestEmailMention(mention)
  })
  if (topMentions.length === 0) {
    throw new TypeError("A non-empty digest requires at least one top mention")
  }

  return {
    counts: createDailyDigestCounts(
      input.mentions.map(dailyDigestEmailMention),
    ),
    topMentions,
  }
}
