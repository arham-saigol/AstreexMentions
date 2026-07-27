import type { EmailPayload } from "../lib/emailOutbox"

export const INGESTED_MENTION_METRIC = "mentions_ingested"
export const USAGE_WARNING_THRESHOLDS = [80, 100] as const
export type UsageWarningThreshold = (typeof USAGE_WARNING_THRESHOLDS)[number]
export type IngestionTrackingSourceType =
  "hacker_news" | "reddit_comments" | "reddit_posts" | "x"

export function candidateMatchesTrackingSource(
  candidate: Readonly<{
    contentType: "comment" | "post" | "story" | "tweet"
    platform: "hacker_news" | "reddit" | "x"
  }>,
  sourceType: IngestionTrackingSourceType,
): boolean {
  switch (sourceType) {
    case "x":
      return candidate.platform === "x" && candidate.contentType === "tweet"
    case "reddit_posts":
      return candidate.platform === "reddit" && candidate.contentType === "post"
    case "reddit_comments":
      return (
        candidate.platform === "reddit" && candidate.contentType === "comment"
      )
    case "hacker_news":
      return (
        candidate.platform === "hacker_news" &&
        (candidate.contentType === "story" ||
          candidate.contentType === "comment")
      )
  }
}

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return normalized
}

/** Normalizes caller-provided content hashes or canonical identity strings. */
export function normalizeMentionFallbackKey(value: string): string {
  return requireNonEmpty(value.normalize("NFKC"), "fallbackKey")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en")
}

function assertUsageCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
}

export function usageWarningThresholdsToEnqueue(input: {
  mentionLimit: number
  mentionsUsed: number
  sent100At?: number | undefined
  sent80At?: number | undefined
}): UsageWarningThreshold[] {
  assertUsageCount(input.mentionLimit, "mentionLimit")
  assertUsageCount(input.mentionsUsed, "mentionsUsed")
  if (input.mentionLimit === 0 || input.mentionsUsed === 0) {
    return []
  }

  const thresholds: UsageWarningThreshold[] = []
  if (
    input.sent80At === undefined &&
    input.mentionsUsed * 100 >= input.mentionLimit * 80
  ) {
    thresholds.push(80)
  }
  if (
    input.sent100At === undefined &&
    input.mentionsUsed >= input.mentionLimit
  ) {
    thresholds.push(100)
  }
  return thresholds
}

function keyPart(value: string): string {
  return encodeURIComponent(requireNonEmpty(value, "idempotency key part"))
}

export function categorizationJobIdempotencyKey(mentionId: string): string {
  return `categorization:mention:${keyPart(mentionId)}`
}

export function usageWarningIdempotencyKey(
  usageCycleId: string,
  threshold: UsageWarningThreshold,
): string {
  return `email:usage:${keyPart(usageCycleId)}:${threshold}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function buildUsageWarningEmail(input: {
  from: string
  mentionLimit: number
  mentionsUsed: number
  recipientEmail: string
  replyTo?: string | undefined
  threshold: UsageWarningThreshold
  workspaceName: string
}): EmailPayload {
  const workspaceName = requireNonEmpty(input.workspaceName, "workspaceName")
  const recipientEmail = requireNonEmpty(input.recipientEmail, "recipientEmail")
  const from = requireNonEmpty(input.from, "from")
  assertUsageCount(input.mentionLimit, "mentionLimit")
  assertUsageCount(input.mentionsUsed, "mentionsUsed")

  const reachedCap = input.threshold === 100
  const subject = reachedCap
    ? `Astreex mention limit reached for ${workspaceName}`
    : `Astreex mention usage reached 80% for ${workspaceName}`
  const summary = reachedCap
    ? `Your workspace has used all ${input.mentionLimit} mentions in the current billing period.`
    : `Your workspace has used ${input.mentionsUsed} of ${input.mentionLimit} mentions in the current billing period.`
  const text = `${subject}\n\n${summary}`

  return {
    from,
    html: `<h1>${escapeHtml(subject)}</h1><p>${escapeHtml(summary)}</p>`,
    subject,
    text,
    to: [recipientEmail],
    ...(input.replyTo === undefined
      ? {}
      : { replyTo: requireNonEmpty(input.replyTo, "replyTo") }),
  }
}
