import {
  canonicalizeMentionUrl,
  localDateSchema,
  MENTION_CATEGORIES,
  PLATFORMS,
  type MentionCategory,
  type Platform,
} from "@astreex/domain"
import { Button, Heading, Link, Section, Text } from "react-email"
import type { CSSProperties } from "react"

import { colors, EmailLayout, fontFamily } from "./email-layout"
import {
  emailButtonContainerStyle,
  emailParagraphStyle,
  emailPrimaryButtonStyle,
} from "./email-styles"
import { renderEmail, type RenderedEmail } from "./render-email"
import {
  assertNonNegativeSafeInteger,
  formatInteger,
  greeting,
  normalizeAstreexUrl,
} from "./shared"

export type DailyDigestMention = {
  author?: string
  category: MentionCategory
  engagementScore?: number
  excerpt?: string
  platform: Platform
  title: string
  url: string
}

export type DailyDigestCounts = {
  byCategory: Record<MentionCategory, number>
  byPlatform: Record<Platform, number>
  total: number
}

export type DailyDigestEmailProps = {
  astreexUrl: string
  counts: DailyDigestCounts
  localDate: string
  recipientName?: string
  topMentions: readonly DailyDigestMention[]
  workspaceName: string
}

const platformLabels: Record<Platform, string> = {
  hacker_news: "Hacker News",
  reddit: "Reddit",
  x: "X",
}

const sectionHeadingStyle: CSSProperties = {
  color: colors.text,
  fontFamily,
  fontSize: "20px",
  fontWeight: 700,
  lineHeight: "28px",
  margin: "28px 0 12px",
}

const listStyle: CSSProperties = {
  color: colors.text,
  fontFamily,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "8px 0 20px",
  paddingLeft: "24px",
}

const mentionStyle: CSSProperties = {
  backgroundColor: colors.background,
  border: `1px solid ${colors.border}`,
  borderRadius: "6px",
  margin: "0 0 16px",
  padding: "18px 20px",
}

const mentionHeadingStyle: CSSProperties = {
  color: colors.text,
  fontFamily,
  fontSize: "17px",
  fontWeight: 700,
  lineHeight: "25px",
  margin: "0 0 8px",
}

const metadataStyle: CSSProperties = {
  color: colors.muted,
  fontFamily,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 10px",
}

const excerptStyle: CSSProperties = {
  color: colors.text,
  fontFamily,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px",
}

const linkStyle: CSSProperties = {
  color: colors.accent,
  fontFamily,
  textDecoration: "underline",
}

function emptyCategoryCounts(): Record<MentionCategory, number> {
  return {
    Bug: 0,
    Complaint: 0,
    "Competitor Mention": 0,
    "Feature Request": 0,
    Other: 0,
    Praise: 0,
    Question: 0,
  }
}

function emptyPlatformCounts(): Record<Platform, number> {
  return { hacker_news: 0, reddit: 0, x: 0 }
}

export function createDailyDigestCounts(
  mentions: readonly Pick<DailyDigestMention, "category" | "platform">[],
): DailyDigestCounts {
  const byCategory = emptyCategoryCounts()
  const byPlatform = emptyPlatformCounts()

  for (const mention of mentions) {
    byCategory[mention.category] += 1
    byPlatform[mention.platform] += 1
  }

  return { byCategory, byPlatform, total: mentions.length }
}

function assertCounts(counts: DailyDigestCounts): void {
  assertNonNegativeSafeInteger("counts.total", counts.total)

  let platformTotal = 0
  for (const platform of PLATFORMS) {
    const value = counts.byPlatform[platform]
    assertNonNegativeSafeInteger(`counts.byPlatform.${platform}`, value)
    platformTotal += value
  }

  let categoryTotal = 0
  for (const category of MENTION_CATEGORIES) {
    const value = counts.byCategory[category]
    assertNonNegativeSafeInteger(`counts.byCategory.${category}`, value)
    categoryTotal += value
  }

  if (platformTotal !== counts.total || categoryTotal !== counts.total) {
    throw new RangeError(
      "Platform and category counts must each add up to counts.total",
    )
  }
}

const readableDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
})

function readableDate(localDate: string): string {
  return readableDateFormatter.format(new Date(`${localDate}T00:00:00.000Z`))
}

function mentionMetadata(mention: DailyDigestMention): string {
  const parts = [platformLabels[mention.platform], mention.category]
  const author = mention.author?.trim()
  if (author) parts.push(author)
  if (mention.engagementScore !== undefined) {
    assertNonNegativeSafeInteger(
      "mention.engagementScore",
      mention.engagementScore,
    )
    parts.push(`${formatInteger(mention.engagementScore)} engagement`)
  }
  return parts.join(" · ")
}

function nonEmptyEntries<T extends string>(
  keys: readonly T[],
  counts: Record<T, number>,
): T[] {
  return keys.filter((key) => counts[key] > 0)
}

function assertDigestProps({
  counts,
  localDate,
  topMentions,
  workspaceName,
}: DailyDigestEmailProps): void {
  localDateSchema.parse(localDate)
  assertCounts(counts)
  if (counts.total === 0) {
    throw new RangeError("Daily digest emails require at least one mention")
  }
  if (topMentions.length === 0 || topMentions.length > counts.total) {
    throw new RangeError(
      "topMentions must contain between one and counts.total mentions",
    )
  }
  if (!workspaceName.trim()) {
    throw new TypeError("workspaceName cannot be empty")
  }
}

export function dailyDigestSubject(
  localDate: string,
  mentionCount: number,
): string {
  localDateSchema.parse(localDate)
  assertNonNegativeSafeInteger("mentionCount", mentionCount)
  const noun = mentionCount === 1 ? "mention" : "mentions"
  return `Astreex daily digest: ${formatInteger(mentionCount)} ${noun} for ${localDate}`
}

export function DailyDigestEmail(props: DailyDigestEmailProps) {
  assertDigestProps(props)
  const {
    astreexUrl,
    counts,
    localDate,
    recipientName,
    topMentions,
    workspaceName,
  } = props
  const safeAstreexUrl = normalizeAstreexUrl(astreexUrl)
  const platformEntries = nonEmptyEntries(PLATFORMS, counts.byPlatform)
  const categoryEntries = nonEmptyEntries(MENTION_CATEGORIES, counts.byCategory)
  const mentionNoun = counts.total === 1 ? "mention" : "mentions"

  return (
    <EmailLayout
      astreexUrl={safeAstreexUrl}
      preview={`${formatInteger(counts.total)} ${mentionNoun} found for ${workspaceName} on ${localDate}.`}
      title={`Your daily mention digest for ${readableDate(localDate)}`}
    >
      <Text className="email-text" style={emailParagraphStyle}>
        {greeting(recipientName)}
      </Text>
      <Text className="email-text" style={emailParagraphStyle}>
        Astreex found <strong>{formatInteger(counts.total)}</strong>{" "}
        {mentionNoun} for {workspaceName} during the previous local day.
      </Text>

      <Heading as="h2" className="email-text" style={sectionHeadingStyle}>
        Mentions by platform
      </Heading>
      <ul
        aria-label="Mention counts by platform"
        className="email-text"
        style={listStyle}
      >
        {platformEntries.map((platform) => (
          <li key={platform}>
            {platformLabels[platform]}:{" "}
            {formatInteger(counts.byPlatform[platform])}
          </li>
        ))}
      </ul>

      <Heading as="h2" className="email-text" style={sectionHeadingStyle}>
        Mentions by category
      </Heading>
      <ul
        aria-label="Mention counts by category"
        className="email-text"
        style={listStyle}
      >
        {categoryEntries.map((category) => (
          <li key={category}>
            {category}: {formatInteger(counts.byCategory[category])}
          </li>
        ))}
      </ul>

      <Heading as="h2" className="email-text" style={sectionHeadingStyle}>
        Top mentions
      </Heading>
      {topMentions.map((mention, index) => {
        const canonicalUrl = canonicalizeMentionUrl(
          mention.url,
          mention.platform,
        )
        const title = mention.title.trim() || "Untitled mention"
        const excerpt = mention.excerpt?.trim()

        return (
          <Section
            className="email-border email-subtle"
            key={`${canonicalUrl}:${index}`}
            style={mentionStyle}
          >
            <Heading as="h3" className="email-text" style={mentionHeadingStyle}>
              {index + 1}. {title}
            </Heading>
            <Text className="email-muted" style={metadataStyle}>
              {mentionMetadata(mention)}
            </Text>
            {excerpt ? (
              <Text className="email-text" style={excerptStyle}>
                {excerpt}
              </Text>
            ) : null}
            <Link className="email-link" href={canonicalUrl} style={linkStyle}>
              View mention on {platformLabels[mention.platform]}
            </Link>
          </Section>
        )
      })}

      <Section style={emailButtonContainerStyle}>
        <Button href={safeAstreexUrl} style={emailPrimaryButtonStyle}>
          View all mentions in Astreex
        </Button>
      </Section>
    </EmailLayout>
  )
}

export function renderDailyDigestEmail(
  props: DailyDigestEmailProps,
): Promise<RenderedEmail> {
  return renderEmail(
    dailyDigestSubject(props.localDate, props.counts.total),
    <DailyDigestEmail {...props} />,
  )
}

export default DailyDigestEmail
