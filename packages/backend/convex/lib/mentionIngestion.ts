export type MentionDedupeIdentity = {
  contentType: string
  fallbackKey?: string | undefined
  platform: "x" | "reddit" | "hacker_news"
  providerItemId?: string | undefined
  workspaceId: string
}

export type ResolvedMentionDedupeIdentity =
  | (Omit<MentionDedupeIdentity, "fallbackKey" | "providerItemId"> & {
      kind: "provider"
      providerItemId: string
    })
  | (Omit<MentionDedupeIdentity, "fallbackKey" | "providerItemId"> & {
      fallbackKey: string
      kind: "fallback"
    })

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

function requireIdentityPart(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return normalized
}

export function resolveMentionDedupeIdentity(
  identity: MentionDedupeIdentity,
): ResolvedMentionDedupeIdentity {
  const base = {
    contentType: requireIdentityPart(identity.contentType, "contentType"),
    platform: identity.platform,
    workspaceId: requireIdentityPart(identity.workspaceId, "workspaceId"),
  }
  const providerItemId = identity.providerItemId?.trim()
  if (providerItemId) {
    return { ...base, kind: "provider", providerItemId }
  }

  const fallbackKey = identity.fallbackKey?.trim()
  if (!fallbackKey) {
    throw new TypeError(
      "A mention requires either providerItemId or fallbackKey",
    )
  }
  return { ...base, fallbackKey, kind: "fallback" }
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

export interface AtomicMentionIngestionStore<Id, CreateRecord extends object> {
  findByFallbackIdentity(
    identity: Extract<ResolvedMentionDedupeIdentity, { kind: "fallback" }>,
  ): Promise<{ id: Id } | null>
  findByProviderIdentity(
    identity: Extract<ResolvedMentionDedupeIdentity, { kind: "provider" }>,
  ): Promise<{ id: Id } | null>
  insert(
    record: CreateRecord & {
      firstSeenAt: number
      lastMatchedAt: number
      updatedAt: number
    },
  ): Promise<Id>
  patch(id: Id, patch: MentionRediscoveryPatch): Promise<void>
}

/**
 * Call inside one Convex mutation so the dedupe lookup, insert, or rediscovery
 * patch share a serializable transaction.
 */
export async function ingestMentionAtomically<Id, CreateRecord extends object>(
  store: AtomicMentionIngestionStore<Id, CreateRecord>,
  input: {
    create: CreateRecord
    identity: MentionDedupeIdentity
    metrics: MentionEngagementMetrics
    now: number
  },
): Promise<
  { kind: "inserted"; mentionId: Id } | { kind: "rediscovered"; mentionId: Id }
> {
  const identity = resolveMentionDedupeIdentity(input.identity)
  const existing =
    identity.kind === "provider"
      ? await store.findByProviderIdentity(identity)
      : await store.findByFallbackIdentity(identity)

  if (existing) {
    await store.patch(
      existing.id,
      buildMentionRediscoveryPatch(input.metrics, input.now),
    )
    return { kind: "rediscovered", mentionId: existing.id }
  }

  const mentionId = await store.insert({
    ...input.create,
    firstSeenAt: input.now,
    lastMatchedAt: input.now,
    updatedAt: input.now,
  })
  return { kind: "inserted", mentionId }
}
